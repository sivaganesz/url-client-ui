# Client UI

The browser half of the Perfox workspace console. A signed-in customer sees
their own workspace — conversations, customers, agents, documents, analytics —
and can phone a customer from the page, with their own microphone on the line.

Built as static files. The backend in [`../backend`](../backend) serves them in
production and answers `/api` in both.

---

## Tech stack

| | |
|---|---|
| **React 19** | function components and hooks only; no class components |
| **TypeScript** | `strict`, and the build fails on a type error |
| **Vite 7** | dev server with HMR, and the production bundler |
| **Tailwind CSS 4** | via `@tailwindcss/vite`; no separate config file |
| **React Router 7** | `react-router-dom`, declarative routes |
| **`@perfox/operator-react`** | the operator SDK, vendored as a tarball — see [OPERATOR-INTEGRATION.md](OPERATOR-INTEGRATION.md) |
| **Playwright** | browser tests, desktop and mobile viewports |
| **ESLint 10** | with `typescript-eslint` and the React Hooks rules |

Runtime dependencies are deliberately four: React, React DOM, React Router and
the operator SDK. Everything else — tables, charts, dialogs, dropdowns, the
date filter — is in `src/components/ui` and `src/components/charts`, written
here rather than pulled in.

---

## Running it

The backend must be up first; it holds the workspace credentials and proxies
every call to Perfox.

```bash
# in ../backend — see its README
docker compose up -d        # Postgres
npm run migrate
npm run seed:admin          # create the first administrator
npm run dev                 # API on :4300

# then here
npm install
npm run dev                 # app on http://localhost:5180
```

Vite serves the app on **5180** and proxies `/api` to the backend on **4300**,
so the browser sees **one origin**.

To create the two accounts the browser tests sign in as, run `npm run seed:dev`
in the backend instead of `seed:admin`.

### Checks

