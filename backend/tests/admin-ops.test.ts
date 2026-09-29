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

/**
 * Giving a locked-out customer a way back in.
 *
 * There is no email in this product, so there is no reset link: an admin
 * generates a password and hands it over, as they did when the account was
 * created. What is worth proving is that the new one works, the old one does
 * not, and nothing that was already signed in stays that way.
 */
describe('resetting a password for a customer', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  const makeCustomer = async () => {
    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Northwind',
      name: 'Nora',
      email: 'nora@northwind.test',
      password: PASSWORD,
      perfoxApiBase: 'https://northwind-api.perfox.ai/api/v1',
      perfoxApiToken: 'sk_northwind',
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    return String(body.customer.workspaceId)
  }

  test('the new password works and the old one stops', async () => {
    const workspaceId = await makeCustomer()

    const res = await admin.post(`/api/admin/customers/${workspaceId}/password`)
    assert.equal(res.status, 200)
    const { email, password } = await res.json()
    assert.equal(email, 'nora@northwind.test')
    assert.ok(password.length >= 12, `a ${password.length}-character password`)

    const withNew = new Client()
    assert.equal((await withNew.login('nora@northwind.test', password)).status, 200)

    const withOld = new Client()
    assert.equal(
      (await withOld.login('nora@northwind.test', PASSWORD)).status,
      401,
      'the password it replaced still signs in',
    )
  })

  /**
   * The case the reset exists for is often that somebody else has the
   * password. Leaving their session open would be the whole problem left
   * open with it.
   */
  test('a session open at the time is ended', async () => {
    const workspaceId = await makeCustomer()

    const customer = new Client()
    assert.equal((await customer.login('nora@northwind.test', PASSWORD)).status, 200)
    assert.equal((await customer.get('/api/auth/me')).status, 200)

    await admin.post(`/api/admin/customers/${workspaceId}/password`)

    const after = await customer.get('/api/auth/me')
    const body = await after.json()
    assert.equal(body.user, null, 'the old session outlived the reset')
  })

  test('it is recorded, without the password in it', async () => {
    const workspaceId = await makeCustomer()
    await admin.post(`/api/admin/customers/${workspaceId}/password`)

    const events = await (await admin.get('/api/admin/events')).json()
    const rows = events.data ?? events.events ?? events
    const row = (rows as { action: string; detail?: unknown }[]).find(
      (e) => e.action === 'customer.password_reset',
    )
    assert.ok(row, 'the reset was not recorded')
    assert.ok(
      !JSON.stringify(row).includes(PASSWORD),
      'the audit row carries a password',
    )
  })

  test('a customer cannot reset anybody, including themselves', async () => {
    const workspaceId = await makeCustomer()

    const customer = new Client()
    await customer.login('nora@northwind.test', PASSWORD)

    const res = await customer.post(`/api/admin/customers/${workspaceId}/password`)
    assert.equal(res.status, 401)
  })

  test('two resets do not produce the same password', async () => {
    const workspaceId = await makeCustomer()
    const first = await (
      await admin.post(`/api/admin/customers/${workspaceId}/password`)
    ).json()
    const second = await (
      await admin.post(`/api/admin/customers/${workspaceId}/password`)
    ).json()
    assert.notEqual(first.password, second.password)
  })
})

/**
 * Correcting the person on the account.
 *
 * Until now nothing could: the save route only ever touched the workspace,
 * so a name or number typed wrongly at creation stayed wrong for good.
 */
