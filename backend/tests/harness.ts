import { after, before } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type Server } from 'node:http'
import pg from 'pg'

/**
 * A real Postgres, a throwaway database, and a fake Perfox.
 *
 * These are integration tests on purpose. The things worth proving here —
 * that one tenant cannot reach another's workspace, that a session dies when
 * it is deleted, that the allowlist holds — are all properties of SQL and
 * HTTP working together. A suite of mocks would assert that the mocks agree
 * with each other.
 *
 * The database is created and dropped per run, so a failing test cannot leave
 * rows behind that make the next one pass. The runner is pinned to one file at
 * a time (--test-concurrency=1) because the files share that database, and two
 * processes each dropping and recreating it hang on the other's connections.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ADMIN_URL =
  process.env.TEST_ADMIN_URL ?? 'postgres://urlfactory:urlfactory@localhost:5433/urlfactory'
const TEST_DB = 'urlfactory_test'
export const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`)

// Set before anything imports env.ts, which reads these once at load.
process.env.DATABASE_URL = TEST_URL
process.env.ENCRYPTION_KEY ??= 'test-key-not-used-anywhere-real'
process.env.NODE_ENV = 'test'

export async function createTestDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  // Dropped first: a crashed previous run leaves one behind, and inheriting
  // its rows is how a test starts passing for the wrong reason.
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${TEST_DB}`)
  await admin.end()

  const db = new pg.Client({ connectionString: TEST_URL })
  await db.connect()
  await db.query(readFileSync(resolve(here, '../src/db/schema.sql'), 'utf8'))
  await db.end()
}

export async function dropTestDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`)
  await admin.end()
}

/**
 * A stand-in for the Perfox API.
 *
 * Two of these, pointed at by two workspaces, is how tenant isolation gets
 * proved: the test can see which upstream a request reached and which token
 * it carried, neither of which is observable against the real API.
 */
export interface FakeUpstream {
  url: string
  /** Every request this upstream received, in order. */
  seen: { path: string; auth: string | null; method: string }[]
  close: () => Promise<void>
}

export async function fakeUpstream(body: unknown = { data: [] }): Promise<FakeUpstream> {
  const seen: FakeUpstream['seen'] = []
  const server: Server = createServer((req, res) => {
    seen.push({
      path: req.url ?? '',
      auth: req.headers.authorization ?? null,
      method: req.method ?? '',
    })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no port')

  return {
    url: `http://127.0.0.1:${address.port}`,
    seen,
    close: () => new Promise((done) => server.close(() => done())),
  }
}

/**
 * Wires the per-file lifecycle so each test file says this once.
 *
 * Closing the HTTP server is part of it, not left to the tests. A listening
 * socket keeps the event loop alive, so forgetting it does not fail anything
 * — the file simply never exits, and the run looks hung rather than broken.
 */
export function useTestDatabase(): void {
  before(async () => {
    await createTestDatabase()
  })
  after(async () => {
    const { stop } = await import('./client.ts')
    await stop()
    const { pool } = await import('../src/db/index.ts')
    await pool.end()
    await dropTestDatabase()
  })
}
