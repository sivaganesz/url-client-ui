import { ROUTES, expect, expectNotBlank, test, visit } from './helpers'

/**
 * Every route renders, with its heading, and logs nothing.
 *
 * The cheapest test in the suite and the one most likely to catch a real
 * regression: a bad import, an out-of-scope variable or a broken lazy chunk
 * all surface here as a blank panel.
 */
test.describe('every page loads', () => {
  for (const route of ROUTES) {
    test(`${route.name} renders`, async ({ page }) => {
      await visit(page, route.path)

      await expect(page.locator('h1')).toHaveText(route.heading)
      await expectNotBlank(page)
      // The shell has to survive whatever the page did.
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    })
  }
})

test('the sidebar names the connected workspace, not a hardcoded one', async ({ page }) => {
  await visit(page, '/')

  const health = await page.request.get('/api/health')
  const { workspace, keyConfigured } = await health.json()

  expect(keyConfigured, 'PERFOX_API_KEY is not set — copy .env.example to .env').toBe(true)
  expect(workspace, 'the proxy did not derive a workspace from PERFOX_API_BASE').toBeTruthy()

  // This is the regression: the name was hardcoded, so the console kept
  // announcing the old workspace after .env was pointed somewhere new.
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText(workspace)
})

test('navigating between pages leaves no page blank', async ({ page }) => {
  await visit(page, '/')

  for (const route of ROUTES.slice(1)) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: route.link, exact: true }).click()
    await expect(page.locator('h1')).toHaveText(route.heading)
    await expectNotBlank(page)
  }
})
