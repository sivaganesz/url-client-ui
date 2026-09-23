import { Router } from 'express'
import { one, query, type UserRow } from '../db/index.ts'
import { decrypt, encrypt } from '../crypto.ts'
import { hashPassword, passwordProblem, verifyPassword, wasteTime } from '../auth/password.ts'
import {
  createAdminSession,
  currentAdmin,
  destroyAdminSession,
  requireAdmin,
  type AdminRow,
} from '../auth/admin-session.ts'
import { limitLogins } from '../auth/rate-limit.ts'
import { record } from '../audit.ts'

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

adminRouter.post('/admin/login', limitLogins, async (req, res) => {
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
    res.locals.loginFailed = true
    res.status(401).json({ error: 'Those details did not match an account.' })
    return
  }
  if (!(await verifyPassword(admin.password_hash, password)) || admin.status !== 'active') {
    res.locals.loginFailed = true
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
            u.id AS user_id, u.name AS user_name, u.email, u.mobile,
            w.status,
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

    await record(req, 'customer.create', {
      type: 'customer',
      id: ws.rows[0]!.id,
      label: workspaceName,
    }, { email, hasApiToken: Boolean(apiToken), hasOperator: Boolean(siteSecret) })

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
 * Suspending a customer rather than deleting one.
 *
 * The workspace, its conversations and the record of it all survive, and the
 * sessions go in the same move — which is the thing that actually ends access.
 *
 * On the workspace, not on the owner's user row. They amount to the same thing
 * while each workspace has exactly one person in it, and stop amounting to the
 * same thing the moment a customer can invite a colleague: suspending the
 * owner would leave the account running under the colleague's login. The
 * per-user column still exists, for suspending one member of a workspace that
 * carries on.
 */
adminRouter.post('/admin/customers/:workspaceId/status', requireAdmin, async (req, res) => {
  const status = text(req.body?.status)
  if (status !== 'active' && status !== 'suspended') {
    res.status(400).json({ error: "Status must be 'active' or 'suspended'." })
    return
  }

  const rows = await query<{ id: string }>(
    'UPDATE workspaces SET status = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [status, req.params.workspaceId],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'No such customer.' })
    return
  }

  if (status === 'suspended') {
    // Everyone in it, not just the owner.
    await query(
      'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE workspace_id = $1)',
      [req.params.workspaceId],
    )
  }

  const workspace = await one<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [
    req.params.workspaceId,
  ])
  await record(req, status === 'suspended' ? 'customer.suspend' : 'customer.reinstate', {
    type: 'customer',
    id: String(req.params.workspaceId),
    label: workspace?.name,
  })

  res.json({ ok: true, status })
})

/**
 * Changing a workspace's Perfox connection.
 *
 * Only the fields sent are touched, and a blank one means "leave it alone"
 * rather than "clear it" — otherwise a form that renders a secret as an empty
 * box (which it must, since nothing can read one back) would wipe the
 * credential every time somebody corrected a typo in the workspace name.
 *
 * Clearing is therefore explicit: send `null`.
 */
adminRouter.patch('/admin/customers/:workspaceId', requireAdmin, async (req, res) => {
  const b = req.body ?? {}
  const sets: string[] = []
  const values: unknown[] = []

  const put = (column: string, value: unknown) => {
    sets.push(`${column} = $${sets.length + 1}`)
    values.push(value)
  }

  // null is a deliberate clear; undefined and '' are "not supplied".
  const given = (v: unknown) => v !== undefined && v !== ''
  const trim = (v: unknown) => (v === null ? null : text(v).replace(/\/+$/, '') || null)
  const plain = (v: unknown) => (v === null ? null : text(v) || null)
  const secret = (v: unknown) => (v === null ? null : encrypt(text(v)))

  if (given(b.workspaceName)) put('name', text(b.workspaceName))
  if (given(b.perfoxApiBase)) put('perfox_api_base', trim(b.perfoxApiBase))
  if (given(b.perfoxApiToken)) put('perfox_api_token_enc', secret(b.perfoxApiToken))
  if (given(b.operatorApiHost)) put('operator_api_host', trim(b.operatorApiHost))
  if (given(b.operatorSiteId)) put('operator_site_id', plain(b.operatorSiteId))
  if (given(b.operatorSiteSecret)) put('operator_site_secret_enc', secret(b.operatorSiteSecret))
  if (given(b.operatorWorkflowId)) put('operator_workflow_id', plain(b.operatorWorkflowId))

  if (sets.length === 0) {
    res.status(400).json({ error: 'Nothing to change.' })
    return
  }

  values.push(req.params.workspaceId)
  const rows = await query<{ id: string }>(
    `UPDATE workspaces SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} RETURNING id`,
    values,
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'No such workspace.' })
    return
  }

  /**
   * Which fields moved, never what they moved to. "The key was changed at
   * 14:20 by ops@" is the question this answers; the key itself must not be in
   * a table that exists to be read.
   */
  const workspace = await one<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [
    req.params.workspaceId,
  ])
  await record(
    req,
    'customer.update',
    { type: 'customer', id: String(req.params.workspaceId), label: workspace?.name },
    { fields: sets.map((s) => s.split(' = ')[0]) },
  )

  // Flags, as everywhere else on this surface. Nothing is read back.
  res.json({ ok: true })
})

