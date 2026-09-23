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

test('nothing on Analytics sticks out of what holds it', async ({ page }) => {
  /**
   * Narrower than the Pixel this project runs at, because the bugs this
   * catches appeared on real phones and not in a 412px emulation: the pager's
   * range and buttons ran off the card, and the chart's two date inputs were
   * squeezed until "to" sat on top of the first one.
   *
   * The sideways-scroll test above misses all of it. A card with its own
   * rounded corners clips what overflows, so the document never grows — the
   * layout is broken without the page ever being wider than the screen.
   */
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await visit(page, '/analytics')
    await expect(page.locator('table tbody tr').first()).toBeVisible()

    const spills = await page.evaluate(() => {
      const out: string[] = []
      for (const el of Array.from(document.querySelectorAll('main *')) as HTMLElement[]) {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue

        const parent = el.parentElement
        if (!parent) continue
        // A parent that scrolls is entitled to hold something wider than
        // itself — the case table does exactly that, on purpose.
        if (getComputedStyle(parent).overflowX !== 'visible') continue

        const within = parent.getBoundingClientRect()
        if (box.right > within.right + 1) {
          out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}"`)
        }
      }
      return [...new Set(out)]
    })

    expect(spills, `at ${width}px`).toEqual([])
  }
})

test('the chart thins its axis rather than stacking the dates', async ({ page }) => {
  /**
   * Twelve labels was a fixed count, and twelve dates need about 550px. On a
   * phone the axis read "17 Ju23 Ju29 Jul4 Aug" — every label drawn, none of
   * them legible.
   */
  await visit(page, '/analytics')
  const chart = page.locator('svg[role="img"]').first()
  await expect(chart).toBeVisible()

  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 800 })

    /**
     * Polled, because the chart measures itself through a ResizeObserver: read
     * it the instant the viewport changes and you are still looking at the
     * labels chosen for the width before.
     */
    await expect
      .poll(async () =>
        chart.evaluate((svg) => {
          const frame = svg.getBoundingClientRect()
          const boxes = (Array.from(svg.querySelectorAll('text')) as SVGTextElement[])
            .filter((t) => /[A-Za-z]/.test(t.textContent ?? ''))
            .map((t) => t.getBoundingClientRect())
            .sort((a, b) => a.x - b.x)

          if (boxes.length < 2) return 'drew no dates'
          for (let i = 1; i < boxes.length; i++) {
            if (boxes[i]!.left - boxes[i - 1]!.right <= 0) return 'dates touching'
          }
          // Cut in half by the edge of the plot is its own unreadable.
          const out = boxes.some((b) => b.left < frame.left - 1 || b.right > frame.right + 1)
          return out ? 'a date off the edge of the plot' : 'ok'
        }),
      )
      .toBe('ok')
  }
})

test('every table pager fits a phone, and they all look the same', async ({ page }) => {
  /**
   * Analytics, Call Logs and Agents share one pager, and the requirement is
   * the same on each: page size on the left, the total in the middle, arrows
   * on the right, one line. Analytics was the odd one out because it asked for
   * a monospace footer — 13px wider on the same control, which was enough to
   * push the total off a 320px screen.
   */
  for (const path of ['/analytics', '/call-logs', '/agents']) {
    /**
     * Loaded once and resized, not loaded once per width. Nine page loads in
     * one test is a burst the workspace answers `rate_limited` to, and the
     * layout here is CSS — the widths do not need fresh data to prove
     * anything.
     */
    await page.setViewportSize({ width: 390, height: 780 })
    await visit(page, path)

    const size = page.getByLabel('Rows per page').first()
    const count = page.locator('span[aria-live]').first()
    await expect(size).toBeVisible()
    await expect(count).toBeVisible()

    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 780 })

      const shape = await count.evaluate((el) => {
        const pager = el.parentElement!
        const footer = pager.parentElement!
        const boxes = (Array.from(pager.children) as HTMLElement[]).map((c) =>
          c.getBoundingClientRect(),
        )
        return {
          clipped: el.scrollWidth > el.clientWidth + 1,
          /**
           * One line, counted by vertical centre rather than by top edge: the
           * row centres items of three different heights, so their tops differ
           * even when they sit side by side.
           */
          lines: new Set(boxes.map((b) => Math.round(b.top + b.height / 2))).size,
          spills: footer.scrollWidth > footer.clientWidth + 1,
        }
      })

      expect(shape.clipped, `${path} @${width} clips the total`).toBe(false)
      expect(shape.lines, `${path} @${width} wraps onto two lines`).toBe(1)
      expect(shape.spills, `${path} @${width} overflows the footer`).toBe(false)

      // Arrows only down here; the words belong to the desktop.
      await expect(page.getByRole('button', { name: 'Next page' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: /^Next$/ })).toHaveCount(0)
    }
  }
})

test('an empty date field still shows its format once tapped', async ({ page }) => {
  /**
   * Focusing a date input on a phone opens a calendar dialog and the field
   * itself draws nothing at all. A desktop does the opposite — focus puts you
   * in its "dd-mm-yyyy" segments, which have to be visible to type into — so
   * handing the field over on focus, as the desktop needs, left the phone
   * blank the moment it was tapped.
   */
  await visit(page, '/analytics')
  const field = page.locator('input[type="date"]').first()
  await expect(field).toBeVisible()
  const hint = field.locator('xpath=following-sibling::span[1]')

  await expect(hint).toHaveText('DD/MM/YYYY')
  await field.focus()
  await expect(hint).toBeVisible()

  // And it gets out of the way as soon as there is a real date to show.
  await field.fill('2026-09-01')
  await expect(hint).toBeHidden()
})

test('a menu opened near the edge stays on the screen', async ({ page }) => {
  /**
   * A dropdown hangs from its own button, and on a phone most buttons sit too
   * near an edge for what hangs off them: the date filter's menu is 256px wide
   * under a button two thirds of the way across a 390px screen, so half of it
   * used to be off the side — including one of the two date inputs.
   *
   * It does not show as horizontal overflow, because the menu is absolutely
   * positioned and simply clipped, which is why the test above never saw it.
   */
  await visit(page, '/analytics')
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  const log = page.locator('section', { hasText: 'Conversation log' }).first()

  for (const name of [/Any time/, /^Status/, /^Channel/, /^Started by/]) {
    await log.getByRole('button', { name }).click()

    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    const width = page.viewportSize()!.width

    expect(box.x, `${name} menu is off the left edge`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `${name} menu is off the right edge`).toBeLessThanOrEqual(width)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
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
