-- StudyNest: lessons table
-- Run this once against your Netlify DB (Postgres) to set up storage for saved lessons.
-- Each lesson belongs to a Netlify Identity user, referenced by their Identity user_id (a UUID/string).
-- No separate "users" table is needed — accounts/passwords stay fully in Netlify Identity.

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,                 -- matches the client-side id (e.g. "m2k3j1ab12")
  user_id     TEXT NOT NULL,                     -- Netlify Identity user id (the JWT "sub" claim)
  subject     TEXT NOT NULL,                     -- e.g. "Biology"
  topic       TEXT NOT NULL,                     -- e.g. "Tissues"
  mode        TEXT NOT NULL CHECK (mode IN ('explain', 'notes', 'quiz', 'flashcards')),
  text        TEXT NOT NULL,                     -- the lesson content (markdown)
  offline     BOOLEAN NOT NULL DEFAULT FALSE,    -- true if generated from the offline fallback, not AI
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),-- server-side save time
  client_created BIGINT,                         -- original Date.now() from the browser, kept for display/sort parity
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast "give me this user's lessons" lookups, newest first
CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons (user_id, created_at DESC);

-- Mirrors the client's de-duplication rule: one lesson per (subject, topic, mode) per user.
-- Re-saving the same subject+topic+mode overwrites the existing row (see ON CONFLICT in the functions).
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_user_subject_topic_mode
  ON lessons (user_id, subject, topic, mode);
