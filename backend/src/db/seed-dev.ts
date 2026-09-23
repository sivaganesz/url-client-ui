import { existsSync, readFileSync } from 'node:fs'
import { encrypt } from '../crypto.ts'
import { one, pool, query } from './index.ts'
import { hashPassword } from '../auth/password.ts'

/**
 * Development only: builds a workspace from the credentials the console
 * already had in its own .env.
 *
 * This exists so the new backend proxies to exactly the same workspace the old
 * one did, which makes "does this still work?" a like-for-like comparison
 * rather than a new variable. It also creates the admin the browser suite
 * signs in as, so a fresh checkout can run the tests.
 *
 *   node --experimental-strip-types src/db/seed-dev.ts
 */
const EMAIL = 'siva@example.com'
const PASSWORD = 'correct-horse-battery'
const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'admin-correct-horse'

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

try {
  const source = process.env.SEED_ENV_FILE ?? '../client-ui/.env'
  if (!existsSync(source)) {
    throw new Error(
      `no credentials to seed from — ${source} does not exist.\n\n` +
        "  This script carries the console's old .env into the database, so it\n" +
        '  only works on a machine that had the pre-database setup. On a fresh\n' +
        '  checkout use `npm run seed`, which prompts for the credentials, or\n' +
        '  point SEED_ENV_FILE at a file holding PERFOX_API_BASE and\n' +
        '  PERFOX_API_KEY.',
    )
  }
  const env = readEnv(source)
  const trim = (v: string | undefined) => v?.replace(/\/+$/, '') || null

  const existing = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [EMAIL])
  if (existing) {
    console.log(`  ${EMAIL} already exists — nothing to do.`)
  } else {
    const ws = await query<{ id: string }>(
      `INSERT INTO workspaces
         (name, perfox_api_base, perfox_api_token_enc,
          operator_api_host, operator_site_id, operator_site_secret_enc, operator_workflow_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        'Siva Workspace',
        trim(env.PERFOX_API_BASE),
        env.PERFOX_API_KEY ? encrypt(env.PERFOX_API_KEY) : null,
        trim(env.OPERATOR_API_HOST),
        env.OPERATOR_SITE_ID || null,
        env.OPERATOR_SITE_SECRET ? encrypt(env.OPERATOR_SITE_SECRET) : null,
        env.OPERATOR_WORKFLOW_ID || null,
      ],
    )

    await query(
      `INSERT INTO users (workspace_id, name, email, mobile, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'owner')`,
      [ws[0]!.id, 'Siva', EMAIL, '+916374160200', await hashPassword(PASSWORD)],
    )

    console.log(`  workspace ${ws[0]!.id}`)
    console.log(`  user      ${EMAIL} / ${PASSWORD}`)
  }

  // The browser suite signs in as this admin (tests/admin.spec.ts). Created
  // here rather than by hand, so a fresh checkout can run the tests.
  const admin = await one<{ id: string }>('SELECT id FROM admins WHERE lower(email) = $1', [
    ADMIN_EMAIL,
  ])
  if (admin) {
    console.log(`  admin ${ADMIN_EMAIL} already exists`)
  } else {
    await query('INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3)', [
      'Main Admin',
      ADMIN_EMAIL,
      await hashPassword(ADMIN_PASSWORD),
    ])
    console.log(`  admin     ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  }

  console.log(`  REST configured     : ${Boolean(env.PERFOX_API_KEY)}`)
  console.log(`  operator configured : ${Boolean(env.OPERATOR_SITE_SECRET)}`)
} catch (err) {
  console.error(`  failed: ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
