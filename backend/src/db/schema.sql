-- Schema for the console's own data: who may sign in, and which Perfox
-- workspace each of them reaches.
--
-- Nothing here duplicates Perfox. Conversations, agents and calls stay in the
-- workspace; this database holds only the identity and credentials needed to
-- reach one on a user's behalf.

CREATE TABLE IF NOT EXISTS workspaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT        NOT NULL,

  -- The REST credentials. The base is stored without a trailing slash: the
  -- Perfox API answers an unknown path with 401 rather than 404, so a stray
  -- slash builds "//agents" and reads exactly like a bad key.
  perfox_api_base         TEXT,
  -- Encrypted at rest (AES-256-GCM). This key authorises everything in the
  -- workspace, so a database leak must not hand over every tenant's data.
  perfox_api_token_enc    TEXT,

  -- Operator calling. A different credential entirely: a workspace key does
  -- not authorise the operator surface and this secret does not authorise the
  -- REST API. Per workspace, because each has its own site.
  operator_api_host       TEXT,
  operator_site_id        TEXT,
  operator_site_secret_enc TEXT,
  operator_workflow_id    TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suspending a customer, as opposed to suspending one person in it.
--
-- users.status stops one member signing in. This stops the account: every
-- session in the workspace goes and none of them can be replaced. With one
-- owner per workspace the two look identical today, which is exactly why the
-- difference is worth making now — once a customer can invite a colleague, a
-- suspension that only reached the owner would leave the account running.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check
  CHECK (status IN ('active', 'suspended'));

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Every user belongs to exactly one workspace, and deleting the workspace
  -- takes its users with it. There is no user without a workspace to be in.
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  name          TEXT NOT NULL,
  -- Stored lowercase; the UNIQUE index below is what actually enforces that
  -- two people cannot register the same address in different cases.
  email         TEXT NOT NULL,
  mobile        TEXT,
  password_hash TEXT NOT NULL,

  -- 'owner' is the client we set up; 'member' is anyone they later invite.
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  -- Suspending beats deleting: the audit trail survives and sessions can be
  -- cut off in the same move.
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_workspace_idx ON users (workspace_id);

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 of the cookie value, never the value itself. Someone reading this
  -- table cannot use what they find to impersonate anyone, the same reason
  -- passwords are not stored either.
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Kept for the "signed in from" list a user should eventually be able to
  -- see and revoke. Not used yet.
  user_agent  TEXT,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- ── administration ─────────────────────────────────────────────────────
--
-- Admins are a separate table rather than a role on the users table, because
-- they can create workspaces and write raw Perfox API keys — a different
-- privilege class, not a different row in the same one.
--
-- The separation does work that a guard would otherwise have to remember: an
-- admin has no workspace_id anywhere, so an admin session cannot resolve a
-- workspace and cannot reach the proxy at all. Not "is refused" — cannot. And
-- no column exists that would turn a customer into an admin.
--
-- Line comments, not block comments: Postgres NESTS /* */, so a path like
-- /api/perfox/* inside one opens a comment that is never closed, and the whole
-- migration fails with "unterminated comment" pointing at the wrong place.

CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one admin is seeded, but more than one is allowed on purpose: a single
-- shared login is how credentials end up being passed around in chat.
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_key ON admins (lower(email));

-- A separate session table, not a nullable column on the customer one.
--
-- A customer's session row can never authenticate an admin request, because
-- the lookup reads a different table entirely — and the two surfaces use
-- different cookie names, so one cannot be replayed at the other.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  admin_id    UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);

-- What an admin did.
--
-- Everything on the admin surface creates or takes away somebody's access, or
-- changes a credential that reaches a customer's data, and until this table
-- existed none of it left a trace: "who suspended Northwind, and when?" had no
-- answer, and neither did "was that key changed before or after they said it
-- stopped working?".
--
-- The admin's email is copied in rather than only referenced. An account can be
-- suspended and a row here has to stay readable regardless — an audit trail
-- that starts saying "unknown" about its most interesting entries is not one.
--
-- Nothing secret is recorded. `detail` holds what changed, never what it
-- changed to: "perfox_api_token" is the fact, and the token itself must not be
-- in a table that exists to be read.
CREATE TABLE IF NOT EXISTS admin_events (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     UUID REFERENCES admins(id) ON DELETE SET NULL,
  admin_email  TEXT NOT NULL,

  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  -- The name at the time, so a renamed or removed workspace still reads.
  target_label TEXT,

  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_events_recent_idx ON admin_events (created_at DESC);
