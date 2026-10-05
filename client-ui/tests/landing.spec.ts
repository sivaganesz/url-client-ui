import { test as signedOut, expect } from '@playwright/test'
import { test, visit } from './helpers'

/**
 * The front door.
 *
 * `/` means two different things depending on who is asking, and the point of
 * these tests is that adding the first did not disturb the second: a stranger
 * is told what this is, and a customer still lands on their dashboard.
 */
test.describe('signed in', () => {
  test('the root is still the dashboard, not the landing page', async ({ page }) => {
    await visit(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in to your workspace/i })).toHaveCount(0)
    // The rail is the proof they are inside the console.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  })
})

signedOut.describe('signed out', () => {
  signedOut.use({ storageState: { cookies: [], origins: [] } })

  signedOut('the root explains what this is, rather than redirecting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/workspace console/i)
    // Still at the root: a landing page that bounces is not one.
    expect(new URL(page.url()).pathname).toBe('/')
  })

  signedOut('both ways in are offered, and lead where they say', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Sign in to your workspace' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Password')).toBeVisible()

    await page.goto('/')
    await page.getByRole('link', { name: 'Administrator sign-in' }).click()
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  /**
   * Only the root. Somebody asking for a page inside the console knows what
   * this is, and should be returned there after signing in rather than shown
   * an introduction.
   */
  signedOut('a protected page still redirects to sign-in', async ({ page }) => {
    for (const path of ['/analytics', '/conversations', '/documents']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  signedOut('the theme toggle works before signing in', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    const before = await html.getAttribute('class')
    // Named by its visible word — the title is the longer explanation, and
    // text content wins over title for the accessible name.
    await page.getByRole('button', { name: /^(Dark|Light)$/ }).click()
    await expect(html).not.toHaveAttribute('class', before ?? '')
  })
})
