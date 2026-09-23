import { Router } from 'express'
import { one, query, type UserRow } from '../db/index.ts'
import { encrypt } from '../crypto.ts'
import { hashPassword, passwordProblem, verifyPassword, wasteTime } from '../auth/password.ts'
import {
  createAdminSession,
  currentAdmin,
  destroyAdminSession,
  requireAdmin,
  type AdminRow,
} from '../auth/admin-session.ts'

export const adminRouter: Router = Router()

/**
 * The admin surface: sign in, and create the customers who cannot sign
 * themselves up.
 *
 * Nothing here touches a customer's workspace data. An admin provisions
 * accounts and credentials; they do not read anybody's conversations. That
 * boundary is structural — an admin has no workspace_id to resolve — and this
 * router deliberately keeps it that way.
 */

const identity = (admin: AdminRow) => ({
  admin: { id: admin.id, name: admin.name, email: admin.email },
})

const isEmail = (s: unknown): s is string =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/* ── sign in ─────────────────────────────────────────────── */

adminRouter.post('/admin/login', async (req, res) => {
  const email = text(req.body?.email).toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' })
    return
  }

  const admin = await one<AdminRow>('SELECT * FROM admins WHERE lower(email) = $1', [email])

  // One message and one shape whichever way it failed, and a decoy hash on the
  // unknown-address path so the timing does not answer what the wording won't.
  if (!admin) {
    await wasteTime()
    res.status(401).json({ error: 'Those details did not match an account.' })
    return
  }
  if (!(await verifyPassword(admin.password_hash, password)) || admin.status !== 'active') {
    res.status(401).json({ error: 'Those details did not match an account.' })
    return
  }

  await createAdminSession(res, admin, req)
  res.json(identity(admin))
})

adminRouter.post('/admin/logout', async (req, res) => {
  await destroyAdminSession(req, res)
  res.json({ ok: true })
})

adminRouter.get('/admin/me', async (req, res) => {
  const admin = await currentAdmin(req)
  // 200 with null rather than 401: a first visit to the admin login page is a
  // signed-out visit, and a 401 there logs a console error on every cold load.
  res.json(admin ? identity(admin) : { admin: null })
})

/* ── customers ───────────────────────────────────────────── */

interface CustomerRow {
  workspace_id: string
  workspace_name: string
  perfox_api_base: string | null
  has_api_token: boolean
  token_hint: string | null
  has_operator: boolean
  user_id: string | null
  user_name: string | null
  email: string | null
  mobile: string | null
  status: string | null
  created_at: string
}

/**
 * What the admin is allowed to see back.
 *
 * Never a key or a secret — not even to the admin who typed it in. A hint is
 * enough to tell two keys apart, and an endpoint that can read every tenant's
 * credential back out is one bug away from being the worst in the system.
 * Changing a key means retyping it.
 */
adminRouter.get('/admin/customers', requireAdmin, async (_req, res) => {
  const rows = await query<CustomerRow>(
    `SELECT w.id                              AS workspace_id,
            w.name                            AS workspace_name,
            w.perfox_api_base,
            (w.perfox_api_token_enc IS NOT NULL)      AS has_api_token,
            NULL::text                        AS token_hint,
            (w.operator_site_secret_enc IS NOT NULL
             AND w.operator_site_id IS NOT NULL)      AS has_operator,
            u.id AS user_id, u.name AS user_name, u.email, u.mobile, u.status,
            w.created_at
       FROM workspaces w
       LEFT JOIN users u ON u.workspace_id = w.id AND u.role = 'owner'
      ORDER BY w.created_at DESC`,
  )
  res.json({ customers: rows })
})

adminRouter.post('/admin/customers', requireAdmin, async (req, res) => {
  const b = req.body ?? {}

  const workspaceName = text(b.workspaceName)
  const name = text(b.name)
  const email = isEmail(b.email) ? text(b.email).toLowerCase() : ''
  const mobile = text(b.mobile) || null
  const password = typeof b.password === 'string' ? b.password : ''

  if (!workspaceName || !name || !email) {
    res.status(400).json({ error: 'Workspace name, contact name and a valid email are required.' })
    return
  }
  const problem = passwordProblem(password)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  // Both tables are checked, because one address must not have an account on
  // each — signing in would then depend on which form you used.
  const clash =
    (await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])) ??
    (await one<{ id: string }>('SELECT id FROM admins WHERE lower(email) = $1', [email]))
  if (clash) {
    res.status(409).json({ error: 'That email address already has an account.' })
    return
  }

  // Trailing slashes are trimmed on the way in as well as on the way out: the
  // Perfox API answers an unknown path with 401 rather than 404, so a stray
  // slash builds "//agents" and reads exactly like a bad key.
  const trim = (v: unknown) => text(v).replace(/\/+$/, '') || null
  const apiToken = text(b.perfoxApiToken)
  const siteSecret = text(b.operatorSiteSecret)

  const client = await (await import('../db/index.ts')).pool.connect()
  try {
    // One transaction: a workspace with no owner is not a customer, and a
    // half-created one would have to be cleaned up by hand.
    await client.query('BEGIN')

    const ws = await client.query<{ id: string }>(
      `INSERT INTO workspaces
         (name, perfox_api_base, perfox_api_token_enc,
          operator_api_host, operator_site_id, operator_site_secret_enc, operator_workflow_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        workspaceName,
        trim(b.perfoxApiBase),
        apiToken ? encrypt(apiToken) : null,
        trim(b.operatorApiHost),
        text(b.operatorSiteId) || null,
        siteSecret ? encrypt(siteSecret) : null,
        text(b.operatorWorkflowId) || null,
      ],
    )

    const user = await client.query<UserRow>(
      `INSERT INTO users (workspace_id, name, email, mobile, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'owner') RETURNING id`,
      [ws.rows[0]!.id, name, email, mobile, await hashPassword(password)],
    )

    await client.query('COMMIT')

    // Deliberately echoes back no credential — not the key, not the secret,
    // not the password. The admin typed them; they do not need them read back.
    res.status(201).json({
      customer: {
        workspaceId: ws.rows[0]!.id,
        workspaceName,
        userId: user.rows[0]!.id,
        email,
        hasApiToken: Boolean(apiToken),
        hasOperator: Boolean(siteSecret && text(b.operatorSiteId)),
      },
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

/**
 * Suspending rather than deleting.
 *
 * The workspace, its conversations and the audit trail all survive, and the
 * sessions go in the same move — which is the thing that actually ends access.
 */
adminRouter.post('/admin/customers/:userId/status', requireAdmin, async (req, res) => {
  const status = text(req.body?.status)
  if (status !== 'active' && status !== 'suspended') {
    res.status(400).json({ error: "Status must be 'active' or 'suspended'." })
    return
  }

  const rows = await query<{ id: string }>(
    'UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [status, req.params.userId],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'No such customer.' })
    return
  }

  if (status === 'suspended') {
    await query('DELETE FROM sessions WHERE user_id = $1', [req.params.userId])
  }
  res.json({ ok: true, status })
})
