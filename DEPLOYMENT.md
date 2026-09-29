# Deployment

How this application is deployed today, and how to run it on your own server.

Read **Five things that will bite you** before deploying anything. The rest is
ordinary.

---

## What this is

A multi-tenant console. Each customer has their own Perfox workspace, and this
application talks to those workspaces on their behalf — conversations,
documents, analytics, and outbound phone calls placed from the browser.

Two halves in one repository:

| | |
|---|---|
| [`backend/`](backend/README.md) | Express 5 on Node 22, Postgres. The API, and the proxy to Perfox. |
| [`client-ui/`](client-ui/README.md) | React 19 built by Vite. Compiles to static files. |

**In production one process serves both.** The backend serves the built
frontend itself. That is not a convenience — see warning 3.

---

## How it is deployed today

The current arrangement, which a new deployment replaces:

| | |
|---|---|
| Host | Railway |
| Edge | Cloudflare in front of it |
| Database | Railway-managed Postgres |
| Trigger | Railway redeploys when the deploy branch moves |
| Migrations | run against the production database before the new build serves traffic |

CI runs on GitHub Actions on every push — lint, typecheck, the backend suite
and the production build — and is independent of the deploy.

Everything below is written so that moving off this is a matter of
configuration rather than code: nothing in the application depends on Railway,
and the only host-specific decision left is where TLS to the database is
required (`DATABASE_SSL`, below).

---

## Five things that will bite you

### 1. Never generate a new `ENCRYPTION_KEY` for an existing database

This key encrypts every customer's Perfox API key and operator secret in the
database. It is deliberately **not** stored in the database, so a stolen backup
is worthless without it.

The consequence: **your database backups do not contain this key.** Back it up
separately or the backups are unreadable.

If the application starts against an existing database with the wrong key, it
does not crash and it does not warn. Decryption returns nothing, so every
workspace reads as *"Operator calling is not set up"*. It looks like the
configuration was wiped.

**Do not re-enter the credentials when you see that.** Saving them writes new
ciphertext over the old, and at that point the original data is unrecoverable
even if the correct key turns up later. Stop, and find the original key.

Generate one **only** for a genuinely new database:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Run one instance only

The login rate limiter — ten failed attempts in fifteen minutes, per account
and per IP — is held **in memory**.

With two instances behind a load balancer, each keeps its own count, so the
real limit becomes ten times the number of instances, and an attacker spreading
requests across them is barely limited at all. Sessions are in Postgres and are
fine; it is only the rate limiter.

Scale vertically, not horizontally, until that moves to shared storage. See
[AUTH.md](backend/AUTH.md).

### 3. `CLIENT_DIST` must be set

It points the backend at the frontend's built files, so the app and the API
answer on **one origin**.

That is what lets the session cookie stay `SameSite=Lax`, which is what makes
the browser reject cross-site requests for us. Serving the frontend from a
separate host or CDN removes that protection: it would need `SameSite=None` and
a CSRF defence that does not currently exist.

Put a CDN in front of the whole origin if you want one. Do not split the two.

### 4. Backups are yours

Postgres holds every customer's conversations metadata, users and encrypted
credentials. Nothing in this application backs itself up.

Set up automated backups, and test a restore — including that the application
starts against the restored database with the key from warning 1.

### 5. Updating the operator SDK takes three steps, not two

`@perfox/operator-react` is **not** on npm. It is a tarball committed at
`client-ui/vendor/`, handed over by the platform team.

```bash
# 1. put the new .tgz in client-ui/vendor/ and update the path in package.json
npm install
# 2. clear Vite's pre-bundled copy, then restart the dev server
rm -rf client-ui/node_modules/.vite
```

The second step is required. A running Vite pre-bundles dependencies at startup
and keeps serving that copy after `npm install` replaces the files on disk — so
the browser runs the previous version while the source on disk is the new one,
and the two do not contradict each other anywhere you would think to look.

---

## What you need

- **Node 22** (`.node-version`). The backend runs TypeScript directly via
  `--experimental-strip-types`; there is no build step for it.
- **Postgres 17.** Local development uses `backend/docker-compose.yml`;
  production expects a managed database.
- A **Perfox workspace** per customer. Their API key and operator credentials
  are entered through the admin UI after deployment, not configured here.

---

## Environment

All of it belongs to the backend. Nothing here reaches the browser bundle.

### Required

