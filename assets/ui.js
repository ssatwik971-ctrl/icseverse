/* StudyNest UI core: safe element builder, dialogs, shared AI request engine, section navigation, printing, offline banner. */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN
  const doc = document

  /* ---------- safe DOM builder (text is always added as text, never as HTML) ---------- */
  function h(tag, attrs, ...kids) {
    const e = doc.createElement(tag)
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue
      if (k === 'class') e.className = v
      else if (k === 'text') e.textContent = v
      else if (k === 'value') e.value = v
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v)
      else e.setAttribute(k, v === true ? '' : v)
    }
    const add = x => { if (x == null || x === false) return; if (Array.isArray(x)) x.forEach(add); else e.appendChild(x.nodeType ? x : doc.createTextNode(String(x))) }
    kids.forEach(add); return e
  }
  const md = text => { const a = h('article', { class: 'prose' }); a.innerHTML = renderMarkdown(text); return a } // renderMarkdown escapes the text first
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n }
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const fmtDateTime = t => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0
  const bar = p => h('div', { class: 'sn-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p }, h('i', { style: 'width:' + Math.max(0, Math.min(100, p)) + '%' }))
  const stat = (n, label, sub) => h('div', { class: 'sn-stat' }, h('strong', null, String(n)), h('span', null, label), sub ? h('small', null, sub) : null)
  const empty = (icon, title, text, label, fn) => h('div', { class: 'sn-empty' }, h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon), h('h3', null, title), h('p', null, text), label ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: fn }, label) : null)
  const subjectById = id => DB.find(s => s.id === id)
  const subjectName = id => (subjectById(id) || {}).name || ''

  /* ---------- confirm dialog (accessible, replaces the browser's plain confirm) ---------- */
  function confirmBox(message, okLabel, danger) {
    return new Promise(res => {
      const d = $('snDialog'); if (!d || typeof d.showModal !== 'function') { res(window.confirm(message)); return }
      clear(d); const form = h('form', { method: 'dialog', class: 'sn-dialog-form' },
        h('p', { id: 'snDialogMsg' }, message),
        h('div', { class: 'action-row' }, h('button', { class: 'btn btn-outline btn-sm', value: 'cancel', type: 'submit' }, 'Cancel'), h('button', { class: 'btn ' + (danger === false ? 'btn-primary' : 'btn-dark') + ' btn-sm', value: 'ok', type: 'submit' }, okLabel || 'Delete')))
      d.setAttribute('aria-labelledby', 'snDialogMsg'); d.appendChild(form)
      d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }); d.returnValue = 'cancel'; d.showModal()
    })
  }

  /* ---------- errors ---------- */
  function mkErr(kind, message) { const e = new Error(message); e.kind = kind; return e }
  function errBox(err, retry) {
    const kind = classifyError(err), [title, msg] = errorCopy(kind, err)
    return h('div', { class: 'callout error-box', role: 'alert' }, h('span', { 'aria-hidden': 'true' }, '🌐'), h('div', null, h('strong', null, title), ' ' + msg, retry ? h('div', null, h('button', { class: 'btn btn-primary btn-sm', type: 'button', style: 'margin-top:8px', onclick: retry }, '↻ Try again')) : null))
  }
  const modelNote = r => r && r.fallback && r.requested ? h('div', { class: 'sn-warn', role: 'alert' }, '⚠️ ' + r.requested + ' was unavailable, so this answer came from ' + r.model + '.') : (r && r.model ? h('small', { class: 'muted' }, (r.cached ? 'Saved answer · ' : '') + 'Made by ' + r.model + '. AI can make mistakes, so check important facts with your teacher or textbook.') : null)

  /* ---------- shared AI request engine ----------
     one place for: offline check, cache, no duplicate requests, model fallback (inside aiChat), one repair try for JSON, error kinds. */
  const inflight = new Map()
  async function ai(o) {
    if (navigator.onLine === false) throw mkErr('network', 'You are offline. The AI needs an internet connection. Your saved lessons, notes and cards still work.')
    const prompt = String(o.prompt || '').trim(); if (!prompt) throw mkErr('invalid', 'There is nothing to ask yet.')
    if (prompt.length > 45000) throw mkErr('invalid', 'That request is too long. Try a smaller piece of text.')
    const ck = o.key ? ['v1', selectedModel, selectedLang, selectedLevel, o.key].join('|') : null
    if (ck && !o.fresh) { const hit = SN.cacheGet(ck); if (hit) return Object.assign({}, hit, { cached: true }) }
    const fk = ck || 'p:' + prompt.length + ':' + prompt.slice(0, 120) + prompt.slice(-120)
    if (inflight.has(fk)) return inflight.get(fk)
    const run = (async () => {
      let r = await aiChat(prompt), value = r.text
      if (o.json) {
        const parse = t => { const p = L.extractJson(t); if (p == null) return undefined; try { return o.validate ? o.validate(p) : p } catch (e) { return undefined } }
        let v = parse(r.text)
        if (v === undefined) { r = await aiChat(prompt + '\n\nIMPORTANT: your last reply could not be read. Reply with ONLY the JSON described above. No other words, no markdown.'); v = parse(r.text) } // one repair try, never more
        if (v === undefined) throw mkErr('format', 'The AI did not give an answer in the right shape. Please try again.')
        value = v
      }
      const out = { value, text: r.text, model: r.model, fallback: !!r.fallback, requested: r.requested || '' }
      if (ck && !r.fallback) SN.cacheSet(ck, out) // an answer from a fallback model is not stored as "the" answer
      return out
    })().finally(() => inflight.delete(fk))
    inflight.set(fk, run); return run
  }
  // Common rules added to every prompt: language, level, plain maths for JSON.
  const rules = (json) => [LANG_RULES[selectedLang] || LANG_RULES.english, LEVEL_RULES[selectedLevel] || LEVEL_RULES.standard, json ? 'MATHS FORMAT: write maths in plain text with symbols such as x², √, ×, ÷, ½. Do not use LaTeX or backslashes, because the answer must be valid JSON.' : MATH_RULE].join('\n')
  const ICSE_ROLE = 'You are a warm, accurate ICSE Class 9 (India) teacher. Use simple words for a young teenager. If you are not sure about a fact, say so. Never invent facts to fill a gap.'

  /* ---------- views and navigation ---------- */
  const views = {}, order = ['study', 'home', 'exam', 'revise', 'notes', 'detective', 'labs', 'settings']
  const NAV = { study: ['✦', 'Study'], home: ['⌂', 'Home'], exam: ['📝', 'Exams'], revise: ['↻', 'Revise'], notes: ['🗒', 'Notes'], detective: ['🔍', 'Mistakes'], labs: ['🔬', 'Labs'], settings: ['⚙', 'Settings'] }
  let current = 'study', cleanup = null, dirty = null
  const setDirty = fn => { dirty = fn } // a view that has unsaved work sets a function returning a message (or '')
  async function canLeave() { const m = dirty && dirty(); if (!m) return true; const ok = await confirmBox(m, 'Leave without saving', true); if (ok) dirty = null; return ok }
  function renderNav() {
    const nav = $('snNav'); if (!nav) return; clear(nav)
    order.forEach(id => { const [ic, label] = NAV[id], b = h('button', { type: 'button', class: 'sn-tab' + (id === current ? ' active' : ''), 'data-view': id, 'aria-current': id === current ? 'page' : null, onclick: () => show(id) }, h('span', { 'aria-hidden': 'true' }, ic), h('span', null, label)); if (id === 'revise' && SN.dueCount && SN.prefs().remind) { const n = SN.dueCount(); if (n > 0) b.appendChild(h('span', { class: 'due-badge', title: n + ' flashcard' + (n > 1 ? 's' : '') + ' due', 'aria-label': n + ' due' }, String(n))) } nav.appendChild(b) })
  }
  function leave() { // hide a view without touching the study page (the library button handles itself)
    if (cleanup) { try { cleanup() } catch (e) { /* ignore */ } cleanup = null }
    doc.body.classList.remove('sn-view'); $('snView').classList.add('hidden'); current = 'study'; renderNav()
  }
  async function show(name, arg) {
    if (name === current && name !== 'study' && !(arg && arg.force)) { /* re-render the same view */ }
    if (!(await canLeave())) return
    if (name === 'study') { leave(); showStudy(); window.scrollTo({ top: 0 }); return }
    if (!views[name]) return
    if (cleanup) { try { cleanup() } catch (e) { /* ignore */ } cleanup = null }
    current = name; dirty = null; doc.body.classList.add('sn-view'); const v = $('snView'); v.classList.remove('hidden')
    const body = clear($('snViewBody')); renderNav()
    const heading = h('h2', { class: 'sn-h', tabindex: '-1', id: 'snViewTitle' }, NAV[name][0] + ' ' + (views[name].title || NAV[name][1])); body.appendChild(heading)
    const box = h('div', { class: 'sn-body' }); body.appendChild(box)
    try { cleanup = views[name].render(box, arg) || null } catch (e) { console.error(e); box.appendChild(h('div', { class: 'callout error-box' }, 'Something went wrong while opening this page. Please reload and try again.')) }
    heading.focus({ preventScroll: true }); window.scrollTo({ top: 0 })
  }
  const refresh = () => { if (current !== 'study' && views[current] && !(views[current].noAuto)) show(current, { force: true }) }

  // Go to the study page with a subject and topic ready to teach.
  function startTeach(subjectId, topic, chapterTitle) {
    leave(); showStudy()
    if (subjectId && DB.some(s => s.id === subjectId)) { selectedSubject = subjectId; $('subjectSelect').value = subjectId; renderSubjectList(); fillChapters(); renderSubtopics(); renderChapterGrid() }
    const s = currentSubject(), i = s.chapters.findIndex(c => c[0] === (chapterTitle || topic)); $('chapterSelect').value = i >= 0 ? String(i) : ''
    $('topicInput').value = topic || ''; saveSelection(); $('teachPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('topicInput').focus()
  }
  const openLesson = id => { leave(); openSaved(id) }

  /* ---------- printing: only #snPrint is printed while body[data-print] is set ---------- */
  function printNode(kind, node, title) {
    const p = $('snPrint'); clear(p); p.appendChild(node); doc.body.dataset.print = kind
    const old = doc.title; if (title) doc.title = title
    const done = () => { delete doc.body.dataset.print; clear(p); doc.title = old; window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 60)
  }

  /* ---------- offline banner ---------- */
  function offlineBanner() {
    const b = $('snOffline'); if (!b) return
    const off = navigator.onLine === false; b.classList.toggle('hidden', !off)
    b.textContent = off ? 'You are offline. Saved lessons, notes, flashcards and saved papers still work. The AI teacher needs the internet.' : ''
  }
  window.addEventListener('online', offlineBanner); window.addEventListener('offline', offlineBanner)

  /* ---------- hooks called by app.js (real events only) ---------- */
  const hash = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36) }
  SN.onStudy = (subjectId, topic) => SN.activity('study', subjectId, 'study|' + subjectId + '|' + String(topic).toLowerCase())
  SN.onQuiz = (L0, n, m, answers) => {
    const sid = L0.subjectId || (DB.find(s => s.name === L0.subject) || {}).id || '', day = L.dayKey()
    SN.put('attempt', 'quiz_' + hash([sid, L0.topic, day, String(answers || '').trim().toLowerCase()].join('|')), { type: 'quiz', subjectId: sid, subject: L0.subject, topic: L0.topic, correct: n, total: m, at: Date.now() }) // same answers on the same day = one attempt
    SN.activity('quiz', sid)
  }
  SN.recordAttempt = (type, subjectId, topic, correct, total, id) => { SN.put('attempt', id || (type + '_' + SN.uid()), { type, subjectId, subject: subjectName(subjectId), topic, correct, total, at: Date.now() }) }
  SN.addMistake = m => { const id = m.id || 'm_' + hash([m.source, m.paperId || '', m.qid || '', m.question].join('|')); if (SN.get('mistake', id)) return id; SN.put('mistake', id, Object.assign({ status: 'open', at: Date.now() }, m)); return id }

  Object.assign(SN, { h, md, clear, fmtDate, fmtDateTime, pct, bar, stat, empty, subjectById, subjectName, confirm: confirmBox, mkErr, errBox, modelNote, ai, rules, ICSE_ROLE, views, show, leave, refresh, setDirty, startTeach, openLesson, printNode, hash, renderNav, offlineBanner, get current() { return current } })

  /* ---------- start up ---------- */
  function boot() {
    renderNav(); offlineBanner()
    $('libraryTop').addEventListener('click', () => { if (current !== 'study') leave() }, true)
    $('subjectList').addEventListener('click', () => { if (current !== 'study') { leave(); showStudy() } })
    window.addEventListener('beforeunload', e => { if (dirty && dirty()) { e.preventDefault(); e.returnValue = '' } })
    SN.onChange(() => { /* views re-render themselves when they care */ })
    window.addEventListener('sn-data', () => { if (current === 'home') SN._rerenderSoon && SN._rerenderSoon() })
  }
  boot()
})()
