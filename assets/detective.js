/* StudyNest Mistake Detective: explains why an answer was wrong, gives a hint and a practice question, and lets the student disagree.
   Objective answers are checked by code. Only written answers use the AI. The AI is told to say "low confidence" when one answer is not enough evidence. */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN, { h, md, clear, fmtDate, empty } = SN
  const CONF = { low: 'I am not sure why (one answer is not much evidence)', medium: 'Likely reason', high: 'Very likely reason' }

  function validateExplain(v) {
    if (!v || typeof v !== 'object') throw new Error('bad'); const p = v.practice || {}
    const out = { misconception: L.clean(v.misconception, 300), confidence: ['low', 'medium', 'high'].includes(String(v.confidence).toLowerCase()) ? String(v.confidence).toLowerCase() : 'low', whatWentWrong: L.clean(v.whatWentWrong, 800), correctReasoning: L.clean(v.correctReasoning, 1200), hint: L.clean(v.hint, 400), practice: { question: L.clean(p.question, 500), answer: L.clean(p.answer, 500) } }
    if (!out.whatWentWrong || !out.correctReasoning || !out.practice.question || !out.practice.answer) throw new Error('incomplete'); return out
  }
  function validateVerdict(v) {
    if (!v || typeof v !== 'object') throw new Error('bad'); const verdict = String(v.verdict || '').toLowerCase(); if (!['correct', 'partly', 'incorrect', 'unclear'].includes(verdict)) throw new Error('verdict')
    const reason = L.clean(v.reason, 700); if (!reason) throw new Error('reason'); return { verdict, reason, correctReasoning: L.clean(v.correctReasoning, 1000), hint: L.clean(v.hint, 400) }
  }
  const explainPrompt = m => SN.ICSE_ROLE + '\nA student answered a question wrongly. Help them understand why.\nSUBJECT: ' + (m.subject || '') + '\nTOPIC: ' + (m.topic || '') + '\nQUESTION: ' + m.question + '\nSTUDENT\'S ANSWER: ' + m.yourAnswer + '\nCORRECT ANSWER: ' + m.correctAnswer + '\nANSWER KEY NOTE: ' + (m.explanation || 'none') +
    '\n\nReply with ONLY this JSON: {"misconception":"the most likely wrong idea in one simple sentence, or an empty string if you cannot tell","confidence":"low or medium or high","whatWentWrong":"2 or 3 simple sentences","correctReasoning":"the right reasoning, step by step, in simple words","hint":"a small hint that helps with a similar question","practice":{"question":"a new, similar question (not the same one)","answer":"its short answer"}}\nRULES: Never say you know what the student was thinking. If one answer is not enough evidence, use confidence "low" and say what you cannot tell. Do not repeat the original question as the practice question.\n' + SN.rules(true)
  const verdictPrompt = (c, note) => SN.ICSE_ROLE + '\nCheck a student\'s answer. Accept an answer that is correct but worded differently from the model answer. Be fair, not strict about spelling.\nSUBJECT: ' + c.subject + '\nQUESTION: ' + c.question + '\nMODEL ANSWER (may be empty): ' + (c.key || 'none given') + '\nSTUDENT\'S ANSWER: ' + c.answer + (note ? '\nTHE STUDENT DISAGREES AND SAYS: ' + note + '\n(Think again about this. Change your verdict only if the student is right.)' : '') +
    '\n\nReply with ONLY this JSON: {"verdict":"correct or partly or incorrect or unclear","reason":"one or two simple sentences that say why","correctReasoning":"the right answer with reasoning, only if the student was not fully correct","hint":"a small hint, only if the student was not fully correct"}\nUse "unclear" if you cannot tell from the information given.\n' + SN.rules(true)

  function render(box, arg) {
    let openId = (arg && arg.id) || null, page = 0
    const home = () => {
      clear(box); box.appendChild(h('p', { class: 'sn-sub' }, 'Understand why you got a question wrong, then try a similar one. Wrong answers from your practice papers appear here by themselves.'))
      box.appendChild(h('h3', { class: 'sn-sec' }, 'My open mistakes'))
      const all = SN.list('mistake').sort((a, b) => b.at - a.at), open = all.filter(m => m.status === 'open'), PER = 8, pages = Math.ceil(open.length / PER); page = Math.min(page, Math.max(0, pages - 1))
      if (!open.length) box.appendChild(empty('🔍', all.length ? 'No open mistakes' : 'No mistakes recorded yet', all.length ? 'Great work. You have understood all of them.' : 'When you answer a practice paper question wrongly, it is added here. You can also check your own answer below.'))
      else {
        const ul = h('div', { class: 'sn-list' }); open.slice(page * PER, page * PER + PER).forEach(m => ul.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, m.question.slice(0, 140) + (m.question.length > 140 ? '…' : '')), h('small', null, [m.subject, m.topic, fmtDate(m.at)].filter(Boolean).join(' · '))), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => investigate(m.id) }, 'Investigate'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'Delete this mistake', onclick: async () => { if (await SN.confirm('Remove this mistake from your list?', 'Remove')) { SN.remove('mistake', m.id); home() } } }, '×')))); box.appendChild(ul)
        if (pages > 1) box.appendChild(h('div', { class: 'sn-row' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page === 0 ? true : null, onclick: () => { page--; home() } }, '← Newer'), h('span', { class: 'sn-note' }, 'Page ' + (page + 1) + ' of ' + pages), h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page >= pages - 1 ? true : null, onclick: () => { page++; home() } }, 'Older →')))
      }
      if (all.length - open.length) box.appendChild(h('p', { class: 'sn-note' }, (all.length - open.length) + ' mistake' + (all.length - open.length > 1 ? 's' : '') + ' marked as understood.'))
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Check my own answer')); checker()
    }

    /* ----- investigate one mistake ----- */
    function investigate(id) {
      const m = SN.get('mistake', id); if (!m) return home(); clear(box); SN.setDirty(null)
      box.appendChild(h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: home }, '← All mistakes'))
      box.appendChild(h('div', { class: 'sn-q', style: 'margin-top:12px' }, h('p', { class: 'sn-note' }, [m.subject, m.topic, fmtDate(m.at)].filter(Boolean).join(' · ')), h('p', { class: 'qt' }, m.question), h('p', null, h('strong', null, 'Your answer: '), m.yourAnswer), h('p', null, h('strong', null, 'Correct answer: '), m.correctAnswer), m.explanation ? h('p', { class: 'sn-note' }, 'Answer key note: ' + m.explanation) : null))
      const out = h('div', { id: 'detOut' }); box.appendChild(out)
      const run = async () => {
        clear(out); out.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('strong', null, 'Looking into it…')))
        try { const r = await SN.ai({ prompt: explainPrompt(m), json: true, validate: validateExplain, key: 'explain|' + m.id }); show(m, r, out) } catch (err) { clear(out); out.appendChild(SN.errBox(err, run)) }
      }
      out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: run }, '🔍 Explain my mistake'), h('button', { class: 'btn btn-light', type: 'button', onclick: () => { SN.update('mistake', m.id, { status: 'resolved', resolvedAt: Date.now() }); showToast('Marked as understood.'); home() } }, '✓ I already understand it')))
      out.appendChild(challengeBox(m))
    }
    function show(m, r, out) {
      const v = r.value; clear(out)
      out.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, v.misconception ? CONF[v.confidence] + ': ' : 'I cannot tell what went wrong from one answer. '), v.misconception || '', h('p', null, v.whatWentWrong)))
      out.appendChild(h('div', { class: 'sn-fb ok' }, h('strong', null, 'The right reasoning'), h('p', null, v.correctReasoning)))
      if (v.hint) out.appendChild(h('div', { class: 'sn-fb mid' }, h('strong', null, 'Hint for next time: '), v.hint))
      out.appendChild(SN.modelNote(r))
      const ans = h('textarea', { class: 'sn-in', id: 'pracAns', rows: 3, placeholder: 'Your answer…', 'aria-label': 'Your answer to the practice question' }), rev = h('div')
      out.appendChild(h('h3', { class: 'sn-sec' }, 'Try a similar question')); out.appendChild(h('p', { class: 'qt' }, v.practice.question)); out.appendChild(ans)
      out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { clear(rev); rev.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Answer: '), v.practice.answer, h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { SN.update('mistake', m.id, { status: 'resolved', resolvedAt: Date.now() }); SN.recordAttempt('detective', m.subjectId, m.topic || 'Retry', 1, 1, 'det_retry_' + m.id); SN.activity('detective', m.subjectId, 'retry|' + m.id); SN.checkAwards && SN.checkAwards(); showToast('Well done! Marked as understood.'); home() } }, '✓ I got it right'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { SN.recordAttempt('detective', m.subjectId, m.topic || 'Retry', 0, 1, 'det_retry_' + m.id); showToast('That is okay. Read the reasoning again and try another day.') } }, 'I got it wrong')))) } }, 'Show the answer')), rev)
      out.appendChild(challengeBox(m))
    }
    // The student can say "I think my answer was right". The AI looks again once, with the student's reason.
    function challengeBox(m) {
      const wrap = h('details', { class: 'sn-how' }, h('summary', null, 'I think my answer was right')), note = h('textarea', { class: 'sn-in', rows: 2, placeholder: 'Why do you think your answer is right?', 'aria-label': 'Why you think your answer is right' }), res = h('div')
      wrap.appendChild(note); wrap.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: async e => {
        const t = note.value.trim(); if (t.length < 5) { showToast('Please say why, in a few words.'); return } const b = e.currentTarget; b.disabled = true; clear(res); res.appendChild(h('p', { class: 'sn-note' }, 'Checking again…'))
        try { const r = await SN.ai({ prompt: verdictPrompt({ subject: m.subject, question: m.question, key: m.correctAnswer, answer: m.yourAnswer }, t), json: true, validate: validateVerdict, key: 'challenge|' + m.id + '|' + SN.hash(t) }); clear(res); res.appendChild(verdictBox(r.value)); res.appendChild(SN.modelNote(r))
          if (r.value.verdict === 'correct') res.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { SN.update('mistake', m.id, { status: 'resolved', resolvedAt: Date.now(), disputed: true }); showToast('Marked as understood.'); home() } }, 'Remove it from my mistakes'))) } catch (err) { clear(res); res.appendChild(SN.errBox(err)) } finally { b.disabled = false }
      } }, 'Check again'))); wrap.appendChild(res); return wrap
    }
    const verdictBox = v => h('div', { class: 'sn-fb ' + (v.verdict === 'correct' ? 'ok' : v.verdict === 'partly' ? 'mid' : v.verdict === 'incorrect' ? 'no' : ''), role: 'status' }, h('strong', null, { correct: 'Correct. ', partly: 'Partly correct. ', incorrect: 'Not correct. ', unclear: 'I cannot tell. ' }[v.verdict]), v.reason, v.correctReasoning ? h('p', null, h('strong', null, 'Right reasoning: '), v.correctReasoning) : null, v.hint ? h('p', null, h('strong', null, 'Hint: '), v.hint) : null)

    /* ----- check my own answer ----- */
    function checker() {
      const f = { subjectId: selectedSubject, topic: '', question: '', key: '', answer: '' }, out = h('div', { id: 'chkOut', 'aria-live': 'polite' })
      SN.setDirty(() => (f.question.trim() && f.answer.trim() && !out.firstChild) ? 'You typed an answer that was not checked yet. Leave anyway?' : '')
      const ta = (id, label, key, rows, ph) => h('div', { class: 'full' }, h('label', { class: 'sn-lbl', for: id }, label), h('textarea', { id, rows, placeholder: ph || '', oninput: e => { f[key] = e.target.value } }, f[key]))
      box.appendChild(h('div', { class: 'sn-form' },
        h('div', null, h('label', { class: 'sn-lbl', for: 'dSub' }, 'Subject'), h('select', { id: 'dSub', onchange: e => { f.subjectId = e.target.value } }, DB.map(s => { const o = h('option', { value: s.id }, s.name); if (s.id === f.subjectId) o.selected = true; return o }))),
        h('div', null, h('label', { class: 'sn-lbl', for: 'dTopic' }, 'Topic (optional)'), h('input', { id: 'dTopic', type: 'text', maxlength: 80, placeholder: 'For example: Newton\'s laws', oninput: e => { f.topic = e.target.value } })),
        ta('dQ', 'The question', 'question', 3), ta('dKey', 'The correct answer, if you have it (optional)', 'key', 2, 'From your textbook or teacher. Leave empty to let the AI check it.'), ta('dA', 'Your answer', 'answer', 3)))
      const check = async note => {
        const q = f.question.trim(), a = f.answer.trim(), k = f.key.trim(); if (q.length < 8) { showToast('Please type the question.'); return } if (!a) { showToast('Please type your answer first.'); return }
        const c = { subject: SN.subjectName(f.subjectId), subjectId: f.subjectId, topic: f.topic.trim() || 'Answer check', question: q, key: k, answer: a }; clear(out)
        // 1. code decides when the answer key is short (a number or a word or two)
        if (k && !note) { const det = decide(k, a); if (det) { out.appendChild(verdictBox(det)); finish(c, det.verdict); extras(c, det); return } }
        // 2. otherwise the AI helps, and says why
        out.appendChild(h('p', { class: 'sn-note' }, 'Checking…'))
        try { const r = await SN.ai({ prompt: verdictPrompt(c, note), json: true, validate: validateVerdict, key: 'verdict|' + SN.hash(q + '|' + k + '|' + a + '|' + (note || '')) }); clear(out); out.appendChild(verdictBox(r.value)); out.appendChild(SN.modelNote(r)); if (r.value.verdict === 'unclear') out.appendChild(h('p', { class: 'sn-note' }, 'This check was not counted, because there was not enough information.')); else finish(c, r.value.verdict); extras(c, r.value) } catch (err) { clear(out); out.appendChild(SN.errBox(err, () => check(note))) }
      }
      const extras = (c, v) => { out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { clear(out); $('dA').value = ''; f.answer = ''; $('dA').focus() } }, '↻ Try again'),
        v.verdict !== 'correct' ? h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { const n = prompt('Why do you think your answer is right?'); if (n && n.trim().length >= 5) check(n.trim()) } }, 'I disagree') : null)) }
      const finish = (c, verdict) => { // recorded once per question + answer + day
        const id = 'det_' + SN.hash(c.question + '|' + c.answer + '|' + L.dayKey()); SN.recordAttempt('detective', c.subjectId, c.topic, verdict === 'correct' ? 1 : 0, 1, id); SN.activity('detective', c.subjectId, 'chk|' + id)
        if (verdict === 'incorrect' || verdict === 'partly') SN.addMistake({ source: 'detective', subjectId: c.subjectId, subject: c.subject, topic: c.topic, question: c.question, yourAnswer: c.answer, correctAnswer: c.key || '(not given)', explanation: '' })
        SN.checkAwards && SN.checkAwards()
      }
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => check('') }, '🔍 Check my answer'))); box.appendChild(out)
    }
    // Deterministic check for short answer keys. Returns a verdict object, or null when the AI should look.
    function decide(key, ans) {
      const nk = L.parseNumUnit(key); if (nk && !/[a-z]{4,}/i.test(key) && L.parseNumUnit(ans)) { const r = L.checkNumeric(ans, { value: nk.value, unit: nk.unit }, 1); return { verdict: r.status === 'correct' ? 'correct' : r.status === 'partial' ? 'partly' : 'incorrect', reason: r.reason } }
      if (key.split(/\s+/).length <= 3 && ans.split(/\s+/).length <= 6) { const r = L.checkObjective({ type: 'fill', answer: key, accept: [key], marks: 1 }, ans); if (r.status === 'correct' || r.status === 'close') return { verdict: 'correct', reason: r.reason } }
      return null // a longer answer, or a different wording, may still be right: let the AI decide
    }
    if (openId) { const id = openId; openId = null; if (SN.get('mistake', id)) { home(); investigate(id); return () => SN.setDirty(null) } }
    home(); return () => SN.setDirty(null)
  }
  SN.views.detective = { title: 'Mistake Detective', render, noAuto: true }
  SN.decideShort = null
})()
