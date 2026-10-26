// netlify/functions/admin.mjs
//
// Admin API at /api/admin (POST {action, ...}). Only the owner can use it.
// Two locks, both checked here on the server for EVERY request:
//   1. The signed-in account's email must be in the ADMIN_EMAILS environment variable.
//   2. The admin PIN (ADMIN_PIN environment variable) must have been entered; it is remembered 2 hours in a signed cookie.
// Anyone else (logged out, or a normal user) gets a plain 404, as if the page does not exist.
// If ADMIN_EMAILS or ADMIN_PIN is not set, the admin area stays closed.

import { getUser } from '@netlify/identity'
import { json, sqlTag, cleanEmail, adminEmails, hmacHex, findBan, createBan } from '../lib/guard.mjs'

export const config = { path: '/api/admin' }

const COOKIE = 'sn_admin'
const TTL = 2 * 60 * 60 // seconds
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
const cookieHeader = (value, maxAge) => `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`

function readCookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'))
  return m ? m[1] : ''
}
const safeEq = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

async function pinOk(req, userId) {
  const pin = process.env.ADMIN_PIN
  if (!pin) return false
  const [exp, sig] = readCookie(req).split('.')
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  return safeEq(sig, await hmacHex(pin, `${userId}.${exp}`))
}

const audit = (sql, admin, action, target, detail) =>
  sql`INSERT INTO admin_audit (admin_email, action, target, detail) VALUES (${admin}, ${action}, ${target || null}, ${String(detail || '').slice(0, 500)})`

