# Client Console — Test Report & Page Completion Status

**Branch:** `prod-grade` · **Tested:** 22–23 September 2026 · **Last updated:** 23 September 2026
**Method:** Automated browser testing (Playwright + Chromium) against two live workspaces, plus the production build.
**Scope:** 21 exploratory runs covering all 6 pages, every major user flow, accessibility, responsive behaviour and error handling — since consolidated into a **committed regression suite of 34 tests** (§9).

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
| 2 | Analytics | 🟡 Partial | 6 | Conversation Log is mock data, awaiting API |
| 3 | Conversations | ✅ Complete | 7 | Includes outbound send/call |
| 4 | Call Log Analytics | ✅ Complete | 2 | Recording playback working |
| 5 | AI Agents | ✅ Complete | 3 | Includes activate/deactivate |
| 6 | Phone Numbers | 🔴 Blocked | 0 | No API exists yet |

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

### 1.2 Analytics — 🟡 Partial

**Working API calls: 6**

| API | Method | Purpose |
|-----|:---:|---------|
| `/analytics/summary` | GET | Total conversations, resolution rate |
| `/billing/credits` | GET | Credit balance tile, plus the low/out-of-credit warning states |
| `/analytics/conversations-over-time` | GET | The main chart; re-queried on every Interval / date-range change |
| `/conversations` | GET | Feeds the channel breakdown |
| `/customers` | GET | Joined to conversations |
| `/agents` | GET | Joined to conversations |

**Gaps / pending:**

| Item | Detail |
|------|--------|
| 🔴 **Conversation Log is mock data** | Sentiment, QA score, follow-up flag, ticket status and the AI notes have **no API behind them**. The section is marked with a "Mock data" badge. Filters, date range, pagination and CSV/JSON export all work against the mock rows and will work unchanged once the API lands. |
| ⚪ `View` button disabled | Correct behaviour — mock ids point at no real conversation. |

**Issues:** None found. Interval switching (Day / Week / Month) and the date range both refetch correctly.

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
| `/outbound` | **POST** | Starts a conversation, sends a message, or places a call |

**Verified working:**

- Channel filters (All / WhatsApp / Web / Phone / SMS / Email), search, agent filter with counts
- Load-more paging, empty state on no match
- Detail pane: Overview and Transcript tabs both render and switch
- Composer: channel chips enable/disable with a stated reason, Send gated correctly
- New-conversation dialog: agent list filtered by trigger node, per-channel contact field
- **Outbound WhatsApp sent successfully** to the authorised number
- **Outbound call placed successfully**, call popup displayed

**Gaps / issues:**

| Item | Detail |
|------|--------|
| ✅ **Rail count — FIXED** | Previously read "50 of 200 conversations" when the workspace held 294, reporting the API cap as the total. Now reads `50 of 200 · 294 in workspace`, with a tooltip explaining the cap. See §7.1. |
| ⚪ Call popup controls inert | Mute / Hold / End are display-only by design — integration pending. |
| ⚪ Call popup naming | Shows the **agent's** name ("phone call testing") rather than who is being called. The number is correct. Not changed — call work is frozen. |

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

### 1.6 Phone Numbers — 🔴 Blocked

**Working API calls: 0**

| API | Method | Purpose |
|-----|:---:|---------|
| — | — | **No phone-number resource exists** on REST or MCP |

**Status:** The page renders an honest "not available yet" state. The table, columns and filter shape are in place and will populate as soon as the endpoint exists.

> This page previously displayed **eight fabricated phone numbers** with invented providers (Twilio, Exotel, Plivo) and connection counts, presented as real data. That has been removed.

**Pending:** an endpoint returning connected numbers — number, label, linked agent, direction, conversation count, status.

---

## 2. What was tested

| Area | Coverage |
|------|----------|
| Pages | All 6 routes, in both dev and production builds |
| Navigation | SPA routing, back/forward, direct URL, refresh, unknown route |
| Conversations | List, filters, search, agent dropdown, load-more, detail pane, both tabs, composer |
| Outbound | New-conversation dialog, WhatsApp send, phone call, composer send |
| Call popup | Display, controls, timer, toggle states |
| Agents | Table/grid toggle, pagination, action buttons, confirmation dialog |
| Call Logs | Table, filters, pagination, recording playback |
| Analytics | Stat tiles, chart intervals, conversation log filters, CSV export |
| Accessibility | Tab order, focus ring, focus trap, Escape, scroll lock, heading hierarchy |
| Responsive | 375 / 768 / 1280 / 1920 px |
| Error handling | Complete API failure |
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

