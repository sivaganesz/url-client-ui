# Perfox workspace console

React + Vite + Tailwind + TypeScript. Six sections: Dashboard, Analytics,
Conversations, Call Log Analytics, AI Agents, Phone Number Connections.

The console is not tied to one workspace. It reads whichever workspace
`PERFOX_API_BASE` points at, and names it in the sidebar from that URL — so the
label cannot disagree with the data on screen.

## Running it

Two processes. The proxy holds the API key; the Vite dev server forwards
`/api/*` to it.

```bash
npm install
cp .env.example .env     # then paste your Perfox key into PERFOX_API_KEY

npm run proxy            # terminal 1 — http://localhost:8787
npm run dev              # terminal 2 — http://localhost:5180
```

**Without the proxy, no page shows data.** The sidebar reads *Workspace
unreachable*, and every page shows an error banner with a Retry button.

That is deliberate. There is no sample-data fallback and no placeholder
figures: a console that invents conversations or resolution rates when it
cannot reach the API is worse than one that says it failed, because the reader
has no way to tell which they are looking at. If you see a number here, the
workspace returned it.

## Checks

```bash
npm run typecheck        # app and tests, strict, noUncheckedIndexedAccess
npm run lint
npm test                 # 34 Playwright tests, ~2 min — see tests/README.md
npm run build            # runs tsc first, then bundles into dist/
```

`npm run build` fails on a type error rather than shipping. `npm test` starts
its own proxy and Vite server, so it works from a clean checkout, but it needs
a real `.env` — it drives the live API.

`npm run discover` prints the workspace's MCP tools and their signatures.
Useful when checking whether a resource exists before writing against it.

## Why there's a proxy

The Perfox key authorises **everything** in the workspace — read and write
across customers, conversations, knowledge base, credentials and workflows. A
key in client-side JavaScript is readable by anyone who opens devtools, so it
stays server-side, in `server/index.js` for local work and `api/[...path].js`
on Vercel. Both inject the `Authorization` header and redact the key from
anything they log or return. The browser only ever talks to same-origin
`/api/*`.

`.env` is gitignored. `.env.example` is the template.

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
| Outbound call or message | `POST /outbound` | **Live** — see below |
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

## Outbound

`POST /outbound` has an agent open a conversation and reach out first, on
`phone`, `whatsapp`, `sms` or `email`. It is used by the New conversation
dialog and by the composer and Call button on a conversation. No webhooks are
involved.

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

**This sends real messages and places real calls.** The regression suite covers
these paths up to the confirmation step and no further.

## Deploying

The Vercel proxy (`api/[...path].js`) is deliberately narrower than the local
one and **fails closed**:

| Variable | Effect |
|---|---|
| `PERFOX_API_KEY` | required — nothing works without it |
| `PERFOX_API_BASE` | which workspace, and the name in the sidebar |
| `ACCESS_CODE` | gates every request. Strongly recommended |
| `ALLOW_OUTBOUND` | `true` **and** an `ACCESS_CODE` permits `POST /outbound` |

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
    types.ts      Api* wire shapes, and the UI types they map onto
    useResource.ts  loading / ready / error / unavailable, with no fallback
    useDataSource.ts  probes the proxy on boot for the sidebar
    cn.ts format.ts collections.ts shapes.ts usePagination.ts
    useDialog.ts useMeasure.ts useCallAudio.ts
  pages/          one per section
server/index.js   the local proxy
api/[...path].js  the deployed proxy — narrower, fails closed
tests/            the regression suite
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
