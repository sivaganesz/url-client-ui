import { expect, test as base, type Page } from '@playwright/test'

export const ROUTES = [
  { name: 'Dashboard', path: '/', link: 'Dashboard', heading: 'Dashboard' },
  { name: 'Analytics', path: '/analytics', link: 'Analytics', heading: 'Analytics' },
  { name: 'Conversations', path: '/conversations', link: 'Conversations', heading: 'Conversations' },
  { name: 'Call Logs', path: '/call-logs', link: 'Call Log Analytics', heading: 'Call Log Analytics' },
  { name: 'Agents', path: '/agents', link: 'AI Agents', heading: 'AI Agents' },
  {
    name: 'Phone Numbers',
    path: '/phone-numbers',
    link: 'Phone Numbers',
    // The sidebar label and the page heading differ here, so they are separate
    // fields rather than one reused string.
    heading: 'Phone Number Connections',
  },
] as const

/**
 * Console noise that is expected everywhere and is not a defect.
 *
 * StrictMode runs every effect twice in development and aborts the first. The
 * data-source probe is the one place that shows up as a failed request, since
 * it is the only fetch outside the shared request layer.
 */
const ALWAYS_EXPECTED = [
  /\/api\/health.*ERR_ABORTED/,
  /^\[vite\]/,
  /Download the React DevTools/,

  /**
   * The workspace API rate-limits, and a full suite run asks faster than it
   * allows — mostly because opening the New conversation dialog costs one
   * request per agent. Neither proxy rate-limits, so this is upstream.
   *
   * A 429 is the API declining, not the console misbehaving, so it does not
   * fail the test that saw it. It does not blind the suite either: the
   * assertions are about what rendered, and a page starved of data still
   * fails its heading and not-blank checks.
   *
   * Tracked as an API finding in TEST-REPORT.md, along with the fact that the
   * console has no retry or backoff for it.
   */
  /429 \(Too Many Requests\)/,
]

/** Per-test allowances, registered from inside the test body. */
const allowances = new WeakMap<Page, RegExp[]>()

/**
 * Declares errors a test provokes on purpose.
 *
 * Call it before the action that causes them. A test that cuts the API off
 * should say so rather than switch the console watch off, so that everything
 * it did *not* expect still fails the run.
 */
export function allowConsoleErrors(page: Page, ...patterns: RegExp[]) {
  allowances.set(page, [...(allowances.get(page) ?? []), ...patterns])
}

/**
 * Every test gets a console watch.
 *
 * A page that renders but logs a React error is broken; the one-off scripts
 * this replaced had to remember to check for that, and that is easy to forget.
 * Here it is automatic, and a test cannot pass while the console is dirty.
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const seen: string[] = []

    page.on('console', (m) => {
      if (m.type() === 'error') seen.push(`console.error: ${m.text().slice(0, 300)}`)
    })
    page.on('pageerror', (e) => seen.push(`pageerror: ${e.message.slice(0, 300)}`))

    await use(page)

    const expected = [...ALWAYS_EXPECTED, ...(allowances.get(page) ?? [])]
    const problems = seen.filter((text) => !expected.some((re) => re.test(text)))
    expect(problems, 'the page logged errors').toEqual([])

    /**
     * Pacing, not padding.
     *
     * The workspace API rate-limits, and back-to-back tests trip it: a full
     * run without this returns 429 on whichever page follows the New
     * conversation dialog, because opening that dialog costs one request per
     * agent. The delay keeps the suite honest about what it is measuring
     * instead of reporting the rate limiter as an application error.
     *
     * The real fix is on the API side — see the N+1 note in TEST-REPORT.md.
     * When /agents reports usable channels, this can go.
     */
    await page.waitForTimeout(600)
  },
})

export { expect }

/** Go to a route and wait for its data to settle. */
export async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await expect(page.locator('h1')).toBeVisible()
}

/**
 * Asserts the page rendered something.
 *
 * The specific failure this guards against: a scope or import error inside a
 * route leaves the shell up and the panel empty, which looks like an empty
 * state rather than a crash. It has happened twice in this project.
 */
export async function expectNotBlank(page: Page, selector = 'body') {
  const text = await page.locator(selector).innerText()
  expect(text.replace(/\s+/g, ' ').trim().length, `${selector} rendered no content`).toBeGreaterThan(40)
}

/** The rail's conversation links. */
export const conversationRows = (page: Page) =>
  page.locator('aside ul > li a[href^="/conversations/"]')
