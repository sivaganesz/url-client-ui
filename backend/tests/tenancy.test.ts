import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeUpstream, useTestDatabase } from './harness.ts'
import { Client, makeWorkspace, start, truncate } from './client.ts'

/**
 * One tenant must not be able to reach another's workspace.
 *
 * This is the claim the whole design rests on, and until now it rested on
 * reading the code. Every other safeguard — the allowlist, the encryption,
 * the closed registration — is damage limitation if this one fails.
 *
 * The technique: two workspaces pointed at two *different* upstream servers.
 * Against the real Perfox API you cannot see which workspace a request went
 * to; against a pair of fakes you can see exactly which one it reached and
 * which token it carried.
 */
useTestDatabase()

describe('tenant isolation', () => {
  beforeEach(async () => {
    await truncate()
  })

  test('each user reaches only their own workspace, with only their own key', async () => {
    await start()
    const alpha = await fakeUpstream({ data: [{ id: 'agent-from-alpha' }] })
    const beta = await fakeUpstream({ data: [{ id: 'agent-from-beta' }] })

    try {
      await makeWorkspace({
        name: 'Alpha',
        email: 'owner@alpha.test',
        apiBase: alpha.url,
        apiToken: 'sk_alpha_key',
      })
      await makeWorkspace({
        name: 'Beta',
        email: 'owner@beta.test',
        apiBase: beta.url,
        apiToken: 'sk_beta_key',
      })

      const a = new Client()
      const b = new Client()
      assert.equal((await a.login('owner@alpha.test', 'a-long-enough-password')).status, 200)
      assert.equal((await b.login('owner@beta.test', 'a-long-enough-password')).status, 200)

      const fromA = await (await a.get('/api/perfox/agents')).json()
      const fromB = await (await b.get('/api/perfox/agents')).json()

      // The data each caller gets back came from their own workspace.
      assert.equal(fromA.data[0].id, 'agent-from-alpha')
      assert.equal(fromB.data[0].id, 'agent-from-beta')

      // Each upstream saw exactly one request, carrying only its own token.
      assert.equal(alpha.seen.length, 1, 'alpha should have been called once')
      assert.equal(beta.seen.length, 1, 'beta should have been called once')
      assert.equal(alpha.seen[0]?.auth, 'Bearer sk_alpha_key')
      assert.equal(beta.seen[0]?.auth, 'Bearer sk_beta_key')

      // And the decisive one: neither key ever went to the other's upstream.
      assert.ok(
        !alpha.seen.some((r) => r.auth?.includes('beta')),
        "beta's key reached alpha's upstream",
      )
      assert.ok(
        !beta.seen.some((r) => r.auth?.includes('alpha')),
        "alpha's key reached beta's upstream",
      )
    } finally {
      await alpha.close()
      await beta.close()
    }
  })

  test('the workspace comes from the session, not from anything the client sends', async () => {
    await start()
    const alpha = await fakeUpstream()
    const beta = await fakeUpstream()

    try {
      const ws = await makeWorkspace({
        name: 'Alpha',
        email: 'owner@alpha.test',
        apiBase: alpha.url,
        apiToken: 'sk_alpha_key',
      })
      const other = await makeWorkspace({
        name: 'Beta',
        email: 'owner@beta.test',
        apiBase: beta.url,
        apiToken: 'sk_beta_key',
      })

      const a = new Client()
      await a.login('owner@alpha.test', 'a-long-enough-password')

      /**
       * Every way a client might try to name a workspace it does not own.
       * None of these is read anywhere, which is the point — the id comes
       * from the session row, so there is nothing to smuggle.
       */
      await a.request(`/api/perfox/agents?workspace_id=${other.workspaceId}`, {
        headers: { 'x-workspace-id': other.workspaceId },
      })
      await a.request('/api/perfox/agents', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: other.workspaceId }),
      })

      assert.equal(beta.seen.length, 0, "a request reached Beta's upstream")
      assert.ok(
        alpha.seen.every((r) => r.auth === 'Bearer sk_alpha_key'),
        'a request carried the wrong key',
      )
      assert.ok(ws.workspaceId !== other.workspaceId)
    } finally {
      await alpha.close()
      await beta.close()
    }
  })

  test('signing out ends access for that user and nobody else', async () => {
    await start()
    const alpha = await fakeUpstream()

    try {
      await makeWorkspace({ name: 'Alpha', email: 'one@alpha.test', apiBase: alpha.url, apiToken: 'k' })

      // Two browsers, same account — a laptop and a phone, say.
      const laptop = new Client()
      const phone = new Client()
      await laptop.login('one@alpha.test', 'a-long-enough-password')
      await phone.login('one@alpha.test', 'a-long-enough-password')

      await laptop.post('/api/auth/logout')

      assert.equal((await laptop.get('/api/perfox/agents')).status, 401, 'the signed-out browser still had access')
      assert.equal(
        (await phone.get('/api/perfox/agents')).status,
        200,
        'signing out of one browser ended the other session too',
      )
    } finally {
      await alpha.close()
    }
  })

  test('a suspended user loses access immediately, session or no session', async () => {
    await start()
    const alpha = await fakeUpstream()

    try {
      const ws = await makeWorkspace({
        name: 'Alpha',
        email: 'one@alpha.test',
        apiBase: alpha.url,
        apiToken: 'k',
      })

      const c = new Client()
      await c.login('one@alpha.test', 'a-long-enough-password')
      assert.equal((await c.get('/api/perfox/agents')).status, 200)

      const { query } = await import('../src/db/index.ts')
      await query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [ws.userId])

      /**
       * The live cookie must stop working at once. This is the case a JWT
       * would have got wrong: it would stay valid until it expired, and
       * suspending someone would mean waiting or maintaining a blocklist.
       */
      assert.equal(
        (await c.get('/api/perfox/agents')).status,
        401,
        'a suspended user kept access through an existing session',
      )
    } finally {
      await alpha.close()
    }
  })
})
