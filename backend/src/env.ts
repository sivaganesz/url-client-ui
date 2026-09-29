import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env')
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath)
  } catch (err) {
    console.warn(`[backend] could not read .env: ${(err as Error).message}`)
  }
}

/** Required, and worth failing loudly for rather than discovering at 3am. */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[backend] ${name} is not set. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

export const PORT = Number(process.env.PORT ?? 4300)
export const NODE_ENV = process.env.NODE_ENV ?? 'development'
export const IS_PROD = NODE_ENV === 'production'

export const DATABASE_URL = required('DATABASE_URL')

/**
 * Whether to connect to Postgres over TLS: `auto`, `require` or `off`.
 *
 * `auto` is right almost everywhere — see backend/src/db/index.ts for what it
 * treats as a private network. The other two exist so that a host neither of
 * us has thought of is a setting rather than a patch: `require` for a managed
 * database behind a hostname that looks local, `off` for a database genuinely
 * on a private network that the guess does not recognise.
 */
const SSL_MODES = ['auto', 'require', 'off'] as const
export const DATABASE_SSL = ((): (typeof SSL_MODES)[number] => {
  const value = (process.env.DATABASE_SSL ?? 'auto').toLowerCase()
  if ((SSL_MODES as readonly string[]).includes(value)) {
    return value as (typeof SSL_MODES)[number]
  }
  console.warn(`[backend] DATABASE_SSL=${value} is not one of ${SSL_MODES.join(', ')}; using auto.`)
  return 'auto'
})()

/**
 * Signs and encrypts. Two separate concerns, one key, deliberately:
 *
 *   · session cookies are random and stored hashed, so they need no key
 *   · workspace credentials are encrypted at rest with this one
 *
 * Losing it means every workspace has to be reconfigured; leaking it alongside
 * a database dump means every workspace's Perfox key is readable. It belongs
 * in a secret manager, not in a file that gets copied around.
 */
export const ENCRYPTION_KEY = required('ENCRYPTION_KEY')

/** How long a session lasts without being used. */
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7)

/**
 * Numbers an agent is allowed to ring, while this is set.
 *
 * Empty in production, and deliberately so: a console whose whole purpose
 * is phoning customers cannot have a list of permitted customers.
 *
 * It is for the other situation — a workspace connected to a real carrier
 * with somebody testing against it. Set it to the numbers that belong to
 * the team and a wrong digit rings nobody. Comma-separated; spaces, dashes
 * and brackets are ignored on both sides of the comparison.
 */
export const OUTBOUND_ALLOWLIST = (process.env.OUTBOUND_ALLOWLIST ?? '')
  .split(',')
  .map((n) => n.replace(/[^0-9]/g, ''))
  .filter(Boolean)

/**
 * Where the built frontend lives, if this process is serving it.
 *
 * Same-origin by design: the app and the API answer on one host, so the
 * session cookie can stay SameSite=Lax and the browser blocks cross-site
 * request forgery without us writing anything. Splitting them across hosts
 * would mean SameSite=None and a CSRF defence of our own.
 */
export const CLIENT_DIST = process.env.CLIENT_DIST ?? ''

/**
 * Registration is closed by default.
 *
 * The console reaches real customer data, so an open sign-up form is a door
 * onto it. Accounts are created by us, in the database, until the invite flow
 * exists. The page is built and reachable; the endpoint behind it refuses.
 */
export const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true'
