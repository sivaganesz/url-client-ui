import type { Request, Response, NextFunction } from 'express'
import { one, query } from '../db/index.ts'
import { hashToken, newToken } from '../crypto.ts'
import { IS_PROD, SESSION_TTL_DAYS } from '../env.ts'

/**
 * Admin sessions — the same mechanism as a customer's, deliberately apart.
 *
 * A different cookie name and a different table. Neither can stand in for the
 * other: a customer's cookie is never looked up here, and an admin's is never
 * looked up there, so "could a customer session reach an admin route?" is not
 * a question about guards.
 *
 * The practical reason for the separate name is smaller but constant — with
 * one name, signing into either surface silently signs you out of the other in
 * the same browser.
 */

export const ADMIN_COOKIE = 'ufasid'

export interface AdminRow {
  id: string
  name: string
  email: string
  password_hash: string
  status: 'active' | 'suspended'
}

const cookie = (req: Request, name: string): string | undefined => {
  const jar = req.cookies as Record<string, string> | undefined
  return jar?.[name]
}

const maxAgeMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

export async function createAdminSession(
  res: Response,
  admin: AdminRow,
  req: Request,
): Promise<void> {
  const token = newToken()
  const expires = new Date(Date.now() + maxAgeMs)

  await query(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), admin.id, expires, req.get('user-agent') ?? null, req.ip ?? null],
  )

  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    // Scoped to the admin surface, so it is not even sent on the customer
    // console's requests. One fewer place it can be captured.
    path: '/',
    expires,
  })
}

export async function destroyAdminSession(req: Request, res: Response): Promise<void> {
  const token = cookie(req, ADMIN_COOKIE)
  if (token) await query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)])
  res.clearCookie(ADMIN_COOKIE, { path: '/' })
}

export async function currentAdmin(req: Request): Promise<AdminRow | null> {
  const token = cookie(req, ADMIN_COOKIE)
  if (!token) return null

  return one<AdminRow>(
    `SELECT a.* FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND a.status = 'active'`,
    [hashToken(token)],
  )
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminRow
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const admin = await currentAdmin(req)
  if (!admin) {
    res.status(401).json({ error: 'Not signed in.' })
    return
  }
  req.admin = admin
  next()
}

export async function sweepExpiredAdminSessions(): Promise<number> {
  const rows = await query<{ token_hash: string }>(
    'DELETE FROM admin_sessions WHERE expires_at < now() RETURNING token_hash',
  )
  return rows.length
}
