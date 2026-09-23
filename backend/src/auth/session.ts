import type { Request, Response, NextFunction } from 'express'
import { one, query, type UserRow } from '../db/index.ts'
import { hashToken, newToken } from '../crypto.ts'
import { IS_PROD, SESSION_TTL_DAYS } from '../env.ts'

/**
 * Sessions, in an httpOnly cookie.
 *
 * Not a JWT, on purpose. Two reasons, and the second is the one that decided
 * it:
 *
 *   · a token in localStorage is readable by any injected script; an httpOnly
 *     cookie is not reachable from JavaScript at all
 *   · a JWT stays valid until it expires. Suspending a user, or signing them
 *     out everywhere, would need a revocation list — and once you are checking
 *     a list on every request you have paid the database cost anyway and kept
 *     none of the statelessness that justified the JWT
 *
 * This backend already reads the database on every proxied request to find the
 * caller's workspace credentials, so there was never any statelessness to
 * protect. Deleting a row logs someone out; that is the whole mechanism.
 */

export const COOKIE = 'ufsid'

/**
 * Reads our one cookie with a real type.
 *
 * `@types/express` declares `req.cookies` as `any`, so every use of it would
 * otherwise be unchecked — exactly the kind of thing strict mode is turned on
 * to catch.
 */
const cookie = (req: Request, name: string): string | undefined => {
  const jar = req.cookies as Record<string, string> | undefined
  return jar?.[name]
}

const maxAgeMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

export async function createSession(res: Response, user: UserRow, req: Request): Promise<void> {
  const token = newToken()
  const expires = new Date(Date.now() + maxAgeMs)

  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), user.id, expires, req.get('user-agent') ?? null, req.ip ?? null],
  )

  res.cookie(COOKIE, token, {
    httpOnly: true,
    // SameSite=Lax is doing the CSRF work here, and it only works because the
    // app and this API answer on one origin. Splitting them would force
    // SameSite=None and a CSRF defence written by hand.
    sameSite: 'lax',
    // Off in development so the cookie survives plain-HTTP localhost.
    secure: IS_PROD,
    path: '/',
    expires,
  })
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = cookie(req, COOKIE)
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  res.clearCookie(COOKIE, { path: '/' })
}

/**
 * The signed-in user, or null. Expired and suspended both read as null.
 *
 * Both suspensions are checked here rather than only at sign-in, which is what
 * makes either of them take effect on the next request instead of whenever the
 * cookie happens to expire. The workspace's is the one that suspends a
 * customer; the user's stops one person in it.
 */
export async function currentUser(req: Request): Promise<UserRow | null> {
  const token = cookie(req, COOKIE)
  if (!token) return null

  const user = await one<UserRow>(
    `SELECT u.* FROM sessions s
       JOIN users u      ON u.id = s.user_id
       JOIN workspaces w ON w.id = u.workspace_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.status = 'active'
        AND w.status = 'active'`,
    [hashToken(token)],
  )
  return user
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await currentUser(req)
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' })
    return
  }
  req.user = user
  next()
}

/** Expired rows are dead weight; this is called on boot and once a day. */
export async function sweepExpiredSessions(): Promise<number> {
  const rows = await query<{ token_hash: string }>(
    'DELETE FROM sessions WHERE expires_at < now() RETURNING token_hash',
  )
  return rows.length
}
