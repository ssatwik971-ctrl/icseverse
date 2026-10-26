// netlify/functions/guard.mjs
//
// The browser talks to this at /api/guard (POST) so banned people are stopped and activity is logged.
//   precheck  before login/signup (no account needed): is this email or device banned?
//   session   after login and every ~90 s while the site is open: records the device, checks the ban
//   event     login_fail / ai_request: logged for the unusual-activity rules
// If anything fails here the site keeps working (the browser treats an error as "not banned").

import { getUser } from '@netlify/identity'
import { json, sqlTag, cleanDevice, cleanEmail, ipHash, findBan, bannedBody, createBan, runRules } from '../lib/guard.mjs'

export const config = { path: '/api/guard' }

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  let b
  try { b = await req.json() } catch { return json(400, { error: 'Bad request.' }) }
  const action = String(b?.action || '')
  const deviceId = cleanDevice(b?.deviceId)

  try {
    const sql = sqlTag()
    const ip = await ipHash(req, context)

    if (action === 'precheck') {
      const email = cleanEmail(b.email)
      const ban = await findBan(sql, { email, deviceId })
      return json(200, ban ? bannedBody(ban) : { banned: false })
    }

    if (action === 'event') {
      const type = String(b.type || '')
      if (type !== 'login_fail' && type !== 'ai_request') return json(400, { error: 'Unknown event.' })
      let user = null
      try { user = await getUser() } catch { user = null }
      const userId = user ? String(user.id) : ''
      const email = user ? cleanEmail(user.email) : cleanEmail(b.email)
      if (type === 'ai_request' && !user) return json(401, { error: 'Not signed in.' })
      await sql`INSERT INTO activity (user_id, email, device_id, ip_hash, type)
                VALUES (${userId || null}, ${email || null}, ${deviceId || null}, ${ip || null}, ${type})`
      await runRules(sql, { userId, email, deviceId })
      const ban = user ? await findBan(sql, { userId, email, deviceId }) : null
      return json(200, ban ? bannedBody(ban) : { banned: false })
    }

    if (action === 'session') {
      let user = null
      try { user = await getUser() } catch { user = null }
      if (!user) return json(401, { error: 'Not signed in.' })
      const userId = String(user.id)
      const email = cleanEmail(user.email)

      let ban = await findBan(sql, { userId, email, deviceId })
      // New account on a banned device: the ban follows to the new account too.
      if (ban && ban.kind === 'device') {
        await createBan(sql, {
          userId, email, by: 'system', parentId: ban.parent_id || ban.id,
          reason: `Signed in on a banned device (ban #${ban.id})`, extraDevices: [deviceId],
          days: ban.expires_at ? Math.max(1, Math.ceil((new Date(ban.expires_at) - Date.now()) / 86400000)) : 0,
        })
        ban = await findBan(sql, { userId, email, deviceId })
      }
      if (ban) return json(200, bannedBody(ban))

      const name = String(user.name || user.userMetadata?.full_name || '').trim().slice(0, 60) || null
      await sql`INSERT INTO users (user_id, display_name, email) VALUES (${userId}, ${name}, ${email || null})
                ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, last_seen = now()`
      if (deviceId) {
        await sql`INSERT INTO devices (user_id, device_id, ip_hash) VALUES (${userId}, ${deviceId}, ${ip || null})
                  ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen = now(), ip_hash = EXCLUDED.ip_hash`
        await sql`INSERT INTO activity (user_id, email, device_id, ip_hash, type) VALUES (${userId}, ${email || null}, ${deviceId}, ${ip || null}, 'session')`
      }
      await runRules(sql, { userId, email, deviceId })
      return json(200, { banned: false })
    }

    return json(400, { error: 'Unknown action.' })
  } catch (err) {
    console.error('guard function error:', err)
    return json(500, { error: 'Check failed.' })
  }
}
