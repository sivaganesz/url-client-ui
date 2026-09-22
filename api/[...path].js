/**
 * Vercel serverless entry for the console.
 *
 * NOT the same surface as server/index.js. That one is a full developer proxy:
 * it forwards any method to any path, and exposes /api/discover and
 * /api/mcp/call. On localhost that is convenient. On a public URL it is an
 * open proxy holding a key that can read and write the entire workspace —
 * anyone with the link could create agents or delete knowledge-base files.
 *
 * So the deployed surface is deliberately narrower:
 *   · reads: GET, and only the paths the app actually calls (ALLOWED below)
 *   · writes: only the exact method + path pairs in WRITES below
 *   · no /api/discover, no /api/mcp/call
 *
 * Environment variables to set in the Vercel project:
 *   PERFOX_API_KEY   required — server-side only, never shipped to the browser
 *   PERFOX_API_BASE  optional — defaults to the siva-workspace base
 *   ACCESS_CODE      strongly recommended — requires a code on every request
 *   ALLOW_OUTBOUND   set to "true" (with ACCESS_CODE) to permit outbound calls
 *
 *   OPERATOR_API_HOST      the tenant API host for operator calling
 *   OPERATOR_SITE_ID       an operator-enabled site key
 *   OPERATOR_SITE_SECRET   required — server-side only, signs operator identity
 *   OPERATOR_WORKFLOW_ID   optional — omit to use the tenant default agent
 */
import { createHmac } from 'node:crypto'

const KEY = process.env.PERFOX_API_KEY ?? ''
// Trailing slashes trimmed: a base ending in "/" builds ".../api/v1//agents",
// and this API answers an unknown path with 401, not 404 — so a stray slash
// reads as a bad key and sends you hunting the wrong problem.
const API_BASE = (process.env.PERFOX_API_BASE ?? 'https://siva-workspace-api.perfox.ai/api/v1').replace(
  /\/+$/,
  '',
)
const ACCESS_CODE = process.env.ACCESS_CODE ?? ''

/**
 * Outbound places real calls and sends real messages, billed to the workspace.
 *
 * It is off unless explicitly switched on, and refuses to switch on without an
 * access code. A deployment that forgets to set either cannot dial anyone —
 * the failure mode of a mistake here is a disabled button, not a stranger
 * ringing a customer on your credits.
 *
 * Both must be set server-side, in the hosting project's environment:
 *   ACCESS_CODE=<something long>   gates every request
 *   ALLOW_OUTBOUND=true            permits POST /outbound
 */
const OUTBOUND_ENABLED = process.env.ALLOW_OUTBOUND === 'true' && ACCESS_CODE.length > 0

/**
 * Operator calling — a separate credential from the workspace key.
 *
 * The site secret signs an operator's identity so the platform will open a
 * voice session for them. Anyone holding it could sign in as any operator, so
 * it stays server-side and is never part of a response.
 *
 * Note this surface is NOT gated by ALLOW_OUTBOUND. That flag guards agent
 * outbound, where the workspace pays for an AI to phone someone unattended.
 * Operator calling is a person clicking dial with their own microphone open;
 * it is gated by ACCESS_CODE like everything else, and by whether the site
 * secret is configured at all.
 */
const OPERATOR = {
  apiHost: (process.env.OPERATOR_API_HOST ?? '').replace(/\/+$/, ''),
  siteId: process.env.OPERATOR_SITE_ID ?? '',
  workflowId: process.env.OPERATOR_WORKFLOW_ID ?? '',
  secret: process.env.OPERATOR_SITE_SECRET ?? '',
  externalId: process.env.OPERATOR_EXTERNAL_ID ?? 'op_console',
  name: process.env.OPERATOR_NAME ?? 'Console Operator',
}

const signOperator = (externalId) =>
  createHmac('sha256', OPERATOR.secret).update(`${OPERATOR.siteId}.${externalId}`).digest('hex')


async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

const ID = '[0-9a-f-]{20,40}'

/** Exactly what src/lib/api.js requests — nothing else reaches the workspace. */
const ALLOWED = [
  new RegExp(`^agents$`),
  new RegExp(`^agents/${ID}$`),
  new RegExp(`^conversations$`),
  new RegExp(`^conversations/${ID}$`),
  new RegExp(`^conversations/${ID}/events$`),
  new RegExp(`^conversations/${ID}/recordings$`),
  new RegExp(`^customers$`),
  new RegExp(`^customers/${ID}$`),
  new RegExp(`^analytics/summary$`),
  new RegExp(`^analytics/conversations-over-time$`),
  new RegExp(`^billing/credits$`),
  new RegExp(`^calls$`),
]

