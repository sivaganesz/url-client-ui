import { readFile } from 'node:fs/promises'
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

/** "26–50 of 317" — blank while a page is in flight, so this can be undefined. */
async function range(page: import('@playwright/test').Page) {
  const m = (await log(page).innerText()).match(/(\d+)–(\d+) of (\d+)/)
  return m ? { first: Number(m[1]), last: Number(m[2]), total: Number(m[3]) } : null
}

test.beforeEach(async ({ page }) => {
  await visit(page, '/analytics')
  await expect(page.locator('table tbody tr').first()).toBeVisible()
})

test('shows real cases, not the mock it replaced', async ({ page }) => {
  await expect(page.getByText('Mock data')).toHaveCount(0)

  const rows = page.locator('table tbody tr')
  expect(await rows.count()).toBeGreaterThan(0)

  // "1–25 of 317" in the footer, "317 conversations" in the header. The count
  // is of everything matching, not of the page — which is only true because
  // the workspace filters before it pages.
  await expect(log(page)).toContainText(/\d+–\d+ of \d+/)
  await expect(log(page)).toContainText(/\d[\d,]* conversations?/)

  const r = await range(page)
  expect(r).not.toBeNull()
  expect(r!.last - r!.first + 1).toBe(await rows.count())
})

test('filtering goes to the server, and the total follows', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/cases')) sent.push(new URL(r.url()).search)
  })

  const before = (await range(page))?.total
  expect(before).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'phone', exact: true }).first().click()
  await expect.poll(() => sent.at(-1) ?? '').toContain('channel=phone')

  /**
   * The total has to change, not just the rows. A browser filtering rows it
   * already holds would leave the total at the unfiltered figure and report
   * "1–25 of 317" over a filtered table.
   *
   * The range is blank while a page is in flight, so an absent reading counts
   * as "unchanged" — otherwise this passes the moment the request starts,
   * which proves nothing about what came back.
   */
  await expect.poll(async () => (await range(page))?.total ?? before).not.toBe(before)
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

    /**
     * Wait for the OFFSET to move, not for a row. The table keeps the previous
     * rows on screen while the next page loads — so waiting for "a row to be
     * visible" returns instantly and reads the page it was already on.
     */
    const from = (await range(page))?.first
    await next.click()
    await expect.poll(async () => (await range(page))?.first ?? from).not.toBe(from)
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

  const size = (await range(page))!.last
  await next.click()
  await expect.poll(() => sent.at(-1) ?? '').toContain('page=2')
  await expect.poll(async () => (await range(page))?.first).toBe(size + 1)
})

test('the page size is a choice, and the workspace serves it', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/cases')) sent.push(new URL(r.url()).search)
  })

  const total = (await range(page))!.total
  await log(page).getByLabel('Rows per page').selectOption('50')

  /**
   * The request has to carry the new size. Slicing 50 rows out of the 25 the
   * browser holds is impossible, but slicing 10 out of them is not — and that
   * would quietly turn the pager into a client-side one whose total lies.
   */
  await expect.poll(() => sent.at(-1) ?? '').toContain('page_size=50')
  await expect.poll(() => page.locator('table tbody tr').count()).toBe(Math.min(50, total))

  // Page 13 of 25-row pages is not page 13 of 50-row pages, so the size
  // change returns to the first page rather than to a page that may not exist.
  expect(sent.at(-1)).toContain('page=1')
  await expect.poll(async () => (await range(page))?.first).toBe(1)
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

/**
 * The per-row export existed on the mock log and was lost in the rewrite to
 * /cases, which nothing caught until the old test failed. It is pinned here.
 */
test('a case exports as JSON, TXT or MD, transcript included', async ({ page }) => {
  // The row carries no events, so picking a format has to go and get them.
  let fetchedEvents = 0
  page.on('request', (r) => {
    if (/\/conversations\/[0-9a-f-]+\/events/.test(r.url())) fetchedEvents++
  })

  for (const format of ['JSON', 'TXT', 'MD'] as const) {
    await page.getByRole('button', { name: 'Export' }).first().click()

    // menuitemradio, not menuitem — it is a single choice.
    const item = page.getByRole('menuitemradio', { name: format, exact: true })
    await expect(item).toBeVisible()

    const download = page.waitForEvent('download')
    await item.click()

    const file = await download
    const ext = format.toLowerCase()
    expect(file.suggestedFilename()).toMatch(new RegExp(`^conversation-[0-9a-f]{8}\\.${ext}$`))

    // The named format, not three copies of one file under three extensions.
    const body = await readFile((await file.path())!, 'utf8')
    if (format === 'JSON') {
      const parsed = JSON.parse(body) as { conversation?: { id?: string }; messages?: unknown[] }
      expect(parsed.conversation?.id).toBeTruthy()
      expect(Array.isArray(parsed.messages)).toBe(true)
    } else if (format === 'MD') {
      expect(body).toMatch(/^# Conversation [0-9a-f-]{20,}/)
      expect(body).toContain('## Transcript')
    } else {
      expect(body).toMatch(/^Conversation [0-9a-f-]{20,}/)
      expect(body).toContain('─── Transcript ───')
    }
  }

  expect(fetchedEvents, 'no export fetched the transcript').toBeGreaterThan(0)
})
