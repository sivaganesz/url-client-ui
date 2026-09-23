import express from 'express'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CLIENT_DIST, IS_PROD } from './env.ts'
import { authRouter } from './routes/auth.ts'
import { perfoxRouter } from './routes/perfox.ts'
import { pool } from './db/index.ts'

const app = express()

/**
 * Behind a proxy in production, so req.ip and the Secure cookie flag read the
 * forwarded values rather than the load balancer's.
 */
if (IS_PROD) app.set('trust proxy', 1)

app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

/**
 * Cookies, parsed here rather than with a dependency.
 *
 * One cookie is read in this whole application and it is not signed — the
 * session token is random and verified against the database, so a signature
 * would add nothing.
 */
app.use((req, _res, next) => {
  const header = req.headers.cookie
  // @types/express already declares `cookies` (as any); this fills it.
  req.cookies = {}
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=')
      if (eq < 1) continue
      const key = part.slice(0, eq).trim()
      try {
        req.cookies[key] = decodeURIComponent(part.slice(eq + 1).trim())
      } catch {
        // A malformed cookie is one we do not have, not a request to reject.
      }
    }
  }
  next()
})

/**
 * Security headers.
 *
 * No CORS block anywhere in this file, and that is the point: the app and this
 * API answer on one origin, so the browser never makes a cross-origin request
 * and the session cookie can stay SameSite=Lax.
 */
app.use((_req, res, next) => {
  res.set('x-content-type-options', 'nosniff')
  res.set('referrer-policy', 'same-origin')
  res.set('x-frame-options', 'DENY')
  next()
})

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, database: 'up' })
  } catch {
    res.status(503).json({ ok: false, database: 'down' })
  }
})

app.use('/api', authRouter)
app.use('/api', perfoxRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'No such endpoint.' })
})

/**
 * The built frontend, from this same process.
 *
 * This is what makes the whole thing one origin. Assets are fingerprinted by
 * the build so they can be cached hard; index.html must not be, or a deploy
 * leaves browsers on the old bundle. Any path that is not a file falls through
 * to index.html, because the routes are client-side.
 */
if (CLIENT_DIST) {
  const dist = resolve(CLIENT_DIST)
  if (!existsSync(dist)) {
    console.warn(`[backend] CLIENT_DIST does not exist: ${dist}`)
  } else {
    app.use(express.static(dist, { index: false, maxAge: '1y' }))
    app.get('/*splat', (_req, res) => {
      res.set('cache-control', 'no-store').sendFile(join(dist, 'index.html'))
    })
  }
}

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Logged in full, reported as nothing: a stack trace in a response tells
    // whoever provoked it how this is built.
    console.error('[backend]', err.stack ?? err.message)
    res.status(500).json({ error: 'Something went wrong.' })
  },
)

export default app
