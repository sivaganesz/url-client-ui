# URL Factory

A multi-tenant console for Perfox workspaces.

Each customer signs in and sees their own workspace — conversations, customers,
AI agents, knowledge base, analytics — and can phone a customer from the page,
with their own microphone on the line. Administrators provision those customers
from a separate surface.

Two halves, one deployable:

| | |
|---|---|
| [`client-ui/`](client-ui/README.md) | React 19 + Vite + Tailwind. Builds to static files. |
| [`backend/`](backend/README.md) | Express 5 on Node 22, Postgres 17. The API, and the proxy to Perfox. |

In production the backend serves the built frontend, so the app and the API
answer on **one origin**. That is what lets the session cookie stay
`SameSite=Lax` and have the browser block cross-site request forgery without
the application writing anything.

---

## Quick start

Postgres, the schema, an administrator, then both halves:

```bash
# 1. database and backend
cd backend
docker compose up -d                 # Postgres on :5433
npm install
cp .env.example .env                 # then fill in ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm run migrate
npm run seed:admin                   # the first administrator
npm run dev                          # API on :4300

# 2. frontend, in another terminal
cd client-ui
npm install
npm run dev                          # app on :5180
```

Open **http://localhost:5180/admin/login**, sign in as the administrator you
just created, and add a customer with their Perfox credentials. That customer
then signs in at **/login**.

To create the two accounts the browser tests use instead, run `npm run seed:dev`
in `backend/`.

---

## Documentation

| | |
|---|---|
| [AUTH.md](backend/AUTH.md) | Sessions, cookies, passwords, the attempt cap, and the two sign-in surfaces |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How it is deployed today, and how to run it on your own server |
| [backend/README.md](backend/README.md) | The API, configuration, data model, the Perfox proxy |
| [client-ui/README.md](client-ui/README.md) | Every page, the folder structure, how data reaches the browser |
| [client-ui/OPERATOR-INTEGRATION.md](client-ui/OPERATOR-INTEGRATION.md) | Operator calling in depth — signing, the SDK, the call panel, troubleshooting |
| [client-ui/tests/README.md](client-ui/tests/README.md) | How the browser suite is organised |

Start with this page and the two READMEs. Go into `AUTH.md` and
`OPERATOR-INTEGRATION.md` when you need the detail.

**Deploying for the first time? Read the five warnings at the top of
[DEPLOYMENT.md](DEPLOYMENT.md) before anything else.** One of them —
`ENCRYPTION_KEY` — is the only mistake in this system that cannot be undone.

---

## Layout

```
url-factory/
├── backend/            the API, sessions, the Perfox proxy
├── client-ui/          the browser console
├── .github/workflows/  CI, and the browser suite
├── .node-version       22
└── package.json        scripts that drive both halves
```

### Root scripts

For a server, where both halves are built and run together:

```bash
npm run build       # build the frontend, then install backend production deps
npm run migrate     # apply the schema
npm run seed:admin  # create an administrator
npm start           # run the backend, which serves the built frontend
```

Each half has its own scripts for working inside it — see its README.

---

## Checks

```bash
cd backend    && npm run lint && npm run typecheck && npm test   # 100 tests
cd client-ui  && npm run lint && npm run typecheck && npm test   #  92 tests
```

**CI runs on every push**: lint, typecheck, the backend suite and the
production build, both halves. The backend tests run against a throwaway
Postgres and an in-process fake Perfox, so nothing reaches the real platform
and no test needs a key.

The browser suite drives a real browser against a real workspace. It is
manual-only (`workflow_dispatch`) because it needs live credentials — the
workflow names the six repository secrets required to schedule it.

---

## How it fits together

```
browser ──(session cookie)──▶ backend ──(that customer's key)──▶ Perfox
```

**The browser never holds a Perfox credential.** A workspace key authorises
everything in that workspace, and anything in client-side JavaScript is
readable by whoever opens devtools. So the browser holds an `httpOnly` session
cookie it cannot read, and the backend resolves the signed-in user's workspace
on every request.

Keys are encrypted at rest with `ENCRYPTION_KEY`, and are in the clear only in
memory, for the length of one request.

Operator calling is the exception: audio runs browser-to-Perfox over WebRTC,
and the backend only issues a signed identity and ends calls reliably. See
[OPERATOR-INTEGRATION.md](client-ui/OPERATOR-INTEGRATION.md).

---

## Requirements

- **Node 22** — the backend runs TypeScript directly with
  `--experimental-strip-types`, so it has no build step
- **Postgres 17** — `backend/docker-compose.yml` for development, a managed
  database in production
- **A Perfox workspace per customer** — credentials are entered through the
  admin UI, not configured in the repository
