import { conversationRows, expect, test, visit } from './helpers'

/**
 * Operator calling.
 *
 * NOTHING HERE DIALS. A dial opens a real phone call and puts the running
 * machine's microphone on it. What is tested is everything up to that: the
 * config endpoint's contract, that the secret stays server-side, and that the
 * UI explains itself when the connector is unavailable rather than offering a
 * button that cannot work.
 */

test.describe('the signing endpoint', () => {
  test('never returns the site secret', async ({ page }) => {
    const res = await page.request.get('/api/operator/config')
    const body = await res.text()

    // Whether or not it is configured, the response must not carry a secret.
    expect(body).not.toMatch(/sa_secret/)
    expect(body.toLowerCase()).not.toContain('siteSecret'.toLowerCase())
  })

  test('is configured, or says plainly that it is not', async ({ page }) => {
    const res = await page.request.get('/api/operator/config')

    // Always 200: "not configured" is an answer, not a failure, and a non-2xx
    // would have the browser log an error on every page load of a console that
    // simply has no operator credentials.
    expect(res.status()).toBe(200)
    const cfg = await res.json()

    if (cfg.configured === false) {
      // The un-configured path has to name what is missing — a bare flag sends
      // someone reading the source to find out.
      expect(cfg.reason).toMatch(/OPERATOR_|not configured/i)
      return
    }

    expect(cfg.apiHost, 'apiHost').toMatch(/^https:\/\//)
    // A trailing slash builds a double-slashed URL, which this platform
    // answers with a 401 that reads exactly like a bad credential.
    expect(cfg.apiHost).not.toMatch(/\/$/)
    expect(cfg.siteId, 'siteId').toMatch(/^sa_site_/)
    expect(cfg.operator?.externalId, 'externalId').toBeTruthy()
    // Hex SHA-256 — the shape the platform verifies against.
    expect(cfg.operator?.userHash, 'userHash').toMatch(/^[0-9a-f]{64}$/)
  })
})

test.describe('the call surface', () => {
  test('the Call button never offers a call it cannot place', async ({ page }) => {
    await visit(page, '/conversations')
    await expect(conversationRows(page).first()).toBeVisible()
    await conversationRows(page).first().click()

    const call = page.getByRole('button', { name: /^Call/ })
    await expect(call).toBeVisible()

    // Never clicked — a click places a real call. A disabled button must say
    // which of the three conditions failed: no number, connector unavailable,
    // or a call already up.
    if (await call.isDisabled()) {
      expect(await call.getAttribute('title')).toMatch(
        /No phone number|already on a call|operator|Connecting|not configured/i,
      )
    }
  })

  test('the new-conversation dialog drops the agent picker for a phone call', async ({ page }) => {
    await visit(page, '/conversations')
    await page.getByRole('button', { name: 'New' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // A text channel hands the conversation to an agent, so it picks one.
    await dialog.getByRole('button', { name: 'WhatsApp', exact: true }).click()
    await expect(dialog.locator('select')).toBeVisible()

    /**
     * Phone does not. The operator places the call through the site, so the
     * agent's triggers have no say in it and choosing one would be theatre.
     */
    await dialog.getByRole('button', { name: 'Phone call', exact: true }).click()
    await expect(dialog.locator('select')).toBeHidden()
    await expect(dialog).toContainText(/You place this call yourself/i)
    // People should not be surprised by an open microphone.
    await expect(dialog).toContainText(/microphone/i)
  })

  test('the call panel is absent until there is a call', async ({ page }) => {
    await visit(page, '/conversations')

    // The shell mounts it, so it must not render itself into view unprompted.
    await expect(page.getByRole('dialog', { name: /^Call with/ })).toBeHidden()
  })
})