export default async (req) => {
  if (req.method !== 'POST') return notFound()
  let user = null
  try { user = await getUser() } catch { user = null }
  const email = user ? cleanEmail(user.email) : ''
  if (!user || !email || !adminEmails().includes(email)) return notFound()

  let b
  try { b = await req.json() } catch { return notFound() }
  const action = String(b?.action || '')

  try {
    const sql = sqlTag()
    const userId = String(user.id)

    if (action === 'status') return json(200, { admin: true, unlocked: await pinOk(req, userId), pinSet: !!process.env.ADMIN_PIN })

    if (action === 'unlock') {
      const pin = process.env.ADMIN_PIN
      if (!pin) return json(503, { error: 'ADMIN_PIN is not set in Netlify yet.' })
      const tries = await sql`SELECT count(*) AS n FROM admin_audit WHERE admin_email = ${email} AND action = 'pin_fail' AND created_at > now() - interval '15 minutes'`
      if (Number(tries[0].n) >= 5) return json(429, { error: 'Too many wrong PINs. Try again in 15 minutes.' })
      const given = String(b.pin || '')
      const ok = safeEq(await hmacHex(pin, 'check|' + given), await hmacHex(pin, 'check|' + pin))
      if (!ok) { await audit(sql, email, 'pin_fail', null, ''); return json(401, { error: 'Wrong PIN.' }) }
      const exp = Math.floor(Date.now() / 1000) + TTL
      const sig = await hmacHex(pin, `${userId}.${exp}`)
      await audit(sql, email, 'unlock', null, '')
      return json(200, { ok: true }, { 'Set-Cookie': cookieHeader(`${exp}.${sig}`, TTL) })
    }
    if (action === 'lock') return json(200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) })

    // Everything below needs the PIN.
    if (!(await pinOk(req, userId))) return json(401, { error: 'PIN needed.', needPin: true })

    if (action === 'stats') {
      const r = await sql`SELECT
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM bans WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS bans,
        (SELECT count(*) FROM flags WHERE status = 'open') AS flags,
        (SELECT count(*) FROM activity WHERE type = 'session' AND created_at > now() - interval '24 hours') AS sessions`
      return json(200, { users: +r[0].users, bans: +r[0].bans, flags: +r[0].flags, sessions: +r[0].sessions })
    }

    if (action === 'users') {
      const q = String(b.q || '').trim().slice(0, 100)
      const like = '%' + q.replace(/[%_\\]/g, '\\$&') + '%'
      const off = Math.max(0, Math.floor(Number(b.offset) || 0))
      const rows = await sql`
        SELECT u.user_id, u.display_name, u.email, u.first_seen, u.last_seen,
          (SELECT count(*) FROM flags f WHERE f.user_id = u.user_id AND f.status = 'open') AS open_flags,
          EXISTS (SELECT 1 FROM bans b JOIN ban_keys k ON k.ban_id = b.id
                  WHERE k.kind = 'user' AND k.value = u.user_id AND b.lifted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())) AS banned
        FROM users u
        WHERE (${q} = '' OR u.email ILIKE ${like} OR u.display_name ILIKE ${like} OR u.user_id = ${q})
        ORDER BY u.last_seen DESC LIMIT 50 OFFSET ${off}`
      return json(200, { users: rows })
    }

    if (action === 'user_detail') {
      const id = String(b.userId || '')
      const u = (await sql`SELECT user_id, display_name, email, first_seen, last_seen, notes FROM users WHERE user_id = ${id}`)[0]
      if (!u) return json(404, { error: 'No such user.' })
      const devices = await sql`SELECT device_id, first_seen, last_seen,
        (SELECT count(DISTINCT user_id) FROM devices d2 WHERE d2.device_id = d.device_id) AS accounts
        FROM devices d WHERE user_id = ${id} ORDER BY last_seen DESC LIMIT 20`
      const activity = await sql`SELECT type, created_at FROM activity WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 40`
      const flags = await sql`SELECT id, rule, detail, status, created_at FROM flags WHERE user_id = ${id} ORDER BY created_at DESC LIMIT 20`
      const bans = await sql`SELECT id, reason, banned_by, created_at, expires_at, lifted_at FROM bans WHERE user_id = ${id} ORDER BY id DESC LIMIT 10`
      return json(200, { user: u, devices, activity, flags, bans })
    }

    if (action === 'ban') {
      const id = String(b.userId || '')
      let target = cleanEmail(b.email)
      let name = ''
      if (id) {
        const u = (await sql`SELECT email, display_name FROM users WHERE user_id = ${id}`)[0]
        if (!u) return json(404, { error: 'No such user.' })
        target = cleanEmail(u.email) || target
        name = u.display_name || ''
      }
      if (!id && !target) return json(400, { error: 'Pick a user or enter an email.' })
      if (adminEmails().includes(target)) return json(400, { error: 'You cannot ban an admin account.' })
      const reason = String(b.reason || '').trim().slice(0, 500)
      if (!reason) return json(400, { error: 'Please write a reason.' })
      if (await findBan(sql, { userId: id, email: target })) return json(409, { error: 'Already banned.' })
      const banId = await createBan(sql, { userId: id, email: target, reason, days: b.days, by: email })
      if (b.flagId) await sql`UPDATE flags SET status = 'banned' WHERE id = ${Number(b.flagId)} AND status = 'open'`
      await sql`UPDATE flags SET status = 'banned' WHERE user_id = ${id} AND ${id} <> '' AND status = 'open'`
      await audit(sql, email, 'ban', target || id, `#${banId} ${name} ${Number(b.days) > 0 ? b.days + ' days' : 'permanent'}: ${reason}`)
      return json(200, { ok: true, banId })
    }

    if (action === 'unban') {
      const banId = Number(b.banId)
      const r = await sql`UPDATE bans SET lifted_at = now(), lifted_by = ${email} WHERE (id = ${banId} OR parent_id = ${banId}) AND lifted_at IS NULL RETURNING id, user_id, email, parent_id`
      if (!r.length) return json(404, { error: 'That ban is not active.' })
      // A new account banned only because of a banned device stays blocked while the first ban is active.
      const me = r.find((x) => x.id === banId)
      let warning = ''
      if (me?.parent_id) {
        const p = await sql`SELECT 1 FROM bans WHERE id = ${me.parent_id} AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
        if (p.length) warning = `This device is still banned by ban #${me.parent_id}. Unban that one too, or this account will be blocked again.`
      }
      await audit(sql, email, 'unban', me?.email || me?.user_id || String(banId), `#${banId} (${r.length} ban${r.length > 1 ? 's' : ''} lifted)`)
      return json(200, { ok: true, lifted: r.length, warning })
    }

    if (action === 'bans') {
      const all = b.filter === 'all'
      const rows = await sql`
        SELECT b.id, b.user_id, b.email, b.reason, b.banned_by, b.parent_id, b.created_at, b.expires_at, b.lifted_at, b.lifted_by,
               (SELECT count(*) FROM ban_keys k WHERE k.ban_id = b.id AND k.kind = 'device') AS devices,
               (b.lifted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())) AS active
        FROM bans b
        WHERE ${all}::boolean OR (b.lifted_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))
        ORDER BY b.id DESC LIMIT 100`
      return json(200, { bans: rows })
    }

    if (action === 'flags') {
      const status = ['open', 'dismissed', 'banned'].includes(b.status) ? b.status : 'open'
      const rows = await sql`
        SELECT f.id, f.user_id, f.email, f.rule, f.detail, f.status, f.created_at, u.display_name
        FROM flags f LEFT JOIN users u ON u.user_id = f.user_id
        WHERE f.status = ${status} ORDER BY f.created_at DESC LIMIT 100`
      return json(200, { flags: rows })
    }

    if (action === 'flag_dismiss') {
      const id = Number(b.flagId)
      const r = await sql`UPDATE flags SET status = 'dismissed' WHERE id = ${id} AND status = 'open' RETURNING id, email`
      if (!r.length) return json(404, { error: 'Flag not found.' })
      await audit(sql, email, 'flag_dismiss', r[0].email || String(id), `flag #${id}`)
      return json(200, { ok: true })
    }

    if (action === 'note') {
      const id = String(b.userId || '')
      const text = String(b.text || '').slice(0, 1000)
      await sql`UPDATE users SET notes = ${text || null} WHERE user_id = ${id}`
      await audit(sql, email, 'note', id, text.slice(0, 100))
      return json(200, { ok: true })
    }

    if (action === 'audit') {
      const rows = await sql`SELECT admin_email, action, target, detail, created_at FROM admin_audit ORDER BY id DESC LIMIT 100`
      return json(200, { audit: rows })
    }

    return json(400, { error: 'Unknown action.' })
  } catch (err) {
    console.error('admin function error:', err)
    return json(500, { error: 'Something went wrong. Please try again.' })
  }
}
