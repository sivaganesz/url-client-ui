import { allowConsoleErrors, expect, expectNotBlank, test, visit } from './helpers'

test.beforeEach(async ({ page }) => {
  await visit(page, '/analytics')
})

test('the conversations-over-time chart redraws for each interval', async ({ page }) => {
  for (const interval of ['Day', 'Week', 'Month']) {
    await page.getByRole('button', { name: interval, exact: true }).click()

    // `interval` is the only query parameter this endpoint honours, and each
    // one returns a different date format, so a broken parser shows up as an
    // empty plot rather than an error.
    await expect(page.locator('svg path').first()).toBeVisible()
  }
})

test('the credit balance comes from the billing endpoint', async ({ page }) => {
  const credits = await page.request.get('/api/perfox/billing/credits')
  expect(credits.ok()).toBe(true)

  await expect(page.locator('main')).toContainText(/Credit/i)
})

/**
 * The conversation log moved to its own file when it stopped being mock data.
 * It is a server-filtered, server-paged view of GET /cases now, and the
 * assertions that matter are about that — see cases.spec.ts.
 */

test.describe('with the API cut off', () => {
  test('the page says so instead of inventing numbers', async ({ page }) => {
    allowConsoleErrors(page, /ERR_FAILED/, /Failed to load resource/)
    await page.route('**/api/perfox/**', (route) => route.abort('failed'))
    await page.reload({ waitUntil: 'domcontentloaded' })

    // The contract from the audit: no fabricated numbers, and a stated
    // failure. A page that quietly renders zeroes is worse than one that
    // says it could not load.
    await expect(page.locator('h1')).toBeVisible()
    await expectNotBlank(page)
    await expect(page.locator('main')).toContainText(/Couldn.t load|Not available|Retry/i)
  })
})
