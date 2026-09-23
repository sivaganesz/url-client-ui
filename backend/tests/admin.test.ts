import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { useTestDatabase } from './harness.ts'
import { Client, makeWorkspace, start, truncate } from './client.ts'
import { query } from '../src/db/index.ts'
import { hashPassword } from '../src/auth/password.ts'

useTestDatabase()

const ADMIN = { email: 'admin@t.test', password: 'admin-long-enough-pw' }
const PASSWORD = 'a-long-enough-password'

async function makeAdmin(email = ADMIN.email, password = ADMIN.password): Promise<string> {
  const rows = await query<{ id: string }>(
    'INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
    ['Main Admin', email, await hashPassword(password)],
  )
  return rows[0]!.id
}

async function signedInAdmin(): Promise<Client> {
  const c = new Client()
  const res = await c.post('/api/admin/login', ADMIN)
  assert.equal(res.status, 200, 'the admin could not sign in')
  return c
}

describe('admin sign-in', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    await start()
    await makeAdmin()
  })

  test('works, and uses its own cookie', async () => {
    const c = new Client()
    const res = await c.post('/api/admin/login', ADMIN)

    assert.equal(res.status, 200)
    const cookie = res.headers.get('set-cookie') ?? ''
    // A different name from the customer session's, so signing into one
    // surface does not silently sign you out of the other.
    assert.match(cookie, /^ufasid=/)
    assert.match(cookie, /HttpOnly/i)
    assert.match(cookie, /SameSite=Lax/i)

    assert.equal((await (await c.get('/api/admin/me')).json()).admin.email, ADMIN.email)
  })

  test('is refused with the same words whether the address exists or not', async () => {
    const wrong = await new Client().post('/api/admin/login', {
      email: ADMIN.email,
      password: 'nope',
    })
    const unknown = await new Client().post('/api/admin/login', {
      email: 'nobody@t.test',
      password: 'nope',
    })

    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.deepEqual(await wrong.json(), await unknown.json())
  })

  test('/admin/me answers 200 with null when signed out', async () => {
    const res = await new Client().get('/api/admin/me')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { admin: null })
  })
})

/**
 * The separation is the whole design. These are the tests that would catch it
 * quietly collapsing back into one privilege class.
 */
describe('admins and customers cannot stand in for each other', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    await start()
    await makeAdmin()
    await makeWorkspace({
      name: 'Acme',
      email: 'owner@acme.test',
      apiBase: 'http://127.0.0.1:1',
      apiToken: 'sk_acme',
    })
  })

  test('a customer cannot reach any admin route', async () => {
    const customer = new Client()
    await customer.login('owner@acme.test', PASSWORD)

    for (const path of ['/api/admin/me', '/api/admin/customers']) {
      const res = await customer.get(path)
      // /admin/me answers 200 with admin:null; /admin/customers must refuse.
      const body = await res.json()
      assert.ok(
        res.status === 401 || body.admin === null,
        `${path} treated a customer session as an admin`,
      )
    }

    const created = await customer.post('/api/admin/customers', {
      workspaceName: 'Sneaky',
      name: 'X',
      email: 'x@t.test',
      password: PASSWORD,
    })
    assert.equal(created.status, 401, 'a customer created a customer')
  })

  test('an admin cannot reach the workspace proxy', async () => {
    const admin = await signedInAdmin()

    /**
     * Not because a guard says no — because an admin has no workspace_id
     * anywhere, so there is nothing for the proxy to resolve. The separation
     * does this, not a check somebody has to remember.
     */
    assert.equal((await admin.get('/api/perfox/agents')).status, 401)
    assert.equal((await admin.get('/api/config')).status, 401)
    assert.equal((await admin.get('/api/operator/config')).status, 401)
  })

  test('an admin session is not a customer session', async () => {
    const admin = await signedInAdmin()
    assert.equal((await admin.get('/api/auth/me')).status, 200)
    // Signed in as an admin, signed out as a customer, simultaneously.
    assert.equal((await (await admin.get('/api/auth/me')).json()).user, null)
  })
})

