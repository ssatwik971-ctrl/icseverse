/* StudyNest Exam Coach: build a practice paper, take it (timer, autosave, review flags), see results, print the paper and the answer key. */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN, { h, md, clear, fmtDate, pct, bar, stat, empty } = SN
  const T = L.TYPES, MAX_Q = 40
  const DIFF = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' }
  const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : String(mm)) + ':' + String(ss).padStart(2, '0') }
  const optText = (q, letter) => (q.options || [])['ABCD'.indexOf(letter)] || ''
  const keyText = q => q.type === 'mcq' ? q.answer + '. ' + optText(q, q.answer) : q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.type === 'num' ? q.answer.value + (q.answer.unit ? ' ' + q.answer.unit : '') : q.type === 'fill' ? q.answer : (q.modelAnswer || (q.markingScheme || []).join('; '))
  const answerShown = (q, a) => { if (a == null || !String(a).trim()) return '(no answer)'; if (q.type === 'mcq') { const l = String(a).trim().charAt(0).toUpperCase(); return 'ABCD'.includes(l) ? l + '. ' + optText(q, l) : String(a) } return String(a) }

  /* ---------- building the paper with the AI ---------- */
  function sourceText(cfg) {
    const chosen = new Set(cfg.chapters.map(c => c.toLowerCase())); const topics = cfg.topics.map(t => t.toLowerCase())
    const m = getSaved().filter(x => x.subjectId === cfg.subjectId && x.mode !== 'quiz' && !x.offline && (cfg.scopeKind === 'full' || chosen.has(String(x.chapter || '').toLowerCase()) || chosen.has(String(x.topic).toLowerCase()) || topics.some(t => String(x.topic).toLowerCase().includes(t)))).slice(0, 3)
    return m.map(x => '--- ' + x.topic + ' ---\n' + String(x.text).slice(0, 1500)).join('\n\n')
  }
  const TYPE_HELP = {
    mcq: '"options":["text A","text B","text C","text D"] (do not write the letters), "answer":"A" or "B" or "C" or "D", "explanation":"why it is right"',
    tf: '"answer":true or false, "explanation":"why"', fill: 'the "text" must contain ____ for the blank; "answer":"the missing word", "accept":["other correct spellings"], "explanation":"why"',
    num: '"answer":{"value": a number, "unit":"m/s"}, "explanation":"the working, step by step"',
    _written: '"modelAnswer":"a full-mark answer", "markingScheme":["point worth 1 mark","point worth 1 mark"], "keywords":["key word","key word"]'
  }
  function batchPrompt(cfg, want, src) {
    const lines = want.map(w => '- ' + w.count + ' x ' + w.type + ' (' + T[w.type].label + ', ' + T[w.type].marks + ' mark' + (T[w.type].marks > 1 ? 's' : '') + ' each)').join('\n')
    const fields = want.map(w => w.type + ': ' + (TYPE_HELP[w.type] || TYPE_HELP._written)).join('\n')
    return SN.ICSE_ROLE + '\nMake ICSE Class 9 practice questions for ' + cfg.subject + '.\nSYLLABUS SCOPE: ' + cfg.scope + '\n' + (cfg.topics.length ? 'FOCUS TOPICS: ' + cfg.topics.join(', ') + '\n' : '') + 'DIFFICULTY: ' + DIFF[cfg.difficulty] + '\n' +
      'QUESTIONS WANTED (exactly these numbers):\n' + lines + '\n\nRULES: Only ask about the scope above. Use only facts you are sure are correct. Every question must be different. Give each question a short "topic" name. Draw-and-label questions must describe in words what to draw; do not rely on a picture. Do not use LaTeX or backslashes.\n' +
      'Reply with ONLY this JSON: {"questions":[{"type":"<type>","topic":"...","text":"...", ...fields for that type}]}\nFIELDS BY TYPE:\n' + fields + '\n' + (src ? '\nSTUDENT\'S SAVED LESSONS (use them as the main source when they fit):\n' + src + '\n' : '\nNo saved lesson text is available, so base the questions on the standard ICSE Class 9 syllabus topics in the scope.\n') + SN.rules(true)
  }
  const validQuestions = p => { const a = Array.isArray(p) ? p : (p && p.questions); if (!Array.isArray(a) || !a.length) throw new Error('no questions'); return a.filter(x => x && typeof x === 'object' && T[x.type]) }
  function groupBatches(sections) { // up to 10 questions per request, one request after another (never in parallel)
    const out = []; let cur = [], n = 0
    for (const s of sections) { let left = s.count; while (left > 0) { const take = Math.min(left, 10 - n); cur.push({ type: s.type, count: take }); n += take; left -= take; if (n >= 10) { out.push(cur); cur = []; n = 0 } } }
    if (cur.length) out.push(cur); return out
  }
  async function generate(cfg, onProgress, cancelled) {
    const src = sourceText(cfg), batches = groupBatches(cfg.sections.filter(s => s.count > 0)); let raw = [], model = null
    for (let i = 0; i < batches.length; i++) {
      if (cancelled()) throw SN.mkErr('cancelled', 'Cancelled.'); onProgress('Making questions… part ' + (i + 1) + ' of ' + batches.length)
      const r = await SN.ai({ prompt: batchPrompt(cfg, batches[i], src), json: true, validate: validQuestions, fresh: true }); model = r; raw = raw.concat(r.value)
    }
    let built = L.assemblePaper(cfg, raw)
    if (Object.keys(built.missing).length && !cancelled()) { // one top-up request for questions that were unusable or repeated
      onProgress('Making a few more questions…'); const want = Object.keys(built.missing).map(t => ({ type: t, count: Math.min(10, built.missing[t] + 1) }))
      try { const r = await SN.ai({ prompt: batchPrompt(cfg, want, src), json: true, validate: validQuestions, fresh: true }); raw = raw.concat(r.value); built = L.assemblePaper(cfg, raw); model = r } catch (e) { /* the paper is built with the questions we already have */ }
    }
    return { built, model }
  }

  /* ---------- printing ---------- */
  function buildPrint(paper) {
    const wrap = h('div'), P = h('div', { class: 'paper-part' }), K = h('div', { class: 'key-part' }); wrap.appendChild(P); wrap.appendChild(K)
    P.appendChild(h('h1', null, paper.title)); P.appendChild(h('div', { style: 'text-align:center' }, paper.subject + ' · Class IX · ICSE syllabus (practice paper)'))
    P.appendChild(h('div', { class: 'meta' }, h('span', null, paper.durationMin ? 'Time: ' + paper.durationMin + ' minutes' : 'Time: as you wish'), h('span', null, 'Maximum marks: ' + paper.totalMarks)))
    P.appendChild(h('div', null, h('strong', null, 'Syllabus covered: '), paper.scope)); P.appendChild(h('h3', null, 'Instructions')); P.appendChild(h('ol', { class: 'ins' }, paper.instructions.map(x => h('li', null, x))))
    paper.sections.forEach(s => {
      P.appendChild(h('h2', null, 'Section ' + s.letter + ': ' + s.title + ' (' + s.perQuestion + ' mark' + (s.perQuestion > 1 ? 's' : '') + ' each)'))
      s.questions.forEach(q => {
        const box = h('div', { class: 'pq' }, h('div', { class: 't' }, h('span', null, q.n + '. ' + q.text), h('span', { class: 'm' }, '[' + q.marks + ']')))
        if (q.type === 'mcq') box.appendChild(h('ul', { class: 'opts' }, q.options.map((o, i) => h('li', null, '(' + 'ABCD'[i] + ') ' + o))))
        else if (q.type === 'tf') box.appendChild(h('div', { style: 'margin-left:18pt' }, 'True / False'))
        else if (q.type === 'fill') { /* the blank is in the question */ }
        else { const n = q.type === 'num' ? 4 : Math.min(14, Math.max(3, q.marks * 2)); box.appendChild(h('div', { class: 'lines' }, Array.from({ length: n }, () => h('div')))) }
        P.appendChild(box)
      })
    })
    P.appendChild(h('p', { class: 'practice' }, 'Practice material made by StudyNest. This is not an official CISCE examination paper. AI-made questions can have mistakes, so check with your teacher.'))
    K.appendChild(h('div', { class: 'pb' }, h('h1', null, 'Answer key and marking scheme'), h('div', { style: 'text-align:center' }, paper.title + ' · ' + paper.subject)))
    const rows = []; L.allQuestions(paper).forEach(q => rows.push(h('tr', null, h('td', null, String(q.n)), h('td', null, keyText(q).slice(0, 400)), h('td', null, String(q.marks)))))
    K.appendChild(h('table', null, h('thead', null, h('tr', null, h('th', null, 'Q'), h('th', null, 'Answer'), h('th', null, 'Marks'))), h('tbody', null, rows)))
    const written = L.allQuestions(paper).filter(q => !L.isAuto(q) && (q.markingScheme || []).length); if (written.length) { K.appendChild(h('h2', null, 'Marking scheme for written answers')); written.forEach(q => K.appendChild(h('div', { class: 'pq' }, h('strong', null, 'Q' + q.n + ' [' + q.marks + ' marks]'), h('ul', null, q.markingScheme.map(m => h('li', null, m)))))) }
    K.appendChild(h('p', { class: 'practice' }, 'Practice material made by StudyNest. Not an official CISCE document. Total marks: ' + paper.totalMarks + '.'))
    return wrap
  }
  const doPrint = (paper, kind) => SN.printNode(kind, buildPrint(paper), 'StudyNest - ' + paper.title + (kind === 'key' ? ' - answer key' : ''))

  /* ---------- the view ---------- */
  function renderExam(box, arg) {
    let timerId = null, saveT = null, rec = null, idx = 0, cancelFlag = false
    const stopTimers = () => { clearInterval(timerId); timerId = null; clearTimeout(saveT) }
    const flush = () => { if (rec && rec.status === 'inprogress') { clearTimeout(saveT); SN.put('paper', rec.id, rec) } }
    const onHide = () => { if (document.hidden) flush() }
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush)
    const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(flush, 400) }

    /* ===== setup + list ===== */
    function home() {
      stopTimers(); clear(box); rec = null; SN.setDirty(null)
      box.appendChild(h('p', { class: 'sn-sub' }, 'Make an exam-style practice paper, take it with a timer, and see which topics need work. These papers are practice material, not official CISCE papers.'))
      const papers = SN.list('paper').sort((a, b) => b.created - a.created), open = papers.filter(p => p.status !== 'submitted'), done = papers.filter(p => p.status === 'submitted')
      if (open.length) { box.appendChild(h('h3', { class: 'sn-sec' }, 'Continue')); const ul = h('div', { class: 'sn-list' }); open.forEach(p => ul.appendChild(item(p, [h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => run(p) }, p.status === 'inprogress' ? 'Resume' : 'Start')], p.status === 'inprogress' ? 'In progress' : 'Ready'))); box.appendChild(ul) }
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Make a new paper')); setup()
      if (done.length) { box.appendChild(h('h3', { class: 'sn-sec' }, 'Finished papers')); const ul = h('div', { class: 'sn-list' }); done.slice(0, 10).forEach(p => { const sc = L.scorePaper(p, p.answers || {}, p.written || {}); ul.appendChild(item(p, [h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => results(p) }, 'Results')], sc.got + '/' + sc.totalOut + (sc.complete ? '' : '+'))) }); box.appendChild(ul); if (done.length > 10) box.appendChild(h('p', { class: 'sn-note' }, 'Showing the 10 newest of ' + done.length + ' papers.')) }
    }
    const item = (p, btns, badge) => h('div', { class: 'sn-item' }, h('div', { class: 'sn-ico', 'aria-hidden': 'true' }, '📝'), h('div', { class: 'grow' }, h('strong', null, p.title), h('small', null, p.subject + ' · ' + p.count + ' questions · ' + p.totalMarks + ' marks · ' + fmtDate(p.created))), h('span', { class: 'sn-badge' }, badge), h('div', { class: 'sn-row' }, btns, h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'Delete ' + p.title, onclick: async () => { if (await SN.confirm('Delete this paper' + (p.status === 'submitted' ? ' and its results' : '') + '? This cannot be undone.', 'Delete paper')) { SN.remove('paper', p.id); home() } } }, '×')))

    function setup() {
      const f = { subjectId: (arg && arg.subjectId) || selectedSubject, scopeKind: 'chapters', chapters: new Set(), topics: new Set(), difficulty: 'medium', total: 20, custom: 20, counts: {}, time: 'auto', show: 'after' }
      const s0 = () => SN.subjectById(f.subjectId), types = () => L.typesFor(f.subjectId)
      const out = h('div'); box.appendChild(out)
      const plan = total => { const wanted = ['mcq', 'fill', 'tf', 'short', 'long'].filter(t => types().includes(t)); const p = L.planSections(wanted, total); types().forEach(t => { f.counts[t] = p.counts[t] || 0 }); if (!p.exact) showToast('These question types cannot make exactly ' + total + ' marks. Change the numbers below.') }
      const totals = () => { let n = 0, m = 0; types().forEach(t => { const c = f.counts[t] || 0; n += c; m += c * T[t].marks }); return { n, m } }
      const paintTotals = () => { const t = totals(), el = $('examTotals'); if (el) { el.textContent = t.n + ' question' + (t.n === 1 ? '' : 's') + ' · ' + t.m + ' marks' + (t.n > MAX_Q ? ' (maximum is ' + MAX_Q + ' questions)' : '') } }
      const paint = () => {
        clear(out); const s = s0()
        out.appendChild(h('div', { class: 'sn-form' },
          h('div', null, h('label', { class: 'sn-lbl', for: 'xSub' }, 'Subject'), h('select', { id: 'xSub', onchange: e => { f.subjectId = e.target.value; f.chapters.clear(); f.topics.clear(); plan(f.total === 'custom' ? f.custom : f.total); paint() } }, DB.map(x => { const o = h('option', { value: x.id }, x.name); if (x.id === f.subjectId) o.selected = true; return o }))),
          h('div', null, h('label', { class: 'sn-lbl', for: 'xScope' }, 'What should it cover?'), h('select', { id: 'xScope', onchange: e => { f.scopeKind = e.target.value; paint() } }, [['chapters', 'Chapters I choose'], ['full', 'Whole syllabus of this subject']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === f.scopeKind) o.selected = true; return o }))),
          h('div', null, h('label', { class: 'sn-lbl', for: 'xDiff' }, 'Difficulty'), h('select', { id: 'xDiff', onchange: e => { f.difficulty = e.target.value } }, Object.keys(DIFF).map(k => { const o = h('option', { value: k }, DIFF[k]); if (k === f.difficulty) o.selected = true; return o })))))
        if (f.scopeKind === 'chapters') {
          out.appendChild(h('div', { class: 'sn-row sp', style: 'margin-top:12px' }, h('span', { class: 'sn-lbl' }, 'Choose one or more chapters'), h('span', null, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { s.chapters.forEach(c => f.chapters.add(c[0])); paint() } }, 'Select all'), ' ', h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { f.chapters.clear(); paint() } }, 'Clear'))))
          out.appendChild(h('div', { class: 'sn-checks', role: 'group', 'aria-label': 'Chapters' }, s.chapters.map(c => h('label', null, h('input', { type: 'checkbox', checked: f.chapters.has(c[0]) ? true : null, onchange: e => { e.target.checked ? f.chapters.add(c[0]) : f.chapters.delete(c[0]) } }), ' ' + c[0]))))
        }
        const subs = SUBTOPICS[f.subjectId] || []
        if (subs.length) { out.appendChild(h('div', { class: 'sn-lbl', style: 'margin-top:12px' }, 'Focus on certain topics? (optional)')); out.appendChild(h('div', { class: 'sn-checks', role: 'group', 'aria-label': 'Topics' }, subs.map(t => h('label', null, h('input', { type: 'checkbox', checked: f.topics.has(t) ? true : null, onchange: e => { e.target.checked ? f.topics.add(t) : f.topics.delete(t) } }), ' ' + t)))) }
        out.appendChild(h('h3', { class: 'sn-sec' }, 'Marks and questions'))
        out.appendChild(h('div', { class: 'sn-row' }, h('label', { class: 'sn-lbl', for: 'xTotal', style: 'margin:0' }, 'Total marks'), h('select', { id: 'xTotal', onchange: e => { const v = e.target.value; f.total = v === 'custom' ? 'custom' : Number(v); plan(f.total === 'custom' ? f.custom : f.total); paint() } }, [10, 20, 30, 40, 50, 80, 'custom'].map(v => { const o = h('option', { value: v }, v === 'custom' ? 'Other…' : String(v)); if (v === f.total) o.selected = true; return o })),
          f.total === 'custom' ? h('input', { type: 'number', class: 'sn-in', style: 'width:110px', min: 1, max: 120, value: f.custom, 'aria-label': 'Custom total marks', onchange: e => { const n = Math.round(Number(e.target.value)); if (!(n >= 1 && n <= 120)) { showToast('Choose from 1 to 120 marks.'); e.target.value = f.custom; return } f.custom = n; plan(n); paint() } }) : null,
          h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { plan(f.total === 'custom' ? f.custom : f.total); paint() } }, 'Fill in the numbers for me')))
        const grid = h('div', { class: 'sn-form', style: 'margin-top:10px' }); types().forEach(t => grid.appendChild(h('div', null, h('label', { class: 'sn-lbl', for: 'xq_' + t }, T[t].label + ' (' + T[t].marks + ' mark' + (T[t].marks > 1 ? 's' : '') + ' each)'), h('input', { id: 'xq_' + t, type: 'number', min: 0, max: 25, value: f.counts[t] || 0, inputmode: 'numeric', onchange: e => { const n = Math.round(Number(e.target.value)); f.counts[t] = n >= 0 && n <= 25 ? n : 0; e.target.value = f.counts[t]; paintTotals() } })))); out.appendChild(grid)
        out.appendChild(h('p', { class: 'sn-note', id: 'examTotals', role: 'status' }))
        out.appendChild(h('div', { class: 'sn-form' },
          h('div', null, h('label', { class: 'sn-lbl', for: 'xTime' }, 'Time limit'), h('select', { id: 'xTime', onchange: e => { f.time = e.target.value } }, [['auto', 'Suggested (1 minute per mark)'], ['0', 'No timer'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '60 minutes'], ['90', '90 minutes'], ['120', '2 hours']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === f.time) o.selected = true; return o }))),
          h('div', null, h('label', { class: 'sn-lbl', for: 'xShow' }, 'Show the answers'), h('select', { id: 'xShow', onchange: e => { f.show = e.target.value } }, [['after', 'After I submit the paper'], ['now', 'After each question I answer']].map(([v, l]) => { const o = h('option', { value: v }, l); if (v === f.show) o.selected = true; return o })))))
        out.appendChild(h('p', { class: 'sn-note' }, 'Questions are made from your saved lessons for these chapters when you have them. There is no textbook text in StudyNest, so otherwise the AI follows the ICSE Class 9 syllabus topics. It can make mistakes.'))
        const msg = h('div', { id: 'examMsg', 'aria-live': 'polite' })
        out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'examGo', onclick: go }, '✦ Make my paper'))); out.appendChild(msg); paintTotals()
      }
      const go = async () => {
        const msg = $('examMsg'), btn = $('examGo'), t = totals(); clear(msg)
        if (f.scopeKind === 'chapters' && !f.chapters.size) { msg.appendChild(h('div', { class: 'sn-warn' }, 'Choose at least one chapter, or pick "Whole syllabus".')); return }
        if (t.n < 1) { msg.appendChild(h('div', { class: 'sn-warn' }, 'Add at least one question.')); return } if (t.n > MAX_Q) { msg.appendChild(h('div', { class: 'sn-warn' }, 'Please ask for at most ' + MAX_Q + ' questions.')); return }
        const s = s0(), chapters = f.scopeKind === 'full' ? [] : Array.from(f.chapters), dur = f.time === 'auto' ? Math.max(5, t.m) : Number(f.time)
        const cfg = { title: s.name + ' practice paper', subject: s.name, subjectId: s.id, scopeKind: f.scopeKind, chapters, topics: Array.from(f.topics), scope: f.scopeKind === 'full' ? 'Whole ' + s.name + ' syllabus (Class 9)' : chapters.join('; '), difficulty: f.difficulty, durationMin: dur, showAnswers: f.show, sections: types().filter(x => f.counts[x] > 0).map(x => ({ type: x, count: f.counts[x] })) }
        cancelFlag = false; btn.disabled = true
        const status = h('p', { class: 'sn-note', role: 'status' }, 'Making your paper…'); msg.appendChild(h('div', { class: 'sn-row' }, h('div', { class: 'spinner', style: 'margin:0' }), status, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { cancelFlag = true; status.textContent = 'Cancelling after the current step…' } }, 'Cancel')))
        try {
          const { built, model } = await generate(cfg, m => { status.textContent = m }, () => cancelFlag)
          const paper = built.paper; if (!paper.count) throw SN.mkErr('format', 'The AI did not give any usable questions. Please try again.')
          const v = L.validatePaper(paper); if (!v.ok) throw SN.mkErr('format', 'The paper did not pass the checks (' + v.errors[0] + ') Please try again.')
          const id = 'p_' + SN.uid(); rec = Object.assign({}, paper, { id, status: 'ready', created: Date.now(), answers: {}, flags: {}, checked: {}, written: {}, startedAt: 0, durationMs: paper.durationMin * 60000, model: model ? model.model : '' })
          SN.put('paper', id, rec); const miss = Object.keys(built.missing).length
          clear(msg); if (miss) msg.appendChild(h('div', { class: 'sn-warn' }, 'Only ' + paper.count + ' of ' + t.n + ' questions could be made, so this paper has ' + paper.totalMarks + ' marks instead of ' + t.m + '.')); msg.appendChild(SN.modelNote(model))
          msg.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => run(SN.get('paper', id)) }, '▶ Start now'), h('button', { class: 'btn btn-light', type: 'button', onclick: () => doPrint(rec, 'paper') }, '⎙ Print paper'), h('button', { class: 'btn btn-light', type: 'button', onclick: () => doPrint(rec, 'key') }, '⎙ Print answer key'), h('button', { class: 'btn btn-outline', type: 'button', onclick: home }, 'Later')))
        } catch (err) { clear(msg); if (err.kind !== 'cancelled') msg.appendChild(SN.errBox(err, go)); else msg.appendChild(h('p', { class: 'sn-note' }, 'Cancelled.')) } finally { btn.disabled = false }
      }
      plan(f.total); paint()
    }

    /* ===== taking the exam ===== */
    function run(p) {
      rec = p; if (p.status === 'submitted') return results(p); if (!p.answers) p.answers = {}; if (!p.flags) p.flags = {}; if (!p.checked) p.checked = {}
      if (p.status === 'ready') { p.status = 'inprogress'; p.startedAt = Date.now(); SN.put('paper', p.id, p) }
      if (p.durationMs && p.startedAt + p.durationMs <= Date.now()) { showToast('The time for this paper ended while you were away, so it was submitted.'); return submit(true) }
      idx = 0; draw(); stopTimers(); if (p.durationMs) timerId = setInterval(tick, 1000)
    }
    const qs = () => L.allQuestions(rec)
    function tick() { const el = $('examTimer'); if (!el || !rec) return; const left = rec.startedAt + rec.durationMs - Date.now(); el.textContent = '⏱ ' + fmtClock(left); el.classList.toggle('low', left < 5 * 60000); if (left <= 0) { showToast('Time is up. Your paper was submitted.'); submit(true) } }
    function draw() {
      clear(box); const list = qs(), q = list[idx], answered = list.filter(x => (rec.answers[x.id] || '').toString().trim()).length, flagged = list.filter(x => rec.flags[x.id]).length
      box.appendChild(h('div', { class: 'sn-row sp' }, h('div', null, h('strong', null, rec.title), h('div', { class: 'sn-note' }, 'Answered ' + answered + ' of ' + list.length + (flagged ? ' · ' + flagged + ' marked for review' : ''))), rec.durationMs ? h('div', { class: 'sn-timer', id: 'examTimer', role: 'timer' }, '⏱ ' + fmtClock(rec.startedAt + rec.durationMs - Date.now())) : h('div', { class: 'sn-badge' }, 'No timer')))
      box.appendChild(h('div', { class: 'sn-qnav', role: 'group', 'aria-label': 'Question navigator' }, list.map((x, i) => h('button', { type: 'button', class: 'sn-qn' + ((rec.answers[x.id] || '').toString().trim() ? ' done' : '') + (rec.flags[x.id] ? ' flag' : '') + (i === idx ? ' cur' : ''), 'aria-label': 'Question ' + x.n + ((rec.answers[x.id] || '').toString().trim() ? ', answered' : ', not answered') + (rec.flags[x.id] ? ', marked for review' : ''), 'aria-current': i === idx ? 'true' : null, onclick: () => { idx = i; draw() } }, String(x.n)))))
      const sec = rec.sections.find(s => s.questions.includes(q))
      const card = h('div', { class: 'sn-q' }, h('div', { class: 'sn-row sp' }, h('span', { class: 'sn-badge' }, 'Section ' + sec.letter + ' · ' + sec.title), h('span', { class: 'sn-badge warn' }, q.marks + ' mark' + (q.marks > 1 ? 's' : ''))), h('p', { class: 'qt', style: 'margin-top:10px' }, q.n + '. ' + q.text))
      const set = v => { rec.answers[q.id] = v; saveSoon(); refreshNav() }
      if (q.type === 'mcq') q.options.forEach((o, i) => { const L1 = 'ABCD'[i]; card.appendChild(h('label', { class: 'sn-opt' + optState(q, L1) }, h('input', { type: 'radio', name: 'ans', value: L1, checked: (rec.answers[q.id] || '').toUpperCase() === L1 ? true : null, onchange: () => { set(L1); if (rec.showAnswers === 'now') drawKeepCard() } }), h('span', null, L1 + '. ' + o))) })
      else if (q.type === 'tf') ['True', 'False'].forEach(v => card.appendChild(h('label', { class: 'sn-opt' + optState(q, v) }, h('input', { type: 'radio', name: 'ans', value: v, checked: (rec.answers[q.id] || '') === v ? true : null, onchange: () => { set(v); if (rec.showAnswers === 'now') drawKeepCard() } }), h('span', null, v))))
      else if (q.type === 'fill' || q.type === 'num') card.appendChild(h('input', { type: 'text', class: 'sn-in', 'aria-label': 'Your answer', placeholder: q.type === 'num' ? 'Number and unit, for example 12 m/s' : 'Type the missing word', value: rec.answers[q.id] || '', autocomplete: 'off', oninput: e => set(e.target.value) }))
      else card.appendChild(h('textarea', { class: 'sn-in', rows: 7, 'aria-label': 'Your answer', placeholder: 'Write your answer here…', maxlength: 4000, oninput: e => set(e.target.value) }, rec.answers[q.id] || ''))
      card.appendChild(h('label', { class: 'sn-checks', style: 'margin-top:10px' }, h('span', null, h('input', { type: 'checkbox', checked: rec.flags[q.id] ? true : null, onchange: e => { rec.flags[q.id] = e.target.checked; if (!e.target.checked) delete rec.flags[q.id]; saveSoon(); refreshNav() } }), ' ⚑ Mark for review')))
      if (rec.showAnswers === 'now') { const fb = h('div', { id: 'liveFb' }); card.appendChild(fb); if (rec.checked[q.id]) liveFeedback(q, fb); else card.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { rec.checked[q.id] = true; saveSoon(); draw() } }, L.isAuto(q) ? 'Check my answer' : 'Show the marking scheme'))) }
      box.appendChild(card)
      box.appendChild(h('div', { class: 'action-row sn-row sp' }, h('button', { class: 'btn btn-outline', type: 'button', disabled: idx === 0 ? true : null, onclick: () => { idx--; draw() } }, '← Previous'), idx < list.length - 1 ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { idx++; draw() } }, 'Next →') : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => submit(false) }, 'Review and submit')))
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-dark btn-sm', type: 'button', onclick: () => submit(false) }, '✓ Submit paper'), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { flush(); stopTimers(); showToast('Saved. The timer keeps running while you are away.'); home() } }, 'Save and leave')))
      if (rec.durationMs) tick()
    }
    function optState(q, v) { if (rec.showAnswers !== 'now' || !rec.checked[q.id]) return ''; const key = q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.answer; if (v === key) return ' ok'; return (rec.answers[q.id] || '').toUpperCase() === v.toUpperCase() ? ' no' : '' }
    function liveFeedback(q, fb) { clear(fb); if (L.isAuto(q)) { const r = L.checkObjective(q, rec.answers[q.id]); fb.appendChild(h('div', { class: 'sn-fb ' + (r.status === 'correct' || r.status === 'close' ? 'ok' : r.status === 'partial' ? 'mid' : 'no') }, h('strong', null, r.status === 'correct' ? 'Correct. ' : r.status === 'close' ? 'Accepted. ' : r.status === 'partial' ? 'Partly correct. ' : r.status === 'blank' ? 'No answer. ' : 'Not quite. '), r.reason, q.explanation ? ' ' + q.explanation : '')) } else { fb.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Marking scheme'), h('ul', null, (q.markingScheme || []).map(m => h('li', null, m))), q.modelAnswer ? h('p', null, h('strong', null, 'Model answer: '), q.modelAnswer) : null)) } }
    function drawKeepCard() { const keep = idx; rec.checked[qs()[keep].id] = true; draw() }
    function refreshNav() { const list = qs(); document.querySelectorAll('.sn-qn').forEach((b, i) => { const x = list[i]; b.classList.toggle('done', !!(rec.answers[x.id] || '').toString().trim()); b.classList.toggle('flag', !!rec.flags[x.id]) }) }

    async function submit(auto) {
      const list = qs(), blank = list.filter(x => !(rec.answers[x.id] || '').toString().trim()).length, flagged = list.filter(x => rec.flags[x.id]).length
      if (!auto) { const ok = await SN.confirm('Submit this paper now?' + (blank ? ' ' + blank + ' question' + (blank > 1 ? 's are' : ' is') + ' not answered.' : '') + (flagged ? ' ' + flagged + ' marked for review.' : '') + ' You cannot change your answers after submitting.', 'Submit paper', false); if (!ok) return }
      stopTimers(); clearTimeout(saveT); rec.status = 'submitted'; rec.submittedAt = Date.now(); rec.written = rec.written || {}
      SN.put('paper', rec.id, rec); recordResults(rec); SN.activity('exam', rec.subjectId); SN.checkAwards && SN.checkAwards(); results(rec)
    }
    function recordResults(p) { // one result per topic (the id never changes, so marking again never double counts)
      const sc = L.scorePaper(p, p.answers || {}, p.written || {}), byTopic = {}
      L.allQuestions(p).forEach(q => { const r = sc.results[q.id]; if (!r || r.status === 'blank' || r.status === 'unmarked') return; const t = q.topic || 'General', e = byTopic[t] || (byTopic[t] = { correct: 0, total: 0 }); e.total++; if (r.status === 'correct' || r.status === 'close' || (r.status === 'partial' && r.marks >= q.marks * 0.6)) e.correct++
        else SN.addMistake({ source: 'exam', paperId: p.id, qid: q.id, subjectId: p.subjectId, subject: p.subject, topic: t, question: q.text + (q.options ? ' ' + q.options.map((o, i) => '(' + 'ABCD'[i] + ') ' + o).join(' ') : ''), yourAnswer: answerShown(q, (p.answers || {})[q.id]), correctAnswer: keyText(q), explanation: q.explanation || '' }) })
      Object.keys(byTopic).forEach(t => SN.recordAttempt('exam', p.subjectId, t, byTopic[t].correct, byTopic[t].total, 'exam_' + p.id + '_' + SN.hash(t)))
    }

    /* ===== results ===== */
    function results(p) {
      stopTimers(); clear(box); rec = p; const sc = L.scorePaper(p, p.answers || {}, p.written || {}), list = L.allQuestions(p)
      box.appendChild(h('div', { class: 'sn-row sp' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: home }, '← All papers'), h('div', { class: 'sn-row' }, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => doPrint(p, 'paper') }, '⎙ Print paper'), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => doPrint(p, 'key') }, '⎙ Print answer key'), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => retake(p) }, '↻ Try again'))))
      box.appendChild(h('h3', { class: 'sn-sec' }, p.title))
      box.appendChild(h('div', { class: 'sn-grid' }, stat(sc.got + ' / ' + p.totalMarks, 'Marks', sc.complete ? sc.percent + '%' : 'so far (' + sc.unmarked + ' marks still to mark)'), stat(sc.autoGot + ' / ' + sc.autoOut, 'Automatic marking', 'multiple choice, true/false, fill-in, numericals'), stat(list.filter(q => !(p.answers[q.id] || '').toString().trim()).length, 'Not answered')))
      if (!sc.complete) box.appendChild(h('div', { class: 'sn-warn' }, 'Written answers are not marked by the computer. Compare each one with the marking scheme and give yourself marks, or ask the AI for a suggestion. Your total updates as you go.'))
      const tb = L.topicBreakdown(p, sc.results)
      if (tb.length) {
        box.appendChild(h('h3', { class: 'sn-sec' }, 'Topics'))
        const rows = tb.map(t => h('tr', null, h('td', null, t.topic), h('td', null, t.got + ' / ' + t.out), h('td', null, h('span', { class: 'sn-badge ' + (t.got / t.out >= 0.6 ? 'ok' : 'bad') }, pct(t.got, t.out) + '%'))))
        box.appendChild(h('div', { class: 'sn-scroll' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Topic'), h('th', null, 'Marks'), h('th', null, 'Result'))), h('tbody', null, rows))))
        box.appendChild(h('p', { class: 'sn-note' }, 'A topic is called weak only after at least 3 answered questions under 60% across your saved results.'))
      }
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Question by question')); const wrap = h('div'); box.appendChild(wrap)
      list.forEach(q => wrap.appendChild(reviewCard(p, q, sc.results[q.id])))
    }
    function reviewCard(p, q, r) {
      const ans = (p.answers || {})[q.id], ok = r.status === 'correct' || r.status === 'close'
      const c = h('div', { class: 'sn-q' }, h('div', { class: 'sn-row sp' }, h('strong', null, 'Question ' + q.n), h('span', { class: 'sn-badge ' + (ok ? 'ok' : r.status === 'unmarked' || r.status === 'partial' ? 'warn' : 'bad') }, r.status === 'unmarked' ? 'Not marked yet' : r.status === 'blank' ? 'Not answered · 0/' + q.marks : r.marks + ' / ' + q.marks)), h('p', { class: 'qt' }, q.text))
      if (q.options) c.appendChild(h('ul', null, q.options.map((o, i) => h('li', null, 'ABCD'[i] + '. ' + o))))
      c.appendChild(h('p', null, h('strong', null, 'Your answer: '), answerShown(q, ans)))
      if (L.isAuto(q)) { c.appendChild(h('div', { class: 'sn-fb ' + (ok ? 'ok' : r.status === 'partial' ? 'mid' : 'no') }, r.reason + (r.status !== 'correct' ? ' Correct answer: ' + keyText(q) + '.' : ''), q.explanation ? h('div', null, h('strong', null, 'Why: '), q.explanation) : null)) }
      else {
        c.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Marking scheme'), h('ul', null, (q.markingScheme || []).map(m => h('li', null, m))), q.modelAnswer ? h('p', null, h('strong', null, 'Model answer: '), q.modelAnswer) : null))
        const cov = L.keywordCoverage(ans || '', q.keywords); if (cov && (ans || '').trim()) c.appendChild(h('p', { class: 'sn-note' }, 'Key words check (a hint only): your answer uses ' + cov.hit + ' of ' + cov.total + ' key words' + (cov.missing.length ? '. Not found: ' + cov.missing.join(', ') : '') + '.'))
        if ((ans || '').trim()) {
          const sel = h('select', { id: 'mk_' + q.id, class: 'sn-in', style: 'width:auto', 'aria-label': 'Marks for question ' + q.n, onchange: e => setMark(p, q, e.target.value) }, [h('option', { value: '' }, 'Choose marks')].concat(Array.from({ length: q.marks + 1 }, (_, i) => { const o = h('option', { value: String(i) }, i + ' / ' + q.marks); if ((p.written || {})[q.id] === i) o.selected = true; return o })))
          const aiOut = h('div'); c.appendChild(h('div', { class: 'sn-row' }, h('label', { class: 'sn-lbl', for: 'mk_' + q.id, style: 'margin:0' }, 'My marks:'), sel, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: async e => { const b = e.currentTarget; b.disabled = true; clear(aiOut); aiOut.appendChild(h('p', { class: 'sn-note' }, 'Marking…')); try { const m = await aiMark(p, q, ans); clear(aiOut); aiOut.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'AI suggests ' + m.value.marks + ' / ' + q.marks + '. '), m.value.reason, h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => setMark(p, q, m.value.marks) }, 'Use this mark')), h('small', { class: 'muted' }, 'AI marking can be wrong. You decide the final mark.'))); aiOut.appendChild(SN.modelNote(m)) } catch (err) { clear(aiOut); aiOut.appendChild(SN.errBox(err)) } finally { b.disabled = false } } }, '✦ Ask AI to suggest marks'))); c.appendChild(aiOut)
        } else c.appendChild(h('p', { class: 'sn-note' }, 'You did not answer this question, so it scores 0.'))
      }
      const row = h('div', { class: 'action-row' }); if (!ok && r.status !== 'unmarked') { row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { const x = SN.addCards([{ front: q.text.slice(0, 300), back: (keyText(q) + (q.explanation ? ' — ' + q.explanation : '')).slice(0, 600) }], { subjectId: p.subjectId, topic: q.topic, source: 'exam' }); showToast(x.added ? 'Added to your flashcards.' : 'That card is already in your flashcards.') } }, '▧ Make a flashcard')); row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => SN.show('detective') }, '🔍 Why did I get this wrong?')) }
      if (row.children.length) c.appendChild(row); return c
    }
    function setMark(p, q, v) { const n = Math.max(0, Math.min(q.marks, Math.round(Number(v)))); if (!isFinite(n)) return; p.written = p.written || {}; p.written[q.id] = n; SN.put('paper', p.id, p); recordResults(p); results(p); showToast('Marks saved.') }
    function aiMark(p, q, ans) {
      const prompt = SN.ICSE_ROLE + '\nMark this student\'s written answer. Be fair: accept correct answers worded differently from the model answer.\nQUESTION (' + q.marks + ' marks): ' + q.text + '\nMARKING SCHEME: ' + (q.markingScheme || []).join(' | ') + '\nMODEL ANSWER: ' + (q.modelAnswer || '') + '\nSTUDENT ANSWER: ' + String(ans).slice(0, 3000) + '\n\nReply with ONLY this JSON: {"marks": a whole number from 0 to ' + q.marks + ', "reason": "one or two simple sentences saying which points were given and which were missing"}\n' + SN.rules(true)
      return SN.ai({ prompt, json: true, validate: v => { const m = Math.round(Number(v && v.marks)); if (!isFinite(m) || m < 0 || m > q.marks || !L.clean(v.reason, 400)) throw new Error('bad mark'); return { marks: m, reason: L.clean(v.reason, 400) } }, key: 'mark|' + p.id + '|' + q.id + '|' + SN.hash(String(ans)) })
    }
    function retake(p) { const id = 'p_' + SN.uid(), c = JSON.parse(JSON.stringify(p)); Object.assign(c, { id, status: 'ready', created: Date.now(), answers: {}, flags: {}, checked: {}, written: {}, startedAt: 0, submittedAt: 0 }); SN.put('paper', id, c); run(SN.get('paper', id)) }

    home()
    return () => { flush(); stopTimers(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush) }
  }

  SN.views.exam = { title: 'Exam coach', render: renderExam, noAuto: true }
  SN.examPrint = doPrint
})()
