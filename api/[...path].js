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
 *   · GET only
 *   · only the paths the app actually calls (ALLOWED below)
 *   · no /api/discover, no /api/mcp/call
 *
 * Environment variables to set in the Vercel project:
 *   PERFOX_API_KEY   required — server-side only, never shipped to the browser
 *   PERFOX_API_BASE  optional — defaults to the siva-workspace base
 *   ACCESS_CODE      optional — set it to require a code on every request
 */
const KEY = process.env.PERFOX_API_KEY ?? ''
const API_BASE = process.env.PERFOX_API_BASE ?? 'https://siva-workspace-api.perfox.ai/api/v1'
const ACCESS_CODE = process.env.ACCESS_CODE ?? ''

const ID = '[0-9a-f-]{20,40}'

/** Exactly what src/lib/api.js requests — nothing else reaches the workspace. */
const ALLOWED = [
  new RegExp(`^agents$`),
  new RegExp(`^agents/${ID}$`),
  new RegExp(`^conversations$`),
  new RegExp(`^conversations/${ID}$`),
  new RegExp(`^conversations/${ID}/events$`),
  new RegExp(`^customers$`),
  new RegExp(`^customers/${ID}$`),
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

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'This deployment is read-only.' })
  }

  if (path === '/api/health') {
    return json(res, 200, {
      ok: true,
      keyConfigured: KEY.length > 0,
      workspace: 'siva-workspace',
      gated: ACCESS_CODE.length > 0,
    })
  }

  if (ACCESS_CODE) {
    const code = req.headers['x-access-code'] ?? url.searchParams.get('code') ?? ''
    if ((Array.isArray(code) ? code[0] : code) !== ACCESS_CODE) {
      return json(res, 401, { error: 'This deployment is private. An access code is required.' })
    }
  }

  if (!KEY) {
    return json(res, 503, { error: 'Not configured. PERFOX_API_KEY is missing.' })
  }

  if (!path.startsWith('/api/perfox/')) {
    // /api/discover and /api/mcp/call exist only in local development.
    return json(res, 404, { error: 'Not found.' })
  }

  const resource = path.slice('/api/perfox/'.length)
  if (!ALLOWED.some((re) => re.test(resource))) {
    return json(res, 403, { error: 'That resource is not available on this deployment.' })
  }

  try {
    const upstream = await fetch(`${API_BASE}/${resource}${url.search}`, {
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
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
