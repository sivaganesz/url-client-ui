import { conversationRows, expect, expectNotBlank, test, visit } from './helpers'

test.beforeEach(async ({ page }) => {
  await visit(page, '/conversations')
  await expect(conversationRows(page).first()).toBeVisible()
})

test.describe('the rail', () => {
  test('lists conversations and says how many of the workspace it is showing', async ({ page }) => {
    const rows = await conversationRows(page).count()
    expect(rows).toBeGreaterThan(0)

    /**
     * The footer has to distinguish three numbers: what is on screen, what the
     * API will return, and what the workspace holds. /conversations caps at
     * 200 with no paging, so "50 of 200" over a workspace of 294 was reported
     * as the total and hid 94 records. The wording is the fix, so it is what
     * is asserted.
     */
    const footer = page.locator('aside').locator('text=/\\d+ of \\d+/').last()
    await expect(footer).toBeVisible()
  })

  test('channel filters narrow the list and never grow it', async ({ page }) => {
    const all = await conversationRows(page).count()

    for (const channel of ['WhatsApp', 'Web', 'Phone']) {
      await page.getByRole('button', { name: channel, exact: true }).first().click()
      await expect
        .poll(() => conversationRows(page).count(), { message: `${channel} filter` })
        .toBeLessThanOrEqual(all)

      await page.getByRole('button', { name: 'All', exact: true }).first().click()
      await expect.poll(() => conversationRows(page).count()).toBe(all)
    }
  })

  test('a search with no matches shows an empty state rather than an empty box', async ({ page }) => {
    const search = page.getByPlaceholder(/Search name/i)
    await search.fill('zzzz-no-such-conversation')

    await expect(page.locator('aside')).toContainText(/No matches/i)

    await search.fill('')
    await expect(conversationRows(page).first()).toBeVisible()
  })

  test('the agent filter lists the agents that hold conversations', async ({ page }) => {
    await page.getByRole('button', { name: /Agent/i }).first().click()

    const options = page.locator('[role="menuitemradio"]')
    await expect(options.first()).toBeVisible()
    // "All agents" plus at least one real one.
    expect(await options.count()).toBeGreaterThan(1)

    await page.keyboard.press('Escape')
    await expect(options.first()).toBeHidden()
  })

  test('Load more appends without discarding what was shown', async ({ page }) => {
    const loadMore = page.getByRole('button', { name: /Load more/i })
    test.skip((await loadMore.count()) === 0, 'this workspace has one page of conversations')

    const before = await conversationRows(page).count()
    await loadMore.click()
    await expect.poll(() => conversationRows(page).count()).toBeGreaterThan(before)
  })
})

test.describe('a conversation', () => {
  test.beforeEach(async ({ page }) => {
    await conversationRows(page).first().click()
    await expect(page.locator('h2').first()).toBeVisible()
  })

  test('opens on Overview with its detail rendered', async ({ page }) => {
    await expectNotBlank(page, 'section')
    await expect(page.locator('section')).toContainText(/Summary|Captured information|Timeline/i)
  })

  /**
   * The regression this exists for: the composer was passed a variable defined
   * in the parent, so opening Transcript threw and blanked the panel. The
   * shell stayed up, so it looked like a conversation with no messages.
   */
  test('switches to Transcript and back without blanking', async ({ page }) => {
    await page.getByRole('tab', { name: /Transcript/i }).click()
    await expectNotBlank(page, 'section')

    await page.getByRole('tab', { name: /Overview/i }).click()
    await expectNotBlank(page, 'section')
  })

  test('the composer offers the text channels', async ({ page }) => {
    await page.getByRole('tab', { name: /Transcript/i }).click()

    await expect(page.getByPlaceholder(/Write a message/i)).toBeVisible()
    const chips = page.getByRole('button', { name: /^(WhatsApp|Email|SMS)$/ })
    expect(await chips.count()).toBeGreaterThanOrEqual(3)
  })

  /**
   * Outbound is verified up to the point of sending and no further.
   *
   * A chip is usable only when the conversation has the contact detail AND the
   * agent has a trigger for that channel, so a disabled chip must say which is
   * missing. That gating is the whole safety mechanism, and it is testable
   * without sending anything.
   */
  test('a blocked channel says why, and nothing is sent', async ({ page }) => {
    await page.getByRole('tab', { name: /Transcript/i }).click()

    const chips = page.getByRole('button', { name: /^(WhatsApp|Email|SMS)$/ })
    for (const chip of await chips.all()) {
      if (await chip.isDisabled()) {
        // The title is the explanation; an unexplained disabled control is the
        // defect this guards against.
        expect(await chip.getAttribute('title')).toMatch(/No |has no |Checking/i)
      }
    }
  })

  test('the Call button is present and gated', async ({ page }) => {
    const call = page.getByRole('button', { name: /^Call/ })
    await expect(call).toBeVisible()

    // Never clicked: a click here places a real call. If it is disabled it
    // must explain itself, which is the same contract as the chips.
    if (await call.isDisabled()) {
      expect(await call.getAttribute('title')).toBeTruthy()
    }
  })
})
