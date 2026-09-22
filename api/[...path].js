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
 *   ACCESS_CODE      optional — set it to require a code on every request
 */
const KEY = process.env.PERFOX_API_KEY ?? ''
// Trailing slashes trimmed: a base ending in "/" builds ".../api/v1//agents",
// and this API answers an unknown path with 401, not 404 — so a stray slash
// reads as a bad key and sends you hunting the wrong problem.
const API_BASE = (process.env.PERFOX_API_BASE ?? 'https://siva-workspace-api.perfox.ai/api/v1').replace(
  /\/+$/,
  '',
)
const ACCESS_CODE = process.env.ACCESS_CODE ?? ''
const WHATSAPP_HOOK = process.env.WHATSAPP_WEBHOOK_URL ?? ''

/** Indian mobiles to E.164. Stored numbers already carry +91, so don't re-add it. */
function toE164(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return null
  return digits.length === 10 ? `+91${digits}` : `+${digits}`
}

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
]

/** Never echo the key back, even if upstream includes it in an error. */
const redact = (text) => (KEY ? String(text).replaceAll(KEY, 'sk_***') : String(text))

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
      workspace: 'siva-workspace',
      gated: ACCESS_CODE.length > 0,
    })
  }

  // Gate everything else, reads AND the WhatsApp write. Ordering matters:
  // put the write above this and the access code stops protecting it.
  if (ACCESS_CODE) {
    const code = req.headers['x-access-code'] ?? url.searchParams.get('code') ?? ''
    if ((Array.isArray(code) ? code[0] : code) !== ACCESS_CODE) {
      return json(res, 401, { error: 'This deployment is private. An access code is required.' })
    }
  }

  // The single write this deployment permits. The hook URL stays server-side:
  // it is a capability, and same-origin avoids CORS.
  if (path === '/api/whatsapp' && req.method === 'POST') {
    if (!WHATSAPP_HOOK) return json(res, 503, { error: 'WHATSAPP_WEBHOOK_URL is not configured.' })

    const body = await readJson(req)
    const phone = toE164(body?.phone)
    const message = String(body?.message ?? '').trim()
    if (!phone) return json(res, 400, { error: 'A valid phone number is required.' })
    if (!message) return json(res, 400, { error: 'Message cannot be empty.' })

    const upstream = await fetch(WHATSAPP_HOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, name: body?.name ?? '', message }),
    })
    if (!upstream.ok) {
      console.error('[console] whatsapp hook', upstream.status)
      return json(res, 502, { error: `The WhatsApp hook returned ${upstream.status}.` })
    }
    return json(res, 200, { ok: true, phone })
  }


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