**None.** No console errors, page errors or React warnings anywhere.

One development-only artefact: `/api/health net::ERR_ABORTED` appears once per page. This is React StrictMode invoking the effect twice and aborting the first. **It does not occur in the production build.** Not a defect.

---

## 5. UI / UX issues

| # | Issue | Severity | Status |
|---|-------|:---:|--------|
| 1 | Conversation rail reported the API cap (200) as the total | 🟡 Medium | ✅ **Fixed** — see §7.1 |
| 2 | Sidebar showed "Siva Workspace" regardless of which workspace was connected | 🟡 Medium | ✅ **Fixed** — see §7.2 |
| 3 | Call popup shows the agent's name instead of the person being called | ⚪ Low | ⏸ Deferred — call work is frozen |
| 4 | No `<main>` landmark anywhere in the app | 🟡 Medium | ✅ **Fixed** — see §7.3 |
| 5 | An empty bordered strip sat above a healthy conversation rail | ⚪ Low | ✅ **Fixed** — see §7.4 |

---

## 6. API / integration issues

| # | Issue | Impact |
|---|-------|--------|
| 1 | `/conversations` caps at **200 records** and accepts no paging parameters — no `limit`, `offset`, `page` or cursor | 94 of 294 conversations are unreachable. Also caps the Dashboard and Analytics channel splits. Confirmed on both REST and MCP, so it is server-side |
| 2 | No phone-number resource | Phone Numbers page cannot be completed |
| 3 | No conversation scoring / ticket resource | Analytics Conversation Log remains mock |
| 4 | `/calls` reports `direction: unknown` on every record | Direction column omitted rather than shown blank |
| 5 | `/agents` reports `channels: ["web"]` for **every** agent, whatever its triggers | The console cannot use it. To know what an agent can be reached on it fetches that agent's full graph — **one request per agent**. Opening the New conversation dialog on an 11-agent workspace costs 12 requests; on a 50-agent workspace it would cost 51 |
| 6 | The API **rate-limits** (HTTP 429) and the console has no backoff | Surfaced while building the regression suite: a full run trips it, because of the N+1 above. A client browsing quickly could hit it too, and today it renders as a generic load failure rather than "too fast, retrying" |

**Two recommended API requests, in priority order:**

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
| Bugs found and fixed | **4** — 2 during testing, 2 since (§7) |
| Regression tests committed | **34**, green on 3 consecutive runs |
| Outbound actions | 2 sent, both to the authorised number, both successful |
| Responsive breakpoints | 4 of 4 clean |
| Accessibility checks | All passed |
| Production build | Clean, 0 errors |

### Status: **Ready for client handover**, subject to two items

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| 1 | Set `ACCESS_CODE` and `ALLOW_OUTBOUND=true` in the hosting project | DevOps | ~5 min |
| 2 | Decide on the call-popup naming | Product | — |

> **Item 1 is required.** Outbound is disabled by default in production as a safety measure — a deployment without these variables cannot place calls, and the Call button will return 403.

> All four frontend issues in §7 are **fixed**. Item 2 is a product decision, not a defect, and is on hold at the client's request.

### Done since the first version of this report

- ✅ **TypeScript migration.** Every file under `src/` is `.ts`/`.tsx`, type-checked under `strict` with `noUncheckedIndexedAccess`. `npm run build` runs `tsc --noEmit` first, so a type error fails the build. It found the bug in §7.4.
- ✅ **Automated regression suite.** 34 tests, committed, run with `npm test` (§9).

### Recommended next

1. Ask the platform team for the two API changes in §6 — paging on `/conversations`, and real channels on `/agents`.
2. Handle 429 with a retry/backoff in the shared request layer.
3. Replace the Conversation Log mock data once the scoring API is available.

---

## 9. The regression suite

```bash
npm test              # headless, ~2 minutes
npm run test:ui       # Playwright UI mode, for debugging
```

34 tests in `tests/`, run by Playwright. The suite starts its own proxy and
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

### Nothing in the suite sends

No test places a call, sends a message, or publishes or unpublishes an agent.

| Flow | Covered to | Not done |
|------|-----------|----------|
| Composer send | channel gating, disabled reasons | Send is never clicked |
| Call button | presence, gating, explanation | never clicked |
| New conversation | dialog contract, agent gating, Send disabled | never submitted |
| Agent activate / deactivate | confirm opens and names the agent | always cancelled |

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
