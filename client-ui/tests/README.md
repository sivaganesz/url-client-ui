# Regression suite

```bash
npm test              # headless, all projects
npm run test:headed   # watch it drive the browser
npm run test:ui       # Playwright's UI mode, for writing and debugging
npx playwright test tests/conversations.spec.ts   # one file
```

The suite starts the backend and Vite itself, so it runs from a clean checkout.
What it needs first is a database with accounts in it:

```bash
cd ../backend
docker compose up -d      # Postgres on :5433
npm run migrate
npm run seed:dev          # the accounts these tests sign in as
```

`seed:dev` creates `siva@example.com` and `admin@example.com`, which is what
`auth.setup.ts` and `admin.spec.ts` default to; `TEST_EMAIL`, `TEST_PASSWORD`,
`TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` override both the seed and the
tests, so they stay in step.

Credentials for the workspace come from the environment
(`PERFOX_API_BASE`, `PERFOX_API_KEY`), from `SEED_ENV_FILE`, or from an old
`client-ui/.env` if one is still lying around. Without them the seed still
makes the accounts and says the workspace is unconfigured: sign-in, the admin
pages and `responsive.spec.ts` pass, and the specs that read live data fail
saying the workspace has no credentials.

If the suite fails at `auth.setup.ts`, that seed has not been run against this
database.

## Nothing here sends

No test places a call, sends a message, or publishes or unpublishes an agent.
The outbound paths are covered up to the confirmation step and stop there:

| Flow | Covered to | Not done |
|------|-----------|----------|
| Composer send | channel gating, disabled reasons | Send is never clicked |
| Call button | presence, gating, explanation | never clicked |
| New conversation | dialog contract, agent gating, Send disabled | never submitted |
| Agent activate/deactivate | confirm opens and names the agent | always cancelled |
| Operator calling | the config contract, that the secret stays server-side, the button gating | never dialled |

If you add a test that would send, it needs an explicit decision about which
number or address it reaches — not a default.

## These are integration tests

They drive a real browser against the real workspace API. That is deliberate:
almost everything that has broken in this project broke at the seam between
the UI and the API, and a mocked suite would have caught none of it.

The cost is that the data is not fixed. Assertions therefore check invariants
rather than figures:

```ts
expect(rows).toBeGreaterThan(0)            // not: toBe(50)
await expect.poll(...).toBeLessThanOrEqual(all)   // filtering never grows a list
```

A suite that fails when somebody adds a conversation teaches people to ignore
it. Where a figure genuinely matters — the agent count behind the stat tiles —
the test reads it from the API in the same run rather than hardcoding it, and
`test.skip` covers the workspaces where the case cannot arise.

## What each file is for

| File | Guards |
|------|--------|
| `smoke.spec.ts` | every route renders, with its heading and a live console. Catches bad imports, out-of-scope variables and broken lazy chunks — all of which blank a panel while leaving the shell up |
| `conversations.spec.ts` | the rail, its filters and search, the detail pane, and the Overview/Transcript tab switch that blanked once before |
| `new-conversation.spec.ts` | the dialog's focus trap, Escape, scroll lock and channel gating |
| `agents.spec.ts` | paging, the view toggle, the stat tiles counting the whole list rather than the page, and the destructive-action confirm |
| `analytics.spec.ts` | the over-time chart across all three intervals, credits, the log's filters and CSV export, and the page's behaviour with the API down |
| `responsive.spec.ts` | phone layout: no horizontal overflow, the drawer, and the single-column conversation view. Runs under the `mobile` project only |
| `admin.spec.ts` | the admin surface: that customers cannot sign themselves up, that /admin needs an admin session, that an admin creates a customer who can then sign in, that the key typed into the form is never readable afterwards, and that neither session can stand in for the other |
| `operator.spec.ts` | operator calling: the signing endpoint never leaks the secret, the Call button explains itself when the connector is unavailable, and the phone tab drops the agent picker |

## The console watch

`helpers.ts` extends Playwright's `page` fixture so every test fails if the
page logged an error. The one-off scripts this replaced had to remember to
check, and that is easy to forget. Expected development noise — StrictMode's
aborted `/api/health` probe, Vite's HMR chatter — is listed in `EXPECTED` and
filtered; anything else fails the test that was running when it appeared.
