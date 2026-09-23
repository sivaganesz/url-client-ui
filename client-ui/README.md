# Perfox workspace console

React + Vite + Tailwind + TypeScript. Six sections: Dashboard, Analytics,
Conversations, Call Log Analytics, AI Agents, Phone Number Connections.

This is the frontend half of a monorepo. The other half is
[`../backend`](../backend), which holds the accounts and the workspace
credentials; **nothing here reads an environment variable at runtime.**

The console is not tied to one workspace. Each signed-in user reaches their
own, and the sidebar names it from the session — so the label cannot disagree
with the data on screen, and two people signed in at once see two different
workspaces through the same URLs.

## Running it

Two processes. The backend holds each workspace's API key; the Vite dev server
forwards `/api/*` to it, so the browser sees **one origin**.

```bash
# first, in ../backend — see its README
#   docker compose up -d ; npm run migrate ; npm run seed

npm install
npm run dev              # http://localhost:5180
```

**Without the backend, you cannot sign in**, and the pages behind the login are
unreachable. With it up but a workspace unconfigured, the sidebar says so and
every page shows a banner rather than an empty table.

That is deliberate. There is no sample-data fallback and no placeholder
figures: a console that invents conversations or resolution rates when it
cannot reach the API is worse than one that says it failed, because the reader
has no way to tell which they are looking at. If you see a number here, the
workspace returned it.

## Checks

```bash
npm run typecheck        # app and tests, strict, noUncheckedIndexedAccess
npm run lint
npm test                 # 44 Playwright tests, ~3 min — see tests/README.md
npm run build            # runs tsc first, then bundles into dist/
```

`npm run build` fails on a type error rather than shipping. `npm test` starts
the backend and Vite itself, so it works from a clean checkout — but it needs a
database and a seeded account, and it drives the live Perfox API.

`npm run discover`, in the backend, prints a workspace's MCP tools and their
signatures. Useful when checking whether a resource exists before writing
against it.

## Why nothing here holds a credential

A Perfox workspace key authorises **everything** in that workspace — read and
write across customers, conversations, knowledge base, credentials and
workflows. A key in client-side JavaScript is readable by anyone who opens
devtools.

So the browser never receives one. It holds a session cookie it cannot even
read (httpOnly), and the backend resolves the signed-in user's workspace on
every request:

```
browser ──(session cookie)──▶ backend ──(that user's key)──▶ Perfox
```

Login returns a name, an email, a mobile number and two booleans about the
workspace — no API base, no token. A test in `tests/smoke.spec.ts` fails if a
key ever becomes readable from the page, in markup, storage or cookies.

**One origin, deliberately.** The app and the API answer on the same host —
Vite proxies in development, the backend serves the built app in production —
which is what lets the session cookie stay `SameSite=Lax` and have the browser
block cross-site request forgery without us writing anything.

## What is live, and what is not

Everything below is REST, not MCP. MCP is a tool-calling protocol for LLM
agents; a web frontend belongs on plain HTTP resources. The mapping lives in
`src/lib/api.ts`, and the wire shapes are in `src/lib/types.ts`.

| Section | Endpoint | State |
|---|---|---|
| Conversations list | `/conversations` + `/customers` | **Live** (capped — see below) |
| Transcript | `/conversations/{id}/events` | **Live** |
| Customer overview | `/customers/{id}` | **Live** |
| AI Agents | `/agents`, `/agents/{id}` | **Live** |
| Publish / unpublish an agent | `POST /agents/{id}/publish`, `PATCH /agents/{id}` | **Live** |
| Call Log Analytics | `/calls` | **Live** — properly cursor-paginated |
| Call recordings | `/conversations/{id}/recordings` | **Live** — signed links, ~900s |
| Dashboard and Analytics totals | `/analytics/summary` | **Live** |
| Conversations over time | `/analytics/conversations-over-time` | **Live** |
| Credit balance | `/billing/credits` | **Live** |
| Outbound message | `POST /outbound` | **Live** — see below |
| Operator calling | `@perfox/operator-react` | **Live** — a human on the line, see below |
| Analytics → Conversation log | — | **Mock**, and badged as such in the UI |
| Phone Number Connections | — | **No endpoint exists** |

`/analytics/summary`, `/calls` and `/recordings` went live in September 2026.
Phone numbers is now the only resource with nothing behind it, and that page
says so rather than showing an empty table.

### Two limits worth knowing before you debug something

