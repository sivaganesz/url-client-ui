import pg from 'pg'
import { DATABASE_SSL, DATABASE_URL } from '../env.ts'

/**
 * TLS for anything that is not on a private network.
 *
 * Every managed Postgres — Railway's public proxy, Render, Neon, RDS,
 * DigitalOcean — refuses an unencrypted connection, and `pg` does not infer
 * that from the URL. Without this, connecting from outside the host fails with
 * an error that reads like a bad password, which is a miserable thing to debug.
 *
 * `rejectUnauthorized: false` because those providers terminate TLS with their
 * own certificate authority. It buys encryption in transit, not proof of who is
 * on the other end — the connection string is the secret doing that work. A
 * deployment that wants the stronger guarantee passes the provider's CA
 * instead, which is a change to make when there is one to pass.
 *
 * What counts as private, when DATABASE_SSL is left on `auto`:
 *
 *   localhost, 127.0.0.1, ::1      this machine
 *   10.x, 192.168.x, 172.16-31.x   a VPC or a private subnet
 *   *.internal                     Railway and Fly private networking
 *   *.flycast                      Fly, again
 *   a name with no dots            a Docker or Compose service, a Render
 *                                  internal host — nothing routable
 *                                  reaches a bare hostname from outside
 *                                  its network
 *
 * That list is a convenience, not a contract. A provider it does not know
 * about gets TLS, which is the safe way to be wrong; when it is wrong the
 * other way, DATABASE_SSL=off settles it without a code change.
 */
const PRIVATE =
  /@(localhost|127\.0\.0\.1|\[::1\]|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+|[\w.-]+\.(internal|flycast)|[\w-]+)[:/]/
const ssl =
  DATABASE_SSL === 'off'
    ? undefined
    : DATABASE_SSL === 'require' || !PRIVATE.test(DATABASE_URL)
      ? { rejectUnauthorized: false }
      : undefined

export const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl })

pool.on('error', (err) => {
  // An idle client dying is the pool's problem to recover from, not a reason
  // to take the process down with it.
  console.error('[db] idle client error:', err.message)
})

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params)
  return res.rows
}

/** The first row, or null. Most lookups here want exactly this. */
export async function one<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/* ── rows, as they come back ─────────────────────────────── */

export interface WorkspaceRow {
  id: string
  name: string
  perfox_api_base: string | null
  perfox_api_token_enc: string | null
  operator_api_host: string | null
  operator_site_id: string | null
  operator_site_secret_enc: string | null
  operator_workflow_id: string | null
}

export interface UserRow {
  id: string
  workspace_id: string
  name: string
  email: string
  mobile: string | null
  password_hash: string
  role: 'owner' | 'member'
  status: 'active' | 'suspended'
}
