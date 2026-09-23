import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Who is signed in, and which workspace they reach.
 *
 * The browser never holds a Perfox credential. It holds a session cookie it
 * cannot even read — httpOnly — and the backend decides, per request, which
 * workspace that cookie means. So this context carries names and flags only:
 * enough to render the shell and to explain what is not configured, and
 * nothing that would let a page talk to Perfox directly.
 *
 * That is the whole point of the design. A login response carrying the
 * workspace's API key would be readable in devtools by anyone who could sign
 * in, would outlive their session, and would let them bypass every permission
 * added later.
 */

export interface SessionUser {
  id: string
  name: string
  email: string
  mobile: string | null
  role: 'owner' | 'member'
}

export interface SessionWorkspace {
  name: string
  /** REST credentials are set, so the pages can load data. */
  configured: boolean
  /** Operator credentials are set, so calls can be placed. */
  callingConfigured: boolean
}

export interface Session {
  status: 'loading' | 'signed-in' | 'signed-out'
  user: SessionUser | null
  workspace: SessionWorkspace | null
  signIn: (email: string, password: string) => Promise<void>
  /** Throws with the server's wording if the current password is wrong. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
  /** Re-reads /auth/me — after a workspace is configured, say. */
  refresh: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

/** Reads the error an endpoint reported, or falls back to something true. */
async function problem(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [workspace, setWorkspace] = useState<SessionWorkspace | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    // /auth/me answers 200 with user:null when signed out. A 401 would have
    // the browser log an error on every cold load of the login page, which is
    // the most ordinary thing a visitor can do.
    const res = await fetch('/api/auth/me', { signal })
    if (!res.ok) throw new Error(await problem(res, 'Could not reach the server.'))
    const body = (await res.json()) as { user: SessionUser | null; workspace: SessionWorkspace | null }
    setUser(body.user)
    setWorkspace(body.workspace)
    setStatus(body.user ? 'signed-in' : 'signed-out')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).catch((err: Error) => {
      if (err.name === 'AbortError') return
      // Unreachable backend is indistinguishable from signed out, as far as
      // what the app can do about it: show the login page and let the attempt
      // report the real problem.
      setStatus('signed-out')
    })
    return () => controller.abort()
  }, [load])

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error(await problem(res, 'Could not sign in.'))
    const body = (await res.json()) as { user: SessionUser; workspace: SessionWorkspace }
    setUser(body.user)
    setWorkspace(body.workspace)
    setStatus('signed-in')
  }, [])

  /**
   * Changing your own password. Every other session ends server-side and this
   * one is re-issued, so nothing here has to re-authenticate afterwards.
   */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!res.ok) throw new Error(await problem(res, 'Could not change the password.'))
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setWorkspace(null)
    setStatus('signed-out')
  }, [])

  return (
    <SessionContext.Provider
      value={{ status, user, workspace, signIn, signOut, changePassword, refresh: () => load() }}
    >
      {children}
    </SessionContext.Provider>
  )
}