| Variable | What it is |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/dbname` |
| `ENCRYPTION_KEY` | See warning 1. Back it up separately. |

The application exits at startup if either is missing.

### Expected in production

| Variable | Set it to |
|---|---|
| `NODE_ENV` | `production` — sets `Secure` on the session cookies and turns on `trust proxy`, without which per-IP rate limiting counts the load balancer |
| `PORT` | The port to listen on. Defaults to `4300`. |
| `CLIENT_DIST` | Absolute path to `client-ui/dist`. See warning 3. |

### Optional

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_SSL` | `auto` | `auto`, `require` or `off`. See below. |
| `SESSION_TTL_DAYS` | `7` | How long a session survives unused. |
| `ALLOW_REGISTRATION` | `false` | Leave it off. Accounts are created by an administrator. |
| `OUTBOUND_ALLOWLIST` | empty | Comma-separated numbers an agent may ring. Empty means no restriction, which is correct in production — see below. |

#### `DATABASE_SSL`

Managed Postgres refuses unencrypted connections, and the driver cannot infer
that from the URL, so the application decides by looking at the host. On `auto`
it connects **without** TLS only for hosts that are clearly private:

- `localhost`, `127.0.0.1`, `::1`
- `10.x`, `192.168.x`, `172.16–31.x`
- `*.internal`, `*.flycast`
- a hostname with no dots (a Docker or Compose service name)

Everything else gets TLS. If the guess is wrong, set it explicitly — `require`
for a managed database behind a private-looking hostname, `off` for a database
genuinely on a private network the list does not recognise.

A TLS mismatch surfaces as an error that reads like a bad password. Check this
before doubting the credentials.

#### `OUTBOUND_ALLOWLIST`

A safety catch for testing against a real carrier: set it and an agent can only
ring those numbers, so a mistyped digit reaches nobody.

**Leave it empty in production.** A console whose purpose is phoning customers
cannot carry a list of permitted customers.

It guards only calls placed by an *agent*. An operator dialling from the
browser talks to Perfox directly and never passes through this process.

---

## Deploying

```bash
# 1. Build the frontend to static files
cd client-ui
npm ci
npm run build            # -> client-ui/dist

# 2. Install the backend
cd ../backend
npm ci

# 3. Apply the schema. BEFORE starting the new version, not after.
npm run migrate

# 4. Start
CLIENT_DIST=/absolute/path/to/client-ui/dist npm start
```

**Migrate before the new code takes traffic.** `schema.sql` is additive and
every statement is `IF NOT EXISTS`, so running it against a database already at
this schema does nothing. That stops being true the day a column is dropped or
renamed — and that is the day this needs a real migration tool rather than a
longer file.

### The first administrator

Nobody can sign in until an administrator exists, and one cannot be created
through the application — something has to exist before anything else can be
made.

```bash
cd backend
npm run seed:admin       # prompts for name, email, password
```

Unattended, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` first.

It **will not** reset an existing administrator. Given an email that already
exists it reports so and stops. To recover a lost administrator password,
change it in the database directly.

Then sign in at `/admin/login` and add customers there, entering each one's
Perfox credentials. See [AUTH.md](backend/AUTH.md).

### Check it came up

```bash
curl https://your-host/api/health
```

`200 {"ok":true,"database":"up"}` means the process is running **and** reached
Postgres. `503` means it is running and the database is not — which is the
failure worth alerting on.

A deploy that the platform reports as successful only means the platform
accepted it. This endpoint is the one that answers whether it works.

---

## Known limits

Not defects, but things to know before being surprised by them.

- **One instance only** — warning 2.
- **No invite flow.** Customer accounts are created by an administrator.
  Registration is disabled and the endpoint refuses even though the page is
  reachable.
- **No incoming calls.** The console places calls; it cannot receive them, and
  there is no answer UI. Operators are never marked available, so nothing is
  routed to them. See
  [client-ui/OPERATOR-INTEGRATION.md](client-ui/OPERATOR-INTEGRATION.md).
- **Administrators cannot revoke their own sessions.** Another administrator
  can.
- **Changing `ENCRYPTION_KEY` is not supported.** There is no rotation script.
  Changing it strands every stored credential — see warning 1.

---

## If something looks wrong

| Symptom | Look at |
|---|---|
| Every workspace says calling is not set up | `ENCRYPTION_KEY` — warning 1. **Do not re-enter credentials.** |
| Database error that reads like a bad password | `DATABASE_SSL`, above |
| Signed in, then signed out again immediately | `CLIENT_DIST` unset, so the app and API are on different origins |
| Health check 503 | The process is up, Postgres is not reachable |
| Rate limiting never triggers behind a proxy | `NODE_ENV` is not `production`, so `trust proxy` is off and every request looks like one IP |
| The browser behaves differently from the source on disk | A stale Vite cache — warning 5 |

---

## See also

- [AUTH.md](backend/AUTH.md) — sessions, cookies, passwords, the attempt cap
- [backend/README.md](backend/README.md) — the API, configuration, data model
- [client-ui/README.md](client-ui/README.md) — the browser half
- [client-ui/OPERATOR-INTEGRATION.md](client-ui/OPERATOR-INTEGRATION.md) —
  operator calling
