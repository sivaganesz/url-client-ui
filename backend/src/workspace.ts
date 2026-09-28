import { one, type UserRow, type WorkspaceRow } from './db/index.ts'
import { decrypt } from './crypto.ts'

/**
 * A workspace's credentials, decrypted, for the length of one request.
 *
 * This is the only place the Perfox key is in the clear, and it never leaves
 * the backend: routes use it to sign an upstream request and then let it go.
 * Nothing here is ever serialised into a response — see `publicWorkspace`.
 */
export interface Credentials {
  id: string
  name: string
  /** REST, with no trailing slash. */
  apiBase: string | null
  apiToken: string | null
  operator: {
    apiHost: string | null
    siteId: string | null
    siteSecret: string | null
    workflowId: string | null
  }
}

/** What the browser is allowed to know: names and flags, never credentials. */
export interface PublicWorkspace {
  name: string
  /** REST is configured, so the pages can load data. */
  configured: boolean
  /** Operator calling is configured, so the Call button can be offered. */
  callingConfigured: boolean
}

export async function credentialsFor(user: UserRow): Promise<Credentials | null> {
  const w = await one<WorkspaceRow>('SELECT * FROM workspaces WHERE id = $1', [user.workspace_id])
  if (!w) return null

  return {
    id: w.id,
    name: w.name,
    // Trailing slashes are trimmed here rather than trusted from the database.
    // The Perfox API answers an unknown path with 401, not 404, so a base
    // ending in "/" builds ".../api/v1//agents" and looks exactly like a bad
    // key — an afternoon lost to the wrong problem.
    apiBase: w.perfox_api_base?.replace(/\/+$/, '') ?? null,
    apiToken: decrypt(w.perfox_api_token_enc),
    operator: {
      apiHost: w.operator_api_host?.replace(/\/+$/, '') ?? null,
      siteId: w.operator_site_id,
      siteSecret: decrypt(w.operator_site_secret_enc),
      workflowId: w.operator_workflow_id,
    },
  }
}

export function publicWorkspace(c: Credentials | null): PublicWorkspace {
  return {
    name: c?.name ?? '',
    configured: Boolean(c?.apiBase && c.apiToken),
    callingConfigured: Boolean(c?.operator.apiHost && c.operator.siteId && c.operator.siteSecret),
  }
}

/**
 * Strips both secrets from anything on its way to a log or a response.
 *
 * An upstream error that echoes the request back would otherwise carry the
 * key with it. Cheaper to redact unconditionally than to be sure it cannot
 * happen.
 */
export function redact(text: unknown, c: Credentials | null): string {
  let out = String(text)
  if (c?.apiToken) out = out.replaceAll(c.apiToken, 'sk_***redacted***')
  if (c?.operator.siteSecret) out = out.replaceAll(c.operator.siteSecret, 'sa_secret_***redacted***')
  return out
}
