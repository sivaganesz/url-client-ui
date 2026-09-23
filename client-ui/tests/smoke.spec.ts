import { ROUTES, allowConsoleErrors, expect, expectNotBlank, test, visit } from './helpers'

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

test('the sidebar names the signed-in user’s own workspace', async ({ page }) => {
  await visit(page, '/')

  const me = await page.request.get('/api/auth/me')
  const { user, workspace } = await me.json()

  expect(user, 'the saved session is not signed in — check tests/auth.setup.ts').toBeTruthy()
  expect(workspace?.name, 'the account has no workspace').toBeTruthy()
  expect(workspace.configured, 'the workspace has no Perfox credentials — run seed:dev').toBe(true)

  /**
   * Two regressions in one assertion. The name used to be hardcoded, so the
   * console kept announcing the old workspace after .env moved; and it now
   * comes from the session rather than from any environment, so two users
   * signed in from different machines each see their own.
   */
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav).toContainText(workspace.name)
  await expect(nav).toContainText(user.email)
})

test('no credential ever reaches the browser', async ({ page }) => {
  await visit(page, '/')

  /**
   * The whole reason the backend exists. A workspace key in a login response
   * would be readable in devtools by anyone who could sign in, would outlive
   * their session, and would let them bypass every permission added later.
   */
  const exposed = await page.evaluate(() => ({
    page: document.documentElement.innerHTML,
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    cookie: document.cookie,
  }))

  for (const [where, hay] of Object.entries(exposed)) {
    expect(hay, `a Perfox key is readable in ${where}`).not.toMatch(/sk_[a-zA-Z0-9]{30,}/)
    expect(hay, `an operator secret is readable in ${where}`).not.toMatch(/sa_secret_live_/)
  }

  // httpOnly, so script cannot read it even to steal it.
  expect(exposed.cookie, 'the session cookie is readable by JavaScript').not.toContain('ufsid')
})

/**
 * Signing out on its own session, not the shared one.
 *
 * Logging out deletes the session row, and every other test is replaying the
 * same saved cookie — so doing this with the shared state would sign the whole
 * suite out mid-run and fail whatever happened to come next.
 */
test.describe('sign out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('closes the door behind it', async ({ page, context }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'siva@example.com')
    await page.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'correct-horse-battery')
    await page.getByRole('button', { name: /^Sign in$/ }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

    await page.getByRole('button', { name: /Sign out/ }).click()
    await expect(page).toHaveURL(/\/login/)

    // Not just the redirect — the session has to be gone server-side too, or a
    // client-side guard is the only thing between a stale tab and the data.
    const me = await context.request.get('/api/auth/me')
    expect((await me.json()).user).toBeNull()

    const agents = await context.request.get('/api/perfox/agents')
    expect(agents.status(), 'the API still answered after sign-out').toBe(401)
  })
})

test('navigating between pages leaves no page blank', async ({ page }) => {
  await visit(page, '/')

  for (const route of ROUTES.slice(1)) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: route.link, exact: true }).click()
    await expect(page.locator('h1')).toHaveText(route.heading)
    await expectNotBlank(page)
  }
})

/**
 * Changing your own password.
 *
 * `POST /auth/password` existed from the start and nothing called it, so the
 * only way to change a password was for someone with database access to do it.
 * These stop short of actually changing it: the suite signs in with the seed's
 * password on every run, and a test that changed it would pass once.
 */
test('a customer can reach the password form, and it checks the old one', async ({ page }) => {
  // The wrong current password below is answered with a 401, on purpose.
  allowConsoleErrors(page, /401/, /Failed to load resource/)
  await visit(page, '/')
  await page.getByRole('button', { name: 'Change password' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const submit = dialog.getByRole('button', { name: 'Change password' })
  await expect(submit).toBeDisabled()

  // Too short, and the form says so rather than letting the server say it.
  await dialog.getByLabel('Current password').fill('whatever-it-is')
  await dialog.getByLabel('New password', { exact: true }).fill('short')
  await expect(dialog.getByText(/at least 12 characters/i)).toBeVisible()
  await expect(submit).toBeDisabled()

  // Long enough, but the two boxes disagree.
  await dialog.getByLabel('New password', { exact: true }).fill('a-long-enough-new-password')
  await dialog.getByLabel('New password again').fill('a-long-enough-new-passwore')
  await expect(dialog.getByText(/do not match/i)).toBeVisible()
  await expect(submit).toBeDisabled()

  /**
   * Matching now, so this one is really sent — with a current password that is
   * wrong, which is the assertion. Nothing changes, and the seed's password
   * still works on the next run.
   */
  await dialog.getByLabel('New password again').fill('a-long-enough-new-password')
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(dialog.getByRole('alert')).toContainText(/current password is not right/i)
})
