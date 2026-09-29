# Authentication

Two separate sign-in systems, one mechanism. This describes both: how they
work, how they are built, how to configure them, and what happens on each
request.

---

## Two surfaces

```
/login         customers        → the console
/admin/login   administrators   → customer provisioning
```

They are not two roles in one system. They are two systems.

| | Customers | Administrators |
|---|---|---|
| Sign in at | `POST /api/auth/login` | `POST /api/admin/login` |
| Cookie | `ufsid` | `ufasid` |
| Account table | `users` | `admins` |
| Session table | `sessions` | `admin_sessions` |
| Guard | `requireAuth` | `requireAdmin` |
| Router | `routes/auth.ts`, `routes/perfox.ts` | `routes/admin.ts` |
| Reaches | their own workspace | every customer, no workspace data |

**An administrator session cannot satisfy a customer route, and a customer
session cannot reach the admin API.** Not because a role is checked — because
the two guards read different cookies and query different tables. There is no
value a customer could hold that would make `requireAdmin` pass.

An administrator who wants to see the console signs in as a customer, with a
customer account.

---

## How a session works

No JWTs. A session is a row in the database and an opaque token in a cookie.

**On sign in:**

1. 32 random bytes become the token.
2. Its SHA-256 hash is stored in `sessions`, with the user, an expiry, the user
   agent and the IP.
3. The token itself goes to the browser in a cookie. It is never stored
   anywhere on the server.

```js
res.cookie('ufsid', token, {
  httpOnly: true,     // unreachable from JavaScript
  sameSite: 'lax',    // the CSRF defence
  secure: IS_PROD,    // off in development so plain-HTTP localhost works
  path: '/',
  expires,            // SESSION_TTL_DAYS from now
})
```

**On every request**, the guard hashes the cookie it was given and looks for a
row:

```sql
SELECT u.* FROM sessions s
  JOIN users u      ON u.id = s.user_id
  JOIN workspaces w ON w.id = u.workspace_id
 WHERE s.token_hash = $1
   AND s.expires_at > now()
   AND u.status = 'active'
   AND w.status = 'active'
```

Four conditions, all in one query. A token that does not match, a session that
has expired, a suspended user and a suspended workspace all produce the same
answer: no user, so `401`.

Three properties fall out of this:

- **The session table cannot be used to sign in.** It holds hashes. Full read
  access to the database does not let anyone impersonate a user.
- **Suspension takes effect on the next request**, not whenever the cookie
  happens to expire, because status is checked on every request rather than
  only at sign-in.
- **Signing someone out is deleting a row.** No revocation list, no token
  blacklist, nothing to keep in sync.

Expired rows are swept on boot and once a day.

### Why not JWTs

Two reasons, and the second decided it.

A token in `localStorage` is readable by any injected script. An httpOnly
cookie is not reachable from JavaScript at all.

And a JWT stays valid until it expires. Suspending a user, or signing them out
everywhere, would need a revocation list — and once a list is being checked on
every request, the database cost has been paid and none of the statelessness
that justified the JWT remains. This backend already reads the database on
every proxied request to find the caller's workspace credentials, so there was
never any statelessness to protect.

### One origin

`SameSite=Lax` is what blocks cross-site request forgery here, and it works
because the app and the API answer on the same host — Vite proxies in
development, the backend serves the built frontend in production.

Splitting them across hosts would force `SameSite=None` and a CSRF defence
written by hand. See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## The sign-in flow

```
browser                     backend                        database
   │  POST /api/auth/login     │                               │
   │  { email, password }      │                               │
   ├──────────────────────────►│                               │
   │                           │  rate limit: IP and email     │
   │                           │  under 10 failures / 15 min?  │
   │                           │                               │
   │                           │  find user by email ──────────►
   │                           │  ◄─── row, with workspace status
   │                           │                               │
   │                           │  argon2 verify                │
   │                           │  (or burn the same time       │
   │                           │   when there is no such user) │
   │                           │                               │
   │                           │  INSERT session ──────────────►
   │  ◄── Set-Cookie: ufsid    │                               │
   │      { user, workspace }  │                               │
```

Every failure returns **one message and one shape** — wrong password, no such
account, suspended user, suspended workspace. Separate answers would let anyone
confirm which email addresses have access. When there is no such user the
backend verifies a decoy hash first, so an unknown address does not return
measurably faster than a known one.

### What the browser is told

```json
{
  "user":      { "id", "name", "email", "mobile", "role" },
  "workspace": { "name", "configured", "callingConfigured" }
}
```

A name and two booleans. **No API base, and no token.** The workspace's Perfox
key stays in the backend: the browser calls `/api/perfox/*` and this process
decides which workspace that means.

A key in a login response would be readable in devtools by anyone who could
sign in, would outlive their session, and would let them bypass every
permission added later. A browser test fails if a key ever becomes readable
from the page, in markup, storage or cookies.

### Checking who is signed in

`GET /api/auth/me` returns `{ user: null, workspace: null }` with a **200** when
nobody is signed in — not a 401. A first visit is a signed-out visit, and a 401
would have every cold load log an error in the console.

---

## Passwords

**argon2id**, at the library's defaults. Chosen over bcrypt because it is
memory-hard: a GPU or ASIC farm gains far less against it, which is the whole
threat model for a stolen password table.

The parameters are deliberately not tuned. argon2's defaults track current
OWASP guidance; a number invented today is a number nobody revisits in three
years.

**The only rule is length:** at least 12 characters, at most 200.