/**
 * Does this connection actually work?
 *
 * Without it, an admin types a key and finds out it was wrong when the
 * customer complains. One cheap authenticated GET against the workspace's own
 * credentials answers it in a second.
 *
 * The upstream's body is never returned — only whether it answered and how.
 * This endpoint exists to check a credential, not to become a second way of
 * reading a customer's data through an admin session.
 */
adminRouter.post('/admin/customers/:workspaceId/test', requireAdmin, async (req, res) => {
  const w = await one<{
    perfox_api_base: string | null
    perfox_api_token_enc: string | null
  }>('SELECT perfox_api_base, perfox_api_token_enc FROM workspaces WHERE id = $1', [
    req.params.workspaceId,
  ])

  if (!w) {
    res.status(404).json({ error: 'No such workspace.' })
    return
  }

  const base = w.perfox_api_base?.replace(/\/+$/, '')
  const token = decrypt(w.perfox_api_token_enc)
  if (!base || !token) {
    res.json({ ok: false, reason: 'This workspace has no API base and key yet.' })
    return
  }

  try {
    const upstream = await fetch(`${base}/agents`, {
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (upstream.ok) {
      res.json({ ok: true, reason: 'The workspace answered.' })
      return
    }

    /**
     * 401 is the one worth naming. This API answers an unknown path with 401
     * rather than 404, so a trailing slash in the base builds "//agents" and
     * looks exactly like a bad key — an afternoon lost to the wrong problem.
     */
    res.json({
      ok: false,
      reason:
        upstream.status === 401
          ? 'Refused (401). Either the key is wrong, or the API base is — this API answers an unknown path with 401, not 404.'
          : `The workspace answered ${upstream.status}.`,
    })
  } catch (err) {
    const message = (err as Error).name === 'TimeoutError' ? 'timed out' : (err as Error).message
    res.json({ ok: false, reason: `Could not reach it: ${message}.` })
  }
})

/** An admin changing their own password. Mirrors the customer's. */
adminRouter.post('/admin/password', requireAdmin, async (req, res) => {
  const admin = req.admin!
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''

  if (!(await verifyPassword(admin.password_hash, current))) {
    res.status(401).json({ error: 'Your current password is not right.' })
    return
  }
  const problem = passwordProblem(next)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  await query('UPDATE admins SET password_hash = $1, updated_at = now() WHERE id = $2', [
    await hashPassword(next),
    admin.id,
  ])
  // Every other session goes — changing a password is what someone does when
  // they think one has been taken.
  await query('DELETE FROM admin_sessions WHERE admin_id = $1', [admin.id])
  await createAdminSession(res, admin, req)

  res.json({ ok: true })
})

/* ── administrators ──────────────────────────────────────── */

/**
 * Who else can get in here.
 *
 * The schema has allowed more than one admin since the beginning, on the
 * grounds that a single shared login is how credentials end up being passed
 * around in chat — but the only way to make a second one was to run
 * `seed:admin` on the server, and there was nowhere at all to see who already
 * had access. An account nobody can enumerate is not more secure; it is only
 * harder to take away.
 */
interface AdminListRow {
  id: string
  name: string
  email: string
  status: string
  created_at: string
  last_seen: string | null
}

adminRouter.get('/admin/admins', requireAdmin, async (_req, res) => {
  const rows = await query<AdminListRow>(
    `SELECT a.id, a.name, a.email, a.status, a.created_at,
            (SELECT max(s.created_at) FROM admin_sessions s WHERE s.admin_id = a.id) AS last_seen
       FROM admins a
      ORDER BY a.created_at`,
  )
  res.json({ admins: rows })
})

adminRouter.post('/admin/admins', requireAdmin, async (req, res) => {
  const name = text(req.body?.name)
  const email = isEmail(req.body?.email) ? text(req.body?.email).toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!name || !email) {
    res.status(400).json({ error: 'A name and a valid email are required.' })
    return
  }
  const problem = passwordProblem(password)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  // Both tables, because one address must not have an account on each —
  // signing in would then depend on which form you happened to use.
  const clash =
    (await one<{ id: string }>('SELECT id FROM admins WHERE lower(email) = $1', [email])) ??
    (await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]))
  if (clash) {
    res.status(409).json({ error: 'That email address already has an account.' })
    return
  }

  const rows = await query<{ id: string }>(
    'INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
    [name, email, await hashPassword(password)],
  )
  await record(req, 'admin.create', { type: 'admin', id: rows[0]!.id, label: email })

  // No credential echoed back: whoever typed the password has it already.
  res.status(201).json({ admin: { id: rows[0]!.id, name, email } })
})