/**
 * The only workspace writes this deployment permits.
 *
 * Taking an agent live and standing it down are separate operations upstream:
 * PATCH rejects "published", because going live runs validation of its own.
 */
const WRITES = [
  { method: 'POST', re: new RegExp(`^agents/${ID}/publish$`) },
  { method: 'PATCH', re: new RegExp(`^agents/${ID}$`) },
  // Reaching out: places a real call, or sends a real message. Off by default
  // — see OUTBOUND_ENABLED above.
  ...(OUTBOUND_ENABLED ? [{ method: 'POST', re: /^outbound$/ }] : []),
]

/** Never echo the key back, even if upstream includes it in an error. */
const redact = (text) => {
  let out = String(text)
  if (KEY) out = out.replaceAll(KEY, 'sk_***')
  if (OPERATOR.secret) out = out.replaceAll(OPERATOR.secret, 'sa_secret_***')
  return out
}

function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (path === '/api/health') {
    return json(res, 200, {
      ok: true,
      keyConfigured: KEY.length > 0,
      gated: ACCESS_CODE.length > 0,
      outbound: OUTBOUND_ENABLED,
      operator: Boolean(OPERATOR.siteId && OPERATOR.secret),
    })
  }

  // Gate everything else, reads AND writes. Ordering matters: put a write
  // above this and the access code stops protecting it.
  if (ACCESS_CODE) {
    const code = req.headers['x-access-code'] ?? url.searchParams.get('code') ?? ''
    if ((Array.isArray(code) ? code[0] : code) !== ACCESS_CODE) {
      return json(res, 401, { error: 'This deployment is private. An access code is required.' })
    }
  }

  // ── operator connector config ────────────────────────────
  // Behind the access-code gate above, and deliberately never the secret.
  // Separate from the PERFOX_API_KEY check below: the two credentials are
  // independent, so calling can work on a deployment with no REST key.
  if (path === '/api/operator/config') {
    // 200 with configured:false — see the note in server/index.js.
    if (!OPERATOR.apiHost || !OPERATOR.siteId || !OPERATOR.secret) {
      return json(res, 200, {
        configured: false,
        reason: 'Operator calling is not configured on this deployment.',
      })
    }
    return json(res, 200, {
      configured: true,
      apiHost: OPERATOR.apiHost,
      siteId: OPERATOR.siteId,
      workflowId: OPERATOR.workflowId || null,
      operator: {
        externalId: OPERATOR.externalId,
        name: OPERATOR.name,
        userHash: signOperator(OPERATOR.externalId),
      },
    })
  }

  // The WhatsApp relay that used to live here is gone: the composer sends
  // through POST /outbound now, as the conversation's own agent. A hook that
  // can message anyone, reachable on a public URL and called by nothing, is
  // only a liability.

  if (!KEY) {
    return json(res, 503, { error: 'Not configured. PERFOX_API_KEY is missing.' })
  }

  if (!path.startsWith('/api/perfox/')) {
    // /api/discover and /api/mcp/call exist only in local development.
    return json(res, 404, { error: 'Not found.' })
  }

  const resource = path.slice('/api/perfox/'.length)

  // Reads are matched against ALLOWED; anything that changes state has to be
  // named explicitly in WRITES, method included.
  const isRead = req.method === 'GET' && ALLOWED.some((re) => re.test(resource))
  const isWrite = WRITES.some((w) => w.method === req.method && w.re.test(resource))

  if (!isRead && !isWrite) {
    // Name the one case an operator can fix, rather than a flat refusal they
    // have to go and read the source to understand.
    if (resource === 'outbound' && !OUTBOUND_ENABLED) {
      return json(res, 403, {
        error:
          'Reaching out is disabled on this deployment. Set ACCESS_CODE and ALLOW_OUTBOUND=true to enable it.',
      })
    }
    return json(res, 403, { error: 'That operation is not available on this deployment.' })
  }

  try {
    const body = isWrite ? await readJson(req) : null
    const upstream = await fetch(`${API_BASE}/${resource}${url.search}`, {
      method: req.method,
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: isWrite ? JSON.stringify(body ?? {}) : undefined,
    })
    const text = await upstream.text()
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json')
    res.setHeader('cache-control', 'no-store')
    return res.status(upstream.status).send(redact(text))
  } catch (err) {
    console.error('[console]', redact(err.message))
    return json(res, 502, { error: 'Could not reach the workspace.' })
  }
}
