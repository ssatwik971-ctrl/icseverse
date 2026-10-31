-- StudyNest: one generic table for everything a student creates besides saved lessons
-- (notes, flashcards with their review schedule, quiz and exam results, practice papers, settings, achievements).
-- Every row belongs to one Netlify Identity user. The function always filters by the verified user id.
-- Deleting a record keeps a small "deleted" row (a tombstone) so the delete reaches the student's other devices. Safe to run more than once.

CREATE TABLE IF NOT EXISTS user_data (
  user_id        TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('note','card','attempt','paper','mistake','setting','award','coach','activity')),
  id             TEXT NOT NULL CHECK (char_length(id) BETWEEN 1 AND 80),
  data           JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  client_updated BIGINT NOT NULL,                  -- the student's own edit time (ms); the newest edit wins
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, id)
);

CREATE INDEX IF NOT EXISTS idx_user_data_sync ON user_data (user_id, updated_at);
