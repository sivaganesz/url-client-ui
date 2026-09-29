import { expect, expectNotBlank, test, visit } from './helpers'

/**
 * The Customers page.
 *
 * Reads only. Nothing here resets a password, edits a name or deletes
 * anything — this suite runs against the real workspace, and the admin
 * surface has its own tests against data it creates itself.
 *
 * The assertions are invariants rather than figures, because the data is live:
 * "the count and the list agree" survives a new conversation arriving
 * mid-suite, "ninety conversations" does not.
 */
test.describe('customers', () => {
  test.beforeEach(async ({ page }) => {
    await visit(page, '/customers')
  })

  test('lists who the workspace has spoken to', async ({ page }) => {
    await expectNotBlank(page)

    const rail = page.locator('aside a[href^="/customers/"]')
    await expect(rail.first()).toBeVisible()

    // The footer counts what the rail is showing, so the two cannot drift.
    const shown = await rail.count()
    await expect(page.locator('aside')).toContainText(new RegExp(`${shown}\\b`))
  })

  test('searching narrows the list and clearing it restores them', async ({ page }) => {
    const rail = page.locator('aside a[href^="/customers/"]')
    const before = await rail.count()
    expect(before, 'no customers to search').toBeGreaterThan(0)

    const first = (await rail.first().innerText()).split('\n')[0]!.trim()
    const search = page.getByPlaceholder('Search customers')

    await search.fill(first.slice(0, 4))
    await expect.poll(() => rail.count()).toBeLessThanOrEqual(before)
    await expect(rail.first()).toBeVisible()

    // Nothing at all should match this.
    await search.fill('zzzzzzz-no-such-customer')
    await expect(page.getByText(/Nobody matches that/i)).toBeVisible()

    await search.fill('')
    await expect.poll(() => rail.count()).toBe(before)
  })

  test('a profile shows what the workspace counts, not what the browser can see', async ({
    page,
  }) => {
    await page.locator('aside a[href^="/customers/"]').first().click()

    await expect(page.getByText('Quick stats')).toBeVisible()
    await expect(page.getByText('Identity')).toBeVisible()
    await expect(page.getByText('Insights')).toBeVisible()

    // Every figure on this tab comes from the workspace, so the one thing
    // worth asserting is that they arrived at all rather than what they say.
    const conversations = page.locator('section').getByText('Conversations', { exact: true })
    await expect(conversations).toBeVisible()

    const insights = page.getByText(/Across all \d+ conversations?\./)
    await expect(insights).toBeVisible()
  })

  /**
   * The reason this page asks the server for its figures.
   *
   * Counting conversations in the browser gives the size of the page it
   * happens to hold, which is a smaller number that reads exactly like the
   * real one. The header and the list must agree about the total.
   */
  test('the conversation count and the conversation list agree', async ({ page }) => {
    await page.locator('aside a[href^="/customers/"]').first().click()
    await expect(page.getByText('Quick stats')).toBeVisible()

    // The Conversations tile, as the workspace reports it. Label and figure
    // are sibling paragraphs, so the number is the one before the label.
    const label = page
      .locator('section')
      .getByText('Conversations', { exact: true })
      .first()
    await expect(label).toBeVisible()
    const tile = label.locator('xpath=preceding-sibling::p[1]')
    const counted = Number((await tile.innerText()).replace(/[^0-9]/g, ''))
    expect(Number.isFinite(counted), 'no conversation count on the profile').toBe(true)

    await page.getByText('Communication', { exact: true }).click()

    const rows = page.locator('section a[href^="/conversations/"]')
    const more = page.getByRole('button', { name: /Load more/ })

    // Let the first page land. Asking whether there is a pager while the
    // list is still arriving answers no, and then the whole list looks short.
    await expect(rows.first()).toBeVisible()

    if (await more.count()) {
      // "Load more (50 of 90)" — the 90 is the workspace's number.
      const label = await more.innerText()
      const total = Number(label.replace(/.*of\s+([\d,]+).*/s, '$1').replace(/[^0-9]/g, ''))
      expect(total, 'the pager disagrees with the profile').toBe(counted)
    } else {
      // Short enough to arrive in one page, so the rows are the whole of it.
      await expect.poll(() => rows.count()).toBe(counted)
    }
  })

  test('the status filter asks the server and shows only that status', async ({ page }) => {
    await page.locator('aside a[href^="/customers/"]').first().click()
    await page.getByText('Communication', { exact: true }).click()

    const rows = page.locator('section a[href^="/conversations/"]')
    await expect(rows.first()).toBeVisible()

    // Resolved is the narrowest filter this workspace has, and the request
    // must carry it rather than the browser sieving what it already holds.
    const asked: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (url.pathname.includes('/customers/') && url.pathname.endsWith('/conversations')) {
        asked.push(url.searchParams.get('status') ?? '')
      }
    })

    await page.getByRole('button', { name: 'Resolved', exact: true }).click()
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    expect(asked.at(-1), 'the filter was applied in the browser').toBe('resolved')

    // Wait for the filtered answer to land. Counting rows the moment the
    // chip is pressed counts the list that is on its way out.
    const empty = page.getByText(/No resolved conversations/i)
    await expect
      .poll(async () => (await rows.count()) > 0 || (await empty.count()) > 0)
      .toBe(true)

    // Whatever came back is resolved, or nothing came back at all.
    const count = await rows.count()
    if (count > 0) {
      await expect(page.locator('section').getByText('Ended', { exact: true })).toHaveCount(0)
    } else {
      await expect(empty).toBeVisible()
    }
  })

  /**
   * A customer nobody has a number or an address for.
   *
   * The rail used to print their id, in monospace, which is not a way of
   * reaching anybody and tells whoever is scanning the list nothing.
   */
  test('a customer with no contact details is described, not labelled with an id', async ({
    page,
  }) => {
    const rail = page.locator('aside a[href^="/customers/"]')
    await expect(rail.first()).toBeVisible()

    const withIds = rail.filter({ hasText: /[0-9a-f]{8}-[0-9a-f]{4}-/ })
    await expect(withIds, 'a customer id is being shown as contact details').toHaveCount(0)
  })
})
