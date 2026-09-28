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
 * The knowledge base, which the Documents page is built on.
 *
 * An upload is the one request in this app that does not carry JSON, and the
 * proxy re-encodes everything it forwards — so it has a route of its own, and
 * what is worth proving is that the bytes and the boundary survive it.
 */
describe('the knowledge base', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  const FILE_ID = 'kbf_01HQ8Z3M4N5P6Q7R8S9T'
  const FOLDER_ID = 'kbd_01HQ8Z3M4N5P6Q7R8S9T'

  const signedIn = async (url: string) => {
    await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: url, apiToken: 'k' })
    const c = new Client()
    await c.login('a@t.test', PASSWORD)
    return c
  }

  test('reads what the Documents page asks for, and nothing more', async () => {
    const up = await fakeUpstream({ data: [] })
    try {
      const c = await signedIn(up.url)

      for (const path of ['kb/files', 'kb/folders', `kb/files/${FILE_ID}`]) {
        assert.equal((await c.get(`/api/perfox/${path}`)).status, 200, `${path} was refused`)
      }

      /**
       * Semantic search is a knowledge base endpoint this console has no use
       * for, and the allowlist is a list of what the app needs rather than of
       * what the platform offers.
       */
      assert.equal((await c.post('/api/perfox/kb/search', { query: 'x' })).status, 403)
    } finally {
      await up.close()
    }
  })

  test('allows the writes the page makes, on files and on folders', async () => {
    const up = await fakeUpstream({ success: true })
    try {
      const c = await signedIn(up.url)

      assert.equal((await c.post('/api/perfox/kb/folders', { name: 'Handbook' })).status, 200)
      assert.equal(
        (await c.patch(`/api/perfox/kb/folders/${FOLDER_ID}`, { name: 'HR' })).status,
        200,
      )
      assert.equal((await c.delete(`/api/perfox/kb/folders/${FOLDER_ID}`)).status, 200)
      assert.equal((await c.delete(`/api/perfox/kb/files/${FILE_ID}`)).status, 200)
      assert.equal(
        (await c.post(`/api/perfox/kb/files/${FILE_ID}/move`, { folder_id: null })).status,
        200,
      )
    } finally {
      await up.close()
    }
  })

  /**
   * The reason the upload is not part of the proxy.
   *
   * The generic route JSON-stringifies what it forwards, which would turn a
   * multipart body into a quoted string the platform cannot read, and rewrite
   * away the boundary that says where each part begins.
   */
  test('forwards an upload as multipart, boundary and all', async () => {
    const up = await fakeUpstream({ id: 'kbf_1', status: 'pending' })
    try {
      const c = await signedIn(up.url)

      const boundary = '----testboundary9c2f'
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="handbook.txt"`,
        'Content-Type: text/plain',
        '',
        'the quick brown fox',
        `--${boundary}--`,
        '',
      ].join('\r\n')

      const res = await c.request('/api/perfox/kb/files', {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      })
      assert.equal(res.status, 200)

      const sent = up.seen.at(-1)
      assert.equal(sent?.method, 'POST')
      assert.match(sent?.path ?? '', /kb\/files/)
      assert.equal(
        sent?.contentType,
        `multipart/form-data; boundary=${boundary}`,
        'the boundary did not survive the proxy',
      )
      // The key is used here and nowhere the browser can see it.
      assert.equal(sent?.auth, 'Bearer k')
    } finally {
      await up.close()
    }
  })

  test('refuses an upload that is not multipart', async () => {
    const up = await fakeUpstream({})
    try {
      const c = await signedIn(up.url)

      const res = await c.post('/api/perfox/kb/files', { file: 'not a file' })
      assert.equal(res.status, 415)
      assert.equal(up.seen.length, 0, 'it reached the platform anyway')
    } finally {
      await up.close()
    }
  })
})

/**
 * A customer's own page.
 *
 * Two reads the console did not have: what the workspace makes of a
 * customer, and everything they have ever said. Both are counted over all of
 * a customer’s conversations rather than over a page of them, which is the
 * reason for asking the server instead of adding up rows in the browser.
 */
describe('a customer', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  const CUSTOMER = '01a0e681-7d72-76a3-b9fa-966f1a651faf'

  test('their details and their conversations are readable', async () => {
    const up = await fakeUpstream({ customer: { id: CUSTOMER }, conversations: [] })
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      for (const path of [
        `customers/${CUSTOMER}/details`,
        `customers/${CUSTOMER}/conversations`,
      ]) {
        const res = await c.get(`/api/perfox/${path}`)
        assert.equal(res.status, 200, `${path} was refused`)
      }

      // A status filter and a cursor are query parameters, which the
      // allowlist does not inspect — it decides which resource may be
      // reached, not how it is asked for.
      assert.equal(
        (await c.get(`/api/perfox/customers/${CUSTOMER}/conversations?status=resolved&limit=50`)).status,
        200,
      )
    } finally {
      await up.close()
    }
  })

  test('writing to a customer is still refused', async () => {
    const up = await fakeUpstream({})
    try {
      await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: up.url, apiToken: 'k' })
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      /**
       * The platform lets a customer be created and edited. This console
       * only ever reads them, and the allowlist is a list of what the app
       * needs rather than of what the workspace offers.
       */
      assert.equal((await c.post('/api/perfox/customers', { name: 'X' })).status, 403)
      assert.equal(
        (await c.patch(`/api/perfox/customers/${CUSTOMER}`, { name: 'X' })).status,
        403,
      )
      assert.equal(up.seen.length, 0)
    } finally {
      await up.close()
    }
  })
})

/**
 * Ending a call so that it is actually ended.
 *
 * The operator SDK fires its stop request and forgets it, and the platform
 * answers {"ok":true} to a session id that never existed — so neither the
 * sending nor the reply is evidence. The conversation going `ended` is, and
 * that is what this route waits for.
 */
describe('ending a call', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  const CID = '11111111-2222-3333-4444-555555555555'
  const SID = 'sess-1'

  const withCalling = (url: string) =>
    makeWorkspace({
      name: 'A',
      email: 'a@t.test',
      apiBase: url,
      apiToken: 'k',
      operator: { apiHost: url, siteId: 'sa_site_live_A', siteSecret: 'sa_secret_live_A' },
    })

  /**
   * The call nobody has answered yet.
   *
   * session/stop cannot end one: there is no audio room before pickup, so it
   * never reaches the carrier and the phone rings on for its full thirty
   * seconds — then connects whoever answers to an empty conversation.
   * cancel_call is the route for that window, and it has to be asked for by
   * conversation, because there is no session to name yet.
   */
  test('cancels the call as well as stopping the session', async () => {
    const up = await fakeUpstream({ ok: true, status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      await c.post('/api/operator/stop', { conversationId: CID, sessionId: SID, answered: false })

      assert.ok(
        up.seen.some((r) => r.path.includes('cancel_call')),
        'a ringing call was never cancelled, only its session stopped',
      )
      assert.ok(
        up.seen.some((r) => r.path.includes('session/stop')),
        'the session was never stopped',
      )
    } finally {
      await up.close()
    }
  })

  /**
   * Before pickup there is no session id to send. The cancel must still go.
   */
  test('cancels even when there is no session yet', async () => {
    const up = await fakeUpstream({ ok: true, status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      await c.post('/api/operator/stop', { conversationId: CID, sessionId: '', answered: false })

      assert.ok(
        up.seen.some((r) => r.path.includes('cancel_call')),
        'nothing was sent for a call with no session',
      )
    } finally {
      await up.close()
    }
  })

  /**
   * The conversation that actually happened.
   *
   * cancel_call would end this one too, and have it recorded as cancelled by
   * the operator — which is a poor description of a call somebody had and
   * then finished. Ending an answered call is what session/stop is for, and
   * it is all this should send.
   */
  test('does not cancel a call the customer answered', async () => {
    const up = await fakeUpstream({ ok: true, status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      await c.post('/api/operator/stop', { conversationId: CID, sessionId: SID, answered: true })

      assert.ok(
        !up.seen.some((r) => r.path.includes('cancel_call')),
        'a conversation that happened was cancelled rather than stopped',
      )
      assert.ok(
        up.seen.some((r) => r.path.includes('session/stop')),
        'the session was never stopped',
      )
    } finally {
      await up.close()
    }
  })

  /**
   * A caller that says nothing is treated as answered, because the cost of
   * guessing wrong that way is a call that rings on, and the other way is a
   * conversation misfiled as one that never took place.
   */
  test('says nothing, and nothing is cancelled', async () => {
    const up = await fakeUpstream({ ok: true, status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      await c.post('/api/operator/stop', { conversationId: CID, sessionId: SID })

      assert.ok(!up.seen.some((r) => r.path.includes('cancel_call')))
    } finally {
      await up.close()
    }
  })

  test('stops the session and reports the conversation ended', async () => {
    // One fake serves both: the conversation read and the operator stop.
    const up = await fakeUpstream({ ok: true, status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const res = await c.post('/api/operator/stop', { conversationId: CID, sessionId: SID })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.ended, true)
      assert.equal(body.attempts, 1)

      // It asked the platform to stop, and then asked the workspace whether
      // anything came of it. Neither on its own would be worth much.
      assert.ok(
        up.seen.some((r) => r.method === 'POST' && r.path.includes('session/stop')),
        'no stop was sent',
      )
      assert.ok(
        up.seen.some((r) => r.method === 'GET' && r.path.includes(`conversations/${CID}`)),
        'the conversation was never checked',
      )
    } finally {
      await up.close()
    }
  })

  /**
   * The case the whole route exists for. A stop that the platform accepts
   * and does not act on must not be reported as success, or this is just the
   * SDK with extra steps.
   */
  test('keeps trying, and says so when the call outlives every attempt', async () => {
    const up = await fakeUpstream({ ok: true, status: 'active' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const body = await (await c.post('/api/operator/stop', { conversationId: CID, sessionId: SID })).json()
      assert.equal(body.ended, false)
      assert.ok(body.attempts > 1, 'it gave up after one try')

      const stops = up.seen.filter((r) => r.path.includes('session/stop')).length
      assert.equal(stops, body.attempts)
    } finally {
      await up.close()
    }
  })

  test('a conversation id that is not one never reaches the platform', async () => {
    const up = await fakeUpstream({ ok: true })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const res = await c.post('/api/operator/stop', { conversationId: '../../admin', sessionId: SID })
      assert.equal(res.status, 400)
      assert.equal(up.seen.length, 0)
    } finally {
      await up.close()
    }
  })

  test('one conversation is readable through the proxy, for the call panel', async () => {
    const up = await fakeUpstream({ status: 'ended' })
    try {
      await withCalling(up.url)
      const c = new Client()
      await c.login('a@t.test', PASSWORD)

      const res = await c.get(`/api/perfox/conversations/${CID}`)
      assert.equal(res.status, 200)
    } finally {
      await up.close()
    }
  })
})
