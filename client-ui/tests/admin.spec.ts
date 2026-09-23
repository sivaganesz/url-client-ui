import { allowConsoleErrors, expect, test } from './helpers'

/**
 * The admin surface.
 *
 * Its own session, so these run signed out of the customer console — the two
 * are separate on purpose and a test that had both would not notice them
 * merging.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.TEST_ADMIN_PASSWORD ?? 'admin-correct-horse',
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: /^Sign in$/ }).click()
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible({ timeout: 20_000 })
}

test('customers cannot create their own account', async ({ page }) => {
  await page.goto('/login')

  // No form, no link, no route. The console reads real customer
  // conversations; a sign-up form would be a door onto them.
  await expect(page.getByRole('button', { name: /^Sign in$/ })).toBeVisible()
  expect(await page.getByRole('link', { name: /register|create account|sign up/i }).count()).toBe(0)

  await page.goto('/register')
  await expect(page).toHaveURL(/\/login/)
})

test('the sign-in page has its panel, and drops it on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  const panel = page.getByRole('heading', { level: 2 })
  await expect(panel).toBeVisible()

  // Below lg the panel is decoration that would cost a phone its whole
  // viewport, so it goes.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeHidden()
  await expect(page.getByRole('button', { name: /^Sign in$/ })).toBeVisible()
})

test('/admin requires an admin session', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
})

test('an admin signs in and sees the customers', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('button', { name: /Add customer/i })).toBeVisible()
  // Not the console: no workspace navigation anywhere on the admin surface.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
})

test('an admin creates a customer, who can then sign in', async ({ page }) => {
  await signIn(page)

  const stamp = Date.now()
  const email = `e2e-${stamp}@northwind.test`
  const password = 'northwind-long-password'
  const workspace = `E2E Northwind ${stamp}`
  const FAKE_KEY = 'sk_not_a_real_key_only_for_this_test_000000'

  // Three steps on a page of its own, rather than a dialog that scrolls.
  await page.getByRole('link', { name: /Add customer/i }).click()
  await expect(page).toHaveURL(/\/admin\/customers\/new/)

  const next = page.getByRole('button', { name: /^Next$/ })

  // Step one: the only one that has to be filled in, so Next waits for it.
  await expect(page.getByRole('heading', { name: 'Customer details' })).toBeVisible()
  await expect(next).toBeDisabled()
  await page.getByLabel('Workspace name').fill(workspace)
  await page.getByLabel('Contact name').fill('Nora')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await expect(next).toBeEnabled()
  await next.click()

  // Step two.
  await expect(page.getByRole('heading', { name: 'Perfox credentials' })).toBeVisible()
  await page.getByLabel('API base').fill('https://example-api.perfox.ai/api/v1')
  await page.getByLabel('API key').fill(FAKE_KEY)

  // Secrets are never plain inputs — a shoulder and a screenshot are both
  // real, and a browser offering to remember a customer's API key is worse.
  await expect(page.getByLabel('API key')).toHaveAttribute('type', 'password')
  await expect(page.getByLabel('API key')).toHaveAttribute('autocomplete', 'off')
  await next.click()

  /**
   * Step three, and the only one with Submit on it. The operator credentials
   * are left blank on purpose: they often arrive later, and the flow has to
   * carry on without them rather than block on something nobody has yet.
   */
  await expect(page.getByRole('heading', { name: 'Operator details' })).toBeVisible()
  await expect(next).toHaveCount(0)

  // Going back keeps what was typed — three steps, one form.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByLabel('API base')).toHaveValue('https://example-api.perfox.ai/api/v1')
  await next.click()

  await page.getByRole('button', { name: /^Submit$/ }).click()

  /**
   * The credentials stay on screen, once. This is the only moment the password
   * exists outside the admin's head — it is stored as an argon2 hash and no
   * endpoint returns it — so a dialog that closed on success took the one
   * thing worth keeping with it.
   */
  await expect(page.getByRole('heading', { name: new RegExp(workspace) })).toBeVisible({
    timeout: 20_000,
  })
  const handover = page.getByText(/share these customer credentials/i)
  await expect(handover).toBeVisible()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await expect(page.getByText(password, { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Back to customers' }).click()
  const row = page.locator('table tbody tr', { hasText: workspace })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Connected')

  /**
   * The key the admin just typed must not be readable anywhere afterwards —
   * not in the table, not in the page source. No endpoint returns it, and
   * this is what keeps that true.
   */
  expect(await page.content()).not.toContain(FAKE_KEY)

  /**
   * The point of the whole feature: provisioned here, signs in there.
   *
   * A fresh context, not another page in this one. Same browser means the
   * admin's cookie is still in the jar, and both sessions being live at once
   * is precisely what the separate cookie names allow — so a page opened here
   * would reach the admin API quite correctly, and prove nothing.
   */
  const customerContext = await page.context().browser()!.newContext()
  const customerPage = await customerContext.newPage()
  await customerPage.goto('/login')
  await customerPage.getByLabel('Email').fill(email)
  await customerPage.getByLabel('Password').fill(password)
  await customerPage.getByRole('button', { name: /^Sign in$/ }).click()

  await expect(customerPage.getByRole('navigation', { name: 'Main' })).toContainText(workspace, {
    timeout: 20_000,
  })

  // And the surfaces stay apart: this customer cannot reach the admin API.
  const asCustomer = await customerPage.request.get('/api/admin/customers')
  expect(asCustomer.status()).toBe(401)
  await customerContext.close()

  /**
   * And it was written down. Creating a customer hands somebody access to
   * real conversations, and until the audit trail existed that left no trace
   * at all — "who set this up, and when?" had no answer.
   */
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Activity' }).click()
  const entry = page.locator('table tbody tr', { hasText: workspace })
  await expect(entry).toContainText('Created customer')
  await expect(entry).toContainText(ADMIN.email)

  // Still nowhere, now that there is a second table it could have leaked into.
  expect(await page.content()).not.toContain(FAKE_KEY)
})

test('an admin session is not a console session', async ({ page, context }) => {
  await signIn(page)

  /**
   * Structural, not a guard: an admin has no workspace_id to resolve, so the
   * proxy cannot serve them even in principle.
   */
  for (const path of ['/api/config', '/api/perfox/agents', '/api/operator/config']) {
    expect((await context.request.get(path)).status(), `${path} answered an admin`).toBe(401)
  }

  await page.goto('/conversations')
  await expect(page).toHaveURL(/\/login/)
})

test('an admin can reach the password form, and it checks the old one', async ({ page }) => {
  /**
   * The mirror of the customer's, and stops in the same place: the suite signs
   * in with the seed's password every run, so a test that really changed it
   * would pass once and then lock the suite out of the admin surface.
   */
  allowConsoleErrors(page, /401/, /Failed to load resource/)
  await signIn(page)

  await page.getByRole('button', { name: 'Change password' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Current password').fill('not-the-admin-password')
  await dialog.getByLabel('New password', { exact: true }).fill('a-long-enough-new-password')
  await dialog.getByLabel('New password again').fill('a-long-enough-new-password')
  await dialog.getByRole('button', { name: 'Change password' }).click()

  await expect(dialog.getByRole('alert')).toContainText(/current password is not right/i)

  // And the session it was tried from is still good — a failed change must not
  // sign anybody out.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
})

test('the administrators page lists who can get in, and guards the last way in', async ({ page }) => {
  /**
   * More than one admin has been allowed since the first migration, but making
   * one meant running `seed:admin` on the server and there was nowhere to see
   * who already had access.
   *
   * Read-only on purpose: creating admins here would leave a row behind on
   * every run, and this suite signs in as the seeded one.
   */
  await signIn(page)
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Administrators' }).click()

  await expect(page.getByRole('heading', { name: 'Administrators' })).toBeVisible()
  // Scoped to the table: the sidebar names the signed-in admin as well.
  await expect(page.locator('table').getByText(ADMIN.email)).toBeVisible()

  // Your own row cannot be suspended: locking yourself out of the only surface
  // that can unlock you needs a person with psql to undo.
  const mine = page.locator('table tbody tr').filter({ hasText: ADMIN.email })
  await expect(mine.getByRole('button', { name: /Suspend|Reinstate/ })).toBeDisabled()

  // The form is there and says what it needs before it will send anything.
  await page.getByRole('button', { name: 'Add administrator' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add administrator' })).toBeDisabled()

  await dialog.getByLabel('Name').fill('Second')
  await dialog.getByLabel('Email').fill('second@example.com')
  await dialog.getByLabel('Password').fill('short')
  await expect(dialog.getByText(/at least 12 characters/i)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add administrator' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('every admin list pages the same way', async ({ page }) => {
  /**
   * Customers, Administrators and Activity all grew past a screenful — the
   * activity trail does so by design, since nothing deletes from it. One pager
   * on all three: 25 to start, a size to choose, the total, and two buttons.
   */
  await signIn(page)

  for (const link of [null, 'Administrators', 'Activity']) {
    if (link) {
      await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: link }).click()
    }

    const size = page.getByLabel('Rows per page')
    const count = page.locator('span[aria-live]').first()
    await expect(size).toBeVisible()
    await expect(count).toContainText(/\d+–\d+ of \d+/)

    // 25 to start with, and never more rows on screen than that.
    await expect(size).toHaveValue('25')
    expect(await page.locator('table tbody tr').count()).toBeLessThanOrEqual(25)

    await expect(page.getByRole('button', { name: /Previous/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Next/ })).toBeVisible()
  }
})

test('a long customer list turns pages without going to the server', async ({ page }) => {
  await signIn(page)

  const total = Number((await page.locator('span[aria-live]').first().innerText()).match(/of (\d+)/)?.[1] ?? 0)
  test.skip(total <= 25, 'this database has one page of customers')

  const next = page.getByRole('button', { name: /Next/ })
  await next.click()
  await expect(page.locator('span[aria-live]').first()).toContainText(`26–`)

  // The size selector re-slices what is already loaded, and returns to the top.
  await page.getByLabel('Rows per page').selectOption('50')
  await expect(page.locator('span[aria-live]').first()).toContainText('1–')
  expect(await page.locator('table tbody tr').count()).toBeLessThanOrEqual(50)
})