describe('creating a customer', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    await start()
    await makeAdmin()
  })

  test('the new customer can sign in straight away', async () => {
    const admin = await signedInAdmin()

    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Northwind',
      name: 'Nora',
      email: 'nora@northwind.test',
      mobile: '+916374160200',
      password: 'northwind-long-password',
      perfoxApiBase: 'https://northwind-api.perfox.ai/api/v1',
      perfoxApiToken: 'sk_northwind_key',
    })
    assert.equal(res.status, 201)

    // The point of the whole feature: provisioned here, signs in there.
    const customer = new Client()
    const login = await customer.login('nora@northwind.test', 'northwind-long-password')
    assert.equal(login.status, 200)

    const body = await login.json()
    assert.equal(body.workspace.name, 'Northwind')
    assert.equal(body.workspace.configured, true)
    assert.equal(body.user.mobile, '+916374160200')
  })

  test('never echoes a credential back', async () => {
    const admin = await signedInAdmin()

    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Northwind',
      name: 'Nora',
      email: 'nora@northwind.test',
      password: 'northwind-long-password',
      perfoxApiBase: 'https://northwind-api.perfox.ai/api/v1',
      perfoxApiToken: 'sk_northwind_secret_key',
      operatorApiHost: 'https://northwind-api.perfox.ai',
      operatorSiteId: 'sa_site_live_NW',
      operatorSiteSecret: 'sa_secret_live_NW',
    })

    const body = await res.text()
    assert.doesNotMatch(body, /sk_northwind_secret_key/, 'the API key came back')
    assert.doesNotMatch(body, /sa_secret_live_NW/, 'the site secret came back')
    assert.doesNotMatch(body, /northwind-long-password/, 'the password came back')

    // Flags, not values.
    const json = JSON.parse(body)
    assert.equal(json.customer.hasApiToken, true)
    assert.equal(json.customer.hasOperator, true)
  })

  test('the list reports flags, never values', async () => {
    const admin = await signedInAdmin()
    await admin.post('/api/admin/customers', {
      workspaceName: 'Northwind',
      name: 'Nora',
      email: 'nora@northwind.test',
      password: 'northwind-long-password',
      perfoxApiToken: 'sk_northwind_secret_key',
      operatorSiteId: 'sa_site_live_NW',
      operatorSiteSecret: 'sa_secret_live_NW',
    })

    const body = await (await admin.get('/api/admin/customers')).text()
    assert.doesNotMatch(body, /sk_northwind_secret_key/)
    assert.doesNotMatch(body, /sa_secret_live_NW/)

    const { customers } = JSON.parse(body)
    assert.equal(customers.length, 1)
    assert.equal(customers[0].workspace_name, 'Northwind')
    assert.equal(customers[0].email, 'nora@northwind.test')
    assert.equal(customers[0].has_api_token, true)
  })

  test('refuses an address that already has an account, on either table', async () => {
    const admin = await signedInAdmin()
    const make = (email: string) =>
      admin.post('/api/admin/customers', {
        workspaceName: 'W',
        name: 'N',
        email,
        password: PASSWORD,
      })

    assert.equal((await make('taken@t.test')).status, 201)
    assert.equal((await make('taken@t.test')).status, 409, 'a duplicate customer was created')
    assert.equal((await make(ADMIN.email)).status, 409, "a customer took the admin's address")
  })

  test('leaves nothing behind when it fails', async () => {
    const admin = await signedInAdmin()

    // A password below the floor fails validation after the workspace name is
    // read but before anything is written — the transaction is what makes a
    // workspace-without-an-owner impossible.
    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Orphan',
      name: 'N',
      email: 'orphan@t.test',
      password: 'short',
    })
    assert.equal(res.status, 400)

    const left = await query('SELECT id FROM workspaces')
    assert.equal(left.length, 0, 'a failed creation left a workspace behind')
  })

  test('a workspace with no credentials is created, and says so', async () => {
    const admin = await signedInAdmin()
    // Perfectly reasonable: make the account now, connect Perfox later.
    const res = await admin.post('/api/admin/customers', {
      workspaceName: 'Later',
      name: 'N',
      email: 'later@t.test',
      password: PASSWORD,
    })
    assert.equal(res.status, 201)

    const customer = new Client()
    const body = await (await customer.login('later@t.test', PASSWORD)).json()
    assert.equal(body.workspace.configured, false)
    assert.equal(body.workspace.callingConfigured, false)
  })
})

