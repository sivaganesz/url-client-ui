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
