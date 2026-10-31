/* StudyNest pure logic: no DOM, no network. Works in the browser (window.SNL) and in Node tests (module.exports).
   Everything here is deterministic so it can be unit tested. */
(function (root) {
  'use strict'
  const DAY = 86400000, MIN = 60000

  /* ---------- small text helpers ---------- */
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' }
  const ascii = s => String(s == null ? '' : s).replace(/[₀-₉]/g, c => SUB[c])
  const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 1000)
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}.\-+/%\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'is', 'are', 'and', 'or', 'to', 'what', 'which', 'why', 'how', 'define', 'name', 'state', 'write', 'give', 'explain', 'with', 'for', 'by', 'it', 'its', 'this', 'that'])
  const words = s => norm(s).split(' ').filter(w => w && !STOP.has(w))
  function similarity(a, b) {
    const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0
    let n = 0; A.forEach(w => { if (B.has(w)) n++ }); return n / (A.size + B.size - n)
  }
  function editDistance(a, b) { // Damerau-Levenshtein (a swapped pair of letters counts as 1 slip)
    if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r }); for (let j = 0; j <= n; j++) d[0][j] = j
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
    return d[m][n]
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b] } return a }

  /* ---------- dates (always the student's local day) ---------- */
  const pad = n => String(n).padStart(2, '0')
  const dayKey = (ts) => { const d = new Date(ts == null ? Date.now() : ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
  const endOfDay = (ts) => { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime() }
  function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); const t = new Date(y, m - 1, d + n, 12); return dayKey(t.getTime()) }
  function weekKey(ts) { const d = new Date(ts); d.setHours(12, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return dayKey(d.getTime()) } // Monday of that week
  function daysUntil(dateStr, now) { // dateStr "YYYY-MM-DD" chosen by the student; whole local days
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null
    const [y, m, d] = dateStr.split('-').map(Number); const t = new Date(y, m - 1, d, 12).getTime(), n = new Date(now == null ? Date.now() : now); n.setHours(12, 0, 0, 0)
    return Math.round((t - n.getTime()) / DAY)
  }
  function streakFrom(dayKeys, now) { // consecutive active days ending today or yesterday (a student who has not studied yet today keeps the streak)
    const set = new Set(dayKeys), today = dayKey(now == null ? Date.now() : now)
    let k = set.has(today) ? today : addDays(today, -1), n = 0
    while (set.has(k)) { n++; k = addDays(k, -1) }
    return n
  }

  /* ---------- JSON from AI text ---------- */
  function extractJson(text) {
    const t = String(text == null ? '' : text); const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const cands = []; if (fence) cands.push(fence[1]); cands.push(t)
    for (const c of cands) {
      const start = c.search(/[\[{]/); if (start < 0) continue
      const open = c[start], close = open === '{' ? '}' : ']'; let depth = 0, inStr = false, esc = false
      for (let i = start; i < c.length; i++) {
        const ch = c[i]
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
        if (ch === '"') inStr = true; else if (ch === open) depth++; else if (ch === close && --depth === 0) {
          const raw = c.slice(start, i + 1)
          for (const s of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(s) } catch (e) { /* try next */ } }
          break
        }
      }
    }
    return null
  }

  /* ---------- question types and papers ---------- */
  const TYPES = {
    mcq: { label: 'Multiple choice', marks: 1, auto: true, short: 'MCQ' },
    tf: { label: 'True or false', marks: 1, auto: true, short: 'T/F' },
    fill: { label: 'Fill in the blanks', marks: 1, auto: true, short: 'Fill' },
    define: { label: 'Definitions', marks: 2 },
    short: { label: 'Short answer', marks: 2 },
    differ: { label: 'Differences between concepts', marks: 3 },
    reason: { label: 'Reasoning', marks: 3 },
    num: { label: 'Numericals', marks: 3, auto: true },
    draw: { label: 'Diagram-based', marks: 3 },
    long: { label: 'Structured long answer', marks: 5 },
    code: { label: 'Program / output', marks: 4 }
  }
  const SUBJECT_TYPES = {
    chem: ['mcq', 'fill', 'tf', 'define', 'short', 'differ', 'reason', 'num', 'long'],
    bio: ['mcq', 'fill', 'tf', 'define', 'short', 'differ', 'reason', 'draw', 'long'],
    math: ['mcq', 'fill', 'tf', 'num', 'short', 'long'],
    physics: ['mcq', 'fill', 'tf', 'define', 'short', 'reason', 'num', 'draw', 'long'],
    civics: ['mcq', 'fill', 'tf', 'define', 'short', 'reason', 'long'],
    history: ['mcq', 'fill', 'tf', 'define', 'short', 'reason', 'long'],
    geog: ['mcq', 'fill', 'tf', 'define', 'short', 'differ', 'reason', 'draw', 'long'],
    computer: ['mcq', 'fill', 'tf', 'define', 'short', 'code']
  }
  const typesFor = id => SUBJECT_TYPES[id] || ['mcq', 'fill', 'tf', 'define', 'short', 'reason', 'long']
  const marksOf = t => (TYPES[t] ? TYPES[t].marks : 1)

  // Chooses how many questions of each type give EXACTLY the wanted marks. Returns {counts, total, exact}.
  function planSections(types, totalMarks) {
    types = types.filter(t => TYPES[t]); totalMarks = Math.max(0, Math.floor(totalMarks || 0))
    const counts = {}; types.forEach(t => { counts[t] = 0 })
    if (!types.length || !totalMarks) return { counts, total: 0, exact: totalMarks === 0 }
    let used = 0; const order = types.slice().sort((a, b) => marksOf(a) - marksOf(b))
    for (const t of order) { if (used + marksOf(t) <= totalMarks) { counts[t] = 1; used += marksOf(t) } }
    // weights: cheap objective types get more questions
    const weight = t => TYPES[t].auto ? 3 : (marksOf(t) <= 2 ? 2 : 1)
    let guard = 0
    while (guard++ < 500) {
      const fit = types.filter(t => counts[t] > 0 && used + marksOf(t) <= totalMarks); if (!fit.length) break
      fit.sort((a, b) => (counts[a] * marksOf(a)) / weight(a) - (counts[b] * marksOf(b)) / weight(b)); counts[fit[0]]++; used += marksOf(fit[0])
    }
    if (used < totalMarks) { // try to fill the gap with any type (coin change)
      const gap = totalMarks - used, best = new Array(gap + 1).fill(null); best[0] = []
      for (let g = 1; g <= gap; g++) for (const t of types) { const m = marksOf(t); if (g >= m && best[g - m] && (!best[g] || best[g - m].length + 1 < best[g].length)) best[g] = best[g - m].concat(t) }
      if (best[gap]) { best[gap].forEach(t => { counts[t]++ }); used = totalMarks }
    }
    return { counts, total: used, exact: used === totalMarks }
  }

  const letterOf = (answer, opts) => {
    const a = clean(answer, 300).replace(/^\(?([A-Da-d])\)?[\).:]?$/, '$1'); if (/^[A-Da-d]$/.test(a)) return a.toUpperCase()
    const i = opts.findIndex(o => norm(o) === norm(answer)); return i >= 0 ? 'ABCD'[i] : ''
  }
  const toBool = v => { if (typeof v === 'boolean') return v; const s = norm(v); if (['true', 't', 'yes', 'correct'].includes(s)) return true; if (['false', 'f', 'no', 'incorrect', 'wrong'].includes(s)) return false; return null }

  // Cleans one question from the AI. Returns null when it is unusable.
  function normQuestion(raw, type) {
    if (!raw || typeof raw !== 'object' || !TYPES[type]) return null
    const q = { type, topic: clean(raw.topic, 80), text: clean(raw.text || raw.question, 1200), explanation: clean(raw.explanation, 1200) }
    if (!q.text) return null
    if (type === 'mcq') {
      const opts = (Array.isArray(raw.options) ? raw.options : []).map(o => clean(String(o).replace(/^\s*\(?[A-Da-d][\).:]\s+/, ''), 300))
      if (opts.length !== 4 || opts.some(o => !o) || new Set(opts.map(norm)).size !== 4) return null
      const a = letterOf(raw.answer, opts); if (!a) return null; q.options = opts; q.answer = a
    } else if (type === 'tf') {
      const b = toBool(raw.answer); if (b === null) return null; q.answer = b
    } else if (type === 'fill') {
      const acc = [].concat(raw.answer == null ? [] : raw.answer, raw.accept || []).map(x => clean(x, 100)).filter(Boolean); if (!acc.length) return null
      q.answer = acc[0]; q.accept = acc.slice(0, 6); if (!/_{3,}/.test(q.text)) q.text += ' _____'
    } else if (type === 'num') {
      const a = raw.answer, v = Number(a && typeof a === 'object' ? a.value : a); if (!isFinite(v)) return null
      q.answer = { value: v, unit: clean((a && typeof a === 'object' ? a.unit : raw.unit) || '', 20) }
    } else {
      const ms = (Array.isArray(raw.markingScheme) ? raw.markingScheme : []).map(x => clean(x, 300)).filter(Boolean).slice(0, 10)
      const model = clean(raw.modelAnswer || (typeof raw.answer === 'string' ? raw.answer : ''), 1500); if (!ms.length && !model) return null
      q.markingScheme = ms; q.modelAnswer = model; q.keywords = (Array.isArray(raw.keywords) ? raw.keywords : []).map(x => clean(x, 40)).filter(Boolean).slice(0, 10)
    }
    return q
  }

  // Builds a paper from the AI's raw questions. Marks come from OUR table, never from the AI, so totals always add up.
  function assemblePaper(cfg, rawList) {
    const sections = [], missing = {}, taken = []; let n = 0
    const list = (cfg.sections || []).filter(s => s.count > 0 && TYPES[s.type])
    list.forEach((s, si) => {
      const qs = []
      for (const raw of rawList) {
        if (qs.length >= s.count) break
        if (!raw || raw.type !== s.type) continue
        const q = normQuestion(raw, s.type); if (!q) continue
        if (taken.some(t => similarity(t, q.text) >= 0.8)) continue // near duplicate
        taken.push(q.text); n++; q.id = 'q' + n; q.n = n; q.marks = s.marks || marksOf(s.type); qs.push(q)
      }
      if (qs.length < s.count) missing[s.type] = s.count - qs.length
      if (qs.length) sections.push({ id: 's' + (si + 1), letter: String.fromCharCode(65 + sections.length), type: s.type, title: TYPES[s.type].label, perQuestion: s.marks || marksOf(s.type), questions: qs })
    })
    const totalMarks = sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + q.marks, 0), 0)
    const count = sections.reduce((a, s) => a + s.questions.length, 0)
    const paper = { title: cfg.title || 'Practice paper', subject: cfg.subject || '', subjectId: cfg.subjectId || '', scope: cfg.scope || '', difficulty: cfg.difficulty || '', durationMin: cfg.durationMin || 0, showAnswers: cfg.showAnswers === 'now' ? 'now' : 'after', totalMarks, count, sections, instructions: paperInstructions(cfg, totalMarks) }
    return { paper, missing }
  }
  function paperInstructions(cfg, total) {
    const out = ['Attempt all questions.', 'The marks for each question are shown in brackets.']
    if (cfg.durationMin) out.push('Suggested time: ' + cfg.durationMin + ' minutes.')
    out.push('Maximum marks: ' + total + '.', 'This is practice material made by StudyNest. It is not an official CISCE paper.')
    return out
  }

  function validatePaper(p) {
    const errors = [], warnings = []
    if (!p || !Array.isArray(p.sections) || !p.sections.length) return { ok: false, errors: ['The paper has no sections.'], warnings }
    let n = 0, total = 0; const texts = []
    for (const s of p.sections) {
      if (!TYPES[s.type]) errors.push('Unknown question type ' + s.type)
      if (!Array.isArray(s.questions) || !s.questions.length) errors.push('Section ' + s.letter + ' is empty.')
      for (const q of s.questions || []) {
        n++
        if (q.n !== n) errors.push('Question numbering is wrong at question ' + n + '.')
        if (!q.text) errors.push('Question ' + n + ' has no text.')
        if (!Number.isInteger(q.marks) || q.marks < 1) errors.push('Question ' + n + ' has invalid marks.')
        total += q.marks || 0
        if (q.type === 'mcq') { if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('Question ' + n + ' needs 4 options.'); if (!/^[A-D]$/.test(q.answer || '')) errors.push('Question ' + n + ' has no valid answer key.') }
        else if (q.type === 'tf') { if (typeof q.answer !== 'boolean') errors.push('Question ' + n + ' needs a true or false key.') }
        else if (q.type === 'fill') { if (!q.answer) errors.push('Question ' + n + ' has no answer key.') }
        else if (q.type === 'num') { if (!q.answer || !isFinite(q.answer.value)) errors.push('Question ' + n + ' has no numeric key.') }
        else if (!(q.markingScheme && q.markingScheme.length) && !q.modelAnswer) errors.push('Question ' + n + ' has no marking scheme.')
        if (texts.some(t => similarity(t, q.text) >= 0.8)) errors.push('Question ' + n + ' is almost the same as an earlier question.')
        texts.push(q.text)
      }
    }
    if (total !== p.totalMarks) errors.push('Marks add up to ' + total + ' but the paper says ' + p.totalMarks + '.')
    if (n !== p.count) errors.push('The paper says ' + p.count + ' questions but has ' + n + '.')
    return { ok: errors.length === 0, errors, warnings }
  }
  const allQuestions = p => (p.sections || []).flatMap(s => s.questions)

  /* ---------- checking answers ---------- */
  const UNIT_ALIAS = { 'm/s²': 'm/s2', 'm/s^2': 'm/s2', 'ms-2': 'm/s2', 'ms^-2': 'm/s2', 'm s-2': 'm/s2', 'm/s/s': 'm/s2', 'ms-1': 'm/s', 'ms^-1': 'm/s', 'm s-1': 'm/s', 'kgm/s': 'kg m/s', 'kg·m/s': 'kg m/s', 'kgms-1': 'kg m/s', 'n/m²': 'pa', 'n/m^2': 'pa', 'n/m2': 'pa', 'pascal': 'pa', 'newton': 'n', 'newtons': 'n', 'metre': 'm', 'meter': 'm', 'metres': 'm', 'meters': 'm', 'second': 's', 'seconds': 's', 'sec': 's', 'kilogram': 'kg', 'kilograms': 'kg', 'joule': 'j', 'joules': 'j', 'watt': 'w', 'watts': 'w', 'kg/m³': 'kg/m3', 'kg/m^3': 'kg/m3', 'kgm-3': 'kg/m3', 'kg m-3': 'kg/m3' }
  const normUnit = u => { let s = norm(u).replace(/\s+/g, ' ').replace(/·|\*/g, ' ').trim(); s = UNIT_ALIAS[s] || s; return UNIT_ALIAS[s.replace(/\s/g, '')] || s }
  function parseNumUnit(str) {
    const m = String(str == null ? '' : str).replace(/,/g, '').trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(.*)$/i)
    return m ? { value: parseFloat(m[1]), unit: m[2].trim() } : null
  }
  function checkNumeric(user, key, marks) {
    const p = parseNumUnit(user); if (!p) return { status: 'incorrect', marks: 0, reason: 'Write your answer as a number, then the unit (for example 12 m/s).' }
    const tol = Math.max(Math.abs(key.value) * 0.01, 0.005), ok = Math.abs(p.value - key.value) <= tol
    if (!ok) return { status: 'incorrect', marks: 0, reason: 'The number is different from the answer key (' + key.value + (key.unit ? ' ' + key.unit : '') + ').' }
    if (key.unit && normUnit(p.unit) !== normUnit(key.unit)) return { status: 'partial', marks: Math.max(0, (marks || 1) - 1), reason: 'The number is right, but the unit should be ' + key.unit + '.' }
    return { status: 'correct', marks: marks || 1, reason: 'Correct.' }
  }
  // Objective questions only (mcq, tf, fill, num). Written answers are NOT decided here.
  function checkObjective(q, ans) {
    const marks = q.marks || 1, blank = ans == null || String(ans).trim() === ''
    if (blank) return { status: 'blank', marks: 0, reason: 'No answer given.' }
    if (q.type === 'mcq') {
      const a = letterOf(String(ans).trim(), q.options || []); if (!a) return { status: 'incorrect', marks: 0, reason: 'Choose one of A, B, C or D.' }
      return a === q.answer ? { status: 'correct', marks, reason: 'Correct.' } : { status: 'incorrect', marks: 0, reason: 'The correct option is ' + q.answer + '.' }
    }
    if (q.type === 'tf') {
      const b = toBool(ans); if (b === null) return { status: 'incorrect', marks: 0, reason: 'Choose True or False.' }
      return b === q.answer ? { status: 'correct', marks, reason: 'Correct.' } : { status: 'incorrect', marks: 0, reason: 'The statement is ' + (q.answer ? 'true' : 'false') + '.' }
    }
    if (q.type === 'num') return checkNumeric(ans, q.answer, marks)
    if (q.type === 'fill') {
      const strip = s => norm(s).replace(/^(the|a|an)\s+/, ''), u = strip(ans), keys = (q.accept && q.accept.length ? q.accept : [q.answer])
      if (keys.some(k => strip(k) === u)) return { status: 'correct', marks, reason: 'Correct.' }
      const nu = parseFloat(u); if (isFinite(nu) && /^[-+]?[\d.]+$/.test(u) && keys.some(k => parseFloat(strip(k)) === nu)) return { status: 'correct', marks, reason: 'Correct.' }
      if (u.length >= 5 && keys.some(k => { const s = strip(k); return s.length >= 5 && editDistance(s, u) <= 1 })) return { status: 'close', marks, reason: 'Accepted: only a small spelling difference. The answer is "' + q.answer + '".' }
      return { status: 'incorrect', marks: 0, reason: 'The answer is "' + q.answer + '".' }
    }
    return { status: 'unmarked', marks: 0, reason: 'This answer needs to be marked by you or the AI teacher.' }
  }
  const isAuto = q => !!(TYPES[q.type] && TYPES[q.type].auto)
  // Hint only: how many key words from the marking scheme appear in a written answer.
  function keywordCoverage(answer, keywords) {
    const a = norm(answer); const ks = (keywords || []).map(norm).filter(Boolean); if (!ks.length) return null
    const hit = ks.filter(k => a.includes(k)); return { hit: hit.length, total: ks.length, missing: ks.filter(k => !a.includes(k)) }
  }
  // answers: {qid: string}; written: {qid: marks awarded (0..q.marks)}. Returns per-question results and totals.
  function scorePaper(paper, answers, written) {
    const results = {}; let got = 0, markedOut = 0, unmarked = 0, autoGot = 0, autoOut = 0
    for (const q of allQuestions(paper)) {
      if (isAuto(q)) { const r = checkObjective(q, answers[q.id]); results[q.id] = r; got += r.marks; markedOut += q.marks; autoGot += r.marks; autoOut += q.marks }
      else {
        const w = written && written[q.id]; const blank = !(answers[q.id] && String(answers[q.id]).trim())
        if (w != null && Number.isFinite(w)) { const m = Math.max(0, Math.min(q.marks, Math.round(w))); results[q.id] = { status: m === q.marks ? 'correct' : (m > 0 ? 'partial' : 'incorrect'), marks: m, reason: 'Marked.' }; got += m; markedOut += q.marks }
        else if (blank) { results[q.id] = { status: 'blank', marks: 0, reason: 'No answer given.' }; markedOut += q.marks }
        else { results[q.id] = { status: 'unmarked', marks: 0, reason: 'Not marked yet.' }; unmarked += q.marks }
      }
    }
    const totalOut = paper.totalMarks
    return { results, got, markedOut, unmarked, totalOut, autoGot, autoOut, percent: totalOut ? Math.round(got * 100 / totalOut) : 0, complete: unmarked === 0 }
  }
  function topicBreakdown(paper, results) {
    const m = {}
    for (const q of allQuestions(paper)) {
      const r = results[q.id]; if (!r || r.status === 'unmarked') continue
      const t = q.topic || 'General'; m[t] = m[t] || { topic: t, got: 0, out: 0, right: 0, count: 0 }
      m[t].got += r.marks; m[t].out += q.marks; m[t].count++; if (r.status === 'correct' || r.status === 'close') m[t].right++
    }
    return Object.values(m).sort((a, b) => a.got / a.out - b.got / b.out)
  }

  /* ---------- weak topics (needs enough evidence) ---------- */
  // records: [{subjectId, topic, correct, total, at}] -> topics under the threshold with at least minQ questions answered.
  function weakTopics(records, opt) {
    const minQ = (opt && opt.minQuestions) || 3, thr = (opt && opt.threshold) || 0.6, map = {}
    const recent = records.slice().sort((a, b) => b.at - a.at).slice(0, 200)
    for (const r of recent) { if (!(r.total > 0) || r.correct > r.total) continue; const k = (r.subjectId || '') + '|' + (r.topic || ''); const e = map[k] || (map[k] = { subjectId: r.subjectId || '', topic: r.topic || '', correct: 0, total: 0, last: 0 }); e.correct += r.correct; e.total += r.total; e.last = Math.max(e.last, r.at || 0) }
    return Object.values(map).filter(e => e.topic && e.total >= minQ && e.correct / e.total < thr).sort((a, b) => a.correct / a.total - b.correct / b.total)
  }

  /* ---------- spaced repetition (simple interval scheme, documented in README) ---------- */
  const RATINGS = ['again', 'hard', 'good', 'easy']
  function newCard(base, now) { return Object.assign({ ease: 2.5, interval: 0, reps: 0, lapses: 0, count: 0, due: now == null ? Date.now() : now, last: 0, prev: '' }, base || {}) }
  function schedule(card, rating, now) {
    now = now == null ? Date.now() : now; const c = Object.assign(newCard(null, now), card)
    if (!RATINGS.includes(rating)) throw new Error('Unknown rating ' + rating)
    let interval, ease = c.ease, reps = c.reps, lapses = c.lapses
    if (rating === 'again') { interval = 0; reps = 0; lapses++; ease = Math.max(1.3, ease - 0.2) }
    else if (rating === 'hard') { interval = reps === 0 ? 1 : Math.max(1, Math.round(Math.max(c.interval, 1) * 1.2)); ease = Math.max(1.3, ease - 0.15); reps++ }
    else if (rating === 'good') { interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(c.interval * ease); reps++ }
    else { interval = reps === 0 ? 3 : reps === 1 ? 7 : Math.round(c.interval * ease * 1.3); ease += 0.15; reps++ }
    interval = Math.min(365, Math.max(0, interval))
    const due = interval === 0 ? now + 10 * MIN : now + interval * DAY // keeps the time of day, so reviews do not all land together
    return Object.assign(c, { ease: Math.round(ease * 100) / 100, interval, reps, lapses, due, last: now, count: c.count + 1, prev: rating })
  }
  const fmtInterval = (c, now) => { const ms = c.due - now; if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + ' min'; if (ms < DAY) return Math.round(ms / 3600000) + ' h'; return Math.round(ms / DAY) + ' d' }
  function nextIntervals(card, now) { now = now == null ? Date.now() : now; const o = {}; RATINGS.forEach(r => { o[r] = fmtInterval(schedule(card, r, now), now) }); return o }
  function bucket(card, now) { // new | overdue | today | later
    now = now == null ? Date.now() : now
    if (!card.count) return 'new'
    if (card.due < startOfDay(now)) return 'overdue'
    if (card.due <= endOfDay(now)) return card.due <= now ? 'due' : 'today'
    return 'later'
  }
  const isDueNow = (card, now) => { now = now == null ? Date.now() : now; return !card.count || card.due <= now }
  function buildQueue(cards, now, limit) { // overdue first (oldest due), then due today, then new cards
    now = now == null ? Date.now() : now
    const due = cards.filter(c => c.count && c.due <= endOfDay(now)).sort((a, b) => a.due - b.due), fresh = cards.filter(c => !c.count)
    return due.concat(fresh).slice(0, limit || 20)
  }
  function reviewCounts(cards, now) {
    now = now == null ? Date.now() : now; const o = { overdue: 0, today: 0, newCards: 0, week: 0, total: cards.length, hard: 0 }
    for (const c of cards) {
      const b = bucket(c, now); if (b === 'overdue') o.overdue++; else if (b === 'due' || b === 'today') o.today++; else if (b === 'new') o.newCards++
      if (b === 'later' && c.due <= endOfDay(now + 7 * DAY)) o.week++
      if (c.lapses >= 2) o.hard++
    }
    return o
  }

  /* ---------- achievements ---------- */
  const ACHIEVEMENTS = [
    { id: 'first_lesson', icon: '📖', title: 'First lesson', how: 'Open or save your first lesson.', test: s => s.studyCount >= 1 || s.saved >= 1 },
    { id: 'first_quiz', icon: '✎', title: 'First quiz', how: 'Finish a scored quiz, practice paper or lab activity.', test: s => s.attempts >= 1 },
    { id: 'first_revision', icon: '↻', title: 'First revision', how: 'Finish one review session with your flashcards.', test: s => s.reviewSessions >= 1 },
    { id: 'five_saved', icon: '▣', title: 'Five lessons saved', how: 'Have 5 lessons saved in your library.', test: s => s.saved >= 5 },
    { id: 'first_paper', icon: '📝', title: 'First practice paper', how: 'Submit one practice paper.', test: s => s.papers >= 1 },
    { id: 'first_note', icon: '🗒', title: 'First note', how: 'Save one note.', test: s => s.notes >= 1 },
    { id: 'consistent_revision', icon: '🌱', title: 'Steady revision', how: 'Revise on any 3 different days within 7 days.', test: s => hasDaysInWindow(s.reviewDays || [], 3, 7) },
    { id: 'goal_done', icon: '🎯', title: 'Weekly goal done', how: 'Reach your weekly study goal in one week.', test: s => !!s.weeklyGoalMet },
    { id: 'chapter_done', icon: '✓', title: 'First chapter studied', how: 'Mark a chapter as studied (a lesson was opened for it, or you ticked it).', test: s => s.chaptersDone >= 1 }
  ]
  function hasDaysInWindow(days, need, span) {
    const u = Array.from(new Set(days)).sort(); for (let i = 0; i < u.length; i++) { const end = addDays(u[i], span - 1); if (u.filter(d => d >= u[i] && d <= end).length >= need) return true } return false
  }
  const earnedAchievements = state => ACHIEVEMENTS.filter(a => { try { return a.test(state) } catch (e) { return false } }).map(a => a.id)

  /* ---------- study coach: deterministic, every item has a real reason ---------- */
  // state: {now, cards[], weak[], mistakes[], dueLessons[], examDate, examSubjectId, papersBySubject{}, progress{subjectId:[idx]}, subjects[{id,name,chapters[[title,page]]}], lastSubjectId, studyCount}
  function recommend(s) {
    const out = [], now = s.now == null ? Date.now() : s.now, rc = reviewCounts(s.cards || [], now)
    if (rc.overdue > 0) out.push({ id: 'cards-overdue', p: 100, icon: '↻', title: 'Review ' + rc.overdue + ' overdue flashcard' + (rc.overdue > 1 ? 's' : ''), reason: rc.overdue + ' card' + (rc.overdue > 1 ? 's were' : ' was') + ' due before today.', action: { type: 'review' } })
    const d = daysUntil(s.examDate, now)
    if (d != null && d >= 0 && d <= 30) {
      const sid = s.examSubjectId || '', n = (s.papersBySubject && s.papersBySubject[sid]) || 0, sub = (s.subjects || []).find(x => x.id === sid)
      out.push({ id: 'exam-' + (s.examDate || ''), p: d <= 7 ? 95 : 70, icon: '📝', title: 'Practise a paper' + (sub ? ' for ' + sub.name : ''), reason: 'Your exam date is in ' + d + ' day' + (d === 1 ? '' : 's') + (n ? ' and you have submitted ' + n + ' practice paper' + (n > 1 ? 's' : '') + (sub ? ' for it.' : '.') : ' and you have not submitted a practice paper' + (sub ? ' for it' : '') + ' yet.'), action: { type: 'exam', subjectId: sid } })
    }
    ;(s.weak || []).slice(0, 2).forEach(w => out.push({ id: 'weak-' + w.subjectId + '-' + w.topic, p: 85 - Math.round(w.correct / w.total * 10), icon: '🎯', title: 'Revise ' + w.topic, reason: 'You got ' + w.correct + ' of ' + w.total + ' questions right on this topic (' + Math.round(w.correct * 100 / w.total) + '%).', action: { type: 'teach', subjectId: w.subjectId, topic: w.topic } }))
    const open = (s.mistakes || []).filter(m => m.status === 'open').sort((a, b) => b.at - a.at)
    if (open.length) out.push({ id: 'mistake-' + open[0].id, p: 80, icon: '🔍', title: 'Retry a missed question', reason: 'You missed a question about "' + (open[0].topic || 'this topic') + '" on ' + new Date(open[0].at).toLocaleDateString() + (open.length > 1 ? ' (and ' + (open.length - 1) + ' more are still open).' : '.'), action: { type: 'detective' } })
    if ((s.dueLessons || []).length) out.push({ id: 'lesson-' + s.dueLessons[0].id, p: 60, icon: '▣', title: 'Revisit "' + s.dueLessons[0].topic + '"', reason: 'You saved this lesson and its revision time has come.', action: { type: 'lesson', id: s.dueLessons[0].id } })
    if (rc.today > 0) out.push({ id: 'cards-today', p: 65, icon: '↻', title: 'Review ' + rc.today + ' flashcard' + (rc.today > 1 ? 's' : '') + ' due today', reason: 'Short, regular reviews help you remember.', action: { type: 'review' } })
    // partly studied subject: suggest the next chapter not yet ticked
    const subs = s.subjects || [], prog = s.progress || {}
    const partial = subs.filter(x => { const n = (prog[x.id] || []).length; return n > 0 && n < x.chapters.length })
    if (partial.length) {
      const sub = partial.find(x => x.id === s.lastSubjectId) || partial.sort((a, b) => (prog[b.id].length / b.chapters.length) - (prog[a.id].length / a.chapters.length))[0]
      const done = new Set(prog[sub.id]), idx = sub.chapters.findIndex((c, i) => !done.has(i))
      if (idx >= 0) out.push({ id: 'chapter-' + sub.id + '-' + idx, p: 40, icon: '📘', title: 'Study next: ' + sub.chapters[idx][0], reason: 'You have studied ' + done.size + ' of ' + sub.chapters.length + ' chapters in ' + sub.name + '.', action: { type: 'teach', subjectId: sub.id, topic: sub.chapters[idx][0] } })
    }
    if (!out.length && !(s.studyCount > 0) && !(s.cards || []).length) out.push({ id: 'start', p: 10, icon: '✦', title: 'Start with your first lesson', reason: 'You have not studied anything here yet. Pick a chapter and press Teach me.', action: { type: 'study' } })
    return out.sort((a, b) => b.p - a.p)
  }

  /* ---------- chemistry ---------- */
  function parseFormula(f) {
    f = ascii(f).replace(/\s+/g, ''); let i = 0
    const num = () => { let s = ''; while (i < f.length && /\d/.test(f[i])) s += f[i++]; return s ? parseInt(s, 10) : 1 }
    function group(depth) {
      const out = {}
      while (i < f.length) {
        const c = f[i]
        if (c === '(' || c === '[') { i++; const g = group(depth + 1); const n = num(); for (const k in g) out[k] = (out[k] || 0) + g[k] * n }
        else if (c === ')' || c === ']') { if (!depth) throw new Error('Cannot read formula ' + f); i++; return out }
        else if (/[A-Z]/.test(c)) { let name = c; i++; while (i < f.length && /[a-z]/.test(f[i])) name += f[i++]; const n = num(); out[name] = (out[name] || 0) + n }
        else throw new Error('Cannot read formula ' + f)
      }
      if (depth) throw new Error('Cannot read formula ' + f)
      return out
    }
    const r = group(0); if (i < f.length) throw new Error('Cannot read formula ' + f); if (!Object.keys(r).length) throw new Error('Empty formula'); return r
  }
  function parseEquation(str) {
    const parts = ascii(str).split(/->|→|=/); if (parts.length !== 2) throw new Error('Equation needs one arrow')
    const side = s => s.split(/\s\+\s|\s*\+\s*(?=[A-Z(])/).map(x => x.trim().replace(/^\d+\s*/, '')).filter(Boolean)
    return { left: side(parts[0]), right: side(parts[1]) }
  }
  function balance(eq) {
    const species = eq.left.concat(eq.right), counts = species.map(parseFormula), els = Array.from(new Set(counts.flatMap(c => Object.keys(c))))
    const nL = eq.left.length, rows = els.map(e => counts.map((c, j) => (c[e] || 0) * (j < nL ? 1 : -1)))
    // Gaussian elimination with exact fractions
    const F = (n, d) => { d = d || 1; if (d < 0) { n = -n; d = -d } const g = gcd(n, d) || 1; return [n / g, d / g] }
    const sub = (a, b) => F(a[0] * b[1] - b[0] * a[1], a[1] * b[1]), mul = (a, b) => F(a[0] * b[0], a[1] * b[1]), div = (a, b) => F(a[0] * b[1], a[1] * b[0])
    const M = rows.map(r => r.map(v => F(v, 1))), cols = species.length, piv = []; let r = 0
    for (let c = 0; c < cols && r < M.length; c++) {
      let p = -1; for (let i = r; i < M.length; i++) if (M[i][c][0] !== 0) { p = i; break }
      if (p < 0) continue; [M[r], M[p]] = [M[p], M[r]]
      const pv = M[r][c]; M[r] = M[r].map(v => div(v, pv))
      for (let i = 0; i < M.length; i++) if (i !== r && M[i][c][0] !== 0) { const f = M[i][c]; M[i] = M[i].map((v, k) => sub(v, mul(f, M[r][k]))) }
      piv.push(c); r++
    }
    const free = []; for (let c = 0; c < cols; c++) if (!piv.includes(c)) free.push(c)
    if (free.length !== 1) return null
    const x = new Array(cols).fill(null).map(() => F(0, 1)); x[free[0]] = F(1, 1)
    piv.forEach((c, i) => { x[c] = F(-M[i][free[0]][0], M[i][free[0]][1]) })
    let l = 1; x.forEach(v => { l = l / gcd(l, v[1]) * v[1] })
    let ints = x.map(v => v[0] * (l / v[1])); const g = ints.reduce((a, b) => gcd(a, b), 0) || 1; ints = ints.map(v => v / g)
    if (ints.some(v => v <= 0)) return null
    return ints
  }
  function atomCounts(eq, coeffs) {
    const side = (list, off) => { const t = {}; list.forEach((f, i) => { const c = parseFormula(f), k = coeffs[off + i] || 0; for (const e in c) t[e] = (t[e] || 0) + c[e] * k }); return t }
    const L = side(eq.left, 0), R = side(eq.right, eq.left.length), els = Array.from(new Set(Object.keys(L).concat(Object.keys(R))))
    return els.map(e => ({ el: e, left: L[e] || 0, right: R[e] || 0, ok: (L[e] || 0) === (R[e] || 0) }))
  }
  const IONS = [
    { sym: 'Na', val: 1, name: 'sodium', cat: 1 }, { sym: 'K', val: 1, name: 'potassium', cat: 1 }, { sym: 'H', val: 1, name: 'hydrogen', cat: 1 },
    { sym: 'Mg', val: 2, name: 'magnesium', cat: 1 }, { sym: 'Ca', val: 2, name: 'calcium', cat: 1 }, { sym: 'Zn', val: 2, name: 'zinc', cat: 1 }, { sym: 'Al', val: 3, name: 'aluminium', cat: 1 }, { sym: 'NH4', val: 1, name: 'ammonium', cat: 1, poly: 1 },
    { sym: 'Cl', val: 1, name: 'chloride', cat: 0 }, { sym: 'O', val: 2, name: 'oxide', cat: 0 }, { sym: 'S', val: 2, name: 'sulphide', cat: 0 }, { sym: 'OH', val: 1, name: 'hydroxide', cat: 0, poly: 1 },
    { sym: 'NO3', val: 1, name: 'nitrate', cat: 0, poly: 1 }, { sym: 'SO4', val: 2, name: 'sulphate', cat: 0, poly: 1 }, { sym: 'CO3', val: 2, name: 'carbonate', cat: 0, poly: 1 }, { sym: 'PO4', val: 3, name: 'phosphate', cat: 0, poly: 1 }
  ]
  function formulaFromIons(a, b) {
    const g = gcd(a.val, b.val), na = b.val / g, nb = a.val / g
    const part = (x, n) => (x.poly && n > 1 ? '(' + x.sym + ')' + n : x.sym + (n > 1 ? n : ''))
    return part(a, na) + part(b, nb)
  }
  function checkFormula(user, expected) {
    let u; try { u = parseFormula(user) } catch (e) { return { status: 'incorrect', reason: 'That is not a valid formula. Use capital letters for each symbol, like Ca(OH)2.' } }
    const e = parseFormula(expected), same = Object.keys(e).length === Object.keys(u).length && Object.keys(e).every(k => u[k] === e[k])
    if (!same) return { status: 'incorrect', reason: 'The atoms do not match. Cross the valencies: each ion\'s valency becomes the other ion\'s subscript (then divide by any common factor).' }
    return ascii(user).replace(/\s/g, '') === expected ? { status: 'correct', reason: 'Correct.' } : { status: 'correct', reason: 'Correct. It is usually written as ' + expected + '.' }
  }

  /* ---------- physics and geography generators ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  const pick = (r, a, b) => a + Math.floor(r() * (b - a + 1))
  function physicsProblem(seed, kind) {
    const r = rng(seed), kinds = ['v', 's', 'f', 'p', 'pr', 'd']; kind = kind || kinds[pick(r, 0, kinds.length - 1)]
    const round = x => Math.round(x * 100) / 100
    if (kind === 'v') { const u = pick(r, 0, 10), a = pick(r, 1, 5), t = pick(r, 2, 8); return { kind, formula: 'v = u + at', text: 'A car starts with a speed of ' + u + ' m/s and speeds up at ' + a + ' m/s² for ' + t + ' s. Find its final speed.', steps: ['Write the formula: v = u + at', 'Put in the values: v = ' + u + ' + (' + a + ' × ' + t + ')', 'v = ' + u + ' + ' + a * t + ' = ' + (u + a * t)], answer: { value: u + a * t, unit: 'm/s' } } }
    if (kind === 's') { const u = pick(r, 0, 10), a = pick(r, 1, 4) * 2, t = pick(r, 2, 6), s = round(u * t + 0.5 * a * t * t); return { kind, formula: 's = ut + ½at²', text: 'A cyclist moves with an initial speed of ' + u + ' m/s and an acceleration of ' + a + ' m/s² for ' + t + ' s. Find the distance covered.', steps: ['Write the formula: s = ut + ½at²', 'Put in the values: s = (' + u + ' × ' + t + ') + ½ × ' + a + ' × ' + t + '²', 's = ' + u * t + ' + ' + round(0.5 * a * t * t) + ' = ' + s], answer: { value: s, unit: 'm' } } }
    if (kind === 'f') { const m = pick(r, 2, 20), a = pick(r, 1, 9); return { kind, formula: 'F = ma', text: 'A force acts on a body of mass ' + m + ' kg and gives it an acceleration of ' + a + ' m/s². Find the force.', steps: ['Write the formula: F = ma', 'F = ' + m + ' × ' + a + ' = ' + m * a], answer: { value: m * a, unit: 'N' } } }
    if (kind === 'p') { const m = pick(r, 2, 15), v = pick(r, 2, 12); return { kind, formula: 'p = mv', text: 'Find the momentum of a ' + m + ' kg body moving at ' + v + ' m/s.', steps: ['Write the formula: momentum = mass × velocity', 'p = ' + m + ' × ' + v + ' = ' + m * v], answer: { value: m * v, unit: 'kg m/s' } } }
    if (kind === 'pr') { const f = pick(r, 2, 20) * 10, a = pick(r, 1, 5) * 2, p = round(f / a); return { kind, formula: 'P = F ÷ A', text: 'A force of ' + f + ' N acts on an area of ' + a + ' m². Find the pressure.', steps: ['Write the formula: pressure = force ÷ area', 'P = ' + f + ' ÷ ' + a + ' = ' + p], answer: { value: p, unit: 'Pa' } } }
    const m = pick(r, 2, 10) * 10, v = pick(r, 1, 5) * 2, d = round(m / v); return { kind: 'd', formula: 'density = mass ÷ volume', text: 'A block has a mass of ' + m + ' kg and a volume of ' + v + ' m³. Find its density.', steps: ['Write the formula: density = mass ÷ volume', 'density = ' + m + ' ÷ ' + v + ' = ' + d], answer: { value: d, unit: 'kg/m3' } }
  }
  function timeDiffMinutes(lon1, lon2) { let d = Math.abs(lon1 - lon2); if (d > 180) d = 360 - d; return Math.round(d * 4) }
  const fmtLon = x => Math.abs(x) + '°' + (x < 0 ? 'W' : x > 0 ? 'E' : '')
  function longitudeProblem(seed) {
    const r = rng(seed), a = pick(r, -12, 12) * 15, b = pick(r, -12, 12) * 15 + (r() < 0.5 ? 0 : 7.5); const lon1 = a, lon2 = b === a ? a + 30 : b, diff = Math.abs(lon1 - lon2) > 180 ? 360 - Math.abs(lon1 - lon2) : Math.abs(lon1 - lon2)
    return { text: 'Two places lie on ' + fmtLon(lon1) + ' and ' + fmtLon(lon2) + '. What is the difference in their local time, in minutes?', steps: ['Find the difference in longitude: ' + diff + '°', 'The Earth turns 1° in 4 minutes.', diff + ' × 4 = ' + diff * 4 + ' minutes'], answer: timeDiffMinutes(lon1, lon2) }
  }

  /* ---------- backup validation ---------- */
  function validateBackup(o) {
    if (!o || typeof o !== 'object' || o.app !== 'studynest' || o.v !== 1) return { ok: false, error: 'This is not a StudyNest backup file.' }
    if (o.data && typeof o.data !== 'object') return { ok: false, error: 'The backup data is damaged.' }
    for (const k in (o.data || {})) { if (!Array.isArray(o.data[k])) return { ok: false, error: 'The backup data is damaged (' + k + ').' }; for (const r of o.data[k]) if (!r || typeof r.id !== 'string' || !r.id || r.id.length > 80) return { ok: false, error: 'A record in the backup has a bad id.' } }
    if (o.lessons && !Array.isArray(o.lessons)) return { ok: false, error: 'The saved lessons in the backup are damaged.' }
    return { ok: true }
  }

  const api = { DAY, norm, clean, similarity, editDistance, gcd, dayKey, startOfDay, endOfDay, addDays, weekKey, daysUntil, streakFrom, extractJson, TYPES, typesFor, marksOf, planSections, normQuestion, assemblePaper, validatePaper, allQuestions, checkObjective, checkNumeric, parseNumUnit, normUnit, isAuto, keywordCoverage, scorePaper, topicBreakdown, weakTopics, RATINGS, newCard, schedule, nextIntervals, bucket, isDueNow, buildQueue, reviewCounts, ACHIEVEMENTS, earnedAchievements, hasDaysInWindow, recommend, parseFormula, parseEquation, balance, atomCounts, IONS, formulaFromIons, checkFormula, physicsProblem, longitudeProblem, timeDiffMinutes, validateBackup, rng }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.SNL = api
})(typeof window !== 'undefined' ? window : globalThis)
