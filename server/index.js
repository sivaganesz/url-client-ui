/**
 * Perfox proxy.
 *
 * The workspace key authorises everything in the workspace, so it stays here
 * and never reaches the browser bundle. The app calls same-origin `/api/*`;
 * Vite forwards those to this process in dev (see vite.config.js).
 *
 * Zero dependencies — node:http plus the built-in fetch on Node 18+.
 *
 * Run: node server/index.js   (or `npm run proxy`)
 */
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env')
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath)
  } catch (err) {
    console.warn(`[proxy] could not read .env: ${err.message}`)
  }
}

const KEY = process.env.PERFOX_API_KEY ?? ''
// Trailing slashes are trimmed because a base ending in "/" would build
// ".../api/v1//agents", and this API answers an unknown path with 401 rather
// than 404 — so a stray slash in .env looks exactly like a bad key.
const API_BASE = (process.env.PERFOX_API_BASE ?? 'https://siva-workspace-api.perfox.ai/api/v1').replace(
  /\/+$/,
  '',
)
const MCP_URL = process.env.PERFOX_MCP_URL ?? 'https://siva-workspace-api.perfox.ai/mcp'
const PORT = Number(process.env.PROXY_PORT ?? 8787)

/**
 * The operator connector — a different credential from the workspace key.
 *
 * A workspace key does not authorise the operator surface and the site secret
 * does not authorise the REST API; the two are unrelated and both can be set.
 *
 * OPERATOR_SITE_SECRET is the trust anchor. It signs an operator's identity so
 * the platform will open a voice session for them, which is exactly why it
 * cannot go in the browser bundle: anyone holding it could sign in as any
 * operator. It stays in this process and is never returned.
 */
const OPERATOR = {
  apiHost: (process.env.OPERATOR_API_HOST ?? '').replace(/\/+$/, ''),
  siteId: process.env.OPERATOR_SITE_ID ?? '',
  workflowId: process.env.OPERATOR_WORKFLOW_ID ?? '',
  secret: process.env.OPERATOR_SITE_SECRET ?? '',
  externalId: process.env.OPERATOR_EXTERNAL_ID ?? 'op_console',
  name: process.env.OPERATOR_NAME ?? 'Console Operator',
}

/**
 * user_hash = HMAC_SHA256(site_secret, "<siteId>.<externalId>")
 *
 * The externalId is taken from env, never from the request. This console has
 * no login, so it signs one fixed identity — meaning every browser that opens
 * it is the same operator, and two tabs will contend over presence. That is
 * acceptable for a single-seat console and is the first thing to change if
 * this ever gets real users: derive the id from their session instead.
 */
const signOperator = (externalId) =>
  createHmac('sha256', OPERATOR.secret).update(`${OPERATOR.siteId}.${externalId}`).digest('hex')

/**
 * The workspace name, read from the API base rather than hardcoded.
 *
 * It used to be a literal 'siva-workspace', so pointing .env at a different
 * workspace left the console still announcing the old one — the data changed
 * underneath a label that didn't.
 *
 * "https://pradeepworkspace-api.perfox.ai/api/v1" -> "pradeepworkspace"
 */
const WORKSPACE =
  /^https?:\/\/([a-z0-9-]+?)(?:-api)?\./i.exec(API_BASE)?.[1] ?? null

/** Strip both secrets from anything we are about to log or return. */
function redact(text) {
  let out = String(text)
  if (KEY) out = out.replaceAll(KEY, 'sk_***redacted***')
  // The site secret should never reach a response, but an upstream error that
  // echoed a request back would carry it. Cheaper to redact than to be sure.
  if (OPERATOR.secret) out = out.replaceAll(OPERATOR.secret, 'sa_secret_***redacted***')
  return out
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  })
  res.end(payload)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

const authHeaders = (extra = {}) => ({
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
  ...extra,
})