/**
 * Suspending another admin, with two things it will not do.
 *
 * It will not suspend you — locking yourself out of the only surface that can
 * unlock you is a mistake nobody recovers from without database access. And it
 * will not suspend the last active one, for the same reason: an admin surface
 * with nobody able to sign in needs a person with psql to repair it.
 */
adminRouter.post('/admin/admins/:adminId/status', requireAdmin, async (req, res) => {
  const status = text(req.body?.status)
  if (status !== 'active' && status !== 'suspended') {
    res.status(400).json({ error: "Status must be 'active' or 'suspended'." })
    return
  }
  if (req.params.adminId === req.admin!.id) {
    res.status(400).json({ error: 'You cannot suspend your own account.' })
    return
  }

  if (status === 'suspended') {
    const others = await one<{ count: string }>(
      `SELECT count(*) AS count FROM admins
        WHERE status = 'active' AND id <> $1`,
      [req.params.adminId],
    )
    if (Number(others?.count ?? 0) === 0) {
      res.status(400).json({ error: 'That is the last active administrator.' })
      return
    }
  }

  const rows = await query<{ id: string }>(
    'UPDATE admins SET status = $1, updated_at = now() WHERE id = $2 RETURNING id',
    [status, req.params.adminId],
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'No such administrator.' })
    return
  }

  if (status === 'suspended') {
    // The open tab has to stop working, not merely the next sign-in.
    await query('DELETE FROM admin_sessions WHERE admin_id = $1', [req.params.adminId])
  }
  res.json({ ok: true, status })
})

/* ── what was done here ──────────────────────────────────── */

/**
 * The audit trail, newest first.
 *
 * Readable by any admin, deliberately: a record only one person can read is a
 * record that person can quietly be wrong about. There is no endpoint to
 * delete or amend one, for the same reason.
 */
adminRouter.get('/admin/events', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  const rows = await query(
    `SELECT id, admin_email, action, target_type, target_id, target_label, detail, created_at
       FROM admin_events
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    [limit],
  )
  res.json({ events: rows })
})

/**
 * One customer's settings, for the edit form to start from.
 *
 * Everything except the two secrets. A form that cannot show what is already
 * stored makes every edit a retyping exercise — the API base and the site id
 * are configuration, not credentials, and hiding them bought nothing.
 */
adminRouter.get('/admin/customers/:workspaceId', requireAdmin, async (req, res) => {
  const w = await one<{
    name: string
    perfox_api_base: string | null
    perfox_api_token_enc: string | null
    operator_api_host: string | null
    operator_site_id: string | null
    operator_site_secret_enc: string | null
    operator_workflow_id: string | null
  }>(
    `SELECT name, perfox_api_base, perfox_api_token_enc, operator_api_host,
            operator_site_id, operator_site_secret_enc, operator_workflow_id
       FROM workspaces WHERE id = $1`,
    [req.params.workspaceId],
  )

  if (!w) {
    res.status(404).json({ error: 'No such workspace.' })
    return
  }

  res.json({
    customer: {
      workspaceName: w.name,
      perfoxApiBase: w.perfox_api_base,
      operatorApiHost: w.operator_api_host,
      operatorSiteId: w.operator_site_id,
      operatorWorkflowId: w.operator_workflow_id,
      // Flags, so the form knows whether there is anything to reveal.
      hasApiToken: w.perfox_api_token_enc !== null,
      hasSiteSecret: w.operator_site_secret_enc !== null,
    },
  })
})

/**
 * The two secrets in the clear, asked for deliberately.
 *
 * This is the one endpoint in the system that returns a credential, and it
 * exists because an admin who set a key up is the person who has to read it
 * back when a customer asks what was configured. Everything about it is
 * arranged so that it cannot happen quietly:
 *
 *   · its own request, not part of loading the edit form, so a secret is in a
 *     response only when somebody pressed the eye
 *   · one workspace at a time; there is no endpoint that returns two
 *   · every call is written to the audit trail, naming the admin and the
 *     customer, so "who read this key?" has an answer
 *
 * The trail records that it was read, never what was read.
 */
adminRouter.get('/admin/customers/:workspaceId/credentials', requireAdmin, async (req, res) => {
  const w = await one<{
    name: string
    perfox_api_token_enc: string | null
    operator_site_secret_enc: string | null
  }>(
    `SELECT name, perfox_api_token_enc, operator_site_secret_enc
       FROM workspaces WHERE id = $1`,
    [req.params.workspaceId],
  )

  if (!w) {
    res.status(404).json({ error: 'No such workspace.' })
    return
  }

  await record(
    req,
    'customer.reveal',
    { type: 'customer', id: String(req.params.workspaceId), label: w.name },
    {
      fields: [
        w.perfox_api_token_enc ? 'perfox_api_token' : null,
        w.operator_site_secret_enc ? 'operator_site_secret' : null,
      ].filter(Boolean),
    },
  )

  res.json({
    perfoxApiToken: decrypt(w.perfox_api_token_enc),
    operatorSiteSecret: decrypt(w.operator_site_secret_enc),
  })
})
