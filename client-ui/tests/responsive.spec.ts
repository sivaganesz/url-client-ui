import { ROUTES, conversationRows, expect, expectNotBlank, test, visit } from './helpers'

/**
 * Runs under the `mobile` project only — see playwright.config.ts.
 *
 * The desktop layout is exercised by every other spec; what needs its own
 * pass is the phone, where the sidebar becomes a drawer and the conversation
 * rail and detail share one column.
 */

test('no page scrolls sideways on a phone', async ({ page }) => {
  for (const route of ROUTES) {
    await visit(page, route.path)
    // Measure once the page has stopped moving: a list still rendering can
    // read wider than it settles at.
    await page.waitForLoadState('networkidle')

    const overflow = await page.evaluate(() => {
      const d = document.documentElement
      return Math.max(d.scrollWidth - d.clientWidth, document.body.scrollWidth - document.body.clientWidth)
    })
    // A pixel of rounding is not a layout bug; a gutter escaping is.
    expect(overflow, `${route.path} overflows horizontally`).toBeLessThanOrEqual(1)
  }
})

test('the sidebar is a drawer that opens, navigates and closes itself', async ({ page }) => {
  await visit(page, '/')

  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toBeHidden()

  await page.getByRole('button', { name: /Open navigation/i }).first().click()
  await expect(nav).toBeVisible()

  await nav.getByRole('link', { name: 'Analytics', exact: true }).click()
  await expect(page.locator('h1')).toHaveText('Analytics')
  // Leaving it open over the page it just navigated to would cover the result.
  await expect(nav).toBeHidden()
})

test('the conversation rail and detail share the column', async ({ page }) => {
  await visit(page, '/conversations')
  await expect(conversationRows(page).first()).toBeVisible()

  await conversationRows(page).first().click()
  await expectNotBlank(page, 'section')

  // Back has to exist here: there is no rail beside the detail to return to.
  await page.getByRole('button', { name: /Back|Conversations/i }).first().click()
  await expect(conversationRows(page).first()).toBeVisible()
})
