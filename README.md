# Siva Workspace — client UI

React + Vite + Tailwind console for the **siva-workspace** Perfox workspace.
Six sections: Dashboard, Analytics, Conversations, Call Log Analytics, AI Agents,
Phone Number Connections.

## Running it

Two processes. The proxy holds the API key; the Vite dev server forwards
`/api/*` to it.

```bash
npm install
cp .env.example .env     # then paste your Perfox key into PERFOX_API_KEY

npm run proxy            # terminal 1 — http://localhost:8787
npm run dev              # terminal 2 — http://localhost:5180
```

Without the proxy the app still runs; every page falls back to bundled sample
data and says so in the sidebar and in a banner on the page.

```bash
npm run build            # production bundle into dist/
npm run discover         # print the workspace's 33 tools and their signatures
```

## Why there's a proxy

The Perfox key authorises **everything** in the workspace — read and write
across customers, conversations, knowledge base, credentials and workflows. A
key in client-side JavaScript is readable by anyone who opens devtools, so it
stays in `server/index.js`, which injects the `Authorization` header and
redacts the key from anything it logs or returns. The browser only ever talks
to same-origin `/api/*`.

`.env` is gitignored. `.env.example` is the template.

## What is live, and what is not

`npm run discover` lists what the workspace exposes. Mapped in `src/lib/api.js`:

| Section | Source | State |
|---|---|---|
| Conversations list | `list_conversations` + `list_customers` | **Live** |
| Transcript | `get_conversation_transcript` | **Live** |
| Customer overview | `get_customer` | **Live** |
| AI Agents | `list_agents` | **Live** |
| Dashboard counts, channel split, volume | derived from conversations + agents | **Live (derived)** |
| Resolution rate | derived from conversation status | **Live (derived — see below)** |
| Token usage | — | **Not available** |
| Call Log Analytics | — | **Not available — sample data** |
| Phone Number Connections | — | **Not available — sample data** |

This workspace has **no calls, phone-numbers or analytics resource**, over MCP
or REST. Unknown REST paths answer `401 Invalid or expired token`, which reads
like an auth failure but really means "no such route" — `/conversations`,
`/agents`, `/customers`, `/credentials`, `/mcp-servers` and `/support/tickets`
all return `200` with the same key.

So the Call Log table's fifteen columns — direction, from/to, ringing/answered/
ended, duration, cost, recording, sentiment — have no source. Those two pages
keep their sample rows and carry a banner explaining why, rather than showing
an empty table that would look like an empty workspace.

### Resolution rate

The workspace reports conversation status as `resolved`, `ended`, `abandoned`
or `active`. The tile computes:

```
resolution rate = resolved / (resolved + ended + abandoned)
```

`ended` is **not** counted as resolved — a conversation that merely stopped
isn't one that got what it came for. On current data that's 34/198 ≈ 17%, with
131 abandoned. **Confirm this definition before anyone acts on the number.**

## Layout

```
src/
  components/
    charts/      BarChart, LineChart, BarList, shared primitives
    layout/      AppShell (sidebar + drawer), PageHeader, PageBody, Sidebar
    ui/          Button Card Badge StatTile Field Avatar DataTable States DataBanner
    icons.jsx    stroke icons on a 24px grid, coloured by currentColor
  data/sample.js fallback data; also the shape contract api.js maps onto
  lib/
    api.js       workspace access + normalisation  ← the mapping lives here
    useResource.js  load / live / sample / error state machine
    useDataSource.js  probes the proxy on boot for the sidebar badge
    format.js  cn.js  useMeasure.js
  pages/         one per section
server/
  index.js       the proxy
  discover.js    tool-list CLI
```

### Design notes

Tokens are declared once in `src/index.css` under `@theme`; components use
semantic names (`bg-canvas`, `text-ink-3`, `border-line`) rather than raw
palette steps. Light-only on purpose — a half-tuned dark theme reads worse
than none; adding one means redeclaring those tokens under a `.dark` variant.

Charts are dependency-free inline SVG. The data hue is `#2a78d6`, **not** the
UI brand blue `#3a5a8c`: the brand step fails the chroma floor for data marks
and validates as gray. Every chart is single-series, so identity comes from
axis labels and no categorical palette is in play.

## Open questions

Carried over from the wireframe, still unanswered:

1. **"Phone Number Conversations"** — the list of connected numbers (what's
   drawn), or conversations grouped by number?
2. **Resolution rate** — is the definition above the intended one?
3. **Conversation pane** — read-only, or can an operator take over? There's no
   send-message tool in the workspace today either way.
4. **Call log** — which columns sort, and is Review a flag or a score?
