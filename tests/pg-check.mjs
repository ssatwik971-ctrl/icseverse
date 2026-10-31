// MANUAL check (not run by npm test): runs the real /api/userdata handler against a local Postgres that already has
// migration 006 applied, with two test accounts. Usage: PGHOST=/var/tmp PGPORT=5444 PGUSER=postgres PGDATABASE=sn node tests/pg-check.mjs
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { handle } from '../netlify/lib/userdata-core.mjs'

const lit = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"
const sql = async (strings, ...vals) => {
  let q = strings[0]; vals.forEach((v, i) => { q += lit(v) + strings[i + 1] })
  const isSel = /^\s*select/i.test(q)
  const out = execFileSync('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', isSel ? `SELECT coalesce(json_agg(t),'[]'::json) FROM (${q}) t` : q], { encoding: 'utf8' }).trim()
  return isSel ? JSON.parse(out) : []
}
const A = { id: 'user-A' }, B = { id: 'user-B' }
const call = (user, method, path, body) => handle(new Request('http://x/api/userdata' + path, { method, body: body ? JSON.stringify(body) : undefined }), { user, sql })
const rec = (kind, id, data, t, deleted) => ({ kind, id, data, updatedAt: t, deleted })
const now = Date.now()

await sql`DELETE FROM user_data WHERE user_id IN ('user-A','user-B')`
let r = await call(null, 'GET', ''); assert.equal(r.status, 401)
r = await call(A, 'POST', '', { records: [rec('note', 'n1', { title: 'A secret' }, now), rec('card', 'c1', { front: 'q' }, now)] }); assert.equal(r.status, 200)
r = await call(B, 'POST', '', { records: [rec('note', 'n1', { title: 'B note' }, now)] }); assert.equal(r.status, 200) // same ids, different student
let a = await (await call(A, 'GET', '?since=0')).json(), b = await (await call(B, 'GET', '?since=0')).json()
assert.equal(a.records.length, 2); assert.equal(b.records.length, 1)
assert.equal(a.records.find((x) => x.id === 'n1').data.title, 'A secret'); assert.equal(b.records[0].data.title, 'B note')
// B tries to change and delete A's record by using the same id: only B's own row can change
await call(B, 'POST', '', { records: [rec('note', 'n1', { title: 'B edited' }, now + 10), rec('card', 'c1', { front: 'B card' }, now + 10, false)] })
a = await (await call(A, 'GET', '?since=0')).json(); assert.equal(a.records.find((x) => x.id === 'n1').data.title, 'A secret'); assert.equal(a.records.find((x) => x.id === 'c1').data.front, 'q')
// an old edit never overwrites a newer one
await call(A, 'POST', '', { records: [rec('note', 'n1', { title: 'A newer' }, now + 100)] }); await call(A, 'POST', '', { records: [rec('note', 'n1', { title: 'A OLD' }, now + 50)] })
a = await (await call(A, 'GET', '?since=0')).json(); assert.equal(a.records.find((x) => x.id === 'n1').data.title, 'A newer')
// delete = tombstone that still reaches other devices
await call(A, 'POST', '', { records: [rec('card', 'c1', {}, now + 200, true)] }); a = await (await call(A, 'GET', '?since=0')).json(); assert.equal(a.records.find((x) => x.id === 'c1').deleted, true)
// "since" only returns what changed
const t = a.now; await new Promise((s) => setTimeout(s, 30)); await call(A, 'POST', '', { records: [rec('note', 'n2', { title: 'later' }, now + 300)] })
const inc = await (await call(A, 'GET', '?since=' + t)).json(); assert.deepEqual(inc.records.map((x) => x.id), ['n2'])
// bad input
for (const bad of [rec('hack', 'x', {}, now), rec('note', '../x', {}, now), rec('note', 'ok', 'str', now), rec('note', 'ok', {}, 'nan'), rec('note', 'ok', { big: 'x'.repeat(210000) }, now)]) assert.equal((await call(A, 'POST', '', { records: [bad] })).status, bad.data && bad.data.big ? 400 : 400)
assert.equal((await call(A, 'POST', '', { records: Array.from({ length: 51 }, (_, i) => rec('note', 'm' + i, {}, now)) })).status, 413)
assert.equal((await call(A, 'POST', '', {})).status, 400); assert.equal((await call(A, 'PUT', '')).status, 405); assert.equal((await call(A, 'DELETE', '')).status, 400)
// delete all removes only this student's data
assert.equal((await call(A, 'DELETE', '?all=true')).status, 200)
a = await (await call(A, 'GET', '?since=0')).json(); b = await (await call(B, 'GET', '?since=0')).json(); assert.equal(a.records.length, 0); assert.equal(b.records.length, 2)
// a user id in the URL or body is ignored
r = await call(B, 'GET', '?since=0&user_id=user-A'); assert.equal((await r.json()).records.length, 2)
// rate limit and ban hooks
assert.equal((await handle(new Request('http://x/', { method: 'GET' }), { user: A, sql, rateLimited: () => 7 })).status, 429)
assert.equal((await handle(new Request('http://x/', { method: 'GET' }), { user: A, sql, checkBan: async () => ({ banned: true }) })).status, 403)
console.log('pg-check: all ownership, merge, delete and validation checks passed')
