# Backend

Auth, workspace credentials, and the Perfox proxy for the console in
`../client-ui`.

Express + TypeScript on Node 22 (`--experimental-strip-types`, so there is no
build step) and Postgres.

## What it is for

The console talks to a Perfox workspace, and a workspace API key authorises
**everything** in it — read and write across customers, conversations,
knowledge base, credentials and workflows. That key must never reach a browser.

So this process holds it. The browser holds a session cookie it cannot even
read, and every `/api/perfox/*` request is resolved against the signed-in
user's own workspace before it is forwarded:

```
browser ──(session cookie)──▶ this backend ──(that user's key)──▶ Perfox
```

Two users signed in at once reach two different workspaces through identical
URLs, and neither browser ever holds a credential.

## Running it

```bash
docker compose up -d        # Postgres on :5433
npm install
cp .env.example .env        # then generate an ENCRYPTION_KEY, below
npm run migrate             # apply the schema
npm run seed:admin          # create the admin account

npm run dev                 # http://localhost:4400
```

Then sign in at `/admin/login` and add customers there. `seed:admin` is the
only account that cannot be made through the app, because something has to
exist before anything else can be created; it prompts, or runs unattended if
`ADMIN_EMAIL` and `ADMIN_PASSWORD` are set.

To run the browser suite instead, `npm run seed:dev` makes both accounts it
signs in as — a customer and an admin — in one step. Workspace credentials come
from `PERFOX_API_BASE` and `PERFOX_API_KEY` in the environment, from the file
named by `SEED_ENV_FILE`, or from an old `../client-ui/.env` if one is still
there. Without any of them it still creates the accounts and says the workspace
is unconfigured, which is enough for everything except the pages that read live
data.

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then in another terminal, `npm run dev` in `../client-ui`. Vite serves the app
on :5180 and forwards `/api` here, so the browser sees **one origin** — which
is what lets the session cookie stay `SameSite=Lax` and have the browser block
CSRF for us. In production this process serves the built app itself
(`CLIENT_DIST`), which keeps that property without a proxy.

`npm run discover` prints a workspace's MCP tools, for checking whether a
resource exists before writing against it.

## Admins and customers are separate

Two tables, two session tables, two cookie names — not one table with a role
column. `users.workspace_id` is NOT NULL and an admin belongs to no workspace,
but the real reason is that an admin can create workspaces and write raw Perfox
keys. That is a different privilege class, not a different row in the same one.

The separation does work a guard would otherwise have to remember:

- an admin session **cannot** reach `/api/perfox/*` — not "is refused", cannot,
  because there is no `workspace_id` anywhere to resolve
- no column exists that would turn a customer into an admin
- with one cookie name, signing into either surface would silently sign you out
  of the other in the same browser

**A credential is returned by one endpoint, and it is written down.** Nothing
else carries a key or a secret: the customers list reports flags, creating one
echoes nothing back, and the edit form loads its settings without them.
`GET /admin/customers/:id/credentials` is the exception — an admin who set a
key up is the person who has to read it back when a customer asks what was
configured. It is arranged so it cannot happen quietly:

- its own request, made when the eye is pressed rather than when the form
  loads, so a secret is in a response only because somebody asked
- one workspace per call
- every call writes an `admin_events` row naming the admin and the customer,
  so "who read this key?" has an answer. The row says a credential was read,
  never which value it was

A blank secret field on the edit form still means "leave it" rather than
"clear it"; clearing is explicit, with `null`.

## Two more decisions worth knowing

**Sessions, not JWTs.** A token in `localStorage` is readable by any injected
script; an httpOnly cookie is not reachable from JavaScript at all. And a JWT
stays valid until it expires — suspending a user would need a revocation list,
at which point you are hitting the database every request anyway and have kept
none of the statelessness that justified the JWT. This backend already reads
the database on every proxied request to find the caller's credentials, so
there was never any statelessness to protect. Deleting a row signs someone out.

**Credentials are encrypted at rest.** `perfox_api_token` and
`operator_site_secret` are AES-256-GCM, keyed from `ENCRYPTION_KEY`. Stored in
plain text, one database dump would hand over every tenant at once. The key
belongs in a secret manager, not in a file that gets copied around — and losing
it means every workspace has to be reconfigured.

## Data model

```
workspaces      the Perfox connection: REST base + key, operator site + secret
users           belongs to exactly one workspace; owner or member
sessions        a hash of the cookie, never the cookie

admins          above workspaces; no workspace_id exists for them
admin_sessions  the same, for the admin cookie
```

`Workspace → many users`, so a company's whole team shares one connection.
Invitations and magic links drop in as a fourth table without disturbing this.

## Customers cannot create their own accounts

There is no sign-up form and no route to one. The console reads real customer
conversations, so a public sign-up would be a door onto them — an admin creates
accounts on `/admin`, and hands over the email and password.

`ALLOW_REGISTRATION` still gates a dormant `/api/auth/register`, kept for the
invitation flow: when that exists the endpoint becomes "accept an invitation"
and the workspace comes from the invite rather than from whoever filled in the
form.

## Sign-in attempts are capped

Ten failures in fifteen minutes, counted per address **and** per IP — per IP
alone lets an attacker spread across a botnet, per address alone lets them try
one password against every account they can name. A success clears the address,
so two typos and then the right password is not a lockout.

It is held in memory, which is fine for one process and **ineffective the
moment there is more than one** — each instance would keep its own count. It
moves to shared storage when the deployment does.

## Endpoints

| | |
|---|---|
| `GET /api/health` | liveness, and whether the database answers |
| `POST /api/auth/login` | sets the session cookie; returns the user and workspace **flags** |
| `POST /api/auth/logout` | deletes the session |
| `GET /api/auth/me` | 200 with `user: null` when signed out — not a 401, so a cold login page logs nothing |
| `POST /api/auth/register` | 403 unless `ALLOW_REGISTRATION=true` |
| `POST /api/auth/password` | requires the current password; ends every other session |
| `POST /api/admin/login` | the admin's own cookie (`ufasid`), own table |
| `POST /api/admin/logout` | |
| `GET /api/admin/me` | 200 with `admin: null` when signed out |
| `POST /api/admin/password` | ends every other admin session |
| `GET /api/admin/customers` | flags, never credentials |
| `POST /api/admin/customers` | creates a workspace and its owner, in one transaction |
| `PATCH /api/admin/customers/:workspaceId` | changes the connection; blank means "leave it" |
| `POST /api/admin/customers/:workspaceId/test` | does this key actually work? |
| `POST /api/admin/customers/:userId/status` | suspend or reinstate; suspending ends their sessions |
| `GET /api/config` | the workspace's name and what is configured |
| `GET /api/operator/config` | the signed operator identity — never the site secret |
| `/api/perfox/*` | the proxy, allowlisted |

`credentials` and `credentials/{id}/resources` are on that allowlist, which is
worth justifying because the name sounds like the last thing a proxy should
forward. It returns metadata only — id, name, type, status, and the *names* of
the fields a credential has, never their values.

Login deliberately returns **no** `base_url` and **no** `api_token`. The
frontend does not need them and cannot be trusted with them.

The proxy is an allowlist, not a passthrough: this process holds a key that can
rewrite a workspace, and a signed-in user should not be able to reach further
through it than the app itself does. Adding a page means adding its route to
`READS` or `WRITES` in `src/routes/perfox.ts`.
