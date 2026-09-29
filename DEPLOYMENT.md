# Running this on your own server

Written for whoever is deploying this for the first time. It assumes you have
never seen the codebase.

Read **Five things that will bite you** before you deploy anything. The rest is
ordinary.

---

## What this is

A multi-tenant console. Each customer has their own Perfox workspace, and this
app talks to those workspaces on their behalf — conversations, documents,
analytics, and outbound phone calls placed from the browser.

Two halves in one repository:

| | |
|---|---|
| `backend/` | Express 5 on Node 22, Postgres. The API, and the proxy to Perfox. |
| `client-ui/` | React 19 built by Vite. Compiles to static files. |

**In production one process serves both.** The backend serves the built
frontend itself. That is not a convenience — see warning 3.

---

## Five things that will bite you

### 1. Never generate a new `ENCRYPTION_KEY` for an existing database

This key encrypts every customer's Perfox API key and operator secret in the
database. It is deliberately **not** stored in the database, so a stolen
backup is worthless without it.

The consequence: **your database backups do not contain this key.** Back it up
separately or the backups are unreadable.

If you start the app against an existing database with the wrong key, it does
not crash and it does not warn you. Decryption returns nothing, so every
workspace simply reads as *"Operator calling is not set up"*. It looks like
the configuration was wiped.

**Do not re-enter the credentials when you see that.** Saving them writes new
ciphertext over the old, and at that point the original data is gone even if
the correct key turns up later. Stop, and find the original key.

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

Scale vertically, not horizontally, until that moves to shared storage.

### 3. `CLIENT_DIST` must be set

It points the backend at the frontend's built files, so the app and the API
answer on **one origin**.

That is what lets the session cookie stay `SameSite=Lax`, which is what makes
the browser reject cross-site requests for us. Serve the frontend from a
separate host or CDN and that protection is gone: you would need
`SameSite=None` and a CSRF defence that does not currently exist.

Put a CDN in front of the whole origin if you want one. Do not split the two.

### 4. Backups are yours now

Postgres holds every customer's conversations, documents metadata, users and
encrypted credentials. Nothing in this application backs itself up.

Set up automated backups, and test a restore — including that the app starts
against the restored database with the key from warning 1.

### 5. Updating the operator SDK takes three steps, not one

`@perfox/operator-react` is **not** on npm. It is a tarball committed at
`client-ui/vendor/`, handed over by the platform team.

```bash
# 1. put the new .tgz in client-ui/vendor/ and update the path in package.json
# 2.
npm i
# 3. THIS ONE. Without it a running dev server keeps serving the old copy.
rm -rf client-ui/node_modules/.vite
```

Skipping step 3 costs hours. The files on disk are correct, the browser runs
the previous version, and the app misbehaves in ways that do not match the
code you are reading. Restart the dev server after clearing that cache.

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

The app exits at startup if either is missing.

### Expected in production

| Variable | Set it to |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | The port to listen on. Defaults to `4300`, which is also what development uses. |
| `CLIENT_DIST` | Absolute path to `client-ui/dist`. See warning 3. |

### Optional

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_SSL` | `auto` | `auto`, `require` or `off`. See below. |
| `SESSION_TTL_DAYS` | `7` | How long a session survives unused. |
| `ALLOW_REGISTRATION` | `false` | Leave it off. Accounts are created by an admin. |
| `OUTBOUND_ALLOWLIST` | empty | Comma-separated numbers an agent may ring. Empty means no restriction, which is correct in production — see below. |

#### `DATABASE_SSL`

Managed Postgres refuses unencrypted connections, and the driver cannot infer
that from the URL, so the app decides by looking at the host. On `auto` it
connects **without** TLS only for hosts that are clearly private:

- `localhost`, `127.0.0.1`, `::1`
- `10.x`, `192.168.x`, `172.16–31.x`
- `*.internal`, `*.flycast`
- a hostname with no dots (a Docker or Compose service name)

Everything else gets TLS. If the guess is wrong, set it explicitly — `require`
for a managed database behind a private-looking hostname, `off` for a database
genuinely on a private network the list does not recognise.

If TLS is wrong you will see an error that reads like a bad password. Check
this before you doubt the credentials.

#### `OUTBOUND_ALLOWLIST`

A safety catch for testing against a real carrier: set it and an agent can only
ring those numbers, so a mistyped digit reaches nobody.

**Leave it empty in production.** A console whose purpose is phoning customers
cannot carry a list of permitted customers.

It only guards calls placed by an *agent*. An operator dialling from the
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

### The first admin

Nobody can sign in until an admin exists, and an admin cannot be created
through the app — something has to exist before anything else can be made.

```bash
cd backend
npm run seed:admin       # prompts for name, email, password
```

Unattended, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` first.

It **will not** reset an existing admin. Given an email that already exists it
reports so and stops. To recover a lost admin password, change it in the
database directly.

Then sign in at `/admin/login` and add customers there, entering each one's
Perfox credentials.

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

Not bugs, but things to know before you are surprised by them.

- **One instance only** — warning 2.
- **No invite flow.** Customer accounts are created by an admin. Registration
  is disabled and the endpoint refuses even if the page is reachable.
- **No incoming calls.** The console places calls; it cannot receive them, and
  there is no answer UI. Operators are never marked available, so nothing is
  routed to them.
- **Admins cannot revoke their own sessions.** Another admin can.
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
| The app behaves in ways the code does not explain | A stale Vite cache — warning 5 |
