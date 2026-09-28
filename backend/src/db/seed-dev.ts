import { existsSync, readFileSync } from 'node:fs'
import { encrypt } from '../crypto.ts'
import { one, pool, query } from './index.ts'
import { hashPassword } from '../auth/password.ts'

/**
 * Development only: the accounts the browser suite signs in as, and a
 * workspace for them to look at.
 *
 *   npm run seed:dev
 *
 * It used to insist on `../client-ui/.env`, the file the console kept its key
 * in before there was a database — so it worked on the one machine that had
 * been through the old setup and nowhere else. A fresh checkout could not run
 * the browser tests at all, which made "the tests pass" a claim only one
 * person could check.
 *
 * Credentials are now taken from the first of these that has them:
 *
 *   1. the environment — PERFOX_API_BASE, PERFOX_API_KEY, OPERATOR_*
 *   2. the file named by SEED_ENV_FILE
 *   3. ../client-ui/.env, if it happens to still be there
 *
 * With none of them it still creates the accounts and says the workspace is
 * unconfigured, because sign-in, the admin pages and the responsive suite do
 * not need a Perfox key — only the pages that read live data do, and those
 * report "not configured" rather than failing strangely.
 *
 * The account names match what the tests default to, so seeding and running
 * them line up without a second set of variables to keep in step.
 */
const EMAIL = process.env.TEST_EMAIL ?? 'siva@example.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'correct-horse-battery'
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'admin-correct-horse'

const KEYS = [
  'PERFOX_API_BASE',
  'PERFOX_API_KEY',
  'OPERATOR_API_HOST',
  'OPERATOR_SITE_ID',
  'OPERATOR_SITE_SECRET',
  'OPERATOR_WORKFLOW_ID',
] as const

type Credentials = Partial<Record<(typeof KEYS)[number], string>>

function readEnvFile(path: string): Credentials {
  const out: Credentials = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim() as (typeof KEYS)[number]
    if (KEYS.includes(key)) out[key] = trimmed.slice(eq + 1).trim()
  }
  return out
}

/** The first source that carries a key, and where it came from. */
function credentials(): { values: Credentials; source: string } {
  const fromEnv: Credentials = {}
  for (const key of KEYS) if (process.env[key]) fromEnv[key] = process.env[key]
  if (fromEnv.PERFOX_API_KEY) return { values: fromEnv, source: 'the environment' }

  const named = process.env.SEED_ENV_FILE
  if (named) {
    if (!existsSync(named)) throw new Error(`SEED_ENV_FILE points at ${named}, which does not exist.`)
    return { values: readEnvFile(named), source: named }
  }

  const legacy = '../client-ui/.env'
  if (existsSync(legacy)) return { values: readEnvFile(legacy), source: legacy }

  return { values: {}, source: '' }
}

try {
  const { values: env, source } = credentials()
  const trim = (v: string | undefined) => v?.replace(/\/+$/, '') || null

  console.log(source ? `  credentials from ${source}` : '  no credentials found')

  const existing = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [
    EMAIL.toLowerCase(),
  ])

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
    ADMIN_EMAIL.toLowerCase(),
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

  if (!env.PERFOX_API_KEY) {
    console.log(
      '\n  No Perfox key, so the pages that read live data will say they are not\n' +
        '  configured. Sign-in, the admin pages and the responsive suite work as\n' +
        '  they are. To add one, set PERFOX_API_BASE and PERFOX_API_KEY and run\n' +
        '  this again, or paste them into the workspace from the admin pages.',
    )
  }
} catch (err) {
  console.error(`  failed: ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
