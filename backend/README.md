# Backend

The API for the console in [`../client-ui`](../client-ui): sessions, workspace
credentials, the administration surface, and the proxy that every Perfox
request goes through.

Express 5 and TypeScript on Node 22, running under
`--experimental-strip-types`, so there is **no build step** — the `.ts` files
are what runs. Postgres 17 for storage.

---

## What it is for

The console is multi-tenant: each customer has their own Perfox workspace, and
their own API key for it. That key authorises everything in that workspace, so
it must never reach a browser.

This process is what makes that possible. It holds the keys, encrypted at rest,
and lends one — decrypted, in memory, for the length of a single request — to
whichever customer is signed in.

```
browser ──(session cookie)──▶ backend ──(that customer's key)──▶ Perfox
```

The browser is never told which workspace it is talking to, what the API base
is, or what the key looks like. It sends a cookie it cannot read, and this
process works out the rest.

---

## Running it

```bash
docker compose up -d        # Postgres on :5433
npm install
cp .env.example .env        # then generate an ENCRYPTION_KEY, below
npm run migrate             # apply the schema
npm run seed:admin          # create the first administrator

npm run dev                 # http://localhost:4300
```

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then sign in at `/admin/login` and add customers there.

`seed:admin` is the only account that cannot be made through the app, because
something has to exist before anything else can be created. It prompts, or runs
unattended when `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. Given
an email that already exists it reports so and stops, so it is safe to re-run.

To run the browser suite instead, `npm run seed:dev` makes both accounts it
signs in as — a customer and an administrator — in one step, plus a workspace
for them to look at.

Then, in another terminal, `npm run dev` in `../client-ui`. Vite serves the app
on :5180 and forwards `/api` here, so the browser sees **one origin** — which
is what lets the session cookie stay `SameSite=Lax` and have the browser block
CSRF without the app writing anything. In production this process serves the
built app itself (`CLIENT_DIST`), which keeps that property without a proxy.

### Scripts

| | |
|---|---|
| `npm run dev` | watch mode on :4300 |
| `npm start` | the same, without the watcher |
| `npm run migrate` | apply `src/db/schema.sql` |
| `npm run seed:admin` | create an administrator |
| `npm run seed:dev` | the browser suite's accounts and workspace |
| `npm test` | 103 tests, against a throwaway database |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Configuration

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string |
| `ENCRYPTION_KEY` | **yes** | encrypts workspace credentials at rest |
| `PORT` | no | default `4300` |
| `NODE_ENV` | no | `production` turns on `trust proxy` and Secure cookies |
| `CLIENT_DIST` | no | path to the built frontend; serving it from here keeps one origin |
| `DATABASE_SSL` | no | `auto`, `require` or `off` — see `src/db/index.ts` |
| `SESSION_TTL_DAYS` | no | default `7` |
| `ALLOW_REGISTRATION` | no | `false` unless set to `"true"` |
| `OUTBOUND_ALLOWLIST` | no | numbers an agent may ring while set; empty means no restriction |

The process exits at startup if either required variable is missing, rather
than failing later on the first request that needs it.

**`ENCRYPTION_KEY` is not stored in the database, so database backups do not
contain it.** It needs backing up separately, and the same key must be used for
the life of the data — see [../DEPLOYMENT.md](../DEPLOYMENT.md).

---

## Folder structure

```
backend/
├── docker-compose.yml       Postgres 17 for local development, on :5433
└── src/
    ├── index.ts             starts the server, schedules session sweeps
    ├── app.ts               the Express app: middleware, /api/health, routers
    ├── env.ts               every setting, read and validated once
    ├── crypto.ts            AES-256-GCM for credentials, hashing for tokens
    ├── workspace.ts         a workspace's credentials, decrypted for one request
    ├── audit.ts             what an administrator did, and to whom
    │
    ├── auth/
    │   ├── session.ts         customer sessions, in an httpOnly cookie
    │   ├── admin-session.ts   administrator sessions — same mechanism, apart
    │   ├── password.ts        argon2id at the library defaults
    │   └── rate-limit.ts      a ceiling on sign-in attempts
    │
    ├── routes/
    │   ├── auth.ts          sign in, sign out, change password, /auth/me
    │   ├── admin.ts         the administration surface
    │   └── perfox.ts        the proxy to Perfox, and operator calling
    │
    └── db/
        ├── index.ts         the pool, and whether to use TLS
        ├── schema.sql       every table, all IF NOT EXISTS
        ├── migrate.ts       applies schema.sql
        ├── seed-admin.ts    the first administrator
        └── seed-dev.ts      the browser suite's accounts
