-- StudyNest: extra lesson details so saved lessons sync fully between devices.
-- Netlify applies this after 001_create_lessons.sql during a deploy. Safe to run more than once.

-- Which model wrote the lesson, and whether the default model answered because the chosen one failed
-- (this is what drives the yellow warning on saved lessons).
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS model           TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS fallback        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS requested_model TEXT;  -- model the student selected (set when fallback is true)

-- Everything else the app remembers about a lesson (subject id, chapter, language, review progress, ...).
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS meta            JSONB NOT NULL DEFAULT '{}'::jsonb;