Composition rules — a capital, a digit, a symbol — push people towards
`Password1!` and towards reuse. A long passphrase and a password manager both
pass as they are.

Verification returns false rather than throwing on a malformed hash. A row
whose hash cannot be parsed must fail the sign-in, not 500 — a 500 tells
whoever is probing that this particular account is interesting.

---

## Rate limiting

Ten failures in fifteen minutes locks sign-in for fifteen minutes.

Counted **per email address and per IP**, and both must be under the limit:

- per IP alone lets one attacker spread across a botnet
- per address alone lets them try one password against every account they can name

A success clears the address, so someone who mistypes twice and then gets it
right is not locked out.

argon2 is most of the defence — every guess is expensive by construction. This
is what stops someone working steadily through a list overnight.

**The counter is in memory.** With more than one instance each keeps its own
count, and the effective limit becomes ten times the number of instances. Run
one instance until this moves to shared storage — see
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Suspension and revocation

Status is checked on every request, so both kinds of suspension take effect
immediately.

| Action | Effect |
|---|---|
| Suspend a **workspace** | every user in it is signed out, and cannot sign in again |
| Suspend a **user** | that person only |
| Suspend an **administrator** | their sessions are deleted at the same time |
| Reset a customer's password | their existing sessions are deleted |
| Change your own password | your other sessions are deleted |

Sessions are deleted rather than marked, so there is no state to reconcile.

---

## Accounts

**Customers cannot create their own accounts.** `POST /api/auth/register`
refuses unless `ALLOW_REGISTRATION` is exactly `"true"`, and it is not. The
console reads real customer conversations, so a public sign-up form is a door
onto them.

The endpoint exists so the page has something to talk to, and refuses so that
shipping it changes nothing.

Accounts are created by an administrator, under `/admin`, along with the
workspace they belong to. A generated password is shown once, to be handed over.

**The first administrator cannot be made through the app** — something has to
exist before anything else can be created:

```bash
cd backend
npm run seed:admin        # prompts for name, email, password
```

Unattended, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` first. Given an
email that already exists it reports so and stops, so it is safe to re-run. It
will not reset an existing administrator; to recover a lost administrator
password, change the row in the database.

---

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `SESSION_TTL_DAYS` | `7` | how long a session survives without being used |
| `ALLOW_REGISTRATION` | `false` | self-service sign-up. Leave it off |
| `NODE_ENV` | `development` | `production` sets `Secure` on both cookies and turns on `trust proxy` |
| `ENCRYPTION_KEY` | — | not used for sessions; encrypts workspace credentials |

Both cookies use the same TTL. Nothing else about authentication is
configurable: the password floor, the attempt limit and the lockout window are
constants in `auth/password.ts` and `auth/rate-limit.ts`.

**In production, `NODE_ENV=production` matters more than it looks.** It sets
`Secure` on the session cookies, so they are only ever sent over HTTPS, and
turns on `trust proxy` so `req.ip` is the real client address rather than the
load balancer's — which is what makes per-IP rate limiting mean anything.

---

## In the frontend

Two providers, two gates, mounted separately.

```jsx
<Route element={<RequireSession />}>      {/* the console  */}
<Route element={<RequireAdmin />}>        {/* /admin/*     */}
```

Each asks its own `/me` endpoint once and holds the answer:

- `loading` → a page skeleton, so nothing flashes
- `signed-out` → redirect to the right sign-in page
- otherwise → the shell and the routes inside it

`RequireSession` carries the path the user was heading for, so signing in
resumes it instead of dropping them on the dashboard.

The admin provider is mounted **inside** the `/admin/*` routes rather than
around the whole app, so a customer's browser never calls `/api/admin/me` at
all — there is nothing there for it, and asking would add a request to every
cold load of the console.

Neither the browser nor the frontend code ever reads a token. The cookie is
`httpOnly`; `fetch` sends it because it is same-origin, and that is the whole
of the client's involvement.

---

## Using it

```bash
# first administrator
cd backend && npm run seed:admin

# sign in at /admin/login, then create a customer there:
#   name, email, and their workspace's Perfox credentials
#   a generated password is shown once — hand it over

# the customer signs in at /login
```

To change a password: the account holder does it from the app
(`POST /api/auth/password` or `/api/admin/password`, both requiring the current
one). An administrator who needs to let a customer back in issues a new
password from the customer's row, which signs that customer out everywhere.

---

## Where it lives

```
backend/src/auth/
├── session.ts         customer sessions: create, destroy, currentUser, requireAuth
├── admin-session.ts   the same for administrators, against its own table
├── password.ts        argon2id, the decoy hash, the length rule
└── rate-limit.ts      the attempt cap

backend/src/routes/
├── auth.ts            login, logout, me, password, register
└── admin.ts           the administration surface, all behind requireAdmin

backend/src/crypto.ts  hashToken, newToken, and the constant-time compare
backend/src/db/schema.sql   users, sessions, admins, admin_sessions

client-ui/src/lib/
├── session.tsx        the customer session and its gate
└── admin.tsx          the administrator session and its gate
```

Covered by `backend/tests/auth.test.ts`, `admin.test.ts` and `tenancy.test.ts`
— the last one checks that one customer's session cannot read another's
workspace.

---

## See also

- [backend/README.md](backend/README.md) — the API this sits inside
- [DEPLOYMENT.md](DEPLOYMENT.md) — `NODE_ENV`, one instance, and HTTPS
- [client-ui/README.md](client-ui/README.md) — the two sign-in surfaces as pages
