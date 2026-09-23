# Client Console — Test Report & Page Completion Status

**Branch:** `fs-ini` · **Tested:** 22–24 September 2026 · **Last updated:** 24 September 2026
**Latest round:** the admin surface — a sidebar, paged lists, a three-step create, revealing a stored credential, deleting a customer, and closing the gaps left open at handover — §12.
**Method:** Automated browser testing (Playwright + Chromium) against two live workspaces, plus the production build.
**Scope:** 21 exploratory runs covering all 6 pages, every major user flow, accessibility, responsive behaviour and error handling — since consolidated into a committed regression suite of **150 tests: 76 in the browser** (§9, §12) and **74 on the backend** (§11, §12).

> Outbound actions were restricted to the single authorised number **+916374160200**. No other number was contacted.

### Workspaces tested

Testing against two workspaces with very different data was deliberate — it exposed two bugs that a single dataset hid.

| | `siva-workspace` | `pradeepworkspace` |
|---|---|---|
| Conversations | 200 loaded of **294** (capped) | **13 of 13** (nothing hidden) |
| Agents | 11 | 6 — draft, published and paused |
| Calls | 57 | 0 |
| Customers | 57 | 1 |
| Credits | 1,703.59 | 4,924.87 |

The second workspace exercised cases the first could not: an **empty** call log, **draft and paused** agents, and an **uncapped** conversation list.

---

## 1. Page-wise completion table

| # | Page | Status | Working API calls | Notes |
|---|------|--------|:---:|-------|
| 1 | Dashboard | ✅ Complete | 4 | All figures live |
| 2 | Analytics | ✅ Complete | 7 | Conversation Log runs on /cases — §12.5 |
| 3 | Conversations | ✅ Complete | 7 + SDK | Text outbound, and operator calling (§10) |
| 4 | Call Log Analytics | ✅ Complete | 2 | Recording playback working |
| 5 | AI Agents | ✅ Complete | 3 | Includes activate/deactivate |
| 6 | Phone Numbers | ✅ Complete | 2 | Plivo numbers, from credential resources — §12.5 |

---

### 1.1 Dashboard — ✅ Complete

**Working API calls: 4**

| API | Method | Purpose |
|-----|:---:|---------|
| `/conversations` | GET | Conversation list, used to derive recent activity |
| `/customers` | GET | Joined to conversations so rows show a name, not an id |
| `/agents` | GET | Joined to conversations so rows show which agent handled it |
| `/analytics/summary` | GET | Authoritative totals and the per-channel split for the four stat tiles |

**Gaps / issues:** None.

> The four tiles (Total / Phone / WhatsApp / Web conversations), the volume chart, the channel breakdown and the recent-conversations list all read live data. Request count is 4 — previously 8, before duplicate reads were shared.

---

### 1.2 Analytics — ✅ Complete

**Working API calls: 7**

| API | Method | Purpose |
|-----|:---:|---------|
| `/analytics/summary` | GET | Total conversations, resolution rate |
| `/billing/credits` | GET | Credit balance tile, plus the low/out-of-credit warning states |
| `/analytics/conversations-over-time` | GET | The main chart; re-queried on every Interval / date-range change |
| `/conversations` | GET | Feeds the channel breakdown |
| `/customers` | GET | Joined to conversations |
| `/agents` | GET | Joined to conversations |
| `/cases` | GET | The conversation log — filtered, scored and paged by the workspace |

**Gaps / pending:** none. The Conversation Log ran on invented rows, badged
"Mock data", until `/cases` existed; it is real now — see §12.5.

**Issues:** None found. Interval switching (Day / Week / Month) and the date
range both refetch correctly.

---

### 1.3 Conversations — ✅ Complete

**Working API calls: 7** (4 read, 1 write, plus 2 on-demand)

| API | Method | Purpose |
|-----|:---:|---------|
| `/conversations` | GET | The conversation list in the left rail |
| `/customers` | GET | Joined so each row shows a customer name |
| `/agents` | GET | Joined so each row shows its agent, and to build the agent filter |
| `/conversations/{id}/events` | GET | The transcript — messages and tool calls |
| `/agents/{id}` | GET | Reads the agent's graph to decide which channels it can send on |
| `/conversations/{id}/recordings` | GET | Signed audio URLs for the Overview tab player |
| `/outbound` | **POST** | Starts a conversation or sends a message on a text channel |
| operator SDK | — | Places a call, with the operator on the line. See §10 |

**Verified working:**

- Channel filters (All / WhatsApp / Web / Phone / SMS / Email), search, agent filter with counts
- Load-more paging, empty state on no match
- Detail pane: Overview and Transcript tabs both render and switch
- Composer: channel chips enable/disable with a stated reason, Send gated correctly
- New-conversation dialog: agent list filtered by trigger node, per-channel contact field
- **Outbound WhatsApp sent successfully** to the authorised number
- **Calls placed and answered** on the authorised number, with working mute, hold and hang-up — §10

**Gaps / issues:**

