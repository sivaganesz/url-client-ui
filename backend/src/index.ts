import app from './app.ts'
import { CLIENT_DIST, PORT } from './env.ts'
import { sweepExpiredSessions } from './auth/session.ts'
import { pool } from './db/index.ts'

/**
 * Starts the server.
 *
 * The Express app itself is in app.ts and does not listen — so the tests can
 * mount it on an ephemeral port without this file's side effects, and so that
 * "what the app is" and "how it is run" stay separable.
 */
const server = app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`)
  console.log(`[backend] serving the app: ${CLIENT_DIST ? 'yes' : 'no — API only'}`)
})

/**
 * Housekeeping, and never a reason to fall over.
 *
 * This ran unguarded and took the process down with it whenever the database
 * was not up yet — which is exactly when a deploy restarts both at once, and
 * left the server unable to boot at all rather than booting and reporting the
 * database as down on /api/health.
 */
function sweep() {
  sweepExpiredSessions()
    .then((n) => n && console.log(`[backend] swept ${n} expired sessions`))
    .catch((err: Error) => console.warn(`[backend] session sweep skipped: ${err.message}`))
}

sweep()
const daily = setInterval(sweep, 24 * 60 * 60 * 1000)
daily.unref()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)))
  })
}
