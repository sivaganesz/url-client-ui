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
npm run seed                # create a workspace and its first user

npm run dev                 # http://localhost:4400
```

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

## Two decisions worth knowing

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
workspaces  the Perfox connection: REST base + key, operator site + secret
users       belongs to exactly one workspace; owner or member
sessions    a hash of the cookie, never the cookie
```

`Workspace → many users`, so a company's whole team shares one connection.
Invitations and magic links drop in as a fourth table without disturbing this.

## Registration is closed

`ALLOW_REGISTRATION` is `false` and should stay that way for now. The console
reads real customer conversations, so a public sign-up form is a door onto
them. Accounts are created with `npm run seed` until the invitation flow
exists, at which point the page becomes "accept an invitation" and the
workspace comes from the invite rather than from whoever filled the form in.

The endpoint and the page both exist already, so switching it on later is
configuration rather than a release.

## Endpoints

| | |
|---|---|
| `GET /api/health` | liveness, and whether the database answers |
| `POST /api/auth/login` | sets the session cookie; returns the user and workspace **flags** |
| `POST /api/auth/logout` | deletes the session |
| `GET /api/auth/me` | 200 with `user: null` when signed out — not a 401, so a cold login page logs nothing |
| `POST /api/auth/register` | 403 unless `ALLOW_REGISTRATION=true` |
| `POST /api/auth/password` | requires the current password; ends every other session |
| `GET /api/config` | the workspace's name and what is configured |
| `GET /api/operator/config` | the signed operator identity — never the site secret |
| `/api/perfox/*` | the proxy, allowlisted |

Login deliberately returns **no** `base_url` and **no** `api_token`. The
frontend does not need them and cannot be trusted with them.

The proxy is an allowlist, not a passthrough: this process holds a key that can
rewrite a workspace, and a signed-in user should not be able to reach further
through it than the app itself does. Adding a page means adding its route to
`READS` or `WRITES` in `src/routes/perfox.ts`.
