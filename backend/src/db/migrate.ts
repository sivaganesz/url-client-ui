import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './index.ts'

/**
 * Applies schema.sql.
 *
 * Every statement is CREATE ... IF NOT EXISTS, so running it twice is safe and
 * there is no migration table to keep in step. That holds while the schema is
 * only ever added to; the first destructive change is the point to bring in a
 * real migration tool rather than to make this one cleverer.
 */
const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(here, 'schema.sql'), 'utf8')

try {
  await pool.query(sql)
  console.log('[migrate] schema applied')
} catch (err) {
  console.error('[migrate] failed:', (err as Error).message)
  process.exitCode = 1
} finally {
  await pool.end()
}
