import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useTestDatabase } from './harness.ts'
import { Client, makeWorkspace, start, truncate } from './client.ts'

useTestDatabase()

const PASSWORD = 'a-long-enough-password'

describe('signing in', () => {
  beforeEach(async () => {
    await truncate()
    await start()
    await makeWorkspace({
      name: 'Acme',
      email: 'owner@acme.test',
      apiBase: 'http://127.0.0.1:1',
      apiToken: 'sk_acme_key_should_never_be_sent_to_a_browser',
      operator: {
        apiHost: 'https://acme-api.perfox.ai',
        siteId: 'sa_site_live_ACME',
        siteSecret: 'sa_secret_live_ACME',
      },
    })
  })

  test('the response carries no credential of any kind', async () => {
    const c = new Client()
    const body = await (await c.login('owner@acme.test', PASSWORD)).text()

    /**
     * The reason this backend exists. A key here would be readable in
     * devtools by anyone who could sign in, would outlive their session, and
     * would let them bypass every permission added later.
     */
    assert.doesNotMatch(body, /sk_acme_key/, 'the workspace API key was in the login response')
    assert.doesNotMatch(body, /sa_secret/, 'the operator site secret was in the login response')
    assert.doesNotMatch(body, /127\.0\.0\.1:1/, 'the workspace API base was in the login response')

    // What it should carry: identity, and two flags about the workspace.
    const json = JSON.parse(body)
    assert.equal(json.user.email, 'owner@acme.test')
    assert.equal(json.workspace.name, 'Acme')
    assert.equal(json.workspace.configured, true)
    assert.equal(json.workspace.callingConfigured, true)
    assert.equal(json.workspace.apiToken, undefined)
    assert.equal(json.workspace.apiBase, undefined)
  })

  test('the session cookie is httpOnly and scoped', async () => {
    const c = new Client()
    const res = await c.login('owner@acme.test', PASSWORD)
    const cookie = res.headers.get('set-cookie') ?? ''

    assert.match(cookie, /^ufsid=/)
    // httpOnly is what stops an injected script reading it. Without it the
    // cookie is no safer than a token in localStorage.
    assert.match(cookie, /HttpOnly/i)
    // SameSite=Lax is what has the browser block CSRF for us, and it only
    // works because the app and this API answer on one origin.
    assert.match(cookie, /SameSite=Lax/i)
    assert.match(cookie, /Path=\//i)
  })

  test('a wrong password and an unknown address are indistinguishable', async () => {
    const wrong = await new Client().login('owner@acme.test', 'not-the-password')
    const unknown = await new Client().login('nobody@acme.test', 'not-the-password')

    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)

    /**
     * Same status and same words, so the response cannot be used to work out
     * which addresses have access here. The timing is evened out too — the
     * unknown-email path runs a decoy verification rather than returning
     * early — though timing is not asserted, since a CI runner's variance
     * would make it flaky and the assertion would get deleted.
     */
    assert.deepEqual(await wrong.json(), await unknown.json())
  })

  test('a failed attempt sets no cookie', async () => {
    const c = new Client()
    await c.login('owner@acme.test', 'not-the-password')
    assert.equal(c.hasSession, false)
    assert.equal((await c.get('/api/config')).status, 401)
  })

  test('a suspended account cannot sign in at all', async () => {
    await makeWorkspace({
      name: 'Gone',
      email: 'gone@acme.test',
      status: 'suspended',
      apiBase: 'http://127.0.0.1:1',
      apiToken: 'k',
    })
    const res = await new Client().login('gone@acme.test', PASSWORD)
    assert.equal(res.status, 401)
  })

  test('the address is matched without regard to case or surrounding space', async () => {
    const res = await new Client().login('  OWNER@Acme.TEST  ', PASSWORD)
    assert.equal(res.status, 200, 'a capitalised address was treated as a different account')
  })
})

