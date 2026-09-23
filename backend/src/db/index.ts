import pg from 'pg'
import { DATABASE_URL } from '../env.ts'

export const pool = new pg.Pool({ connectionString: DATABASE_URL })

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
