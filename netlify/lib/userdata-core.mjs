// Core of /api/userdata. It has no Netlify imports so it can be tested with a fake or a real database.
// Safety rule: every query is filtered by user.id, and that id comes from the verified Netlify Identity session,
// never from the request body or the URL.

export const KINDS = ['note', 'card', 'attempt', 'paper', 'mistake', 'setting', 'award', 'coach', 'activity']
export const MAX_RECORD = 200_000 // bytes of JSON per record
export const MAX_BATCH = 50
export const MAX_ROWS = 5000 // records per student
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/
const PAGE = 2000

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

// Returns { rec } or { error }.
export function validateRecord(r, now = Date.now()) {
  if (!r || typeof r !== 'object') return { error: 'Bad record.' }
  if (!KINDS.includes(r.kind)) return { error: 'Unknown kind.' }
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return { error: 'Bad id.' }
  const t = Number(r.updatedAt)
  if (!Number.isFinite(t) || t <= 0) return { error: 'Bad time.' }
  const deleted = r.deleted === true
  const data = deleted ? {} : r.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Bad data.' }
  const text = JSON.stringify(data)
  if (new TextEncoder().encode(text).length > MAX_RECORD) return { error: 'Record too large.' }
  return { rec: { kind: r.kind, id: r.id, text, deleted, updatedAt: Math.min(Math.floor(t), now + 5 * 60_000) } }
}

// deps: { user, sql, rateLimited?, checkBan?(sql, user, req) }
export async function handle(req, deps) {
  const { user, sql } = deps
  if (!user || !user.id) return json(401, { error: 'Not signed in. Please log in and try again.' })
  const userId = String(user.id)
  const wait = deps.rateLimited ? deps.rateLimited('ud:' + userId) : 0
  if (wait) return json(429, { error: 'Too many requests. Please wait a moment and try again.' }, { 'Retry-After': String(wait) })
  try {
    if (deps.checkBan) { const ban = await deps.checkBan(sql, user, req); if (ban) return json(403, ban) }

    if (req.method === 'GET') {
      const since = Math.max(0, Number(new URL(req.url).searchParams.get('since')) || 0)
      const rows = await sql`
        SELECT kind, id, data, deleted, client_updated, (extract(epoch from updated_at) * 1000)::bigint AS server_ms
        FROM user_data
        WHERE user_id = ${userId} AND updated_at > to_timestamp(${since}::double precision / 1000.0)
        ORDER BY updated_at ASC, kind, id
        LIMIT ${PAGE + 1}`
      const more = rows.length > PAGE, page = more ? rows.slice(0, PAGE) : rows
      const now = (await sql`SELECT (extract(epoch from now()) * 1000)::bigint AS now`)[0].now
      return json(200, {
        records: page.map((r) => ({ kind: r.kind, id: r.id, data: r.data || {}, deleted: !!r.deleted, updatedAt: Number(r.client_updated) })),
        more, next: more ? Number(page[page.length - 1].server_ms) : null, now: Number(now),
      })
    }

    if (req.method === 'POST') {
      let body; try { body = await req.json() } catch { return json(400, { error: 'Invalid JSON.' }) }
      const list = body && Array.isArray(body.records) ? body.records : null
      if (!list || !list.length) return json(400, { error: 'Send { records: [...] }.' })
      if (list.length > MAX_BATCH) return json(413, { error: 'Send at most ' + MAX_BATCH + ' records at a time.' })
      const clean = []
      for (const r of list) { const v = validateRecord(r); if (v.error) return json(400, { error: v.error }); clean.push(v.rec) }
      const n = (await sql`SELECT count(*)::int AS n FROM user_data WHERE user_id = ${userId}`)[0].n
      if (n + clean.length > MAX_ROWS) return json(413, { error: 'You have reached the storage limit for saved study data.' })
      for (const r of clean) {
        await sql`
          INSERT INTO user_data (user_id, kind, id, data, deleted, client_updated, updated_at)
          VALUES (${userId}, ${r.kind}, ${r.id}, ${r.text}::jsonb, ${r.deleted}, ${r.updatedAt}, now())
          ON CONFLICT (user_id, kind, id) DO UPDATE SET
            data = EXCLUDED.data, deleted = EXCLUDED.deleted, client_updated = EXCLUDED.client_updated, updated_at = now()
          WHERE user_data.client_updated < EXCLUDED.client_updated`
      }
      return json(200, { saved: clean.length })
    }

    if (req.method === 'DELETE') {
      if (new URL(req.url).searchParams.get('all') !== 'true') return json(400, { error: 'Pass ?all=true to delete all of your study data.' })
      await sql`DELETE FROM user_data WHERE user_id = ${userId}`
      return json(200, { deleted: 'all' })
    }
    return json(405, { error: 'Method not allowed.' })
  } catch (err) {
    console.error('userdata error:', err && err.message)
    return json(500, { error: 'Something went wrong with your study data. Please try again.' })
  }
}