| Item | Detail |
|------|--------|
| ✅ **Rail count — FIXED** | Previously read "50 of 200 conversations" when the workspace held 294, reporting the API cap as the total. Now reads `50 of 200 · 294 in workspace`, with a tooltip explaining the cap. See §7.1. |
| ✅ **Call popup controls — FIXED** | Mute / Hold / End were display-only. They now act on the real audio stream, verified on answered calls. See §10. |
| ✅ **Call popup naming — RESOLVED** | It showed the agent's name because the agent placed the call. The operator places it now, so the panel carries the customer's name from the click. |

---

### 1.4 Call Log Analytics — ✅ Complete

**Working API calls: 2**

| API | Method | Purpose |
|-----|:---:|---------|
| `/calls` | GET | The call log. Cursor-paginated — followed to the end so nothing is hidden past the server cap |
| `/conversations/{id}/recordings` | GET | Signed recording URL, fetched on demand when a row's play button is pressed |

**Verified working:** 57 calls listed, four stat tiles, search and three filters, pagination (25 / 50 / 100), and **recording playback** — signed URL fetched and audio streamed (HTTP 206).

**Gaps / issues:**

| Item | Detail |
|------|--------|
| ⚪ Call direction not shown | The API reports `direction: unknown` on every call, so the column is deliberately omitted rather than shown blank. |
| ⚪ Recordings age out | `has_recording` turns false after the retention window — expected, not a defect. |

---

### 1.5 AI Agents — ✅ Complete

**Working API calls: 3** (1 read, 2 write)

| API | Method | Purpose |
|-----|:---:|---------|
| `/agents` | GET | The agent list — name, status, channels, build, last updated |
| `/agents/{id}/publish` | **POST** | Activate: takes an agent live (runs its own validation upstream) |
| `/agents/{id}` | **PATCH** | Deactivate: sets status to `paused` |

**Verified working:** table and grid views, pagination (10 / 25 / 50 / 100), Activate / Deactivate buttons with correct enabled state, and the confirmation dialog — opened, read correctly, and cancelled with Escape without changing anything.

**Gaps / issues:**

| Item | Detail |
|------|--------|
| ⚪ Per-agent metrics unavailable | `/agents` returns no conversation or resolution figures per agent, so only the total count is shown. Marked as reserved in the UI. |

> Activate and Deactivate are **separate endpoints** because `PATCH` rejects `"published"` — going live runs its own validation upstream.

---

### 1.6 Phone Numbers — ✅ Complete

**Working API calls: 2**

| API | Method | Purpose |
|-----|:---:|---------|
| `/credentials` | GET | The workspace's connections, filtered to Plivo |
| `/credentials/{id}/resources` | GET | The numbers on each, with their channels and assigned agent |

**Verified working:** the numbers a workspace is reachable on, one row per
number and channel, with the agent each is assigned to. An unassigned number
says so rather than looking broken, and the page survives the credentials
endpoint failing.

> This page previously displayed **eight fabricated phone numbers** with invented providers (Twilio, Exotel, Plivo) and connection counts, presented as real data. That was removed while the endpoint did not exist, and the page said so; it reads the real resource now.

**Scope, at the client's direction:** Plivo only, and view-only — the create
credential flow is deliberately not used here.

---

## 2. What was tested

| Area | Coverage |
|------|----------|
| Pages | All 6 routes, in both dev and production builds |
| Navigation | SPA routing, back/forward, direct URL, refresh, unknown route |
| Conversations | List, filters, search, agent dropdown, load-more, detail pane, both tabs, composer |
| Outbound (text) | New-conversation dialog, WhatsApp send, composer send |
| Operator calling | 5 real calls: dial, pickup, mute, hold, navigation, hang-up, no-answer, double-dial (§10) |
| Call panel | Status from the platform, timer, controls against a live audio stream |
| Agents | Table/grid toggle, pagination, action buttons, confirmation dialog |
| Call Logs | Table, filters, pagination, recording playback |
| Analytics | Stat tiles, chart intervals, conversation log filters, CSV export |
| Accessibility | Tab order, focus ring, focus trap, Escape, scroll lock, heading hierarchy |
| Responsive | 375 / 768 / 1280 / 1920 px |
| Error handling | Complete API failure; and for calling, a config endpoint that fails, is unreachable, returns nonsense or never answers |
| Console | Errors, warnings and failed requests on every page |

Everything in this table was tested by hand or by one-off script during the
rounds above. What is now **permanently guarded** is §9 — the parts that would
silently break are covered; the parts that would send a message or place a call
are covered up to the confirmation and no further.

---

## 3. Working correctly

**Zero console errors on any page, in both dev and production.**

