/* StudyNest data layer (window.SN). Local first: everything is saved in this browser under the current owner
   ("guest" or the signed-in account). When signed in and online it is also copied to /api/userdata.
   Conflicts: the newest edit of each record wins (by its own edit time). A delete leaves a small "deleted" marker so it reaches other devices. */
(function () {
  'use strict'
  const L = window.SNL
  const KINDS = ['note', 'card', 'attempt', 'paper', 'mistake', 'setting', 'award', 'coach', 'activity']
  const OWNER_KEY = 'sn_owner', API = '/api/userdata', MAX_REC = 200000
  const SN = window.SN = window.SN || {}
  const listeners = []
  let mem = null, memOwner = null, timer = null, syncing = null
  const sync = { state: 'local', last: 0, error: '' } // local | syncing | ok | error | offline

  const owner = () => { const u = rawGet(OWNER_KEY); return u ? 'u_' + u : 'guest' }
  const storeKey = o => 'sn_d_' + o
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const isSynced = () => memOwner !== 'guest' && memOwner !== null

  function load() {
    const o = owner(); if (mem && memOwner === o) return mem
    memOwner = o; let v = null
    try { v = JSON.parse(localStorage.getItem(storeKey(o)) || 'null') } catch (e) { v = null } // malformed data is ignored, never crashes
    if (!v || typeof v !== 'object' || !v.k || typeof v.k !== 'object') v = { v: 1, k: {}, since: 0 }
    KINDS.forEach(k => { if (!v.k[k] || typeof v.k[k] !== 'object') v.k[k] = {} })
    mem = v; return v
  }
  function save() {
    try { localStorage.setItem(storeKey(memOwner), JSON.stringify(mem)); return true }
    catch (e) { if (typeof showToast === 'function') showToast('Your browser storage is full or blocked, so this change could not be saved on this device.'); return false }
  }
  function emit(kind) { listeners.slice().forEach(f => { try { f(kind) } catch (e) { console.error(e) } }); window.dispatchEvent(new CustomEvent('sn-data', { detail: { kind } })) }

  /* ---------- records ---------- */
  function shape(r) { return Object.assign({}, r.d, { id: r.id, updatedAt: r.updatedAt }) }
  function get(kind, id) { const r = load().k[kind] && load().k[kind][id]; return r && !r.deleted && r.d ? shape(r) : null }
  function list(kind) { const m = load().k[kind] || {}; return Object.values(m).filter(r => r && !r.deleted && r.d && typeof r.d === 'object').map(shape) }
  function put(kind, id, data, quiet) {
    if (!KINDS.includes(kind)) throw new Error('Unknown kind ' + kind)
    const d = Object.assign({}, data); delete d.id; delete d.updatedAt
    if (JSON.stringify(d).length > MAX_REC / 2) { showToast('That item is too large to save.'); return false }
    const prev = load().k[kind][id], t = Math.max(Date.now(), prev ? prev.updatedAt + 1 : 0)
    load().k[kind][id] = { id, updatedAt: t, deleted: false, dirty: true, d }
    const ok = save(); if (!quiet) { emit(kind); schedule() } return ok
  }
  function update(kind, id, patch) { const cur = get(kind, id); if (!cur) return false; return put(kind, id, Object.assign({}, cur, patch)) }
  function remove(kind, id) {
    const m = load().k[kind]; if (!m[id]) return
    if (isSynced()) m[id] = { id, updatedAt: Math.max(Date.now(), m[id].updatedAt + 1), deleted: true, dirty: true, d: {} }
    else delete m[id]
    save(); emit(kind); schedule()
  }
  function removeWhere(kind, fn) { list(kind).filter(fn).forEach(r => remove(kind, r.id)) }

  /* ---------- activity: one small record per day, counts only (no private content) ---------- */
  function activity(type, subjectId, uniq) { // uniq: count this thing only once per day (e.g. reopening the same lesson)
    const day = L.dayKey(), cur = get('activity', day) || { counts: {}, subjects: {} }
    if (uniq) { cur.seen = cur.seen || []; if (cur.seen.includes(uniq)) return; cur.seen.push(uniq); if (cur.seen.length > 60) cur.seen.shift() }
    cur.counts[type] = (cur.counts[type] || 0) + 1
    if (subjectId) { cur.subjects[subjectId] = (cur.subjects[subjectId] || 0) + 1; cur.last = subjectId }
    put('activity', day, cur)
  }
  const activities = () => list('activity')
  const ACTIONS = ['study', 'quiz', 'exam', 'review', 'lab', 'detective']
  const activeDays = types => activities().filter(a => (types || ACTIONS).some(t => a.counts && a.counts[t] > 0)).map(a => a.id)
  function weekActions(now) { const wk = L.weekKey(now == null ? Date.now() : now); return activities().filter(a => L.weekKey(new Date(a.id + 'T12:00').getTime()) === wk).reduce((n, a) => n + ACTIONS.reduce((m, t) => m + ((a.counts && a.counts[t]) || 0), 0), 0) }

  /* ---------- preferences ---------- */
  const PREF_DEFAULTS = { lang: 'english', level: 'standard', model: 'deepseek', weeklyGoal: 10, examDate: '', examSubjectId: '', sessionSize: 20, reduceMotion: false, contrast: false, remind: true }
  function prefs() { const p = get('setting', 'prefs') || {}; return Object.assign({}, PREF_DEFAULTS, p) }
  function setPrefs(patch) { const cur = get('setting', 'prefs') || {}; return put('setting', 'prefs', Object.assign({}, cur, patch)) }
  const hasPrefs = () => !!get('setting', 'prefs')

  /* ---------- AI answer cache (per owner, expires, size-capped) ---------- */
  const TTL = 14 * 86400000
  function cacheGet(k) { try { const c = JSON.parse(localStorage.getItem('sn_aic_' + owner()) || '{}'), e = c[k]; if (e && e.v && Date.now() - e.t < TTL) return e.v } catch (x) { /* ignore */ } return null }
  function cacheSet(k, v) {
    try { const key = 'sn_aic_' + owner(); let c = {}; try { c = JSON.parse(localStorage.getItem(key) || '{}') || {} } catch (x) { c = {} }
      c[k] = { t: Date.now(), v }; const ks = Object.keys(c); if (ks.length > 30) ks.sort((a, b) => c[a].t - c[b].t).slice(0, ks.length - 30).forEach(x => delete c[x])
      localStorage.setItem(key, JSON.stringify(c)) } catch (x) { /* storage full: caching is optional */ }
  }
  const cacheClear = () => { try { localStorage.removeItem('sn_aic_' + owner()) } catch (x) { /* ignore */ } }

  /* ---------- cloud sync ---------- */
  async function api(method, qs, body) {
    const go = () => fetch(API + (qs || ''), { method, credentials: 'same-origin', headers: Object.assign({ 'X-Device-Id': (window.studynestDeviceId && window.studynestDeviceId()) || '' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
    let r = await go()
    if (r.status === 401 && typeof window.studynestRefreshSession === 'function' && await window.studynestRefreshSession()) r = await go()
    return r
  }
  function schedule() { if (!isSynced() || navigator.onLine === false) return; clearTimeout(timer); timer = setTimeout(() => syncNow(), 4000) }
  function setState(state, error) { sync.state = state; sync.error = error || ''; if (state === 'ok') sync.last = Date.now(); window.dispatchEvent(new CustomEvent('sn-sync')) }
  function syncNow() {
    if (!isSynced()) { setState('local'); return Promise.resolve(false) }
    if (navigator.onLine === false) { setState('offline'); return Promise.resolve(false) }
    if (syncing) return syncing
    syncing = (async () => {
      const m = load(); setState('syncing')
      try {
        // 1. pull
        let since = m.since || 0, guard = 0, newest = 0
        for (;;) {
          const r = await api('GET', '?since=' + since); if (r.status === 401) { setState('error', 'Please log in again to sync.'); return false }
          if (r.status === 403) { setState('error', 'Sync is not available for this account.'); return false }
          if (!r.ok) { setState('error', 'The server could not be reached. Your data is safe on this device.'); return false }
          const j = await r.json()
          for (const s of j.records || []) {
            if (!KINDS.includes(s.kind)) continue
            const loc = m.k[s.kind][s.id]
            if (!loc || s.updatedAt > loc.updatedAt) m.k[s.kind][s.id] = { id: s.id, updatedAt: s.updatedAt, deleted: !!s.deleted, dirty: false, d: s.deleted ? {} : (s.data || {}) }
          }
          newest = j.now || newest
          if (j.more && j.next && guard++ < 20) since = j.next; else break
        }
        save()
        // 2. push (50 at a time)
        const dirty = []; KINDS.forEach(k => Object.values(m.k[k]).forEach(r => { if (r.dirty) dirty.push({ kind: k, rec: r }) }))
        for (let i = 0; i < dirty.length; i += 50) {
          const chunk = dirty.slice(i, i + 50)
          const r = await api('POST', '', { records: chunk.map(c => ({ kind: c.kind, id: c.rec.id, data: c.rec.d, updatedAt: c.rec.updatedAt, deleted: !!c.rec.deleted })) })
          if (!r.ok) { setState('error', r.status === 413 ? 'Some items are too large or you reached the storage limit.' : 'Some changes could not be saved to your account yet. They are safe on this device.'); save(); return false }
          chunk.forEach(c => { const cur = m.k[c.kind][c.rec.id]; if (cur && cur.updatedAt === c.rec.updatedAt) { if (cur.deleted) delete m.k[c.kind][c.rec.id]; else cur.dirty = false } })
        }
        m.since = Math.max(0, (newest || Date.now()) - 5000); save(); setState('ok'); emit('*'); return true
      } catch (e) { setState(navigator.onLine === false ? 'offline' : 'error', 'No connection to your account. Your data is safe on this device.'); return false }
      finally { syncing = null }
    })()
    return syncing
  }

  /* ---------- owner changes (login / logout) ---------- */
  function setOwner(userId) { rawSet(OWNER_KEY, userId || ''); mem = null; clearTimeout(timer); load(); emit('*') }
  window.addEventListener('studynest-auth', e => {
    const d = e.detail || {}
    if (d.type === 'logout') { setOwner(''); setState('local'); return }
    if (d.userId) { if (owner() !== 'u_' + d.userId) setOwner(d.userId); syncNow() }
    else if (d.type === 'init' && navigator.onLine !== false) { if (owner() !== 'guest') setOwner(''); setState('local') } // online and not signed in = really signed out
  })
  window.addEventListener('online', () => { schedule(); window.dispatchEvent(new CustomEvent('sn-sync')) })
  window.addEventListener('offline', () => window.dispatchEvent(new CustomEvent('sn-sync')))
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isSynced() && Date.now() - sync.last > 120000) schedule() })

  /* ---------- export, import, delete ---------- */
  function exportAll() {
    const data = {}; KINDS.forEach(k => { data[k] = Object.values(load().k[k]).filter(r => r && !r.deleted && r.d).map(r => ({ id: r.id, updatedAt: r.updatedAt, d: r.d })) })
    return { app: 'studynest', v: 1, exportedAt: new Date().toISOString(), lessons: getSaved(), progress: lsGet(LS_PROG, {}), data }
  }
  function importAll(o) { // merge: a record is only replaced when the file's copy is newer. A backup of the current data is kept first.
    const v = L.validateBackup(o); if (!v.ok) return { ok: false, error: v.error }
    try { localStorage.setItem('sn_backup_before_import', JSON.stringify(exportAll())) } catch (e) { return { ok: false, error: 'There is not enough storage space to make a safety copy first, so nothing was imported.' } }
    let added = 0, skipped = 0
    for (const k of Object.keys(o.data || {})) {
      if (!KINDS.includes(k)) { skipped += o.data[k].length; continue }
      for (const r of o.data[k]) {
        const cur = load().k[k][r.id], t = Number(r.updatedAt) || Date.now(), d = r.d && typeof r.d === 'object' ? r.d : null
        if (!d) { skipped++; continue }
        if (!cur || t > cur.updatedAt) { load().k[k][r.id] = { id: r.id, updatedAt: t, deleted: false, dirty: true, d }; added++ } else skipped++
      }
    }
    let lessons = 0
    if (Array.isArray(o.lessons)) { const have = getSaved(); const add = o.lessons.filter(x => x && x.text && x.topic && x.subject && x.mode && !have.some(y => sameLesson(y, x))).map(x => Object.assign({}, x, { id: uid(), synced: false })); if (add.length) { setSaved(have.concat(add).slice(0, 120)); lessons = add.length } }
    save(); emit('*'); schedule(); return { ok: true, added, skipped, lessons }
  }
  async function deleteAll() {
    KINDS.forEach(k => { load().k[k] = {} }); mem.since = 0; save(); cacheClear()
    let cloud = null
    if (isSynced() && navigator.onLine !== false) { try { const r = await api('DELETE', '?all=true'); cloud = r.ok } catch (e) { cloud = false } }
    emit('*'); return cloud
  }
  function guestCount() { try { const g = JSON.parse(localStorage.getItem(storeKey('guest')) || 'null'); return g && g.k ? KINDS.reduce((n, k) => n + Object.keys(g.k[k] || {}).length, 0) : 0 } catch (e) { return 0 } }
  function adoptGuest() { // copy this device's guest data into the signed-in account (never overwrites a newer record)
    if (!isSynced()) return 0
    let g; try { g = JSON.parse(localStorage.getItem(storeKey('guest')) || 'null') } catch (e) { return 0 } if (!g || !g.k) return 0
    let n = 0; KINDS.forEach(k => Object.values(g.k[k] || {}).forEach(r => { if (r && !r.deleted && r.d && !load().k[k][r.id]) { load().k[k][r.id] = { id: r.id, updatedAt: r.updatedAt || Date.now(), deleted: false, dirty: true, d: r.d }; n++ } }))
    save(); emit('*'); schedule(); return n
  }

  Object.assign(SN, { KINDS, uid, owner, get, list, put, update, remove, removeWhere, activity, activities, activeDays, weekActions, ACTIONS, prefs, setPrefs, hasPrefs, PREF_DEFAULTS, cacheGet, cacheSet, cacheClear, sync, syncNow, isSynced, exportAll, importAll, deleteAll, guestCount, adoptGuest, onChange: f => listeners.push(f) })
  load()
})()