```

Tests live in `tests/`, alongside a `harness.ts` that builds a throwaway
database and a `client.ts` that signs in and keeps cookies.

---

## Data model

Six tables.

| Table | Holds |
|---|---|
| `workspaces` | one customer's Perfox connection — API base, encrypted token, encrypted operator secret, status |
| `users` | the people who sign in to the console, each belonging to one workspace |
| `sessions` | customer sessions, stored hashed |
| `admins` | administrator accounts |
| `admin_sessions` | administrator sessions, stored hashed |
| `admin_events` | the audit trail |

Credentials are encrypted at rest with `ENCRYPTION_KEY`: a database dump on its
own reveals nothing usable. `workspace.ts` is the only place a key exists in the
clear, and it never leaves the request that decrypted it.

Session tokens are stored **hashed**, so the table cannot be used to sign in as
anyone even with full read access to the database.

---

## Authentication

Two separate systems, deliberately.

```
customers        POST /api/auth/login    → cookie  →  the console
administrators   POST /api/admin/login   → cookie  →  customer provisioning
```

Different cookie names, different tables, different routers. **An administrator
session cannot satisfy a customer route and a customer session cannot reach the
admin API** — not by a role check that could be got wrong, but because the two
look in different places entirely.

**Sessions, not JWTs.** A token in `localStorage` is readable by any injected
script; an httpOnly cookie is not reachable from JavaScript at all. And a JWT
stays valid until it expires, so suspending a user would need a revocation list
— at which point the database is being read on every request anyway, and none
of the statelessness that justified the JWT remains. This process already reads
the database on every proxied request to find the caller's credentials. Deleting
a row signs someone out.

**Passwords are argon2id** at the library's defaults — memory-hard, so a GPU or
ASIC farm gains far less against it than against bcrypt.

**Sign-in attempts are capped:** ten failures in fifteen minutes, counted per
address **and** per IP. Per IP alone lets an attacker spread across a botnet;
per address alone lets them try one password against every account they can
name. A success clears the address, so two typos followed by the right password
is not a lockout. The counter is held in memory, which means **one instance** —
see [../DEPLOYMENT.md](../DEPLOYMENT.md).

**Customers cannot create their own accounts.** `POST /api/auth/register`
refuses unless `ALLOW_REGISTRATION=true`, which it is not. Accounts are created
by an administrator, who hands over the details.

A fuller account is in [AUTH.md](AUTH.md).

---

## The Perfox proxy

Every workspace request goes through `routes/perfox.ts`, and the path is
matched against an **allowlist** before anything is forwarded.

```
GET  /api/perfox/agents            →  {workspace api base}/agents
POST /api/perfox/outbound          →  {workspace api base}/outbound
```

Reads and writes are separate lists, and a write names its method. A path that
matches neither is refused here, before a request is made. That is what stops
the proxy becoming a way to reach anything in a workspace that the console has
no business touching.

Allowed reads include agents, conversations and their events and recordings,
customers and their details, calls, cases, analytics, credits, credentials and
the knowledge base. Allowed writes are narrow: publishing an agent, patching
one, sending an outbound message, and the knowledge-base file and folder
operations. File upload has a route of its own, because it carries a file
rather than JSON.

**Operator calling** is also here, but works differently: the browser talks to
Perfox directly over WebRTC, and this process only issues the signed identity
(`GET /api/operator/config`) and ends calls reliably (`POST /api/operator/stop`).
The detail is in
[../client-ui/OPERATOR-INTEGRATION.md](../client-ui/OPERATOR-INTEGRATION.md).

---

## Endpoints

| | |
|---|---|
| `GET /api/health` | liveness, and whether the database answers |
| `POST /api/auth/login` | sets the session cookie; returns the user and workspace **flags** |
| `POST /api/auth/logout` | deletes the session row |
| `GET /api/auth/me` | the signed-in user, or 401 |
| `POST /api/auth/password` | change own password |
| `POST /api/auth/register` | refuses unless registration is enabled |
| `GET /api/config` | what the frontend may know about the workspace |
| `ALL /api/perfox/*` | the allowlisted proxy |
| `GET /api/operator/config` | the signed operator identity |
| `POST /api/operator/stop` | end a call, and confirm it ended |

Administration, all requiring an administrator session:

| | |
|---|---|
| `POST /api/admin/login` · `logout` · `password` | the admin session |
| `GET /api/admin/me` | the signed-in administrator |
| `GET /api/admin/customers` | every customer and their workspace |
| `POST /api/admin/customers` | create a customer and attach a workspace |
| `GET` · `PATCH` · `DELETE /api/admin/customers/:workspaceId` | read, edit, remove |
| `GET /api/admin/customers/:workspaceId/credentials` | **reveals the decrypted Perfox token and operator secret**; audited as `customer.reveal` |
| `POST /api/admin/customers/:workspaceId/test` | check the credentials reach Perfox |
| `POST /api/admin/customers/:workspaceId/password` | issue a new password |
| `POST /api/admin/customers/:workspaceId/status` | suspend or restore |
| `GET` · `POST /api/admin/admins` | list and create administrators |
| `POST /api/admin/admins/:adminId/status` | suspend, which also revokes sessions |
| `GET /api/admin/events` | the audit trail |

**The credentials route hands back plaintext.** It decrypts a workspace's
Perfox token and operator secret and returns them, so an administrator can read
back what was entered. One workspace per request, and every call is written to
the audit trail as `customer.reveal`, recording which fields were revealed and
by whom — never the values themselves.

Two things follow. Responses from this route must not be logged or captured by
anything that keeps request bodies. And an administrator session is, in
practice, access to every workspace's credentials one request at a time: the
only guard is `requireAdmin`, so the trail is a record of what happened rather
than a barrier to it.

`/api/health` returns `{"ok":true,"database":"up"}` with a 200, or a 503 when
Postgres is unreachable. It is the check worth alerting on: it answers whether
the process is up **and** can reach its data.

---

## Tests

```bash
npm test        # 103 tests, ~1 minute
```

Node's built-in test runner, no additional dependency. They run against a real
Postgres — a throwaway `urlfactory_test` database created and dropped by
`tests/harness.ts`, never the development one — and against an in-process fake
Perfox, so nothing reaches the real platform and no test needs a key.

The suites cover sign-in and sessions, the password rules and the attempt cap,
credentials at rest, the proxy allowlist, the knowledge base, customer and
admin operations, ending a call, and tenant isolation — that one customer's
session cannot read another's workspace.

---

## See also

- [AUTH.md](AUTH.md) — authentication in full
- [../DEPLOYMENT.md](../DEPLOYMENT.md) — running this on a server
- [../client-ui/README.md](../client-ui/README.md) — the browser half
- [../client-ui/OPERATOR-INTEGRATION.md](../client-ui/OPERATOR-INTEGRATION.md)
  — operator calling
