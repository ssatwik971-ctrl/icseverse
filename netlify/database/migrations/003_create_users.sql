-- StudyNest: who is who. Maps each Netlify Identity user_id (used in lessons.user_id) to a display name and email.
-- Filled automatically by the lessons function each time a signed-in user uses the site. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  user_id      TEXT PRIMARY KEY,                 -- same value as lessons.user_id
  display_name TEXT,
  email        TEXT,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now()
);
