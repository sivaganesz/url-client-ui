import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { one, pool, query } from './index.ts'
import { hashPassword, passwordProblem } from '../auth/password.ts'

/**
 * Creates the admin account.
 *
 * This is the only account that cannot be made through the app, because
 * something has to exist before anything else can be created. Customers are
 * made by an admin on the Customers page — the interactive workspace prompts
 * that used to live in `npm run seed` moved there.
 *
 * It prompts rather than taking arguments, so the password does not end up in
 * a shell history.
 *
 *   npm run seed:admin
 */
const rl = createInterface({ input: stdin, output: stdout })

const ask = async (q: string, fallback = ''): Promise<string> => {
  const a = (await rl.question(fallback ? `${q} [${fallback}] ` : `${q} `)).trim()
  return a || fallback
}

try {
  const existing = await query<{ email: string }>('SELECT email FROM admins ORDER BY created_at')
  if (existing.length > 0) {
    console.log('\n  Admins already exist:')
    for (const a of existing) console.log(`    ${a.email}`)
    const more = await ask('\n  Add another? (y/N)', 'N')
    if (!/^y/i.test(more)) {
      console.log('  Nothing to do.\n')
      process.exit(0)
    }
  }

  console.log('\n── admin account ─────────────────────────────\n')

  const name = await ask('Name:')
  const email = (await ask('Email:')).toLowerCase()
  const password = await ask('Password (12+ characters):')

  if (!name || !email) throw new Error('Name and email are required.')
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)

  // Both tables: one address must not have an account on each, or signing in
  // would depend on which form you happened to use.
  const clashAdmin = await one<{ id: string }>('SELECT id FROM admins WHERE lower(email) = $1', [email])
  const clashUser = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (clashAdmin || clashUser) throw new Error(`${email} already has an account.`)

  const rows = await query<{ id: string }>(
    'INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
    [name, email, await hashPassword(password)],
  )

  console.log(`\n  admin ${rows[0]!.id}  ${email}`)
  console.log('  Sign in at /admin/login, then add customers from there.\n')
} catch (err) {
  console.error(`\n  ${(err as Error).message}\n`)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}
