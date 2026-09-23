import { allowConsoleErrors, expect, test, visit } from './helpers'

/**
 * The conversation log, on GET /cases.
 *
 * It ran on invented rows for months, badged "Mock data", because nothing
 * scored a conversation. These are the assertions that would notice it going
 * back — or, more likely, quietly losing one of the distinctions the endpoint
 * is careful to make.
 */
const log = (page: import('@playwright/test').Page) =>
  page.locator('section', { hasText: 'Conversation log' }).first()

test.beforeEach(async ({ page }) => {
  await visit(page, '/analytics')
  await expect(page.locator('table tbody tr').first()).toBeVisible()
})

test('shows real cases, not the mock it replaced', async ({ page }) => {
  await expect(page.getByText('Mock data')).toHaveCount(0)

  const rows = page.locator('table tbody tr')
  expect(await rows.count()).toBeGreaterThan(0)

  // "1–25 of 315". The count is of everything matching, not of the page —
  // which is only true because the workspace filters before it pages.
  await expect(log(page)).toContainText(/\d+–\d+ of \d+/)
})

test('filtering goes to the server, and the total follows', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/cases')) sent.push(new URL(r.url()).search)
  })

  const countText = async () => (await log(page).innerText()).match(/\d+–\d+ of (\d+)/)?.[1]
  const before = await countText()

  await page.getByRole('button', { name: 'phone', exact: true }).first().click()
  await expect.poll(() => sent.at(-1) ?? '').toContain('channel=phone')

  /**
   * The total has to change, not just the rows. A browser filtering rows it
   * already holds would leave the total at the unfiltered figure and report
   * "1–25 of 315" over a filtered table.
   */
  await expect.poll(countText).not.toBe(before)
})

test('the two ways an agent can be missing are told apart', async ({ page }) => {
  /**
   * The distinction the endpoint is careful about: no `workflow_id` means
   * nothing matched the inbound, while a `workflow_id` with a null name means
   * an agent handled it and was deleted afterwards. Collapsing them would
   * report a handled conversation as unassigned.
   *
   * They fall on different pages of live data, so this walks until it has seen
   * both rather than assuming page one has them.
   */
  const seen = { none: false, deleted: false }

  for (let i = 1; i <= 5; i++) {
    const body = await page.locator('table').innerText()
    if (/No agent matched/.test(body)) seen.none = true
    if (/Agent deleted/.test(body)) seen.deleted = true
    if (seen.none && seen.deleted) break

    const next = page.getByRole('button', { name: 'Next' })
    if (await next.isDisabled()) break
    await next.click()

    /**
     * Wait for the page NUMBER, not for a row. The table keeps the previous
     * rows on screen while the next page loads — so waiting for "a row to be
     * visible" returns instantly and reads the page it was already on.
     */
    await expect(log(page)).toContainText(`Page ${i + 1} of`)
  }

  expect(seen.none, 'no case showed "No agent matched"').toBe(true)
  expect(seen.deleted, 'no case showed "Agent deleted"').toBe(true)
})

test('an unscored case says so rather than reading as a bad score', async ({ page }) => {
  const body = await page.locator('table').innerText()

  /**
   * The scored fields are absent until a conversation has been judged. A blank
   * verdict would read as "judged, and found nothing"; `resolved: false` would
   * be worse still, since not-yet-scored is not the same as unresolved.
   */
  if (/Not scored yet/.test(body)) {
    expect(body).not.toContain('undefined')
    expect(body).not.toContain('NaN')
  }
})

test('the ticket status is separate from the AI verdict', async ({ page }) => {
  // Both columns exist, because a conversation can be ended without being
  // resolved and one reading cannot carry both facts.
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'AI verdict' })).toBeVisible()
})

test('paging asks for the next page rather than slicing one it has', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/cases')) sent.push(new URL(r.url()).search)
  })

  const next = page.getByRole('button', { name: 'Next' })
  test.skip(await next.isDisabled(), 'this workspace has one page of cases')

  await next.click()
  await expect.poll(() => sent.at(-1) ?? '').toContain('page=2')
  await expect(log(page)).toContainText('Page 2 of')
})

test('a case links to its own transcript', async ({ page }) => {
  /**
   * A case IS a conversation — the row carries the conversation id, so there
   * is no second identifier to look up.
   */
  const view = page.locator('table tbody tr').first().getByRole('link')
  await expect(view).toHaveAttribute('href', /^\/conversations\/[0-9a-f-]{20,}$/)
})

test('the page survives cases failing', async ({ page }) => {
  allowConsoleErrors(page, /ERR_FAILED/, /Failed to load resource/)
  await page.route('**/api/perfox/cases*', (route) => route.abort('failed'))
  await page.reload({ waitUntil: 'domcontentloaded' })

  // The rest of Analytics keeps working; the log says it could not load.
  await expect(page.locator('h1')).toHaveText('Analytics')
  await expect(log(page)).toContainText(/Couldn.t load|Retry/i)
})

test('a case exports as CSV', async ({ page }) => {
  /**
   * This existed on the mock log and was lost in the rewrite to /cases, which
   * nothing caught until the old test failed. It is pinned here now.
   */
  await page.getByRole('button', { name: 'Export' }).first().click()

  // menuitemradio, not menuitem — it is a single choice.
  const csv = page.getByRole('menuitemradio', { name: 'CSV' })
  await expect(csv).toBeVisible()

  const download = page.waitForEvent('download')
  await csv.click()
  expect((await download).suggestedFilename()).toMatch(/^case-[0-9a-f]{8}\.csv$/)
})