**An unknown path answers `401 Invalid or expired token`, not `404`.** It reads
like a bad key and means the route does not exist. A trailing slash in
`PERFOX_API_BASE` produces `//agents` and fails exactly the same way — both
proxies trim it for that reason.

**`/conversations` caps at 200 records and accepts no paging.** Not `limit`,
`offset`, `page`, `per_page` or `cursor`; there is no `next_cursor`. Confirmed
over both REST and MCP, so it is server-side. On a workspace with more than
200 conversations the rest are unreachable, and the rail says so rather than
presenting the cap as the total:

```
50 of 200 · 294 in workspace
```

`/calls`, by contrast, is cursor-paginated correctly — `src/lib/api.ts` already
has the cursor-following helper, so if `/conversations` ever gains the same
support it is close to a one-word change.

### Resolution rate

`/analytics/summary` reports `resolution_rate` directly, as a percentage
(`13.98`), not a fraction. That value is used when present.

When it is absent the console derives one from conversation status:

```
resolution rate = resolved / (resolved + ended + abandoned)
```

`ended` is **not** counted as resolved — a conversation that merely stopped is
not one that got what it came for. **Confirm this definition before anyone
acts on the number.**

## Calling, and the two kinds of it

Two different things on this platform both look like "making a call", and the
console does both. Which one you get depends on the channel:

| | Agent outbound | Operator calling |
|---|---|---|
| Who talks to the customer | the AI agent | **you, in this browser** |
| Where the audio lives | on the platform | your microphone and speakers |
| The request | `POST /outbound` | the operator SDK → `call_outbound` |
| Can Mute / Hold do anything? | no — no local audio | **yes** |
| Authorised by | the workspace API key | a site key + a server-signed `user_hash` |

**Phone is operator calling.** The Call button on a conversation and the Phone
tab of the New conversation dialog both open the line here — your microphone
goes live when the customer picks up, and the panel's Mute, Hold and End act on
the real stream. There is no agent to choose, because the agent is not the one
talking; the workflow's phone trigger has no say in whether the call can be
placed.

The console used to place these through agent outbound while showing a panel
built for the other kind, which is why `CallScreen` carried the comment "Mute
and Hold are UI only for now".

### Outbound

`POST /outbound` still handles the **text** channels: an agent opens a
conversation and reaches out first on `whatsapp`, `sms` or `email`. It is used
by the composer and by the other three tabs of the New conversation dialog. No
webhooks are involved.

Two things about it shape the UI:

- A channel is only offered when the conversation has the contact detail **and**
  the agent has a trigger node for that channel. The `channels` field on
  `/agents` reports `["web"]` for every agent and cannot be used, so the console
  reads each agent's graph instead — one request per agent, which is why
  opening the dialog is the most expensive thing in the app.
- A successful response can still carry `send_authorized: false`, meaning the
  conversation opened and the agent ran but it has no Sender action, so nothing
  went out. That is a half-built agent rather than a failed request, and the
  dialog stays open and says so instead of navigating away.

**This sends real messages.** The regression suite covers these paths up to the
confirmation step and no further.

### The operator connector

`@perfox/operator-react` ships as a tarball in `vendor/`, not from npm, and is
installed with a `file:` dependency. It pulls in `livekit-client` (~550 kB),
which the SDK imports dynamically — so it is its own chunk and is downloaded on
first dial, not on first page view. Keep it that way.

The platform will not open an operator session for an unsigned identity, which
is why this needs a server:

```
user_hash = HMAC_SHA256(OPERATOR_SITE_SECRET, "<siteId>.<externalId>")
```

Both proxies expose `GET /api/operator/config`, which returns the public site
config plus that signature and **never** the secret. `src/lib/operator.tsx`
fetches it, mounts the SDK under it, and exposes `useCall()` — which, unlike
the SDK's own hook, never throws, so a page can ask for calling and explain why
it is unavailable instead of crashing.

Three things worth knowing:

- **This console signs one fixed identity** (`OPERATOR_EXTERNAL_ID`), because
  it has no login. Every browser that opens it is the same operator, and two
  tabs will contend over presence. Fine for a single seat; derive the id from a
  session before this gets real users.
- **It never goes `available`.** Going available enrols the console in inbound
  ring routing, and there is no answer UI here — a routed call would ring into
  a void. Adding inbound means building `incomingCall` / `answer` / `decline`
  and keeping the tab open, since presence goes stale ~60s after the heartbeat
  stops.
