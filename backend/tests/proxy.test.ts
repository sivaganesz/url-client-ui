import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { fakeUpstream, useTestDatabase } from './harness.ts'
import { Client, makeWorkspace, start, truncate } from './client.ts'
import { decrypt, encrypt } from '../src/crypto.ts'

useTestDatabase()

const PASSWORD = 'a-long-enough-password'

describe('the proxy', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  test('forwards only what the app actually asks for', async () => {
    const up = await fakeUpstream()
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      // Every path the frontend uses, including the nested ones that a
      // wildcard-array bug once turned into "analytics,summary" and 403'd.
      for (const path of [
        'agents',
        'conversations',
        'customers',
        'calls',
        'cases',
        'analytics/summary',
        'analytics/conversations-over-time',
        'billing/credits',
        'credentials',
      ]) {
        const res = await c.get(`/api/perfox/${path}`)
        assert.equal(res.status, 200, `${path} was refused`)
      }
    } finally {
      await up.close()
    }
  })

  test('refuses everything else, however ordinary it looks', async () => {
    const up = await fakeUpstream()
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      /**
       * This process holds a key that can rewrite an entire workspace. A
       * signed-in user should not be able to reach further through it than
       * the app does — so the proxy is an allowlist, and these are real
       * Perfox resources it deliberately does not expose.
       */
      // 'credentials' is deliberately NOT here any more — the Phone Numbers
      // page needs it, and it returns field names, never field values.
      for (const path of ['mcp-servers', 'knowledge-base', 'support/tickets']) {
        const res = await c.get(`/api/perfox/${path}`)
        assert.equal(res.status, 403, `${path} was allowed through`)
      }

      assert.equal(up.seen.length, 0, 'a refused path still reached the workspace')
    } finally {
      await up.close()
    }
  })

  test('refuses a write that is not named, even on an allowed path', async () => {
    const up = await fakeUpstream()
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      // Reading agents is allowed; deleting one is not. The method is part
      // of the rule, not an afterthought.
      assert.equal((await c.get('/api/perfox/agents')).status, 200)
      assert.equal(
        (await c.request('/api/perfox/agents', { method: 'DELETE' })).status,
        403,
        'an unnamed method was forwarded',
      )
    } finally {
      await up.close()
    }
  })

  test('needs a session, not merely a well-formed path', async () => {
    const up = await fakeUpstream()
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })

      const anonymous = new Client()
      assert.equal((await anonymous.get('/api/perfox/agents')).status, 401)
      assert.equal(up.seen.length, 0, 'an unauthenticated request reached the workspace')
    } finally {
      await up.close()
    }
  })

  test('says so plainly when the workspace has no credentials', async () => {
    await makeWorkspace({ name: 'Unconfigured', email: 'u@t.test' })
    const c = new Client()
    await c.login('u@t.test', PASSWORD)

    const res = await c.get('/api/perfox/agents')
    assert.equal(res.status, 503)
    assert.match((await res.json()).error, /no Perfox connection configured/i)
  })

  test('passes the query string through', async () => {
    const up = await fakeUpstream()
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      await c.get('/api/perfox/analytics/conversations-over-time?interval=week')
      assert.match(up.seen[0]?.path ?? '', /interval=week/)
    } finally {
      await up.close()
    }
  })
})

describe('operator signing', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  test('signs the identity correctly and withholds the secret', async () => {
    await makeWorkspace({
      name: 'A',
      email: 'a@t.test',
      operator: {
        apiHost: 'https://a-api.perfox.ai',
        siteId: 'sa_site_live_AAA',
        siteSecret: 'sa_secret_live_AAA',
        workflowId: 'wf-1',
      },
    })
    const c = new Client()
    const login = await (await c.login('a@t.test', PASSWORD)).json()

    const res = await c.get('/api/operator/config')
    const body = await res.text()
    assert.doesNotMatch(body, /sa_secret/, 'the site secret was in the response')

    const cfg = JSON.parse(body)
    assert.equal(cfg.configured, true)
    assert.equal(cfg.siteId, 'sa_site_live_AAA')

    /**
     * The external id is derived from the signed-in user, never taken from
     * the request — otherwise a client could name its own and sign in as any
     * operator on the workspace's site.
     */
    assert.equal(cfg.operator.externalId, `op_${login.user.id}`)

    const expected = createHmac('sha256', 'sa_secret_live_AAA')
      .update(`sa_site_live_AAA.${cfg.operator.externalId}`)
      .digest('hex')
    assert.equal(cfg.operator.userHash, expected, 'the signature does not verify')
  })

  test('answers 200 with configured:false rather than an error', async () => {
    await makeWorkspace({ name: 'A', email: 'a@t.test' })
    const c = new Client()
    await c.login('a@t.test', PASSWORD)

    const res = await c.get('/api/operator/config')
    /**
     * "Not configured" is a true answer to "what is the config?". A non-2xx
     * would have the browser log an error on every page load of a workspace
     * that simply does not have calling set up.
     */
    assert.equal(res.status, 200)
    assert.equal((await res.json()).configured, false)
  })

  test('two workspaces get different signatures', async () => {
    await makeWorkspace({
      name: 'A',
      email: 'a@t.test',
      operator: { apiHost: 'https://a.test', siteId: 'sa_site_A', siteSecret: 'secret_A' },
    })
    await makeWorkspace({
      name: 'B',
      email: 'b@t.test',
      operator: { apiHost: 'https://b.test', siteId: 'sa_site_B', siteSecret: 'secret_B' },
    })

    const a = new Client()
    const b = new Client()
    await a.login('a@t.test', PASSWORD)
    await b.login('b@t.test', PASSWORD)

    const ca = await (await a.get('/api/operator/config')).json()
    const cb = await (await b.get('/api/operator/config')).json()

    assert.notEqual(ca.siteId, cb.siteId)
    assert.notEqual(ca.operator.userHash, cb.operator.userHash)
  })
})

