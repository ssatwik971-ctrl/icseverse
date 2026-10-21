// netlify/functions/lessons.js
//
// CRUD endpoint for StudyNest saved lessons, backed by Netlify DB (Postgres).
// Auth: Netlify Identity. Netlify verifies the Identity JWT itself before this
// function runs, and exposes the logged-in user as context.clientContext.user.
// No manual token verification is needed here.
//
// Routes (all under /.netlify/functions/lessons, or /api/lessons if redirected there):
//   GET    /lessons            -> list the current user's saved lessons
//   POST   /lessons            -> save (create or upsert) a lesson
//   DELETE /lessons?id=<id>    -> delete one lesson by id
//   DELETE /lessons?all=true   -> delete all of the current user's lessons ("Clear all")
//
// Required environment variable (set automatically when you enable Netlify DB,
// or manually if you provisioned Postgres another way):
//   NETLIFY_DATABASE_URL

const { neon } = require('@netlify/neon');

const sql = neon(); // reads NETLIFY_DATABASE_URL automatically

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return json(401, { error: 'Not signed in. Please log in and try again.' });
  }
  const userId = user.sub;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT id, subject, topic, mode, text, offline, client_created AS created
        FROM lessons
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 200
      `;
      // Shape matches the client's localStorage lesson objects exactly.
      const lessons = rows.map(r => ({
        id: r.id,
        subject: r.subject,
        topic: r.topic,
        mode: r.mode,
        text: r.text,
        offline: r.offline,
        created: Number(r.created),
      }));
      return json(200, { lessons });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { id, subject, topic, mode, text, offline, created } = body;

      if (!id || !subject || !topic || !mode || !text) {
        return json(400, { error: 'Missing required lesson fields.' });
      }
      if (!['explain', 'notes', 'quiz', 'flashcards'].includes(mode)) {
        return json(400, { error: 'Invalid mode.' });
      }

      // Upsert on the same (user_id, subject, topic, mode) uniqueness rule the
      // client already uses for de-duplication, so re-saving overwrites in place.
      const rows = await sql`
        INSERT INTO lessons (id, user_id, subject, topic, mode, text, offline, client_created, updated_at)
        VALUES (${id}, ${userId}, ${subject}, ${topic}, ${mode}, ${text}, ${!!offline}, ${created || Date.now()}, now())
        ON CONFLICT (user_id, subject, topic, mode)
        DO UPDATE SET
          text = EXCLUDED.text,
          offline = EXCLUDED.offline,
          client_created = EXCLUDED.client_created,
          updated_at = now()
        RETURNING id, subject, topic, mode, text, offline, client_created AS created
      `;
      const saved = rows[0];
      return json(200, {
        lesson: {
          id: saved.id,
          subject: saved.subject,
          topic: saved.topic,
          mode: saved.mode,
          text: saved.text,
          offline: saved.offline,
          created: Number(saved.created),
        },
      });
    }

    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      if (params.all === 'true') {
        await sql`DELETE FROM lessons WHERE user_id = ${userId}`;
        return json(200, { deleted: 'all' });
      }
      if (params.id) {
        await sql`DELETE FROM lessons WHERE user_id = ${userId} AND id = ${params.id}`;
        return json(200, { deleted: params.id });
      }
      return json(400, { error: 'Pass ?id=<lessonId> or ?all=true.' });
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (err) {
    console.error('lessons function error:', err);
    return json(500, { error: 'Something went wrong saving your lessons. Please try again.' });
  }
};
