import { Router } from 'express'
import { one, query, type UserRow } from '../db/index.ts'
import { hashPassword, passwordProblem, verifyPassword, wasteTime } from '../auth/password.ts'
import { createSession, currentUser, destroySession, requireAuth } from '../auth/session.ts'
import { credentialsFor, publicWorkspace } from '../workspace.ts'
import { ALLOW_REGISTRATION } from '../env.ts'
import { limitLogins } from '../auth/rate-limit.ts'

export const authRouter: Router = Router()

/** Everything the browser is allowed to know about who it is signed in as. */
async function identity(user: UserRow) {
  const creds = await credentialsFor(user)
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
    },
    // Deliberately only the name and two flags. The API base and token stay
    // in this process: the browser talks to /api/perfox/* and this backend
    // decides which workspace that means. A key in a login response would be
    // readable in devtools by anyone who could sign in, would outlive their
    // session, and would let them bypass every permission we add later.
    workspace: publicWorkspace(creds),
  }
}

const isEmail = (s: unknown): s is string =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

authRouter.post('/auth/login', limitLogins, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' })
    return
  }

  const user = await one<UserRow>('SELECT * FROM users WHERE lower(email) = $1', [email])

  /**
   * One message and one shape for every failure.
   *
   * "No such account" and "wrong password" as separate answers would let
   * anyone confirm which email addresses have access here. The decoy hash
   * keeps the timing similar too, since an early return is its own signal.
   */
  if (!user) {
    await wasteTime()
    res.locals.loginFailed = true
    res.status(401).json({ error: 'Those details did not match an account.' })
    return
  }

  const ok = await verifyPassword(user.password_hash, password)
  if (!ok || user.status !== 'active') {
    res.locals.loginFailed = true
    res.status(401).json({ error: 'Those details did not match an account.' })
    return
  }

  await createSession(res, user, req)
  res.json(await identity(user))
})

authRouter.post('/auth/logout', async (req, res) => {
  await destroySession(req, res)
  res.json({ ok: true })
})

/** Who am I? The frontend calls this on boot to decide what to render. */
authRouter.get('/auth/me', async (req, res) => {
  const user = await currentUser(req)
  if (!user) {
    // Not an error: a first visit is a logged-out visit, and a 401 here would
    // have the browser log one on every cold load.
    res.json({ user: null, workspace: null })
    return
  }
  res.json(await identity(user))
})

/**
 * Registration, off by default.
 *
 * The console reaches real customer conversations, so a public sign-up form is
 * a door onto them. Accounts are created directly in the database until the
 * invite flow exists — at which point this becomes "accept an invitation"
 * rather than "create an account", and the workspace comes from the invite
 * instead of being chosen by whoever is filling the form in.
 *
 * The endpoint exists now so the page has something to talk to, and refuses
 * so that shipping it changes nothing.
 */
authRouter.post('/auth/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) {
    res.status(403).json({
      error:
        'Registration is not open. Your workspace administrator creates accounts — ask them for an invitation.',
    })
    return
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const email = isEmail(req.body?.email) ? req.body.email.trim().toLowerCase() : ''
  const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile.trim() : null
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!name || !email) {
    res.status(400).json({ error: 'Name and a valid email address are required.' })
    return
  }
  const problem = passwordProblem(password)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  const workspaceId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : ''
  const workspace = workspaceId
    ? await one<{ id: string }>('SELECT id FROM workspaces WHERE id = $1', [workspaceId])
    : null
  if (!workspace) {
    res.status(400).json({ error: 'That workspace does not exist.' })
    return
  }

  const taken = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (taken) {
    res.status(409).json({ error: 'That email address already has an account.' })
    return
  }

  const rows = await query<UserRow>(
    `INSERT INTO users (workspace_id, name, email, mobile, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspace.id, name, email, mobile, await hashPassword(password)],
  )
  const user = rows[0]!

  await createSession(res, user, req)
  res.status(201).json(await identity(user))
})

/** Change your own password. Requires the current one, even when signed in. */
authRouter.post('/auth/password', requireAuth, async (req, res) => {
  const user = req.user!
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''

  if (!(await verifyPassword(user.password_hash, current))) {
    res.status(401).json({ error: 'Your current password is not right.' })
    return
  }
  const problem = passwordProblem(next)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    await hashPassword(next),
    user.id,
  ])
  // Every other session goes: changing a password is what someone does when
  // they think one has been taken, and leaving the others alive defeats it.
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id])
  await createSession(res, user, req)

  res.json({ ok: true })
})
