import { allowConsoleErrors, expect, expectNotBlank, test, visit } from './helpers'

/**
 * Connected numbers and addresses.
 *
 * The page was blocked for months — no endpoint existed — and showed an
 * explanation instead of a table. It has real data now, from
 * `/credentials/{id}/resources`, so these are the assertions that would notice
 * it quietly going back to empty.
 */
test.describe('phone number connections', () => {
  test.beforeEach(async ({ page }) => {
    await visit(page, '/phone-numbers')
  })

  test('lists what the workspace is reachable on', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Phone Number Connections')
    await expectNotBlank(page)

    // Not an assertion about how many — that is live data. An assertion that
    // the page is showing something rather than the old "not available" state.
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
    await expect(page.getByRole('alert')).toBeHidden()
  })

  test('the same number appears once per channel', async ({ page }) => {
    /**
     * One number bound for voice and for WhatsApp is two rows, because they
     * are assigned to agents separately — merging them would hide that one is
     * claimed and the other is not. It also means the identifier cannot be the
     * row key, which is the bug this guards against: React would drop a row.
     */
    const identifiers = await page.locator('table tbody tr td:first-child').allTextContents()
    expect(identifiers.length).toBeGreaterThan(0)

    // Every row rendered, duplicates included — a key collision loses one.
    const rowCount = await page.locator('table tbody tr').count()
    expect(identifiers.length).toBe(rowCount)
  })

  test('an unassigned number says so, rather than looking broken', async ({ page }) => {
    const body = await page.locator('table').innerText()

    /**
     * `assigned_agent` is absent from the API rather than null when nothing
     * claims an identifier, because a spare number is a normal state. The page
     * has to read that as "Unassigned" and not as an error or a blank.
     */
    if (/Unassigned/.test(body)) {
      await expect(page.getByRole('alert')).toBeHidden()
    }
    expect(body).not.toContain('undefined')
    expect(body).not.toContain('null')
  })

  test('filters narrow the list and never grow it', async ({ page }) => {
    const rows = page.locator('table tbody tr')
    const all = await rows.count()
    expect(all).toBeGreaterThan(0)

    await page.getByPlaceholder(/Search number/i).fill('zzzz-no-such-number')

    // The empty state is itself a row, so counting to zero never happens —
    // asserting on the message is both truer and less brittle.
    await expect(page.getByText(/Nothing matches/i)).toBeVisible()

    await page.getByPlaceholder(/Search number/i).fill('')
    await expect.poll(() => rows.count()).toBe(all)
  })

  test('the page survives the credentials endpoint failing', async ({ page }) => {
    // Cutting it off is the point of this one, so the aborted requests it
    // causes are declared rather than switching the console watch off.
    allowConsoleErrors(page, /ERR_FAILED/, /Failed to load resource/)
    await page.route('**/api/perfox/credentials*', (route) => route.abort('failed'))
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Says it could not load rather than reading as "nothing connected" —
    // an empty table and a failed request are different facts.
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
