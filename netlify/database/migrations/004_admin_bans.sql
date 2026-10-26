-- StudyNest: admin ban system. Safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;

-- One row per ban. A ban is "active" while lifted_at IS NULL and (expires_at IS NULL or in the future).
CREATE TABLE IF NOT EXISTS bans (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT,
  email       TEXT,
  reason      TEXT NOT NULL DEFAULT '',
  banned_by   TEXT NOT NULL,                       -- admin email, or 'system' for automatic bans
  parent_id   BIGINT,                              -- set when the system banned a new account that used a banned device
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,                         -- NULL = permanent
  lifted_at   TIMESTAMPTZ,
  lifted_by   TEXT
);

-- What a ban blocks: the account (user), the email, and each device id the account used.
CREATE TABLE IF NOT EXISTS ban_keys (
  ban_id BIGINT NOT NULL REFERENCES bans(id) ON DELETE CASCADE,
  kind   TEXT NOT NULL CHECK (kind IN ('user', 'email', 'device')),
  value  TEXT NOT NULL,
  PRIMARY KEY (ban_id, kind, value)
);
CREATE INDEX IF NOT EXISTS ban_keys_lookup ON ban_keys (kind, value);

-- Which device ids each account has used (device id = random id kept in the browser; ip is a hash).
CREATE TABLE IF NOT EXISTS devices (
  user_id    TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  ip_hash    TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);
CREATE INDEX IF NOT EXISTS devices_by_device ON devices (device_id);

-- Things the detection rules count (AI requests, failed logins, sessions). Old rows are cleaned up automatically.
CREATE TABLE IF NOT EXISTS activity (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT,
  email      TEXT,
  device_id  TEXT,
  ip_hash    TEXT,
  type       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_user_time ON activity (user_id, type, created_at);
CREATE INDEX IF NOT EXISTS activity_email_time ON activity (email, type, created_at);

-- Unusual-activity flags. The system only flags; the admin decides whether to ban.
CREATE TABLE IF NOT EXISTS flags (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT,
  email      TEXT,
  rule       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'banned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flags_status ON flags (status, created_at);

-- Every admin action (and wrong PIN tries).
CREATE TABLE IF NOT EXISTS admin_audit (
  id          BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
