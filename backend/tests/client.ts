import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import app from '../src/app.ts'
import { encrypt } from '../src/crypto.ts'
import { query } from '../src/db/index.ts'
import { hashPassword } from '../src/auth/password.ts'

/**
 * The app on a real socket, plus the fixtures the tests need.
 *
 * A real listen and real fetch, rather than a request-injection library: the
 * cookie is the thing under test in most of these, and cookies are a property
 * of HTTP, not of Express's internals.
 */

let server: Server | null = null
let base = ''

export async function start(): Promise<string> {
  if (server) return base
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((done) => server!.once('listening', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return base
}

export async function stop(): Promise<void> {
  if (!server) return
  await new Promise<void>((done) => server!.close(() => done()))
  server = null
}

/**
 * A browser: one cookie jar, carried across requests.
 *
 * It keeps every cookie by name rather than just the customer session's,
 * because the two surfaces use different names — `ufsid` and `ufasid`. A jar
 * that only recognised one silently threw the other away, and every admin
 * test failed as though the session had not been created.
 */
export class Client {
  private jar = new Map<string, string>()

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.jar.size > 0) {
      headers.set(
        'cookie',
        [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '),
      )
    }
    if (init.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const res = await fetch(`${base}${path}`, { ...init, headers, redirect: 'manual' })

    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? ''
      const eq = pair.indexOf('=')
      if (eq < 1) continue
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      // An empty value is the server clearing it, which is a removal.
      if (value) this.jar.set(name, value)
      else this.jar.delete(name)
    }
    return res
  }

  post(path: string, body?: unknown): Promise<Response> {
    return this.request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  }

  get(path: string): Promise<Response> {
    return this.request(path)
  }

  async login(email: string, password: string): Promise<Response> {
    return this.post('/api/auth/login', { email, password })
  }

  /** A customer session specifically, not any cookie. */
  get hasSession(): boolean {
    return this.jar.has('ufsid')
  }
}

export interface Fixture {
  workspaceId: string
  userId: string
  email: string
  password: string
}

/**
 * A workspace and a user in it.
 *
 * `apiBase` points at whatever the caller wants — usually a fake upstream, so
 * a test can see which one a request actually reached.
 */
export async function makeWorkspace(opts: {
  name: string
  email: string
  apiBase?: string
  apiToken?: string
  operator?: { apiHost: string; siteId: string; siteSecret: string; workflowId?: string }
  password?: string
  status?: 'active' | 'suspended'
}): Promise<Fixture> {
  const password = opts.password ?? 'a-long-enough-password'

  const ws = await query<{ id: string }>(
    `INSERT INTO workspaces
       (name, perfox_api_base, perfox_api_token_enc,
        operator_api_host, operator_site_id, operator_site_secret_enc, operator_workflow_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      opts.name,
      opts.apiBase ?? null,
      opts.apiToken ? encrypt(opts.apiToken) : null,
      opts.operator?.apiHost ?? null,
      opts.operator?.siteId ?? null,
      opts.operator?.siteSecret ? encrypt(opts.operator.siteSecret) : null,
      opts.operator?.workflowId ?? null,
    ],
  )

  const user = await query<{ id: string }>(
    `INSERT INTO users (workspace_id, name, email, password_hash, role, status)
     VALUES ($1,$2,$3,$4,'owner',$5) RETURNING id`,
    [ws[0]!.id, opts.name + ' owner', opts.email, await hashPassword(password), opts.status ?? 'active'],
  )

  return { workspaceId: ws[0]!.id, userId: user[0]!.id, email: opts.email, password }
}

/** Empties every table between tests, so none can lean on another's rows. */
export async function truncate(): Promise<void> {
  await query('TRUNCATE workspaces, users, sessions RESTART IDENTITY CASCADE')
}
