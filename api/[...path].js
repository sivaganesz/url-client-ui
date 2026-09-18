/**
 * Vercel serverless entry.
 *
 * Vercel does not run server/index.js (that is the local dev server), so every
 * /api/* request lands here instead. Both wrappers call the same `handle()`
 * in server/workspace.js, so the sanitising rules can't drift apart.
 *
 * Environment variables to set in the Vercel project:
 *   PERFOX_API_KEY   required — the workspace key, server-side only
 *   PERFOX_API_BASE  optional — defaults to the siva-workspace base
 *   ACCESS_CODE      optional — set it to require a code; unset leaves the
 *                    report open to anyone with the URL
 */
import { handle } from '../server/workspace.js'

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host ?? 'localhost'}`)

  // The code may arrive as a header (from the app) or ?code= (a shared link).
  const code = req.headers['x-access-code'] ?? url.searchParams.get('code') ?? ''

  const { status, body } = await handle({
    method: req.method,
    pathname: url.pathname,
    code: Array.isArray(code) ? code[0] : code,
  })

  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  // Customer data — never let a shared CDN or another origin hold onto it.
  res.setHeader('access-control-allow-origin', 'same-origin')
  res.status(status).send(JSON.stringify(body))
}