- Conversation detail renders correctly after the file split, including the Transcript tab
- Outbound works end to end — WhatsApp delivered, `send_authorized: true`, navigation to the new conversation
- Call placed successfully; popup displayed with initials, number, Mute, Hold, End
- Call popup timer runs; Mute toggles to Unmute; Hold shows "On hold" and pauses the clock
- Agent-to-channel filtering correct: WhatsApp → `client-ui-testing`, Phone → `phone call testing`, SMS/Email → none
- Composer chips disable with a stated reason (*"client-ui-testing has no Email trigger"*)
- Dashboard fires **4** API requests, down from 8
- Route code splitting confirmed — the Conversations chunk loads only on navigation
- Recording playback streams audio successfully
- Pagination correct on Call Logs and Agents; stat tiles count the whole list, not the page
- Modal accessibility: focus enters, Tab is trapped, Escape closes, page scroll locks and restores
- Keyboard navigation reaches every control; 2px focus ring visible; Enter activates
- No horizontal overflow at any of the four screen widths
- Mobile drawer, and list → detail → back, all work
- All six routes have exactly one `<h1>`
- **On total API failure: error banner, Retry button, and no fabricated data**

---

## 4. Errors found

**None in the pages.** No console errors, page errors or React warnings on any
route, in either build.

**Two in the call flow**, both found only by phoning a real number and both now
fixed — the panel reporting a false mute state at pickup, and a raw SDK error
string shown to the user. They are written up in §10.3, because neither could
have been caught by reading the code or by any test that does not place a call.

Two artefacts that are not defects:

- `/api/health net::ERR_ABORTED`, once per page in development. React
  StrictMode runs the effect twice and aborts the first. Absent from the
  production build.
- `POST /operator/answer` 404s about once a second while a call rings, until
  the customer picks up. That is the SDK polling for pickup — see §6, item 7.

---

## 5. UI / UX issues

| # | Issue | Severity | Status |
|---|-------|:---:|--------|
| 1 | Conversation rail reported the API cap (200) as the total | 🟡 Medium | ✅ **Fixed** — see §7.1 |
| 2 | Sidebar showed "Siva Workspace" regardless of which workspace was connected | 🟡 Medium | ✅ **Fixed** — see §7.2 |
| 3 | Call popup showed the agent's name instead of the person being called | ⚪ Low | ✅ **Resolved** by the operator work — §10 |
| 4 | No `<main>` landmark anywhere in the app | 🟡 Medium | ✅ **Fixed** — see §7.3 |
| 5 | An empty bordered strip sat above a healthy conversation rail | ⚪ Low | ✅ **Fixed** — see §7.4 |
| 6 | The panel said you were muted for ~2s after the customer answered | 🔴 High | ✅ **Fixed** — see §10.3 |
| 7 | A failed call reported `call no_answer` — a raw SDK error string | 🟡 Medium | ✅ **Fixed** — see §10.3 |

---

## 6. API / integration issues

**Items 1–4 are waiting on a platform release**, not open problems with no
answer. The APIs behind them are in development and not yet in production; the
client will say when they land, and the console work to adopt each one is
small because the gaps are already mapped.

| # | Waiting on the API | Impact until then |
|---|-------|--------|
| 1 | `/conversations` caps at **200 records** and accepts no paging parameters — no `limit`, `offset`, `page` or cursor | 94 of 294 conversations are unreachable. Also caps the Dashboard and Analytics channel splits. Confirmed on both REST and MCP, so it is server-side |
| 2 | No phone-number resource | Phone Numbers page cannot be completed |
| 3 | No conversation scoring / ticket resource | Analytics Conversation Log remains mock |
| 4 | `/agents` reports `channels: ["web"]` for **every** agent, whatever its triggers | The console cannot use it. To know what an agent can be reached on it fetches that agent's full graph — **one request per agent**. Opening the New conversation dialog on an 11-agent workspace costs 12 requests; on a 50-agent workspace it would cost 51 |

### Platform behaviour that is not a defect

Recorded so nobody designs around it or files it twice.

| Behaviour | Why it is fine |
|---|---|
| `/calls` reports `direction: unknown` on every record | Direction is not recorded on the call today. The column is omitted rather than shown blank or guessed — **a wrong direction is worse than none**. Confirmed with the client as intended, not a gap to close |
| `has_recording` turns false once a recording passes the workspace's retention window | It means "available now", not "was ever recorded". The player treats it that way |
| The API **rate-limits** (HTTP 429) | Surfaced by the regression suite, driven by the N+1 above. It would go away with item 4. Worth a retry/backoff on our side regardless, but not a fault |
| The operator SDK polls `POST /operator/answer` once a second while a call rings, and **every poll 404s** until pickup | ~25 console errors per unanswered call. Normal SDK behaviour — but console-error monitoring should filter it, or every call looks like an incident |

**Two requests worth making of the platform team, in priority order:**

1. Give `/conversations` the same `limit` + `next_cursor` that `/calls` already has. The frontend already has the cursor-following helper and would need a one-word change.
2. Make `/agents` report each agent's real trigger channels. That removes the N+1 outright and with it most of the 429 exposure.

**Worth doing on our side regardless:** the console should treat a 429 as a retry-after condition rather than a failure. Not done — it is a behaviour change to the shared request layer and was outside the scope of this round.

---

## 7. Fixes made during testing

### 7.1 Conversation rail reported the API cap as the total

**Problem.** The footer read `50 of 200 conversations` while the workspace held **294**. `/conversations` returns at most 200 records and accepts no paging — re-confirmed that `limit`, `offset`, `page`, `per_page` and `cursor` all return the same 200, with no `next_cursor`. The UI was presenting that cap as the complete figure, so 94 conversations were invisible with nothing to say so.

