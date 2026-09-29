import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { one, pool, query } from './index.ts'
import { hashPassword, passwordProblem } from '../auth/password.ts'

/**
 * Creates an admin account.
 *
 * This is the only account that cannot be made through the app, because
 * something has to exist before anything else can be created. Customers are
 * made by an admin on the Customers page.
 *
 *   npm run seed:admin
 *
 * It prompts, so a password does not end up in a shell history. For a script —
 * CI, a container entrypoint, the development seed — set ADMIN_NAME,
 * ADMIN_EMAIL and ADMIN_PASSWORD, and it runs without asking. That path is
 * what stops "create the admin" from being a step only a human can do.
 *
 * All three are needed for it: setting the email and the password is what
 * turns the prompting off, so a missing name has nobody left to ask.
 */
const fromEnv = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
const rl = fromEnv ? null : createInterface({ input: stdin, output: stdout })

const ask = async (q: string, fallback = ''): Promise<string> => {
  if (!rl) return fallback
  const a = (await rl.question(fallback ? `${q} [${fallback}] ` : `${q} `)).trim()
  return a || fallback
}

try {
  const existing = await query<{ email: string }>('SELECT email FROM admins ORDER BY created_at')

  if (existing.length > 0 && !fromEnv) {
    console.log('\n  Admins already exist:')
    for (const a of existing) console.log(`    ${a.email}`)
    const more = await ask('\n  Add another? (y/N)', 'N')
    if (!/^y/i.test(more)) {
      console.log('  Nothing to do.\n')
      process.exit(0)
    }
  }

  if (!fromEnv) console.log('\n── admin account ─────────────────────────────\n')

  const name = process.env.ADMIN_NAME ?? (await ask('Name:'))
  const email = (process.env.ADMIN_EMAIL ?? (await ask('Email:'))).toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? (await ask('Password (12+ characters):'))

  if (!name || !email) {
    throw new Error(
      fromEnv
        ? 'Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD. Supplying the email and'
          .concat(' password is what makes this run without prompting, so the name')
          .concat(' has to come from the environment too.')
        : 'Name and email are required.',
    )
  }
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)

  // Idempotent when driven from the environment, so a setup script can run
  // twice without failing — which is the difference between a seed a person
  // runs once and one a machine runs on every boot.
  const already = await one<{ id: string }>('SELECT id FROM admins WHERE lower(email) = $1', [email])
  if (already) {
    if (!fromEnv) throw new Error(`${email} already has an account.`)
    console.log(`  admin ${email} already exists`)
    process.exit(0)
  }

  // One address must not have an account on both tables, or signing in would
  // depend on which form you happened to use.
  const clashUser = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (clashUser) throw new Error(`${email} already has a customer account.`)

  const rows = await query<{ id: string }>(
    'INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
    [name, email, await hashPassword(password)],
  )

  console.log(`\n  admin ${rows[0]!.id}  ${email}`)
  if (!fromEnv) console.log('  Sign in at /admin/login, then add customers from there.\n')
} catch (err) {
  console.error(`\n  ${(err as Error).message}\n`)
  process.exitCode = 1
} finally {
  rl?.close()
  await pool.end()
}