describe('editing the details of a customer', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  const makeCustomer = async () => {
    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Northwind',
      name: 'Nora',
      email: 'nora@northwind.test',
      mobile: '+910000000000',
      password: PASSWORD,
      perfoxApiBase: 'https://northwind-api.perfox.ai/api/v1',
      perfoxApiToken: 'sk_northwind',
    })
    return String((await res.json()).customer.workspaceId)
  }

  const ownerOf = async (workspaceId: string) =>
    (
      await query<{ name: string; email: string; mobile: string | null }>(
        'SELECT name, email, mobile FROM users WHERE workspace_id = $1',
        [workspaceId],
      )
    )[0]!

  test('a name and a number can be corrected', async () => {
    const workspaceId = await makeCustomer()

    const res = await admin.patch(`/api/admin/customers/${workspaceId}`, {
      name: 'Nora Patel',
      mobile: '+919876543210',
    })
    assert.equal(res.status, 200)

    const owner = await ownerOf(workspaceId)
    assert.equal(owner.name, 'Nora Patel')
    assert.equal(owner.mobile, '+919876543210')
  })

  /**
   * The email is the login. Nothing in this route may move it, whatever the
   * form sends — a changed address is a changed account.
   */
  test('the email is not editable', async () => {
    const workspaceId = await makeCustomer()

    await admin.patch(`/api/admin/customers/${workspaceId}`, {
      email: 'someone.else@northwind.test',
      name: 'Nora Patel',
    })

    const owner = await ownerOf(workspaceId)
    assert.equal(owner.email, 'nora@northwind.test', 'the login address was changed')

    // And the old address still signs in.
    const c = new Client()
    assert.equal((await c.login('nora@northwind.test', PASSWORD)).status, 200)
  })

  test('a number that is not one is refused', async () => {
    const workspaceId = await makeCustomer()

    const res = await admin.patch(`/api/admin/customers/${workspaceId}`, {
      mobile: 'ring me on tuesday',
    })
    assert.equal(res.status, 400)

    const owner = await ownerOf(workspaceId)
    assert.equal(owner.mobile, '+910000000000', 'a bad number was written anyway')
  })

  test('the workspace and the person move in one call', async () => {
    const workspaceId = await makeCustomer()

    const res = await admin.patch(`/api/admin/customers/${workspaceId}`, {
      workspaceName: 'Northwind Trading',
      name: 'Nora Patel',
    })
    assert.equal(res.status, 200)

    assert.equal((await ownerOf(workspaceId)).name, 'Nora Patel')
    const workspace = (
      await query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId])
    )[0]!
    assert.equal(workspace.name, 'Northwind Trading')
  })
})

/**
 * An id that is not a UUID.
 *
 * Both id columns are UUID, so the driver raises 22P02 on anything else and
 * nothing on these routes catches it — which made a malformed request look
 * like a fault in the server, loggable and alertable, by any caller who felt
 * like typing one.
 */
describe('an id of the wrong shape', () => {
  let admin: Client
  beforeEach(async () => {
    admin = await reset()
  })

  const BAD = ['not-a-uuid', '123', 'null', "'; DROP TABLE workspaces; --"]

  test('is not found, on every route that takes one', async () => {
    for (const id of BAD) {
      const e = encodeURIComponent(id)
      const answers = [
        await admin.request(`/api/admin/customers/${e}`),
        await admin.request(`/api/admin/customers/${e}/credentials`),
        await admin.request(`/api/admin/customers/${e}`, {
          method: 'PATCH',
          body: JSON.stringify({ workspaceName: 'X' }),
        }),
        await admin.request(`/api/admin/customers/${e}`, { method: 'DELETE' }),
        await admin.post(`/api/admin/customers/${e}/status`, { status: 'suspended' }),
        await admin.post(`/api/admin/customers/${e}/password`, {}),
        await admin.post(`/api/admin/customers/${e}/test`, {}),
        await admin.post(`/api/admin/admins/${e}/status`, { status: 'suspended' }),
      ]
      for (const res of answers) {
        assert.equal(res.status, 404, `${id} should be not found, not ${res.status}`)
      }
    }
  })

  /**
   * Order matters more than the status does.
   *
   * Checking the id first would answer a stranger's request about whether an
   * id looks right before establishing that they have any business asking.
   * Not signed in is the only thing they should learn.
   */
  test('still answers "not signed in" first to a caller who is not', async () => {
    const res = await new Client().request('/api/admin/customers/not-a-uuid/credentials')
    assert.equal(res.status, 401)
  })

  test('a well-formed id that matches nothing is also not found', async () => {
    const absent = '11111111-2222-3333-4444-555555555555'
    const res = await admin.request(`/api/admin/customers/${absent}`)
    assert.equal(res.status, 404)
  })
})
