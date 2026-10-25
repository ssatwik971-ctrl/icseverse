// netlify/functions/lessons.mjs
//
// Saved-lessons endpoint for StudyNest, backed by Netlify DB (Postgres).
// Served at /api/lessons (see `config.path` below, no redirect needed).
//
// Auth: Netlify Identity. The browser session cookie (nf_jwt) is sent with every
// same-site request and getUser() reads it here. No manual token handling.
//
//   GET    /api/lessons            -> the signed-in user's saved lessons
//   POST   /api/lessons            -> save (create or update) one lesson
//   DELETE /api/lessons?id=<id>    -> delete one lesson
//   DELETE /api/lessons?all=true   -> delete all of the user's lessons
//
// Needs NETLIFY_DATABASE_URL (set automatically when Netlify DB is enabled)
// and netlify/database/migrations/001 + 002 run against the database.

import { getUser } from '@netlify/identity'
import { neon } from '@netlify/neon'

export const config = { path: '/api/lessons' }

const sql = neon() // reads NETLIFY_DATABASE_URL automatically
const MODES = ['explain', 'notes', 'quiz', 'flashcards']
const MAX_TEXT = 200_000
const MAX_META = 8_000

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

// Row -> the lesson object the browser keeps in localStorage.
function shape(r) {
  const meta = r.meta && typeof r.meta === 'object' ? r.meta : {}
  return {
    ...meta,
    id: r.id,
    subject: r.subject,
    topic: r.topic,
    mode: r.mode,
    text: r.text,
    offline: !!r.offline,
    model: r.model || '',
    fallback: !!r.fallback,
    requested: r.requested_model || '',
    created: Number(r.created),
  }
}

export default async (req) => {
  let user = null
  try { user = await getUser() } catch { user = null }
  if (!user) return json(401, { error: 'Not signed in. Please log in and try again.' })
  const userId = user.id

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, subject, topic, mode, text, offline, model, fallback, requested_model, meta,
               client_created AS created
        FROM lessons
        WHERE user_id = ${userId}
        ORDER BY client_created DESC NULLS LAST, created_at DESC
        LIMIT 200
      `
      return json(200, { lessons: rows.map(shape) })
    }

    if (req.method === 'POST') {
      let body
      try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON.' }) }
      const { id, subject, topic, mode, text, offline, created, model, fallback, requested } = body || {}
      const meta = body && typeof body.meta === 'object' && body.meta ? body.meta : {}

      if (!id || !subject || !topic || !mode || !text) return json(400, { error: 'Missing required lesson fields.' })
      if (!MODES.includes(mode)) return json(400, { error: 'Invalid mode.' })
      if (String(text).length > MAX_TEXT) return json(413, { error: 'Lesson is too large to save.' })
      const metaJson = JSON.stringify(meta)
      if (new TextEncoder().encode(metaJson).length > MAX_META) return json(413, { error: 'Lesson details are too large to save.' })

      // One lesson per (user, subject, topic, mode): saving again updates it in place.
      const rows = await sql`
        INSERT INTO lessons (id, user_id, subject, topic, mode, text, offline, model, fallback, requested_model, meta, client_created, updated_at)
        VALUES (${String(id)}, ${userId}, ${String(subject)}, ${String(topic)}, ${mode}, ${String(text)}, ${!!offline},
                ${model || null}, ${!!fallback}, ${fallback ? (requested || null) : null}, ${metaJson}::jsonb,
                ${Number(created) || Date.now()}, now())
        ON CONFLICT (user_id, subject, topic, mode)
        DO UPDATE SET
          text = EXCLUDED.text,
          offline = EXCLUDED.offline,
          model = EXCLUDED.model,
          fallback = EXCLUDED.fallback,
          requested_model = EXCLUDED.requested_model,
          meta = EXCLUDED.meta,
          client_created = EXCLUDED.client_created,
          updated_at = now()
        RETURNING id, subject, topic, mode, text, offline, model, fallback, requested_model, meta,
                  client_created AS created
      `
      return json(200, { lesson: shape(rows[0]) })
    }

    if (req.method === 'DELETE') {
      const params = new URL(req.url).searchParams
      if (params.get('all') === 'true') {
        await sql`DELETE FROM lessons WHERE user_id = ${userId}`
        return json(200, { deleted: 'all' })
      }
      const id = params.get('id')
      if (id) {
        await sql`DELETE FROM lessons WHERE user_id = ${userId} AND id = ${id}`
        return json(200, { deleted: id })
      }
      return json(400, { error: 'Pass ?id=<lessonId> or ?all=true.' })
    }

    return json(405, { error: 'Method not allowed.' })
  } catch (err) {
    console.error('lessons function error:', err)
    return json(500, { error: 'Something went wrong with your saved lessons. Please try again.' })
  }
}