**Fix.** The rail now reads the true total from `analytics/summary` — the only endpoint that knows it — and separates three counts that had been conflated: what is rendered, what matches the filters, and what the workspace holds.

| State | Footer |
|-------|--------|
| Fresh load | `50 of 200 · 294 in workspace` |
| After Load more | `100 of 200 · 294 in workspace` |
| All loaded | `200 of 200 · 294 in workspace` |
| Filter active | `41 of 41 matching` |
| No matches | `0 of 0 matching` |

Hovering explains it: *"The conversations API returns at most 200 records, so the 94 oldest are not available here."*

The workspace total is **hidden while a filter is active** — comparing "41 matching" against "294 in workspace" invites a meaningless comparison. On an uncapped workspace the note does not appear at all; `pradeepworkspace` correctly reads `13 of 13 conversations`.

**Cost:** one extra `GET /analytics/summary` on this page (3 → 4 requests). **Degradation tested:** if that call fails the footer falls back to `50 of 200 conversations` and the list is unaffected; if both fail, the error state shows with no fabricated rows.

### 7.2 Sidebar named the wrong workspace

**Problem.** The console displayed **"Siva Workspace"** while connected to `pradeepworkspace`. Two separate hardcoded strings, neither derived from the actual connection:

- `server/index.js` — `const WORKSPACE = 'siva-workspace'`
- `Sidebar.jsx` — the literal text `Siva Workspace`

Pointing `.env` at a different workspace therefore changed the data while the label kept announcing the old one.

**Fix.** The name is now derived from `PERFOX_API_BASE` and passed through to the sidebar, so it cannot disagree with the data:

```
.env -> siva-workspace-api.perfox.ai      sidebar: siva-workspace
.env -> pradeepworkspace-api.perfox.ai    sidebar: pradeepworkspace
```

Verified by switching workspaces and confirming both the title and the status line follow.

### 7.3 No `<main>` landmark

**Problem.** Found while writing the regression suite: there was no accessible
way to target "the page content", because the app had no `<main>`. The shell
rendered the routed page inside a plain `<div>`.

This is not only a test-authoring inconvenience. Landmarks are how a screen
reader user skips past navigation to the content; without one, every page
visit starts from the top of the sidebar. The earlier round recorded
"accessibility checks: all passed", which was too generous — tab order, focus
rings, focus traps and heading hierarchy were all checked, landmarks were not.

**Fix.** The shell now wraps the routed page in a single `<main>`, so every
route has exactly one content landmark. One element changed; no visual change.

### 7.4 An empty bordered strip above the conversation rail

**Problem.** Caught by the TypeScript migration, not by a person. The rail
tested `list.status !== 'live'` — and `'live'` is not one of the four statuses
a resource can have. The condition was therefore true on a healthy load, so
the wrapper rendered on every visit. `DataBanner` itself returns nothing
unless there is something to report, so the result was a bordered, padded
strip with no content in it.

**Fix.** The condition now names the two states that have something to say:
`error` and `unavailable`.

---

## 8. Final summary

| Metric | Result |
|--------|--------|
| Pages tested | 6 of 6, across **2 workspaces** |
| Pages complete | 4 ✅ · 1 partial 🟡 · 1 blocked 🔴 |
| Distinct API operations in use | **13** — 10 reads, 3 writes |
| Console errors | **0** |
| Failed user flows | **0** |
| Bugs found and fixed | **6** — 2 during testing, 2 since (§7), 2 on real calls (§10) |
| Regression tests committed | **76** — 44 browser, 32 backend |
| Real calls placed | **5**, all to the authorised number, 2 answered |
| Outbound actions | 2 sent, both to the authorised number, both successful |
| Responsive breakpoints | 4 of 4 clean |
| Accessibility checks | All passed |
| Production build | Clean, 0 errors |

### Status: **Ready for client handover**, subject to two items

Both are environment, not code. They are held with the same platform release
as §6 items 1–4.

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| 1 | Set `ACCESS_CODE` and `ALLOW_OUTBOUND=true` in the hosting project | DevOps | ~5 min |
| 2 | Set `OPERATOR_SITE_SECRET` in the hosting project | DevOps | ~2 min |

> **Both items are required.** Item 1 guards agent outbound, which sends messages; item 2 is what lets a person place a call. Neither is set by the app — without them the buttons are disabled and say so, which is the intended failure.

> All seven frontend issues in §5 are now **fixed**.

### Done since the first version of this report

- ✅ **A login, and one workspace per account.** The console was a
  single-tenant app configured by an env file; it now has accounts, and each
  reaches its own workspace. No credential reaches the browser — §11.
- ✅ **A separate backend**, and a monorepo holding both halves.

- ✅ **TypeScript migration.** Every file under `src/` is `.ts`/`.tsx`, type-checked under `strict` with `noUncheckedIndexedAccess`. `npm run build` runs `tsc --noEmit` first, so a type error fails the build. It found the bug in §7.4.
- ✅ **Automated regression suite.** 44 browser tests (§9) and 32 backend tests (§11.4).
- ✅ **Operator calling.** A person on the line rather than the AI, with working mute, hold and hang-up. Tested against a real phone — §10.
- ✅ **Backend tests.** 32 of them, including the tenant-isolation proof the design rests on — §11.3.

