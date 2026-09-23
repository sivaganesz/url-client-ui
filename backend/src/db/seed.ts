import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { one, pool, query, type UserRow } from './index.ts'
import { encrypt } from '../crypto.ts'
import { hashPassword, passwordProblem } from '../auth/password.ts'

/**
 * Creates a workspace and its first user.
 *
 * This is the "our team sets the client up" step: registration is closed, so
 * this is how an account comes to exist. It prompts rather than taking
 * arguments, because a command line puts credentials in the shell history.
 *
 *   npm run seed
 */
const rl = createInterface({ input: stdin, output: stdout })

const ask = async (q: string, fallback = ''): Promise<string> => {
  const a = (await rl.question(fallback ? `${q} [${fallback}] ` : `${q} `)).trim()
  return a || fallback
}

try {
  console.log('\n── new workspace ─────────────────────────────\n')

  const name = await ask('Workspace name:')
  if (!name) throw new Error('A workspace name is required.')

  const apiBase = await ask('Perfox API base (https://<ws>-api.perfox.ai/api/v1):')
  const apiToken = await ask('Perfox API key (sk_…):')

  console.log('\n  Operator calling — leave blank to skip; it can be added later.\n')
  const opHost = await ask('  Operator API host:', apiBase ? new URL(apiBase).origin : '')
  const opSite = await ask('  Operator site id (sa_site_live_…):')
  const opSecret = await ask('  Operator site secret (sa_secret_live_…):')
  const opWorkflow = await ask('  Operator workflow id:')

  console.log('\n── first user (the client) ───────────────────\n')

  const userName = await ask('Name:')
  const email = (await ask('Email:')).toLowerCase()
  const mobile = await ask('Mobile (optional):')
  const password = await ask('Password (12+ characters):')

  if (!userName || !email) throw new Error('Name and email are required.')
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)

  const clash = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (clash) throw new Error(`${email} already has an account.`)

  const ws = await query<{ id: string }>(
    `INSERT INTO workspaces (
       name, perfox_api_base, perfox_api_token_enc,
       operator_api_host, operator_site_id, operator_site_secret_enc, operator_workflow_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      name,
      // Trimmed here as well as on read: a trailing slash builds "//agents",
      // which this API answers with 401 and which reads as a bad key.
      apiBase.replace(/\/+$/, '') || null,
      apiToken ? encrypt(apiToken) : null,
      opHost.replace(/\/+$/, '') || null,
      opSite || null,
      opSecret ? encrypt(opSecret) : null,
      opWorkflow || null,
    ],
  )

  const user = await query<UserRow>(
    `INSERT INTO users (workspace_id, name, email, mobile, password_hash, role)
     VALUES ($1,$2,$3,$4,$5,'owner') RETURNING *`,
    [ws[0]!.id, userName, email, mobile || null, await hashPassword(password)],
  )

  console.log(`\n  workspace ${ws[0]!.id}  ${name}`)
  console.log(`  user      ${user[0]!.id}  ${email}  (owner)`)
  console.log('\n  Sign in with that email and password.\n')
} catch (err) {
  console.error(`\n  ${(err as Error).message}\n`)
  process.exitCode = 1
} finally {
  rl.close()
  await pool.end()
}
