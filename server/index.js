/**
 * Local development server.
 *
 * Wraps the shared `handle()` from workspace.js in a plain node:http listener.
 * Vercel uses api/[...path].js instead — same logic, different transport.
 *
 * Run: node server/index.js   (or `npm run proxy`)
 */
import { createServer } from 'node:http'
import { gated, handle, isConfigured } from './workspace.js'

const PORT = Number(process.env.PROXY_PORT ?? 8788)

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const code = req.headers['x-access-code'] ?? url.searchParams.get('code') ?? ''

  const { status, body } = await handle({
    method: req.method,
    pathname: url.pathname,
    code: Array.isArray(code) ? code[0] : code,
  })

  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
})

server.listen(PORT, () => {
  console.log(`[client-review] http://localhost:${PORT}`)
  console.log(
    `[client-review] read-only · key ${isConfigured() ? 'configured' : 'MISSING'} · ${
      gated ? 'ACCESS CODE REQUIRED' : 'open (no access code set)'
    }`,
  )
  console.log('[client-review] /api/overview /api/conversations /api/customers /api/channels /api/assistants')
})