```bash
npm run typecheck   # tsc over src and the test project
npm run lint        # ESLint
npm run build       # typecheck + production bundle into dist/
npm test            # Playwright, against a running dev server
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build
rather than shipping.

---

## Two sign-in surfaces

```
/login         customers → the console
/admin/login   administrators → customer provisioning
```

**Customers cannot create accounts.** There is no sign-up form and no route to
one; an administrator creates them under `/admin` and hands over the details.

The two surfaces have separate sessions, separate cookies and separate backend
tables, so neither stands in for the other — an administrator cannot open the
console, and a customer cannot reach the admin API.

---

## Pages

### The console

| Route | Page | What it shows |
|---|---|---|
| `/` | **Dashboard** | The workspace at a glance: total conversations and the split by channel (phone, WhatsApp, web), conversation volume over time, and the busiest agents. Each tile links into the page that explains it. |
| `/analytics` | **Analytics** | The same figures with a date range and Day / Week / Month bucketing, plus the credit balance and the **conversation log** — a filterable, paged table of every case, with export. |
| `/conversations` `/conversations/:id` | **Conversations** | Two panes: every conversation on the left, filterable by channel; the selected thread on the right. The thread shows the transcript, the agent's tool calls, a recording player where one exists, and a composer for replying on the channel the conversation is on. |
| `/call-logs` | **Call Logs** | Phone calls specifically: total calls, how many resolved, how many have recordings, total talk time. Filter by channel and outcome; play any recording inline. |
| `/customers` `/customers/:id` | **Customers** | Two panes: everyone the workspace has spoken to on the left, one of them on the right. **Profile** carries identity, quick stats and AI-generated insights across all their conversations; **Communication** lists their conversations, filtered by status, fifty at a time. |
| `/agents` | **AI Agents** | Every agent in the workspace, as cards or a table. Shows which channels each is connected to and whether it is published; publish and unpublish from here. |
| `/phone-numbers` | **Phone Numbers** | Every number and address the workspace can be reached on — not only phone: WhatsApp, SMS and email identifiers come from the same endpoint and belong together. One row per number *per channel*, because a number is bound to an agent separately for each. |
| `/documents` | **Documents** | The knowledge base the agents answer from. Browse folders as a grid or a table, upload files or whole folders, rename, move and delete. |
| `/login` | **Sign in** | Customer sign-in. No sign-up link, deliberately. |

### Administration

| Route | Page | What it shows |
|---|---|---|
| `/admin` | **Customers** | Every customer account, their workspace connection, and whether calling is configured. Edit a customer's profile, their Perfox credentials and their operator credentials; reset a password. |
| `/admin/customers/new` | **New customer** | Create an account and attach a workspace in one form. |
| `/admin/admins` | **Administrators** | The administrator accounts, and revoking their sessions. |
| `/admin/activity` | **Activity** | The audit trail — who did what, when, in words rather than raw identifiers. |
| `/admin/login` | **Admin sign in** | Separate session, separate cookie. |

Any unknown route inside either surface redirects to its own home rather than
showing a 404.

---

## How data reaches a page

**The browser never holds a Perfox credential.** A workspace key authorises
everything in that workspace — read and write across customers, conversations,
knowledge base and workflows — and anything in client-side JavaScript is
readable by whoever opens devtools.

So the browser holds a session cookie it cannot read (`httpOnly`), and the
backend resolves the signed-in user's workspace on every request:

```
browser ──(session cookie)──▶ backend ──(that user's key)──▶ Perfox
```

Sign-in returns a name, an email, a mobile number and two booleans about the
workspace — no API base, no token. `tests/smoke.spec.ts` fails if a key ever
becomes readable from the page, in markup, storage or cookies.

**One origin, deliberately.** The app and the API answer on the same host —
Vite proxies in development, the backend serves the built app in production —
which is what lets the session cookie stay `SameSite=Lax` and have the browser
block cross-site request forgery without the app writing anything.

Every section is REST, not MCP. MCP is a tool-calling protocol for LLM agents;
a web frontend belongs on plain HTTP resources. The mapping is in
`src/lib/api.ts` and the wire shapes are in `src/lib/types.ts`.

| Section | Endpoint |
|---|---|
| Conversations list | `/conversations` + `/customers` |
| Transcript | `/conversations/{id}/events` |
| Customer overview | `/customers/{id}` |
| AI Agents | `/agents`, `/agents/{id}` |
| Publish / unpublish | `POST /agents/{id}/publish`, `PATCH /agents/{id}` |
| Call Logs | `/calls` |
| Recordings | `/conversations/{id}/recordings` — signed links, ~900s |
| Dashboard and Analytics | `/analytics/summary`, `/analytics/conversations-over-time` |
| Credit balance | `/billing/credits` |
| Conversation log | `/cases` — filtered and paged upstream |
| Phone numbers | `/credentials`, `/credentials/{id}/resources` |
| Documents | the knowledge-base routes |
| Outbound message | `POST /outbound` |
| Operator calling | `@perfox/operator-react` |

### Two platform limits that shape the UI

**`/conversations` caps at 200 records and accepts no paging.** Not `limit`,
`offset`, `page`, `per_page` or `cursor`; there is no `next_cursor`. This holds
over both REST and MCP, so it is server-side. On a workspace with more than 200
conversations the rest are unreachable, and the rail says so rather than
presenting the cap as the total:

```
50 of 200 · 294 in workspace
```

`/calls`, by contrast, is cursor-paginated properly, and `src/lib/api.ts`
already has the cursor-following helper.

**An unknown path answers `401 Invalid or expired token`, not `404`.** It reads
like a bad key and means the route does not exist. A trailing slash in the API
base produces `//agents` and fails the same way — both proxies trim it.

---

## Colour, and the two themes

**Every colour is a token.** They are declared once in `src/index.css` and used
by name everywhere else:

```css
--color-surface: #ffffff;   /* card backgrounds */
--color-ink:     #1c1b19;   /* the main text colour */
--color-line:    #e7e4dd;   /* borders */
```

```jsx
<div className="bg-surface text-ink border-line">
```

That is what makes a second theme possible without touching a component.
`:root.dark` redeclares 35 of those names with dark values, so `bg-surface`
keeps working and simply resolves elsewhere. No component knows a theme exists.

Tailwind 4, so there is no config file and no `dark:` variants scattered
through the markup — the configuration is the CSS.

### Adding a colour

**Declare it twice, or it will look wrong in one theme.** A raw hex in a
component is invisible in review and only shows up when somebody switches.

```css
@theme {
  --color-new-thing: #…;   /* light */
}

:root.dark {
  --color-new-thing: #…;   /* dark */
}
```

Check the pair you have created: text on a background should clear 4.5:1. The
dark palette's worst pair is 6.39:1 and the light one's is 5.09:1, so there is
room — but a new colour is a new pair, and nothing enforces it automatically.

### Tokens that are not what they sound like

| Token | What it is for |
|---|---|
| `ink` | the colour **text** is. Never a surface — it inverts between themes |
| `panel` | a surface that is dark **on purpose**: the admin rail |
| `scrim` | the dim behind a dialog |
| `brand-panel` | the sign-in hero, which carries white text in both themes |
| `on-accent` | text **on** a filled accent. White in light, near-black in dark |

The last one is the least obvious. A single blue cannot both carry white text
and be legible as text on a dark surface — it would need to be darker than
0.183 luminance and lighter than 0.237 at once. So in dark mode a brand button
carries dark text, as dark interfaces generally do.

### Which theme is in force

The choice lives in `localStorage` under `ui-theme`, defaults to the operating
system's setting, and follows the system only while nobody has chosen.

It is applied by a small script in `index.html` **before the first paint**. An
effect would run after React has drawn, which is a white flash on every load
for anyone who picked dark. `src/lib/theme.ts` only has to agree with what that
script already did.

The toggle lives in the account block at the foot of either rail, and shows the
theme it will switch *to*.

---

## Folder structure

```
client-ui/
├── vendor/                     the operator SDK tarball (a file: dependency)
├── tests/                      Playwright specs — see tests/README.md
├── index.html                  the single page
├── vite.config.js              dev server on 5180, /api proxied to 4300
├── playwright.config.ts        desktop + mobile projects
└── src/
    ├── main.tsx                mounts the app inside StrictMode
    ├── App.tsx                 every route, and the two session gates
    ├── index.css               Tailwind entry and the design tokens
    ├── vite-env.d.ts           Vite’s ambient types
    │
    ├── pages/                  one file per route
    │   ├── Dashboard.tsx  Analytics.tsx  Conversations.tsx
    │   ├── CallLogs.tsx   Customers.tsx  Agents.tsx
    │   ├── PhoneNumbers.tsx      Documents.tsx      Login.tsx
    │   └── admin/          the administration surface
    │       ├── AdminShell.tsx    AdminLogin.tsx   Customers.tsx
    │       ├── NewCustomer.tsx   Admins.tsx       Activity.tsx
    │       ├── EditConnectionDialog.tsx
    │       └── CredentialHelp.tsx
    │
    ├── components/
    │   ├── layout/         AppShell, Sidebar — the frame every page sits in
    │   ├── ui/             the design system: DataTable, Modal, Card, Badge,
    │   │                   Button, Field, Dropdown, FilterMenu, DateFilter,
    │   │                   TablePager, StatTile, States, Spinner, Avatar,
    │   │                   ConfirmDialog, DataBanner
    │   ├── charts/         BarChart, LineChart, BarList, ChartPrimitives
    │   ├── conversations/  the thread: ConversationDetail, TranscriptTab,
    │   │                   OverviewTab, Composer, ToolEvent, channels
    │   ├── CallScreen.tsx          the call panel, above the router outlet
    │   ├── NewConversationDialog.tsx
    │   ├── ConversationLog.tsx     the cases table on Analytics
    │   ├── RecordingPlayer.tsx     LogFilters.tsx
    │   ├── ChangePasswordDialog.tsx
    │   ├── ThemeToggle.tsx         light or dark, in the account block
    │   ├── ErrorBoundary.tsx       icons.tsx
    │
    └── lib/
        ├── api.ts          every request to the backend, in one place
        ├── types.ts        the wire shapes
        ├── shapes.ts       empty values, so a loading page has the right shape
        ├── session.tsx     the customer session and its gate
        ├── admin.tsx       the administrator session and its gate
        ├── operator.tsx    the operator SDK gate and the useCall() hook
        ├── useResource.ts  load / loading / error / reload, abort-safe
        ├── usePagination.ts  client-side paging, paired with TablePager
        ├── useDialog.ts    open/close plumbing shared by the modals
        ├── useCallAudio.ts   useMeasure.ts
        ├── collections.ts  filtering and sorting helpers
        ├── export.ts       CSV and JSON download
        ├── kbUpload.ts     folder-aware knowledge-base upload
        ├── theme.ts        which theme is in force, and remembering it
        ├── format.ts       dates, durations, numbers
        └── cn.ts           class-name joining
```

### Conventions worth knowing before adding a page

- **`useResource(load, empty, deps)` for anything fetched.** It handles the
  abort, the loading and error states, and re-running on dependency change. Its
  `empty` argument is why pages render their real layout while loading instead
  of a spinner-shaped hole.
- **Pages hold layout, `lib/api.ts` holds requests.** A page should not
  construct a URL.
- **The design system is in `components/ui`.** Reach for `DataTable`, `Card`,
  `Field` and `Modal` before writing a table, a panel, an input or a dialog.
- **Paging comes in two kinds.** `usePagination` + `TablePager` for a list the
  browser already holds; a cursor for `/calls`, which the API pages properly.
- **A new colour is declared twice**, light and dark, or it looks wrong in
- **Tailwind classes of equal specificity are settled by stylesheet order**,
  not by the order they appear in the attribute. When one utility has to win,
  make it more specific rather than moving it.

---

## Deploying

**This half deploys as static files.** `npm run build` produces `dist/`, and
the backend serves it — which is what keeps the app and the API on one origin.
Point the backend's `CLIENT_DIST` at that directory.

Nothing here is configured at build time. There is no `VITE_` variable, no API
base to set: the app talks to its own origin, and everything workspace-specific
lives in the backend's database.

The full procedure, including the database and the first administrator, is in
[../DEPLOYMENT.md](../DEPLOYMENT.md).

---

## See also

- [OPERATOR-INTEGRATION.md](OPERATOR-INTEGRATION.md) — operator calling, in
  depth: the signing endpoint, the SDK, the call panel, troubleshooting
- [tests/README.md](tests/README.md) — how the browser suite is organised and
  what it deliberately does not do
- [../backend/AUTH.md](../backend/AUTH.md) — sign-in, sessions and the
  two surfaces, including the gates in this half
- [../backend/README.md](../backend/README.md) — the API, sessions and the
  Perfox proxy
- [../DEPLOYMENT.md](../DEPLOYMENT.md) — running the whole thing on a server
