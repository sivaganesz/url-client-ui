import { expect, test, visit } from './helpers'

/**
 * The New conversation dialog.
 *
 * This dialog places real calls and sends real messages, so no test here
 * submits it. What is tested is everything up to Send: the dialog's keyboard
 * contract, and the gating that decides whether Send is offered at all.
 *
 * Kept to three tests on purpose. Opening the dialog costs one request per
 * agent — the workspace reports "web" for every agent's channels, so the only
 * way to know what an agent can be reached on is to fetch its graph — and a
 * test per assertion rate-limited the API at 429. See tests/README.md.
 */
test.beforeEach(async ({ page }) => {
  await visit(page, '/conversations')
  await page.getByRole('button', { name: 'New' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('the dialog meets its keyboard and screen-reader contract', async ({ page }) => {
  const dialog = page.getByRole('dialog')

  // Named, so a screen reader announces what opened rather than "dialog".
  await expect(dialog).toHaveAttribute('aria-labelledby', /.+/)
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  // Focus moves to the panel itself, which carries that name.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('dialog')

  // The page behind must not scroll under a trackpad.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

  // Tab cannot escape.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(
      () => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement),
    )
    expect(inside, `focus left the dialog on Tab ${i + 1}`).toBe(true)
  }

  // Escape closes it and gives the page back.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

/**
 * Only a published agent with a trigger for the chosen channel can take a
 * conversation. When none exists the dialog has to say so rather than offer a
 * Send that the API will reject.
 */
test('each channel either offers an agent or explains that none handles it', async ({ page }) => {
  const dialog = page.getByRole('dialog')
  const select = dialog.locator('select')

  // Phone is not in this list: a call is placed by the operator through the
  // site, so there is no agent to choose and no picker to check. Its own
  // gating is covered in operator.spec.ts.
  for (const channel of ['SMS', 'WhatsApp', 'Email']) {
    await dialog.getByRole('button', { name: channel, exact: true }).click()

    // The agent list is fetched per channel; assert once it has settled,
    // otherwise "Loading agents…" reads as neither an agent nor a reason.
    await expect(select).not.toContainText(/Loading/i)

    // A collapsed <select> contributes nothing to innerText, so the options
    // are read directly rather than looked for in the dialog's text.
    const options = await select.locator('option').allTextContents()
    const noAgent = options.some((o) => /No published workflow/i.test(o))
    const offersAgent = options.some((o) => !/Choose|Loading|No published/i.test(o))

    expect(
      noAgent || offersAgent,
      `${channel} offered neither an agent nor an explanation`,
    ).toBe(true)
  }
})

test('Send stays disabled until the form is complete', async ({ page }) => {
  const dialog = page.getByRole('dialog')

  // Nothing chosen and nothing typed, so there is nothing to send.
  await expect(dialog.getByRole('button', { name: /^(Send|Call|Start)/i }).last()).toBeDisabled()
})
