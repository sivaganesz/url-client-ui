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
const WHATSAPP_HOOK = process.env.WHATSAPP_WEBHOOK_URL ?? ''

/**
 * Indian mobile numbers to E.164.
 *
 * The workspace already stores them as +91XXXXXXXXXX, so prepending the country
 * code blindly would give +9191... — this handles a bare 10-digit number, a
 * leading 0, and an already-prefixed one.
 */
function toE164(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!digits) return null
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}
const WORKSPACE = 'siva-workspace'

/** Strip the key from anything we are about to log or return. */
function redact(text) {
  if (!KEY) return String(text)
  return String(text).replaceAll(KEY, 'sk_***redacted***')
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

    // ── WhatsApp send ────────────────────────────────────────
    // Proxied rather than called from the browser: the hook URL is a
    // capability (anyone holding it can send as you), so it stays server-side,
    // and same-origin sidesteps CORS entirely.
    if (path === '/api/whatsapp' && req.method === 'POST') {
      if (!WHATSAPP_HOOK) {
        return send(res, 503, { error: 'WHATSAPP_WEBHOOK_URL is not configured.' })
      }
      const body = await readBody(req)
      const phone = toE164(body?.phone)
      const message = String(body?.message ?? '').trim()

      if (!phone) return send(res, 400, { error: 'A valid phone number is required.' })
      if (!message) return send(res, 400, { error: 'Message cannot be empty.' })

      const upstream = await fetch(WHATSAPP_HOOK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, name: body?.name ?? '', message }),
      })
      const text = await upstream.text()
      if (!upstream.ok) {
        console.error('[proxy] whatsapp hook', upstream.status, text.slice(0, 200))
        return send(res, 502, { error: `The WhatsApp hook returned ${upstream.status}.` })
      }
      return send(res, 200, { ok: true, phone })
    }

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
  console.log(`[proxy] GET /api/health   GET /api/discover   POST /api/mcp/call   /api/perfox/*`)
})
