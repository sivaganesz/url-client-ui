import { expect, test, visit } from './helpers'

test.beforeEach(async ({ page }) => {
  await visit(page, '/agents')
  await expect(page.locator('table')).toBeVisible()
})

test('the table paginates, and the page size changes what is shown', async ({ page }) => {
  const rows = page.locator('table tbody tr')
  const firstPage = await rows.count()
  expect(firstPage).toBeGreaterThan(0)

  const sizes = page.getByRole('combobox').first()
  await sizes.selectOption({ index: 1 })

  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(firstPage)
})

/**
 * The counts above the table are for the whole list, not the visible page.
 *
 * Paging made this easy to get wrong: a tile that counts `pager.rows` reports
 * 10 agents on a workspace with 11 and nobody notices until a client does.
 */
test('the stat tiles count the whole list, not the current page', async ({ page }) => {
  const agents = await page.request.get('/api/perfox/agents')
  const total = (await agents.json()).data.length

  const rows = await page.locator('table tbody tr').count()
  test.skip(rows >= total, 'this workspace fits on one page')

  await expect(page.locator('main')).toContainText(String(total))
})

test('the view toggle swaps the table for cards', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid' }).click()
  await expect(page.locator('table')).toBeHidden()

  await page.getByRole('button', { name: 'Table' }).click()
  await expect(page.locator('table')).toBeVisible()
})

test('the toggle can be operated from the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Grid' }).focus()
  await page.keyboard.press('Enter')

  await expect(page.locator('table')).toBeHidden()
})

/**
 * Activate / Deactivate publish and unpublish a real agent, so the test stops
 * at the confirmation.
 *
 * What matters is that the destructive action asks first and that the dialog
 * names the agent — a confirm that says "Are you sure?" over the wrong row is
 * the failure mode worth catching.
 */
test('deactivating asks first, and the prompt names the agent', async ({ page }) => {
  const row = page.locator('table tbody tr').first()
  const agentName = (await row.locator('td').first().innerText()).trim()

  const deactivate = row.getByRole('button', { name: /Deactivate/i })
  test.skip(await deactivate.isDisabled(), 'the first agent is not live')

  await deactivate.click()

  // ConfirmDialog is an alertdialog: it interrupts rather than merely opens.
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText(agentName)

  // Scoped to the dialog: the backdrop is also labelled Cancel, so an
  // unscoped lookup matches two elements.
  // Cancelled, always. Confirming would unpublish a live agent.
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirm).toBeHidden()
})