describe('credentials at rest', () => {
  test('survive a round trip', () => {
    const secret = 'sk_a_workspace_key_with_real_consequences'
    const stored = encrypt(secret)

    assert.notEqual(stored, secret, 'the value was stored in the clear')
    assert.doesNotMatch(stored, /sk_a_workspace/)
    assert.equal(decrypt(stored), secret)
  })

  test('encrypt differently every time', () => {
    /**
     * A fresh IV per encryption. Identical ciphertexts for identical inputs
     * would tell anyone reading the table which workspaces share a key.
     */
    assert.notEqual(encrypt('same'), encrypt('same'))
  })

  test('refuse to decrypt once tampered with', () => {
    const stored = encrypt('sk_original')
    const [iv, body, tag] = stored.split('.')

    // GCM is authenticated, so a flipped byte fails rather than quietly
    // yielding different plaintext.
    const flipped = Buffer.from(body!, 'base64url')
    flipped[0] ^= 0xff
    assert.equal(decrypt([iv, flipped.toString('base64url'), tag].join('.')), null)
  })

  test('return null for anything malformed, rather than throwing', () => {
    /**
     * A credential that cannot be decrypted is the same situation as one that
     * was never set: the workspace is unconfigured, which callers handle.
     * Throwing would turn a misconfiguration into a 500.
     */
    for (const bad of [null, undefined, '', 'not-encrypted', 'a.b', 'a.b.c.d']) {
      assert.equal(decrypt(bad), null, `decrypt(${JSON.stringify(bad)}) should be null`)
    }
  })
})

/**
 * The console asking the platform whether a call it is showing is still up.
 *
 * The operator SDK's call state rests on single events that go missing in
 * both directions — a line left open after the operator hung up, a panel
 * left showing a call the customer already ended. The platform is the side
 * that knows, and this is the route the browser asks it through, so that the
 * site secret stays here rather than going to the browser to ask directly.
 */
describe('what the platform says about a live call', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  const CID = '11111111-2222-3333-4444-555555555555'

  const withOperator = (apiHost: string) =>
    makeWorkspace({
      name: 'A',
      email: 'a@t.test',
      operator: { apiHost, siteId: 'sa_site_live_A', siteSecret: 'sa_secret_live_A' },
    })

  test('a call the platform has finished reports ended', async () => {
    const up = await fakeUpstream({ status: 'completed' })
    try {
      await withOperator(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const res = await c.get(`/api/operator/call-status?conversation_id=${CID}`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.state, 'ended')
      assert.equal(body.status, 'completed')

      // Asked, not inferred: the answer came from the platform.
      assert.equal(up.seen[0]?.method, 'POST')
      assert.match(up.seen[0]?.path ?? '', /call_status/)
    } finally {
      await up.close()
    }
  })

  test('a call still up reports live', async () => {
    // The platform names a status only once a call is over; while one is
    // running the field is simply absent.
    const up = await fakeUpstream({})
    try {
      await withOperator(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const body = await (await c.get(`/api/operator/call-status?conversation_id=${CID}`)).json()
      assert.equal(body.state, 'live')
      assert.equal(body.status, null)
    } finally {
      await up.close()
    }
  })

  /**
   * The invariant the whole feature rests on.
   *
   * The console ends a call on the strength of this answer, so a platform it
   * cannot reach must never come back as "ended" — otherwise a blip in our
   * own network is what takes a live call off the operator's screen, which
   * is a worse bug than the one this route exists to fix.
   */
  test('a platform it cannot reach reports unknown, never ended', async () => {
    const up = await fakeUpstream({})
    const url = up.url
    await up.close()

    await withOperator(url)
    const c = new Client()
    await c.login('a@t.test', PASSWORD)

    const body = await (await c.get(`/api/operator/call-status?conversation_id=${CID}`)).json()
    assert.equal(body.state, 'unknown')
  })

  test('a workspace without operator credentials cannot be polled', async () => {
    await makeWorkspace({ name: 'B', email: 'b@t.test' })
    const c = new Client()
    await c.login('b@t.test', PASSWORD)

    const body = await (await c.get(`/api/operator/call-status?conversation_id=${CID}`)).json()
    assert.equal(body.state, 'unknown')
  })

  test('a conversation id that is not one is refused', async () => {
    const up = await fakeUpstream({})
    try {
      await withOperator(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const res = await c.get('/api/operator/call-status?conversation_id=../../admin')
      assert.equal(res.status, 400)
      assert.equal(up.seen.length, 0, 'it reached the platform anyway')
    } finally {
      await up.close()
    }
  })
})
