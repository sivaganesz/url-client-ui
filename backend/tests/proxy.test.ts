import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { fakeUpstream, useTestDatabase } from './harness.ts'
import { asDialled, destinationProblem, mayRing } from '../src/routes/perfox.ts'
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
 * The numbers an agent may ring, while a deployment says so.
 *
 * Off everywhere by default, because a console for phoning customers cannot
 * carry a list of permitted customers. It is for a workspace wired to a real
 * carrier with somebody testing against it, where a wrong digit reaches a
 * stranger and there is no undoing that.
 *
 * Only the agent path can be guarded here. An operator dialling from the
 * browser talks to the platform directly and never passes through this
 * process at all.
 */
describe('restricting who can be rung', () => {
  beforeEach(async () => {
    await truncate()
    await start()
  })

  const signedIn = async (url: string) => {
    await makeWorkspace({ name: 'A', email: 'a@t.test', apiBase: url, apiToken: 'k' })
    const c = new Client()
    await c.login('a@t.test', PASSWORD)
    return c
  }

  /**
   * Unset is the shipped state, and it must mean "no opinion" rather than
   * "nothing allowed" — a guard that refuses everything when it is switched
   * off would take the product down rather than protect it.
   *
   * Who may be rung and what shape a number takes are separate questions:
   * the list says nothing here, and the destination is still checked. See
   * "what may be sent to" below.
   */
  test('with nothing set, any customer may be reached', async () => {
    const up = await fakeUpstream({ ok: true })
    try {
      const c = await signedIn(up.url)
      const res = await c.post('/api/perfox/outbound', {
        agent_id: 'a1',
        channel: 'sms',
        // Not on any list, and nobody this workspace has spoken to before.
        to: '9812345678',
      })
      assert.equal(res.status, 200)
      assert.equal(up.seen.length, 1)
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

/**
 * Which number the allowlist lets through.
 *
 * The guard exists so that a mistyped digit, on a workspace wired to a real
 * carrier, rings nobody instead of a stranger. That makes the comparison the
 * whole feature: a rule that accepts a number it was not given is not a
 * weaker guard, it is a guard that dials somebody who never agreed to it.
 *
 * Whole numbers are compared, not suffixes. +91 63741 60200, 916374160200
 * and 00916374160200 are one telephone written three ways; 16374160200 is a
 * North American number that merely shares the last ten digits.
 */
describe('which numbers may be rung', () => {
  const LIST = ['916374160200']

  const allowed: [string, string][] = [
    ['916374160200', 'the approved number'],
    ['+91 63741 60200', 'the same, with spaces and a plus'],
    ['00916374160200', 'the same, dialled with an international prefix'],
    ['  +91-63741-60200  ', 'the same, punctuated and padded'],
  ]
  for (const [number, why] of allowed) {
    test(`allows ${JSON.stringify(number)} — ${why}`, () => {
      assert.equal(mayRing(number, LIST), true)
    })
  }

  const refused: [unknown, string][] = [
    ['16374160200', 'country code 1 — a different telephone'],
    ['999916374160200', 'digits prefixed onto the approved number'],
    ['6374160200', 'the national number without its country code'],
    ['60200', 'a suffix of the approved number'],
    ['200', 'three digits'],
    ['0', 'a single digit'],
    ['', 'nothing at all'],
    [null, 'no number given'],
    [undefined, 'the field absent'],
    ['916374160201', 'one digit different'],
    ['+1 555 0100', 'an unrelated number'],
  ]
  for (const [number, why] of refused) {
    test(`refuses ${JSON.stringify(number)} — ${why}`, () => {
      assert.equal(mayRing(number, LIST), false)
    })
  }

  /**
   * Unset is the shipped state, and it must mean "no opinion" rather than
   * "nothing allowed".
   */
  test('an empty list permits everything, including nothing', () => {
    assert.equal(mayRing('+441234567890', []), true)
    assert.equal(mayRing('', []), true)
  })

  test('more than one number can be listed', () => {
    const two = ['916374160200', '+44 20 7946 0958']
    assert.equal(mayRing('442079460958', two), true)
    assert.equal(mayRing('916374160200', two), true)
    assert.equal(mayRing('442079460959', two), false)
  })
})

/**
 * What may be sent to.
 *
 * Not an allowlist — an operator messages whoever their customers are. This
 * refuses what cannot be a destination at all, on the endpoint that carries
 * SMS, WhatsApp and email alike.
 *
 * Phone numbers are Indian for this deployment. A number from elsewhere is
 * refused deliberately, and widening it means changing this test with the
 * code, which is the point of pinning it here.
 */
describe('what may be sent to', () => {
  const fine: [string, string, string][] = [
    ['6374160200', 'sms', 'the national number'],
    ['916374160200', 'sms', 'with the country code'],
    ['+91 63741 60200', 'whatsapp', 'spaced and punctuated'],
    ['00916374160200', 'sms', 'dialled with an international prefix'],
    ['9123456789', 'sms', 'ten digits that happen to begin 91'],
    ['919123456789', 'sms', 'the same, with the country code'],
    ['name@example.com', 'email', 'an email address'],
    ['a.b+tag@sub.example.co.uk', 'email', 'a more awkward address'],
  ]
  for (const [to, channel, why] of fine) {
    test(`allows ${JSON.stringify(to)} on ${channel} — ${why}`, () => {
      assert.equal(destinationProblem(to, channel), null)
    })
  }

  const refused: [unknown, string, string][] = [
    ['', 'sms', 'nothing at all'],
    ['   ', 'sms', 'whitespace'],
    [null, 'sms', 'no value'],
    ['637416020', 'sms', 'nine digits'],
    ['63741602001', 'sms', 'eleven digits'],
    ['16374160200', 'sms', 'country code 1 — a different country'],
    ['+44 20 7946 0958', 'sms', 'a UK number'],
    ['999916374160200', 'sms', 'digits prefixed onto a valid number'],
    ['a customer name', 'sms', 'text where a number belongs'],
    ['11111111-2222-3333-4444-555555555555', 'sms', 'a conversation id pasted in'],
    ['not-an-email', 'email', 'text with no @'],
    ['', 'email', 'an empty address'],
    ['name@example.com', 'sms', 'an address on a phone channel'],
    ['6374160200', 'email', 'a number on the email channel'],
  ]
  for (const [to, channel, why] of refused) {
    test(`refuses ${JSON.stringify(to)} on ${channel} — ${why}`, () => {
      assert.notEqual(destinationProblem(to, channel), null)
    })
  }

  test('the reason is something an operator can act on', () => {
    assert.match(String(destinationProblem('123', 'sms')), /10-digit/)
    assert.match(String(destinationProblem('x', 'email')), /email address/)
    assert.match(String(destinationProblem('', 'sms')), /required/)
  })
})

/**
 * What actually leaves for the carrier.
 *
 * Plivo refuses a bare national number, so accepting a ten-digit entry is not
 * enough — it has to be completed to +91 before it goes out, or the send fails
 * upstream with a message the operator cannot act on.
 */
describe('the number that leaves', () => {
  const completed: [string, string][] = [
    ['6374160200', 'a ten-digit entry gains its country code'],
    ['916374160200', 'already carrying one, unchanged'],
    ['+91 63741 60200', 'punctuation and spacing removed'],
    ['00916374160200', 'an international prefix reduced'],
    ['9123456789', 'ten digits that begin 91 are national, not prefixed'],
    ['919123456789', 'the same number with its country code'],
  ]
  for (const [input, why] of completed) {
    test(`${JSON.stringify(input)} — ${why}`, () => {
      const out = asDialled(input)
      assert.match(String(out), /^\+91\d{10}$/, 'not in the shape the carrier takes')
    })
  }

  test('the same telephone, however it is written, leaves identically', () => {
    const forms = ['6374160200', '916374160200', '+91 63741 60200', '00916374160200', '+91-63741-60200']
    const out = forms.map((f) => asDialled(f))
    assert.deepEqual(new Set(out), new Set(['+916374160200']))
  })

  test('9123456789 is not mistaken for a country code and eight digits', () => {
    assert.equal(asDialled('9123456789'), '+919123456789')
    assert.equal(asDialled('919123456789'), '+919123456789')
  })

  test('what cannot be dialled completes to nothing', () => {
    for (const bad of ['', '   ', '637416020', '63741602001', '16374160200', '+44 20 7946 0958', 'a name', null]) {
      assert.equal(asDialled(bad), null, `${JSON.stringify(bad)} should not complete`)
    }
  })
})