### Recommended next

1. **Continuous integration.** All 76 tests exist and nothing runs them; they only catch a regression if someone remembers to look. This is the last engineering gap — see §11.6 for what it needs.
2. Ask the platform team for the two API changes in §6 — paging on `/conversations`, and real channels on `/agents`.
3. Handle 429 with a retry/backoff in the shared request layer.
4. Replace the Conversation Log mock data once the scoring API is available.

---

## 9. The regression suite

```bash
npm test              # headless, ~2 minutes
npm run test:ui       # Playwright UI mode, for debugging
```

44 tests in `tests/`, run by Playwright. The suite starts the backend and
Vite server, so it works from a clean checkout; it needs a configured `.env`,
and says so plainly if one is missing.

| File | Tests | Guards |
|------|:---:|--------|
| `smoke.spec.ts` | 8 | Every route renders with its heading. Catches the failure mode that hit this project twice: a bad import or out-of-scope variable blanks a panel while the shell stays up, so it looks like an empty state rather than a crash |
| `conversations.spec.ts` | 10 | The rail, filters, search, agent filter, Load more; the detail pane and the Overview ↔ Transcript switch that blanked once before |
| `agents.spec.ts` | 5 | Paging, the view toggle, keyboard operation, stat tiles counting the whole list, and the destructive-action confirm |
| `analytics.spec.ts` | 5 | The over-time chart across all three intervals, credits, the log's filters and CSV export, and the page's behaviour with the API cut off |
| `new-conversation.spec.ts` | 3 | The dialog's focus trap, Escape, scroll lock and per-channel agent gating |
| `responsive.spec.ts` | 3 | Phone layout: no horizontal overflow on any route, the drawer, and the single-column conversation view |
| `operator.spec.ts` | 7 | Calling: the signing endpoint never leaks the secret, the Call button explains itself when the connector is unavailable, the phone tab drops the agent picker, and a broken connector does not take the console with it |

### Nothing in the suite sends

No test places a call, sends a message, or publishes or unpublishes an agent.

| Flow | Covered to | Not done |
|------|-----------|----------|
| Composer send | channel gating, disabled reasons | Send is never clicked |
| Call button | presence, gating, explanation | never clicked |
| New conversation | dialog contract, agent gating, Send disabled | never submitted |
| Agent activate / deactivate | confirm opens and names the agent | always cancelled |
| Operator calling | the config contract, the secret staying server-side, the button gating, four broken-connector states | **never dialled** |

### Two design decisions worth knowing

**These are integration tests, against the live API.** Almost everything that
has broken in this project broke at the seam between the UI and the API, and a
mocked suite would have caught none of it. The cost is that the data is not
fixed, so assertions check invariants — "filtering never grows the list" —
rather than figures like "41 rows". A suite that fails because somebody added
a conversation teaches people to ignore it. Where a figure genuinely matters,
the test reads it from the API in the same run.

**Every test fails if the page logged an error.** The console watch is part of
the shared fixture rather than something each test remembers to check. A test
that provokes an error deliberately declares it; upstream 429s are excluded
with the reasoning recorded in `tests/helpers.ts`.

---

## 10. Operator calling

### 10.1 What changed

Two different things on this platform both look like "making a call", and the
console was doing the wrong one:

| | Agent outbound (before) | Operator calling (now) |
|---|---|---|
| Who talks to the customer | the AI agent | **the person at the console** |
| Where the audio lives | on the platform | the browser's microphone |
| Can Mute / Hold do anything? | no — no local audio | **yes** |
| Authorised by | the workspace API key | a site key + a server-signed `user_hash` |

That is why the popup's controls were inert: there was no local audio stream to
act on. Only **phone** changed. WhatsApp, SMS and email still go through
`POST /outbound` as the conversation's agent, because there the agent really is
the one talking.

The site secret signs the operator's identity and never reaches the browser —
both proxies expose `GET /api/operator/config`, which returns the public site
config plus the signature.

### 10.2 What was tested

Five calls to the authorised number **+916374160200**, two of them answered. No
other number was contacted.

| # | Scenario | Result |
|:---:|---|---|
| 1 | Connector handshake — signing and the platform's three gates | ✅ `{"ok":true}` |
| 2 | Dial from a conversation's Call button | ✅ Confirm names the number, the microphone and the separate conversation |
| 3 | Ring → answer → live | ⚠️ Defect found — §10.3 |
| 4 | Mute / Unmute on a live call | ✅ Acts on the real stream |
| 5 | Hold / Resume | ✅ Timer pauses (`0:02 → 0:02` over six seconds) and resumes (`0:03 → 0:07`) |
| 6 | Call survives navigating to another page | ✅ Stayed up across to AI Agents |
| 7 | End | ✅ Panel cleared, button re-enabled |
| 8 | No answer after 30s | ⚠️ Defect found — §10.3 |
| 9 | Second dial while a call is up | ✅ Refused — "You are already on a call" |
| 10 | Dial again after ending | ✅ Timer reset, no error carried over |
| 11 | Dial from the New conversation dialog | ✅ No agent picker, and **no `POST /outbound` fired** |
| 12 | Microphone blocked | ✅ Tested by the client — see §10.4 |

