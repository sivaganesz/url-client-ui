import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * The admin session, kept entirely apart from the customer one.
 *
 * Separate context, separate endpoints, separate cookie. The two never mix:
 * being signed in here says nothing about being signed in there, and neither
 * can stand in for the other — which is the same separation the backend makes
 * with two tables.
 *
 * An admin never sees a workspace's data. They provision accounts; they do not
 * read anybody's conversations.
 */

export interface Admin {
  id: string
  name: string
  email: string
}

export interface AdminSession {
  status: 'loading' | 'signed-in' | 'signed-out'
  admin: Admin | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AdminContext = createContext<AdminSession | null>(null)

export function useAdmin(): AdminSession {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>')
  return ctx
}

async function problem(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminSession['status']>('loading')
  const [admin, setAdmin] = useState<Admin | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    // 200 with admin:null when signed out — a cold load of the login page is
    // the most ordinary thing here, and a 401 would log an error every time.
    const res = await fetch('/api/admin/me', { signal })
    if (!res.ok) throw new Error(await problem(res, 'Could not reach the server.'))
    const body = (await res.json()) as { admin: Admin | null }
    setAdmin(body.admin)
    setStatus(body.admin ? 'signed-in' : 'signed-out')
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).catch((err: Error) => {
      if (err.name !== 'AbortError') setStatus('signed-out')
    })
    return () => controller.abort()
  }, [load])

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error(await problem(res, 'Could not sign in.'))
    setAdmin(((await res.json()) as { admin: Admin }).admin)
    setStatus('signed-in')
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    setAdmin(null)
    setStatus('signed-out')
  }, [])

  return (
    <AdminContext.Provider value={{ status, admin, signIn, signOut }}>
      {children}
    </AdminContext.Provider>
  )
}

/* ── what the admin surface talks to ─────────────────────── */

export interface CustomerRow {
  workspace_id: string
  workspace_name: string
  perfox_api_base: string | null
  has_api_token: boolean
  has_operator: boolean
  user_id: string | null
  user_name: string | null
  email: string | null
  mobile: string | null
  status: string | null
  created_at: string
}

/** Another person who can sign in at /admin/login. */
export interface AdminRow {
  id: string
  name: string
  email: string
  status: string
  created_at: string
  /** When a session was last issued to them — blank means never signed in. */
  last_seen: string | null
}

/** What a paged list answers with, alongside its rows. */
export interface Pagination {
  page: number
  page_size: number
  total: number
  total_pages: number
}

/** One thing an admin did, as the audit trail records it. */
export interface AdminEvent {
  id: number
  admin_email: string
  action: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  detail: Record<string, unknown>
  created_at: string
}

/** A workspace's settings as the edit form starts from them — never a secret. */
export interface CustomerDetail {
  workspaceName: string
  perfoxApiBase: string | null
  operatorApiHost: string | null
  operatorSiteId: string | null
  operatorWorkflowId: string | null
  hasApiToken: boolean
  hasSiteSecret: boolean
}

export interface NewCustomer {
  workspaceName: string
  name: string
  email: string
  mobile?: string
  password: string
  perfoxApiBase?: string
  perfoxApiToken?: string
  operatorApiHost?: string
  operatorSiteId?: string
  operatorSiteSecret?: string
  operatorWorkflowId?: string
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(await problem(res, `The server answered ${res.status}.`))
  return (await res.json()) as T
}

export const adminApi = {
  customers: () => send<{ customers: CustomerRow[] }>('/api/admin/customers'),

  /**
   * Creates a workspace and its first user.
   *
   * The response carries no credential back — not the key, not the secret, not
   * the password. The admin typed them; reading them back out is a capability
   * worth not having.
   */
  createCustomer: (input: NewCustomer) =>
    send<{ customer: { workspaceId: string; userId: string; email: string } }>(
      '/api/admin/customers',
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /**
   * Changes a workspace's connection.
   *
   * Only the fields passed are touched; a blank string means "leave it" and
   * `null` means "clear it". The form can never show an existing secret —
   * nothing reads one back — so its field is always empty, and treating empty
   * as a clear would wipe the key on every unrelated edit.
   */
  updateCustomer: (workspaceId: string, changes: Partial<NewCustomer>) =>
    send<{ ok: true }>(`/api/admin/customers/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  /** Everything the edit form starts from, minus the two secrets. */
  customer: (workspaceId: string) =>
    send<{ customer: CustomerDetail }>(`/api/admin/customers/${workspaceId}`),

  /**
   * The two secrets in the clear.
   *
   * Its own call, made when somebody presses the eye and not before, because
   * every one of them is written to the audit trail. Loading it with the form
   * would put a credential in a response nobody asked for and an entry in the
   * trail nobody meant.
   */
  reveal: (workspaceId: string) =>
    send<{ perfoxApiToken: string | null; operatorSiteSecret: string | null }>(
      `/api/admin/customers/${workspaceId}/credentials`,
    ),

  /**
   * Removes the workspace, its users and their sessions.
   *
   * Nothing in Perfox is touched — the conversations belong to the workspace
   * over there, and this console only held the key to reach them.
   */
  deleteCustomer: (workspaceId: string) =>
    send<{ ok: true }>(`/api/admin/customers/${workspaceId}`, { method: 'DELETE' }),

  /** Asks the workspace whether its stored credentials actually work. */
  testConnection: (workspaceId: string) =>
    send<{ ok: boolean; reason: string }>(`/api/admin/customers/${workspaceId}/test`, {
      method: 'POST',
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    send<{ ok: true }>('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  admins: () => send<{ admins: AdminRow[] }>('/api/admin/admins'),

  /**
   * The audit trail, paged on the server.
   *
   * The only admin list that is: it only ever grows, since nothing deletes
   * from it, so a page of it is what anybody needs and the whole of it is not
   * something to send.
   */
  events: (page = 1, pageSize = 25) =>
    send<{ events: AdminEvent[]; pagination: Pagination }>(
      `/api/admin/events?page=${page}&page_size=${pageSize}`,
    ),

  addAdmin: (body: { name: string; email: string; password: string }) =>
    send<{ admin: { id: string } }>('/api/admin/admins', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  setAdminStatus: (adminId: string, status: 'active' | 'suspended') =>
    send<{ ok: true }>(`/api/admin/admins/${adminId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  /** Suspends the customer — the workspace and everyone in it, not one user. */
  setStatus: (workspaceId: string, status: 'active' | 'suspended') =>
    send<{ ok: true }>(`/api/admin/customers/${workspaceId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
}