/** One JSON-RPC round trip to the MCP endpoint. */
let rpcId = 0
async function mcp(method, params = {}) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: authHeaders({ accept: 'application/json, text/event-stream' }),
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`MCP ${method} -> HTTP ${res.status}: ${redact(text).slice(0, 400)}`)
  }

  // Streamable HTTP may answer as SSE; take the last `data:` frame.
  let json = text
  if (text.startsWith('event:') || text.includes('\ndata:')) {
    const frames = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
    json = frames[frames.length - 1] ?? '{}'
  }

  const parsed = JSON.parse(json)
  if (parsed.error) throw new Error(`MCP ${method} -> ${parsed.error.message ?? 'error'}`)
  return parsed.result
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  if (req.method === 'OPTIONS') return send(res, 204, {})

  try {
    // ── health ───────────────────────────────────────────────
    // The UI probes this on boot to decide live vs sample data.
    if (path === '/api/health') {
      return send(res, 200, {
        ok: true,
        keyConfigured: KEY.length > 0,
        workspace: WORKSPACE,
        apiBase: API_BASE,
        mcpUrl: MCP_URL,
      })
    }

    // ── operator connector config ────────────────────────────
    // Public site config plus a signed identity. Deliberately never the
    // secret: a settings form that posts one from the browser hands it to
    // anyone with devtools. Placed above the PERFOX_API_KEY gate because the
    // two credentials are independent — calling can work without the REST key.
    if (path === '/api/operator/config') {
      // 200 with configured:false, not a 503. "Not configured" is a true
      // answer to "what is the config?", and a non-2xx would have the browser
      // log an error on every page load of a console that simply has no
      // operator credentials. The integration guide's sample returns 503; this
      // deviates on purpose. A real failure still surfaces as one.
      if (!OPERATOR.apiHost || !OPERATOR.siteId || !OPERATOR.secret) {
        return send(res, 200, {
          configured: false,
          reason:
            'Operator calling is not configured. Set OPERATOR_API_HOST, OPERATOR_SITE_ID and OPERATOR_SITE_SECRET in .env.',
        })
      }
      return send(res, 200, {
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

    if (!KEY) {
      return send(res, 503, {
        error: 'PERFOX_API_KEY is not set. Copy .env.example to .env and add the key.',
      })
    }

    // ── discovery ────────────────────────────────────────────
    // Authoritative list of what this workspace exposes. The public docs do
    // not specify the REST resources, so this is how the mapping in
    // src/lib/api.js gets filled in.
    if (path === '/api/discover') {
      const result = await mcp('tools/list')
      const tools = (result?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }))
      return send(res, 200, { count: tools.length, tools })
    }

    // The WhatsApp relay that used to live here is gone: sending goes through
    // POST /outbound as the conversation's own agent, so the hook has no
    // caller left.

    // ── MCP tool call ────────────────────────────────────────
    if (path === '/api/mcp/call' && req.method === 'POST') {
      const body = await readBody(req)
      if (!body?.name) return send(res, 400, { error: 'Body must be { name, arguments }' })
      const result = await mcp('tools/call', {
        name: body.name,
        arguments: body.arguments ?? {},
      })
      return send(res, 200, result)
    }

    // ── REST passthrough ─────────────────────────────────────
    // /api/perfox/<rest-of-path> -> <API_BASE>/<rest-of-path>
    if (path.startsWith('/api/perfox/')) {
      const target = `${API_BASE}/${path.slice('/api/perfox/'.length)}${url.search}`
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)

      const upstream = await fetch(target, {
        method: req.method,
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })

      const text = await upstream.text()
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      })
      return res.end(redact(text))
    }

    return send(res, 404, { error: `No route for ${path}` })
  } catch (err) {
    console.error('[proxy]', redact(err.message))
    return send(res, 502, { error: redact(err.message) })
  }
})

server.listen(PORT, () => {
  console.log(`[proxy] listening on http://localhost:${PORT}`)
  console.log(`[proxy] workspace ${WORKSPACE} · key ${KEY ? 'configured' : 'MISSING'}`)
  console.log(`[proxy] operator ${OPERATOR.siteId ? 'configured' : 'not configured'}`)
  console.log(
    `[proxy] GET /api/health   GET /api/discover   GET /api/operator/config   POST /api/mcp/call   /api/perfox/*`,
  )
})