The console's own failure handling was tested separately, without dialling: a
failing config endpoint, an unreachable one, a malformed response and one that
never answers. In all four the conversation pages keep working and the Call
button explains itself.

### 10.3 Defects found on real calls

**The panel said you were muted at the moment of pickup.** 🔴

The SDK sets the call status to `live` in `beginSession`, which runs *before*
the audio room finishes connecting — and its `micEnabled` flag starts false,
flipping true only once the room is up. So for about two seconds after the
customer answered, the panel read "In call" while the button offered "Unmute":
it told the operator they were muted when they were not, at the one moment that
matters.

`micEnabled` alone cannot distinguish "not connected yet" from "deliberately
muted", so the console now latches a separate flag the first time the audio
comes up, and resets it per call. The panel shows **"Connecting audio…"** with
the controls disabled until the audio is really there. Measured on a live call:
the window is 2.2 seconds.

**A failed call reported `call no_answer`.** 🟡

That is the SDK's raw error string going straight onto the screen of whoever
just tried to phone a customer. All seven of its error shapes are now mapped to
sentences — "No answer.", "The line was busy." — with anything unrecognised
passed through rather than flattened into "an error occurred", since a message
nobody has seen before is more useful raw. Verified on a live call: the banner
now reads *"Could not reach out — No answer."*

There was a third, caught earlier by reading the SDK rather than by calling: on
a no-answer it sets an error but leaves the call's status at `dialing`, so a
status check alone would leave the panel saying "Calling…" indefinitely. The
console reads the error too. Confirmed on an unanswered call — the panel
cleared at 36.7s.

### 10.4 The microphone case

**A call answered while the microphone is blocked** — ✅ **tested by the client
and closed.**

Worth keeping the note that goes with it: dialling with the microphone denied
does *not* fail early, the call is placed normally. And the microphone needs a
**secure context**. `localhost` is exempt, so development works over plain
HTTP, but any other host — including a LAN IP — silently fails to get a
microphone until it is served over HTTPS. That matters for whatever URL the
console is eventually served from.

### 10.5 What this needs to work in production

`OPERATOR_SITE_SECRET` must be set in the hosting project, alongside the
existing `ACCESS_CODE`. It is a different credential from the workspace API key
and is not covered by `ALLOW_OUTBOUND`, which guards the AI phoning someone
unattended — a person clicking dial with their own microphone open is a
different risk. Without the secret the Call button is disabled and says why.

The app's origin must also be on the site's `allowed_origins` **and** on the
operator node's. Both were already correct for `http://localhost:5180`;
production's origin needs adding before it will work there.

---

## 11. Accounts, and one workspace each

### 11.1 What changed

The console read one workspace, named by `PERFOX_API_BASE` in a file on the
server. That cannot serve two clients: one key in one env file is one tenant.

It now has accounts. Each user belongs to a workspace, each workspace carries
its own Perfox connection, and the same URLs return different data depending on
who is signed in.

The frontend is now only a frontend. The two proxies that used to live inside
it — `server/index.js` and `api/[...path].js` — are replaced by a dedicated
backend, and both repositories became one monorepo:

```
url-factory/
  client-ui/   React + Vite. Reads no environment variable at runtime.
  backend/     Express + Postgres. Accounts, credentials, and the proxy.
```

### 11.2 The decision worth recording

The original proposal was for login to return the workspace's `base_url` and
`api_token`, for the frontend to use.

**That was not built, and should not be.** A Perfox workspace key authorises
everything in that workspace — read *and* write across customers,
conversations, knowledge base, credentials and workflows. Sent to the browser
it would be readable in devtools by anyone who could sign in, would keep
working after that person was deactivated, and would let them bypass every
permission added later. One leaked browser session would be a full workspace
compromise with no way to tell it had happened, and rotating the key would cut
off every tenant sharing it.

So the credentials stay server-side and the browser gets a session cookie it
cannot read:

```
browser ──(httpOnly cookie)──▶ backend ──(that user's key)──▶ Perfox
```

Login returns a name, an email, a mobile number and two booleans about the
workspace. Nothing else.

**Sessions rather than JWTs**, for two reasons. A token in `localStorage` is
readable by injected script; an httpOnly cookie is not reachable from
JavaScript at all. And a JWT stays valid until it expires, so suspending a user
would need a revocation list — at which point the database is read on every
request anyway and the statelessness that justified the JWT is gone. This
backend already reads it every request to find the caller's workspace.

**One origin**, deliberately: Vite proxies in development and the backend
serves the built app in production, so the session cookie stays
`SameSite=Lax` and the browser blocks cross-site request forgery without a
line of code from us.

### 11.3 Tenant isolation, proved rather than asserted

The claim everything else rests on is that one client cannot reach another's
data. Until these tests it rested on reading the code.

