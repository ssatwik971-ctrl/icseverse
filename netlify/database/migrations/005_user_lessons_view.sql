-- StudyNest: one combined list. Shows every user (user id, name, email, banned or not) next to every lesson they saved
-- (subject, topic, mode, text, model, ...). A user with no lessons still appears, with empty lesson columns.
-- It is a VIEW: it only reads from `users` and `lessons`, so nothing is copied and it is always up to date.

CREATE OR REPLACE VIEW user_lessons AS
SELECT
  COALESCE(u.user_id, l.user_id) AS user_id,
  u.display_name,
  u.email,
  u.first_seen,
  u.last_seen,
  EXISTS (
    SELECT 1 FROM bans b JOIN ban_keys k ON k.ban_id = b.id
    WHERE k.kind = 'user' AND k.value = COALESCE(u.user_id, l.user_id)
      AND b.lifted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())
  ) AS banned,
  l.id AS lesson_id,
  l.subject, l.topic, l.mode, l.text, l.offline,
  l.model, l.fallback, l.requested_model, l.meta,
  l.created_at AS lesson_saved_at,
  l.updated_at AS lesson_updated_at
FROM users u
FULL OUTER JOIN lessons l ON l.user_id = u.user_id;