describe('suspending a customer', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    await start()
    await makeAdmin()
  })

  test('ends their live session, not just future sign-ins', async () => {
    const admin = await signedInAdmin()
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'W',
        name: 'N',
        email: 'n@t.test',
        password: PASSWORD,
        perfoxApiBase: 'http://127.0.0.1:1',
        perfoxApiToken: 'k',
      })
    ).json()

    const customer = new Client()
    await customer.login('n@t.test', PASSWORD)
    assert.equal((await customer.get('/api/config')).status, 200)

    await admin.post(`/api/admin/customers/${created.customer.workspaceId}/status`, {
      status: 'suspended',
    })

    // The open tab has to stop working, not merely the next sign-in.
    assert.equal((await customer.get('/api/config')).status, 401, 'the live session survived')
    assert.equal((await new Client().login('n@t.test', PASSWORD)).status, 401)
  })

  test('can be undone', async () => {
    const admin = await signedInAdmin()
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'W',
        name: 'N',
        email: 'n@t.test',
        password: PASSWORD,
      })
    ).json()

    const id = created.customer.workspaceId
    await admin.post(`/api/admin/customers/${id}/status`, { status: 'suspended' })
    await admin.post(`/api/admin/customers/${id}/status`, { status: 'active' })

    assert.equal((await new Client().login('n@t.test', PASSWORD)).status, 200)
  })

  test('reaches everyone in the workspace, not only its owner', async () => {
    /**
     * Suspension used to set `users.status` on the owner, which is the same
     * thing only while a workspace holds one person. The moment a customer can
     * invite a colleague, suspending the owner would leave the account running
     * under the colleague's login — so it suspends the workspace, and this is
     * the assertion that would notice it going back.
     */
    const admin = await signedInAdmin()
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'W',
        name: 'N',
        email: 'owner@t.test',
        password: PASSWORD,
        perfoxApiBase: 'http://127.0.0.1:1',
        perfoxApiToken: 'k',
      })
    ).json()

    // A second person in the same workspace, the way an invite would leave one.
    await query(
      `INSERT INTO users (workspace_id, name, email, password_hash, role)
       VALUES ($1, 'Colleague', 'colleague@t.test', $2, 'member')`,
      [created.customer.workspaceId, await hashPassword(PASSWORD)],
    )

    const colleague = new Client()
    await colleague.login('colleague@t.test', PASSWORD)
    assert.equal((await colleague.get('/api/config')).status, 200)

    await admin.post(`/api/admin/customers/${created.customer.workspaceId}/status`, {
      status: 'suspended',
    })

    assert.equal(
      (await colleague.get('/api/config')).status,
      401,
      'a colleague kept the suspended account running',
    )
    assert.equal((await new Client().login('colleague@t.test', PASSWORD)).status, 401)
  })

  test('refuses a status it does not recognise', async () => {
    const admin = await signedInAdmin()
    const created = await (
      await admin.post('/api/admin/customers', {
        workspaceName: 'W',
        name: 'N',
        email: 'n@t.test',
        password: PASSWORD,
      })
    ).json()

    const res = await admin.post(`/api/admin/customers/${created.customer.workspaceId}/status`, {
      status: 'deleted',
    })
    assert.equal(res.status, 400)
  })
})

describe('administrators', () => {
  beforeEach(async () => {
    await truncate()
    await query('TRUNCATE admins, admin_sessions CASCADE')
    await start()
    await makeAdmin()
  })

  test('are listed, added, and cannot be created twice', async () => {
    const admin = await signedInAdmin()

    const before = await (await admin.get('/api/admin/admins')).json()
    assert.equal(before.admins.length, 1)
    // Never a hash, not even to another admin.
    assert.equal(JSON.stringify(before.admins).includes('argon2'), false)

    const made = await admin.post('/api/admin/admins', {
      name: 'Second',
      email: 'second@t.test',
      password: PASSWORD,
    })
    assert.equal(made.status, 201)

    // And they can actually get in, which is the point of the page.
    assert.equal((await new Client().post('/api/admin/login', {
      email: 'second@t.test',
      password: PASSWORD,
    })).status, 200)

    // One address, one account: a customer and an admin sharing one would make
    // signing in depend on which form you happened to use.
    assert.equal(
      (await admin.post('/api/admin/admins', {
        name: 'Again',
        email: 'second@t.test',
        password: PASSWORD,
      })).status,
      409,
    )
  })

  test('cannot lock the last way in', async () => {
    const admin = await signedInAdmin()
    const me = await (await admin.get('/api/admin/me')).json()

    // Suspending yourself needs somebody with psql to undo.
    const self = await admin.post(`/api/admin/admins/${me.admin.id}/status`, {
      status: 'suspended',
    })
    assert.equal(self.status, 400)

    // And so does suspending the only other one when you are not active.
    await admin.post('/api/admin/admins', {
      name: 'Second',
      email: 'second@t.test',
      password: PASSWORD,
    })
    const list = await (await admin.get('/api/admin/admins')).json()
    const second = list.admins.find((a: { email: string }) => a.email === 'second@t.test')

    // Two active, so this one is allowed.
    assert.equal((await admin.post(`/api/admin/admins/${second.id}/status`, {
      status: 'suspended',
    })).status, 200)

    // Their open tab stops working, not merely their next sign-in.
    assert.equal((await new Client().post('/api/admin/login', {
      email: 'second@t.test',
      password: PASSWORD,
    })).status, 401)
  })

  test('a suspended admin loses the session they already had', async () => {
    const admin = await signedInAdmin()
    await admin.post('/api/admin/admins', {
      name: 'Second',
      email: 'second@t.test',
      password: PASSWORD,
    })

    const second = new Client()
    assert.equal((await second.post('/api/admin/login', {
      email: 'second@t.test',
      password: PASSWORD,
    })).status, 200)
    assert.equal((await second.get('/api/admin/customers')).status, 200)

    const list = await (await admin.get('/api/admin/admins')).json()
    const row = list.admins.find((a: { email: string }) => a.email === 'second@t.test')
    await admin.post(`/api/admin/admins/${row.id}/status`, { status: 'suspended' })

    assert.equal(
      (await second.get('/api/admin/customers')).status,
      401,
      'a suspended admin kept their live session',
    )
  })
})
