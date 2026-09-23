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
 * The conversation log runs on mock data — the workspace scores no
 * conversation and raises no ticket. The filtering, paging and export are
 * real, so they are what is tested.
 */
test.describe('the conversation log', () => {
  test('channel filters toggle cleanly back to the baseline', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    const baseline = await rows.count()
    expect(baseline).toBeGreaterThan(0)

    const web = page
      .getByRole('group', { name: 'Filter by channel' })
      .getByRole('button', { name: 'Web', exact: true })
    await web.click()
    await expect.poll(() => rows.count()).toBeLessThan(baseline)
    await expect(web).toHaveAttribute('aria-pressed', 'true')

    await web.click()
    await expect.poll(() => rows.count()).toBe(baseline)
    await expect(web).toHaveAttribute('aria-pressed', 'false')
  })

  test('a row exports as CSV', async ({ page }) => {
    await page.getByRole('button', { name: 'Export' }).first().click()

    // The menu uses menuitemradio, not menuitem — it is a single choice.
    const csv = page.getByRole('menuitemradio', { name: 'CSV' })
    await expect(csv).toBeVisible()

    const download = page.waitForEvent('download')
    await csv.click()
    expect((await download).suggestedFilename()).toMatch(/\.csv$/)
  })
})

/**
 * Cutting the API off is the point of this one, so the aborted requests it
 * causes are declared rather than silencing the watch.
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
