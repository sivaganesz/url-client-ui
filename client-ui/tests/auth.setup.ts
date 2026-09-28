import { expect, test as setup } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { STORAGE_STATE } from './paths'

/**
 * Signs in once, and saves the cookie for every other test to reuse.
 *
 * Signing in per test would be 40-odd argon2 verifications a run, and argon2
 * is deliberately slow. This runs as its own project that the others depend
 * on, so the cost is paid once.
 *
 * The credentials are the development seed's (`npm run seed:dev` in the
 * backend), not a real account. If the suite starts failing here, that seed
 * has not been run against this database.
 */
const EMAIL = process.env.TEST_EMAIL ?? 'siva@example.com'
const PASSWORD = process.env.TEST_PASSWORD ?? 'correct-horse-battery'

setup('sign in', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /^Sign in$/ }).click()

  // The redirect is the proof it worked; an error banner means the seed is
  // missing, and saying so beats forty tests failing on a missing sidebar.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 15_000 })

  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })
})
