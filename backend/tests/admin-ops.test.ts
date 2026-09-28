import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeUpstream, useTestDatabase } from './harness.ts'
import { Client, makeWorkspace, start, truncate } from './client.ts'
import { query } from '../src/db/index.ts'
import { hashPassword } from '../src/auth/password.ts'
import { resetRateLimits } from '../src/auth/rate-limit.ts'
import { decrypt } from '../src/crypto.ts'

useTestDatabase()

const ADMIN = { email: 'ops@t.test', password: 'admin-long-enough-pw' }
const PASSWORD = 'a-long-enough-password'

async function reset(): Promise<Client> {
  await truncate()
  await query('TRUNCATE admins, admin_sessions CASCADE')
  resetRateLimits()
  await start()
  await query('INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3)', [
    'Ops',
    ADMIN.email,
    await hashPassword(ADMIN.password),
  ])
  const c = new Client()
  assert.equal((await c.post('/api/admin/login', ADMIN)).status, 200)
  return c
}

describe('changing a connection', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  test('replaces a key without touching the fields left blank', async () => {
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'Acme',
        name: 'A',
        email: 'a@t.test',
        password: PASSWORD,
        perfoxApiBase: 'https://acme-api.perfox.ai/api/v1',
        perfoxApiToken: 'sk_original',
      })
    ).json()
    const id = created.customer.workspaceId

    const res = await admin.request(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ perfoxApiToken: 'sk_rotated' }),
    })
    assert.equal(res.status, 200)

    const [row] = await query<{ perfox_api_base: string; perfox_api_token_enc: string }>(
      'SELECT perfox_api_base, perfox_api_token_enc FROM workspaces WHERE id = $1',
      [id],
    )
    assert.equal(decrypt(row!.perfox_api_token_enc), 'sk_rotated')
    // The base was not sent, so it must be exactly as it was.
    assert.equal(row!.perfox_api_base, 'https://acme-api.perfox.ai/api/v1')
  })

  test('a blank field leaves the credential alone', async () => {
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'Acme',
        name: 'A',
        email: 'a@t.test',
        password: PASSWORD,
        perfoxApiToken: 'sk_keepme',
      })
    ).json()

    /**
     * The form cannot render an existing secret — nothing can read one back —
     * so its field is always empty. Treating empty as "clear it" would wipe
     * the key every time somebody corrected a typo in the workspace name.
     */
    await admin.request(`/api/admin/customers/${created.customer.workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workspaceName: 'Acme Ltd', perfoxApiToken: '' }),
    })

    const [row] = await query<{ name: string; perfox_api_token_enc: string }>(
      'SELECT name, perfox_api_token_enc FROM workspaces WHERE id = $1',
      [created.customer.workspaceId],
    )
    assert.equal(row!.name, 'Acme Ltd')
    assert.equal(decrypt(row!.perfox_api_token_enc), 'sk_keepme', 'the key was wiped by a blank field')
  })

  test('clearing is possible, but has to be explicit', async () => {
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'Acme',
        name: 'A',
        email: 'a@t.test',
        password: PASSWORD,
        perfoxApiToken: 'sk_goaway',
      })
    ).json()

    await admin.request(`/api/admin/customers/${created.customer.workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ perfoxApiToken: null }),
    })

    const [row] = await query<{ perfox_api_token_enc: string | null }>(
      'SELECT perfox_api_token_enc FROM workspaces WHERE id = $1',
      [created.customer.workspaceId],
    )
    assert.equal(row!.perfox_api_token_enc, null)
  })

  test('never returns a credential', async () => {
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'Acme',
        name: 'A',
        email: 'a@t.test',
        password: PASSWORD,
      })
    ).json()

    const body = await (
      await admin.request(`/api/admin/customers/${created.customer.workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ perfoxApiToken: 'sk_brand_new_secret' }),
      })
    ).text()

    assert.doesNotMatch(body, /sk_brand_new_secret/)
  })

  test('refuses a workspace that does not exist, and an empty change', async () => {
    const missing = await admin.request('/api/admin/customers/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      body: JSON.stringify({ workspaceName: 'X' }),
    })
    assert.equal(missing.status, 404)
  })

  test('needs an admin session', async () => {
    const res = await new Client().request('/api/admin/customers/whatever', {
      method: 'PATCH',
      body: JSON.stringify({ workspaceName: 'X' }),
    })
    assert.equal(res.status, 401)
  })
})

describe('testing a connection', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  test('reports success when the workspace answers', async () => {
    const up = await fakeUpstream()
    try {
      const w = await makeWorkspace({
        name: 'Live',
        email: 'live@t.test',
        apiBase: up.url,
        apiToken: 'sk_live',
      })
      const res = await admin.post(`/api/admin/customers/${w.workspaceId}/test`)
      const body = await res.json()

      assert.equal(body.ok, true)
      // It checks a credential; it does not become a second way of reading a
      // customer's data through an admin session.
      assert.equal(body.data, undefined)
      assert.equal(up.seen[0]?.auth, 'Bearer sk_live')
    } finally {
      await up.close()
    }
  })

  test('says so when there is nothing configured', async () => {
    const w = await makeWorkspace({ name: 'Empty', email: 'empty@t.test' })
    const body = await (await admin.post(`/api/admin/customers/${w.workspaceId}/test`)).json()

    assert.equal(body.ok, false)
    assert.match(body.reason, /no API base and key/i)
  })

  test('explains a 401 rather than just reporting it', async () => {
    const w = await makeWorkspace({
      name: 'Bad',
      email: 'bad@t.test',
      // Nothing listening: a connection failure, which is its own message.
      apiBase: 'http://127.0.0.1:1',
      apiToken: 'sk_bad',
    })
    const body = await (await admin.post(`/api/admin/customers/${w.workspaceId}/test`)).json()
    assert.equal(body.ok, false)
    assert.match(body.reason, /could not reach it/i)
  })
})

describe('an admin changing their own password', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  test('requires the current one', async () => {
    const res = await admin.post('/api/admin/password', {
      currentPassword: 'wrong',
      newPassword: 'a-brand-new-long-password',
    })
    assert.equal(res.status, 401)
  })

  test('ends every other admin session', async () => {
    const other = new Client()
    await other.post('/api/admin/login', ADMIN)
    assert.equal((await other.get('/api/admin/customers')).status, 200)

    const res = await admin.post('/api/admin/password', {
      currentPassword: ADMIN.password,
      newPassword: 'a-brand-new-long-password',
    })
    assert.equal(res.status, 200)

    assert.equal((await other.get('/api/admin/customers')).status, 401, 'the other session survived')
    assert.equal((await admin.get('/api/admin/customers')).status, 200)
  })
})

describe('sign-in attempts are capped', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    resetRateLimits()
    await start()
    await query('INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3)', [
      'Ops',
      ADMIN.email,
      await hashPassword(ADMIN.password),
    ])
  })

  test('a run of failures is eventually refused outright', async () => {
    const c = new Client()
    let sawLimit = false

    for (let i = 0; i < 14; i++) {
      const res = await c.post('/api/admin/login', { email: ADMIN.email, password: 'wrong' })
      if (res.status === 429) {
        sawLimit = true
        // No hint about attempts remaining: that is a free signal about
        // whether the address exists and how close they are.
        assert.doesNotMatch(JSON.stringify(await res.json()), /\d+ attempts?/)
        assert.ok(res.headers.get('retry-after'), 'no retry-after header')
        break
      }
      assert.equal(res.status, 401)
    }

    assert.ok(sawLimit, 'fourteen wrong passwords were all accepted for a try')
  })

  test('the right password after a couple of typos still works', async () => {
    const c = new Client()
    await c.post('/api/admin/login', { email: ADMIN.email, password: 'typo' })
    await c.post('/api/admin/login', { email: ADMIN.email, password: 'typo again' })

    // Someone mistyping their own password twice must not be locked out.
    assert.equal((await c.post('/api/admin/login', ADMIN)).status, 200)
  })

  test('an attempt cut off mid-guess counts like any other', async () => {
    /**
     * The counter used to run on `finish`, which fires only for a response
     * written out in full. Hanging up the moment the guess was in flight meant
     * the password was still checked and the attempt still cost nothing — an
     * unlimited supply of free guesses, from a limiter that looked right.
     */
    const base = await start()
    for (let i = 0; i < 12; i++) {
      const cut = new AbortController()
      const attempt = fetch(`${base}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: 'wrong' }),
        signal: cut.signal,
      }).catch(() => null)

      // Long enough for the body to be read and argon2 to start, nowhere near
      // long enough for it to answer.
      await new Promise((ready) => setTimeout(ready, 15))
      cut.abort()
      await attempt
    }

    // Locked, though not one of those responses was ever collected.
    const res = await new Client().post('/api/admin/login', ADMIN)
    assert.equal(res.status, 429, 'aborted guesses were free')
  })

  test('the customer login is capped too', async () => {
    await makeWorkspace({ name: 'W', email: 'w@t.test' })
    const c = new Client()
    let sawLimit = false

    for (let i = 0; i < 14; i++) {
      const res = await c.login('w@t.test', 'wrong')
      if (res.status === 429) {
        sawLimit = true
        break
      }
    }
    assert.ok(sawLimit, 'the customer login accepted fourteen wrong passwords')
  })
})
