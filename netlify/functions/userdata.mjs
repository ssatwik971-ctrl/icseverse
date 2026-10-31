// netlify/functions/userdata.mjs
//
// Cloud copy of the student's notes, flashcards, results, papers and settings, served at /api/userdata.
//   GET    /api/userdata?since=<ms>   -> records changed since that time
//   POST   /api/userdata              -> { records: [{ kind, id, data, updatedAt, deleted }] } (max 50)
//   DELETE /api/userdata?all=true     -> delete all of this student's study data
// Auth is the Netlify Identity session cookie, exactly like /api/lessons. The files in netlify/database/migrations/ create the table.

import { getUser } from '@netlify/identity'
import { getDatabase } from '@netlify/database'
import { findBan, bannedBody, cleanEmail, cleanDevice } from '../lib/guard.mjs'
import { rateLimited } from '../lib/rate.mjs'
import { handle, json } from '../lib/userdata-core.mjs'

export const config = { path: '/api/userdata' }

export default async (req) => {
  let user = null
  try { user = await getUser() } catch { user = null }
  if (!user) return json(401, { error: 'Not signed in. Please log in and try again.' })
  try {
    const db = getDatabase()
    const sql = async (strings, ...vals) => { const r = await db.sql(strings, ...vals); return Array.isArray(r) ? r : (r && r.rows) || [] }
    const checkBan = async (q, u, rq) => {
      const ban = await findBan(q, { userId: String(u.id), email: cleanEmail(u.email), deviceId: cleanDevice(rq.headers.get('x-device-id')) })
      return ban ? bannedBody(ban) : null
    }
    return await handle(req, { user: { id: user.id, email: user.email }, sql, rateLimited, checkBan })
  } catch (err) {
    console.error('userdata function error:', err && err.message)
    return json(500, { error: 'Something went wrong with your study data. Please try again.' })
  }
}
