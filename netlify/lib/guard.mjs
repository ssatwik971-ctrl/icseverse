// Shared helpers for the ban system (used by guard.mjs, admin.mjs and lessons.mjs).
import { getDatabase } from '@netlify/database'

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })

// sql`...` helper that always returns an array of rows.
export function sqlTag() {
  const db = getDatabase()
  return async (strings, ...vals) => {
    const r = await db.sql(strings, ...vals)
    return Array.isArray(r) ? r : (r && r.rows) || []
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const cleanDevice = (v) => { v = String(v || '').toLowerCase(); return UUID.test(v) ? v : '' }
export const cleanEmail = (v) => String(v || '').trim().toLowerCase().slice(0, 200)
export const adminEmails = () => String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
export async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))) }
export async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}

// IP is never stored as is, only a salted hash.
export async function ipHash(req, context) {
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  return ip ? (await sha256hex('studynest|' + ip)).slice(0, 24) : ''
}

/* ---------- bans ---------- */

// Returns the first active ban that matches the account, the email or the device, or null.
// Account/email matches come before device-only matches.
export async function findBan(sql, { userId = '', email = '', deviceId = '' }) {
  const rows = await sql`
    SELECT b.id, b.reason, b.expires_at, b.parent_id, k.kind
    FROM bans b JOIN ban_keys k ON k.ban_id = b.id
    WHERE b.lifted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())
      AND ((k.kind = 'user' AND k.value = ${userId})
        OR (k.kind = 'email' AND k.value = ${email})
        OR (k.kind = 'device' AND k.value = ${deviceId}))
    ORDER BY (k.kind = 'device') ASC, b.id ASC
    LIMIT 1`
  return rows[0] || null
}

export const bannedBody = (ban) => ({ banned: true, reason: ban.reason || '', until: ban.expires_at || null })

export async function createBan(sql, { userId = '', email = '', reason = '', days = 0, by, parentId = null, extraDevices = [] }) {
  const d = Math.max(0, Math.min(3650, Math.floor(Number(days) || 0)))
  const rows = await sql`
    INSERT INTO bans (user_id, email, reason, banned_by, parent_id, expires_at)
    VALUES (${userId || null}, ${email || null}, ${String(reason).slice(0, 500)}, ${by}, ${parentId},
            CASE WHEN ${d}::int > 0 THEN now() + ${d}::int * interval '1 day' ELSE NULL END)
    RETURNING id`
  const id = rows[0].id
  if (userId) await sql`INSERT INTO ban_keys (ban_id, kind, value) VALUES (${id}, 'user', ${userId}) ON CONFLICT DO NOTHING`
  if (email) await sql`INSERT INTO ban_keys (ban_id, kind, value) VALUES (${id}, 'email', ${email}) ON CONFLICT DO NOTHING`
  const devs = new Set(extraDevices.filter(Boolean))
  if (userId) for (const r of await sql`SELECT device_id FROM devices WHERE user_id = ${userId}`) devs.add(r.device_id)
  for (const dv of devs) await sql`INSERT INTO ban_keys (ban_id, kind, value) VALUES (${id}, 'device', ${dv}) ON CONFLICT DO NOTHING`
  return id
}

/* ---------- unusual-activity rules (they only flag, never ban) ---------- */

async function addFlag(sql, { userId = '', email = '', rule, detail }) {
  const dup = await sql`SELECT 1 FROM flags WHERE rule = ${rule} AND status = 'open'
    AND COALESCE(user_id, '') = ${userId} AND COALESCE(email, '') = ${email} LIMIT 1`
  if (dup.length) return
  await sql`INSERT INTO flags (user_id, email, rule, detail) VALUES (${userId || null}, ${email || null}, ${rule}, ${detail})`
}
const num = (rows) => Number(rows[0]?.n || 0)

export async function runRules(sql, { userId = '', email = '', deviceId = '' }) {
  try {
    if (userId) {
      const burst = num(await sql`SELECT count(*) AS n FROM activity WHERE user_id = ${userId} AND type = 'ai_request' AND created_at > now() - interval '10 minutes'`)
      if (burst >= 30) await addFlag(sql, { userId, email, rule: 'ai_burst', detail: `${burst} AI requests in 10 minutes` })
      const devs = num(await sql`SELECT count(DISTINCT device_id) AS n FROM devices WHERE user_id = ${userId} AND last_seen > now() - interval '24 hours'`)
      if (devs >= 4) await addFlag(sql, { userId, email, rule: 'many_devices', detail: `${devs} different devices in 24 hours` })
    }
    if (deviceId && userId) {
      const accts = num(await sql`SELECT count(DISTINCT user_id) AS n FROM devices WHERE device_id = ${deviceId}`)
      if (accts >= 3) await addFlag(sql, { userId, email, rule: 'shared_device', detail: `One device used by ${accts} accounts` })
    }
    if (email) {
      const fails = num(await sql`SELECT count(*) AS n FROM activity WHERE email = ${email} AND type = 'login_fail' AND created_at > now() - interval '15 minutes'`)
      if (fails >= 8) await addFlag(sql, { userId, email, rule: 'login_fail', detail: `${fails} failed logins in 15 minutes` })
    }
    if (Math.random() < 0.01) await sql`DELETE FROM activity WHERE created_at < now() - interval '30 days'`
  } catch (e) { console.error('runRules failed:', e) }
}