The technique: two workspaces pointed at two **different** fake upstream
servers. Against the real Perfox API you cannot see which workspace a request
went to; against a pair of fakes you can see exactly which one it reached and
which token it carried.

| What is proved | |
|---|---|
| Each user reaches only their own workspace, with only their own key | ✅ |
| Neither key ever arrives at the other's upstream | ✅ |
| The workspace comes from the session, not a query string, header or body | ✅ |
| Signing out of one browser leaves the other signed in | ✅ |
| A suspended user loses access through a live session **immediately** | ✅ |

The last one is the case a JWT would have got wrong.

### 11.4 The backend suite

32 tests on Node's built-in runner against a real Postgres — no new dependency
for either. The database is created and dropped per run, so a failing test
cannot leave rows that make the next one pass.

| Area | Covers |
|---|---|
| `tenancy.test.ts` | the five rows above |
| `auth.test.ts` | that no credential is in the login response; cookie flags; that a wrong password and an unknown address are indistinguishable in status *and* wording; that changing a password ends every other session; expiry; that the table stores a hash, not the cookie |
| `proxy.test.ts` | the allowlist from both sides — every path the frontend uses passes, and real Perfox resources it has no business reaching are refused without the request leaving the process; encryption round trip, fresh IV per encryption, and refusal to decrypt a tampered value |

On the browser side the suite grew to 44, with three additions: that no
credential is readable from the page in markup, storage or cookies; that
signing out kills the session server-side rather than only redirecting; and a
setup project that signs in once and shares the cookie, because argon2 is slow
on purpose and forty verifications a run would dominate it.

### 11.5 Defects found while building it

**Express 5 hands a multi-segment wildcard back as an array.** So
`analytics/summary` arrived as `analytics,summary`, matched no allowlist
pattern, and 403'd every nested path while single-segment ones worked. It
looked exactly like a permissions problem and was not. The proxy tests now pin
every nested path the frontend uses.

**The boot-time session sweep took the process down.** It ran unguarded, so an
unhandled rejection killed the server whenever the database was unreachable —
which is precisely when a deploy restarts both at once. The result was a
backend that could not start at all, rather than one that starts and reports
the database as down on `/api/health`. Found when the Postgres container had
stopped and the test suite failed to launch the backend instead of failing a
test with a readable message.

### 11.6 Still open

**Registration is closed** (`ALLOW_REGISTRATION=false`) and should stay so.
The console reads real customer conversations, so a public sign-up form is a
door onto them. Accounts are created by an administrator on /admin until the invitation
flow exists — at which point the page becomes "accept an invitation" and the
workspace comes from the invite rather than from whoever filled the form in.
The page and the endpoint both exist already, so switching it on is
configuration rather than a release.

**Invitations and magic links** are not built. Deferred deliberately.

**CI** still does not exist, and is now the oldest item outstanding. It needs a
decision: the browser suite drives the live Perfox API and needs a workspace
key as a repository secret, a database, and a seeded account. The backend
suite needs only Postgres, so it could run in CI today on its own.

> Six items listed as open at the end of this round's §11 have since been
> closed — see §12.3. What remains is in §12.4.

---

## 12. The admin surface

Added after §11 and, until this round, almost entirely absent from this report
— the word "admin" appeared once in it. That was a fair description of the
coverage too: the surface that creates every account and holds every
credential had three browser tests and no section of its own.

### 12.1 What it is

Three sections behind `/admin`, on a session that has nothing to do with a
customer's:

| Section | What it does |
|---|---|
| **Customers** | every workspace, its owner, whether it has a Perfox key and whether calling is configured; create, edit the connection, test it, suspend, reinstate or delete |
| **Administrators** | who else can sign in here, when they were added, when they last did, and whether they are active; add one, suspend one |
| **Activity** | every action any admin took, newest first, paged on the server |

Navigation is a sidebar — fixed from `lg`, a drawer below it — and all three
lists page the same way: 25 to start, a size to choose, the total and two
buttons.

One endpoint returns a credential, and it is written down. The list reports
flags, creating a customer echoes nothing back, and the edit form loads its
settings without the two secrets; `GET /admin/customers/:id/credentials` is the
exception, called when the eye beside a masked field is pressed. Every call
writes an audit row naming the admin and the customer, and the row records that
a credential was read rather than which value it was. §12.3 has the reasoning.

### 12.2 What is tested

**Browser (13 tests, `admin.spec.ts`)** — that a customer cannot create their
own account and `/register` redirects; that the sign-in panel drops on a
phone; that `/admin` demands an admin session; that an admin walks the three
steps of the create form, that Next waits on the first, that Submit is only on
the third, that going back keeps what was typed, that the customer then signs
in, that the key typed in is nowhere in the page afterwards, that the customer
cannot reach the admin API, and that the creation is recorded in Activity by
workspace name and by who did it; that an admin session is not a console
session; that the password form rejects a wrong current password; that the
administrators page refuses to suspend you or the last active account; that
all three lists page identically and a long one turns pages without going to
the server; that the edit form fills itself in, masks both secrets, reveals
one with a single request and hides it again without a second; and that a
customer can be deleted after a confirmation that names it — created by the
test itself, so the suite never removes a real one.