describe('who am I', () => {
  beforeEach(async () => {
    await truncate()
    await start()
    await makeWorkspace({ name: 'Acme', email: 'owner@acme.test' })
  })

  test('answers 200 with no user when signed out, not 401', async () => {
    const res = await new Client().get('/api/auth/me')

    /**
     * A first visit is a signed-out visit. Answering 401 would have the
     * browser log a console error on every cold load of the login page — the
     * most ordinary thing a visitor can do — and train everyone to ignore
     * errors there.
     */
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { user: null, workspace: null })
  })

  test('reports an unconfigured workspace rather than pretending', async () => {
    const c = new Client()
    const body = await (await c.login('owner@acme.test', PASSWORD)).json()

    // The account exists; nobody has connected it to Perfox yet. A real
    // state, and the UI says so instead of showing six broken pages.
    assert.equal(body.workspace.name, 'Acme')
    assert.equal(body.workspace.configured, false)
    assert.equal(body.workspace.callingConfigured, false)
  })
})

describe('registration', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  test('is refused, and says who to ask', async () => {
    const res = await new Client().post('/api/auth/register', {
      name: 'Someone',
      email: 'someone@example.test',
      password: PASSWORD,
    })

    // Off unless ALLOW_REGISTRATION is set. The console reads real customer
    // conversations, so a public sign-up form is a door onto them.
    assert.equal(res.status, 403)
    assert.match((await res.json()).error, /administrator|invitation/i)
  })
})

describe('changing a password', () => {
  beforeEach(async () => {
    await truncate()
    await start()
    await makeWorkspace({ name: 'Acme', email: 'owner@acme.test' })
  })

  test('requires the current one', async () => {
    const c = new Client()
    await c.login('owner@acme.test', PASSWORD)

    const res = await c.post('/api/auth/password', {
      currentPassword: 'wrong',
      newPassword: 'a-brand-new-long-password',
    })
    assert.equal(res.status, 401)
  })

  test('refuses one that is too short', async () => {
    const c = new Client()
    await c.login('owner@acme.test', PASSWORD)

    const res = await c.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'short',
    })
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /12 characters/)
  })

  test('ends every other session', async () => {
    const laptop = new Client()
    const phone = new Client()
    await laptop.login('owner@acme.test', PASSWORD)
    await phone.login('owner@acme.test', PASSWORD)

    const res = await laptop.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-long-password',
    })
    assert.equal(res.status, 200)

    /**
     * Changing a password is what someone does when they think one has been
     * taken. Leaving the other sessions alive defeats the point of it.
     */
    assert.equal((await phone.get('/api/config')).status, 401, 'the other session survived')
    // The browser that made the change stays signed in, on a fresh session.
    assert.equal((await laptop.get('/api/config')).status, 200)

    assert.equal((await new Client().login('owner@acme.test', PASSWORD)).status, 401)
    assert.equal(
      (await new Client().login('owner@acme.test', 'a-brand-new-long-password')).status,
      200,
    )
  })
})

describe('sessions', () => {
  beforeEach(async () => {
    await truncate()
    await start()
    await makeWorkspace({ name: 'Acme', email: 'owner@acme.test' })
  })

  test('an expired session is refused', async () => {
    const c = new Client()
    await c.login('owner@acme.test', PASSWORD)
    assert.equal((await c.get('/api/config')).status, 200)

    const { query } = await import('../src/db/index.ts')
    await query(`UPDATE sessions SET expires_at = now() - interval '1 second'`)

    assert.equal((await c.get('/api/config')).status, 401, 'an expired session still worked')
  })

  test('the table stores a hash, not the cookie', async () => {
    const c = new Client()
    const res = await c.login('owner@acme.test', PASSWORD)
    const token = (res.headers.get('set-cookie') ?? '').split(';')[0]?.replace('ufsid=', '') ?? ''

    const { query } = await import('../src/db/index.ts')
    const rows = await query<{ token_hash: string }>('SELECT token_hash FROM sessions')

    assert.equal(rows.length, 1)
    assert.ok(token.length > 20)
    /**
     * Someone who can read this table must not be able to use what they find
     * to impersonate anyone — the same reason passwords are not stored either.
     */
    assert.notEqual(rows[0]!.token_hash, token, 'the raw session token was stored')
  })

  test('a forged cookie is refused', async () => {
    const res = await new Client().request('/api/config', {
      headers: { cookie: 'ufsid=this-is-not-a-real-token' },
    })
    assert.equal(res.status, 401)
  })
})