- **`dialOut` reports failure in state and never throws.** `operator.tsx` reads
  the outcome back and re-throws, because on the commonest failure — no answer
  after 30s — the SDK sets `error` but leaves the call at status `dialing`,
  so a status check alone would leave the panel saying "Calling…" forever.

The microphone needs a **secure context**. `localhost` is exempt, so dev works
over plain HTTP, but any other host — including a LAN IP — silently fails to
get a mic until it is served over HTTPS.

**The app's origin must be on the site's `allowed_origins`, and on the operator
node's.** Both. A missing origin answers `403 origin_not_allowed`; the other
two gates answer `operator_not_enabled` and `operator_signature_required`, in
that order, so the error body names which one to fix.

## Deploying

**This half deploys as static files.** `npm run build` produces `dist/`, and
the backend serves it — which is what keeps the app and the API on one origin.
Point the backend's `CLIENT_DIST` at it.

There is nothing to configure here. Everything that was once an environment
variable of this project now lives per workspace in the backend's database:

| Was | Is now |
|---|---|
| `PERFOX_API_KEY` | `workspaces.perfox_api_token_enc`, encrypted at rest |
| `PERFOX_API_BASE` | `workspaces.perfox_api_base` |
| `OPERATOR_SITE_ID` / `_SECRET` / `_WORKFLOW_ID` | the matching `workspaces` columns |
| `ACCESS_CODE` | superseded by the login |

`ALLOW_OUTBOUND` is gone with the Vercel proxy it guarded. Agent outbound is
now reachable only by a signed-in user whose workspace has a key, which is a
narrower door than a shared access code was.

`ALLOW_OUTBOUND` does **not** gate operator calling. That flag guards agent
outbound, where the workspace pays for an AI to phone someone unattended;
operator calling is a person clicking dial with their own microphone open. It
is gated by `ACCESS_CODE` like everything else, and by whether the site secret
is configured at all. Without one, the Call button is disabled and says so.

Without both `ACCESS_CODE` and `ALLOW_OUTBOUND=true`, outbound is not routed
and the Call button returns 403. A deployment that should place calls needs
both set.

## Layout

```
src/
  components/
    charts/       BarChart, LineChart, BarList, shared primitives
    conversations/  the conversation pane, split by tab
    layout/       AppShell (sidebar + drawer + <main>), PageHeader, PageBody
    ui/           Button Card Badge StatTile Field Avatar DataTable States
    icons.tsx     stroke icons on a 24px grid, coloured by currentColor
  data/conversationLog.ts   the mock rows for the Analytics log, and only those
  lib/
    api.ts        workspace access + normalisation  ← the mapping lives here
    operator.tsx  the call session: OperatorGate + useCall()
    types.ts      Api* wire shapes, and the UI types they map onto
    useResource.ts  loading / ready / error / unavailable, with no fallback
    session.tsx   who is signed in, and which workspace they reach
    cn.ts format.ts collections.ts shapes.ts usePagination.ts
    useDialog.ts useMeasure.ts useCallAudio.ts
  pages/          one per section, plus Login and Register
vendor/           the operator SDK tarball, installed via file:
tests/            the regression suite
../backend/       accounts, workspace credentials, and the proxy
```

`src/lib/types.ts` keeps two layers apart on purpose: `Api*` types are the wire
shapes exactly as the workspace sends them, and the rest are what components
consume after mapping. None of the wire shapes are documented anywhere — they
were established by probing the live API, so they describe what it *did*
return, not what it promises to.

### Design notes

Tokens are declared once in `src/index.css` under `@theme`; components use
semantic names (`bg-canvas`, `text-ink-3`, `border-line`) rather than raw
palette steps. Light-only on purpose — a half-tuned dark theme reads worse
than none; adding one means redeclaring those tokens under a `.dark` variant.

Charts are dependency-free inline SVG. The data hue is `#2a78d6`, **not** the
UI brand blue `#3a5a8c`: the brand step fails the chroma floor for data marks
and validates as gray. Every chart is single-series, so identity comes from
axis labels and no categorical palette is in play.

Tailwind emits `.px-2` before `.px-2\.5`, so a later class wins regardless of
where it appears in the string. A `className` override that collides with a
component's own spacing silently does nothing — `cn()` documents this.

## Open questions

1. **"Phone Number Conversations"** — the list of connected numbers, or
   conversations grouped by number? Moot until the endpoint exists.
2. **Resolution rate** — is the definition above the intended one?
3. **Call log** — which columns should sort?
4. **The 200-conversation cap** — worth asking the platform team for the same
   `limit` + `next_cursor` that `/calls` already has.