**Backend (74 tests)** — the admin half covers: separate tables and separate
cookie names; that a customer session reaches no admin route and an admin
session reaches no workspace; that a suspension ends live sessions rather than
only future sign-ins, and reaches a colleague in the same workspace; that
sign-in attempts are capped per address and per IP, including attempts cut off
mid-guess; that administrators can be listed and added but not locked out
entirely; that the settings come back without the two secrets and the reveal
endpoint returns them and records the read; that deleting a customer takes its
users and sessions with it while the audit row outlives them; and that the
trail records who did what without recording a single credential.

### 12.3 What this round fixed

Six items, each of which had been reported as open and left that way.

**Aborted sign-in attempts were free.** The rate limiter counted on
`res.on('finish')`, which fires only for a response written out in full.
Hanging up the moment a guess was in flight meant the password was still
checked and the attempt was never counted — an unlimited supply of guesses
from a limiter that read as correct. It counts on `close` now, and an attempt
that did not finish counts as a failure.

**Suspension reached one user, not the account.** It set `users.status` on the
owner. With one person per workspace that is the same thing; with an invited
colleague it would have left a suspended customer running under somebody
else's login. It suspends the workspace now, and both checks live where the
session is read, so either takes effect on the next request.

**Nobody could change their own password.** Both endpoints had existed since
the login work and neither was called by anything, so the only way to change a
password was for someone with database access to do it.

**A second administrator could not be made, or seen.** More than one has been
allowed since the first migration, but making one meant running `seed:admin`
on the server and there was nowhere to see who already had access.

**No trace of anything an admin did.** "Who suspended Northwind, and when?"
had no answer. There is an append-only `admin_events` row per action now,
readable by any admin, holding which fields changed and never what they
changed to.

**A fresh checkout could not run the browser suite.** `seed:dev` insisted on
`client-ui/.env`, the file the console kept its key in before there was a
database — so it worked on one machine and nowhere else, which made "the tests
pass" a claim only one person could check.

### 12.4 Still open

**CI** — the oldest item outstanding, and unchanged: 150 tests
(76 browser, 74 backend) and nothing runs them but a person. The backend suite
needs only Postgres and could run today; the browser suite needs a workspace
key as a repository secret.

**The workspace rate-limits a full run.** A browser pass is a few hundred reads
in four minutes, which is a heavier burst than any person produces, and the
tail of it comes back `rate_limited`. The console retries a throttled read
twice before showing an error, and the suite retries a failed test once, so
what is left is the suite outrunning the API rather than anything the code did.
A test that fails on its own, or on both attempts, is a real failure.

**Invitations and magic links** — deferred deliberately. Until they exist,
`ALLOW_REGISTRATION` stays `false` and accounts are made by an admin.

**Admin sessions are not listable or revocable** by their owner, the way a
customer's eventually should be. The rows are there, with user agent and IP;
nothing reads them.

### 12.5 What shipped after the gap-closing round

The admin surface and the console both moved on from §12.3. In order of how
much of the product they touch:

**The Conversation Log runs on `/cases`.** It was invented rows behind a "Mock
data" badge because nothing scored a conversation. It is server-filtered and
server-paged now, so the total is the total of what matched rather than of
what was fetched, and the two ways an agent can be missing are told apart — no
`workflow_id` means nothing matched the inbound, while a `workflow_id` with a
null name means an agent handled it and was deleted since. Reporting both as
"unassigned" would have said nobody took a conversation that somebody did.

**Phone Numbers reads real numbers**, from `/credentials` and each
credential's resources. Plivo only, view-only, at the client's direction.

**Exports are one exporter, three formats.** The log offered JSON and a
flattened CSV; the conversation page offered JSON, TXT and MD in a shape of
its own. Both go through `src/lib/export.ts` now. What the API will not say is
left out rather than guessed: a `status_change` event comes back with no data
payload under any `include` mode, so the file names the event and does not
invent "Status → ended (Workflow completed)".

**Two bugs surfaced while checking those exports against the client's
samples.** A `tool_call` is raised with `actor: 'ai'`, and the actor was tested
before the event type — so it became an empty AI speech bubble and `tool_input`
reached nothing. The arguments an agent called a tool with were not visible in
the console at all. And the export menu's "still mounted" flag was only ever
cleared, so StrictMode's second mount left it false and every export was
silently skipped.

**The console fits a phone.** Four things that only appeared on a real handset,
none of which the "no page scrolls sideways" test could see, because each was
absolutely positioned or clipped by a card: the pager ran off its card, the
chart's two date inputs were squeezed until "to" sat on top of the first one,
the x axis drew a fixed twelve labels whatever the width, and an empty date
field showed nothing at all until tapped. The axis fix corrected the desktop
too, where two dates had been touching.

**The admin surface is a sidebar with three paged sections**, a three-step
create form that ends on the sign-in to hand over, an edit form that loads what
is stored and reveals a secret behind an eye, and Delete beside Suspend. §12.1
and §12.2 describe them; the reasoning for showing a credential at all is in
§12.1.
