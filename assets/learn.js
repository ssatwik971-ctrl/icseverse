/* StudyNest learning pipeline: Lesson -> key points / cards / notes, the Notes workspace, and Revise (spaced repetition). */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN, { h, md, clear, fmtDate, pct, bar, stat, empty } = SN
  const lessonSubject = Lx => (typeof subjectOf === 'function' ? subjectOf(Lx) : currentSubject())
  const MAXL = 12000

  /* ---------- flashcards: shared helpers ---------- */
  function validateCards(p) {
    const arr = Array.isArray(p) ? p : (p && Array.isArray(p.cards) ? p.cards : null); if (!arr) throw new Error('no cards')
    const seen = new Set(), out = []
    for (const c of arr) { const front = L.clean(c && c.front, 300), back = L.clean(c && c.back, 600); if (!front || !back || seen.has(L.norm(front))) continue; seen.add(L.norm(front)); out.push({ front, back }) }
    if (out.length < 3) throw new Error('too few cards'); return out.slice(0, 15)
  }
  function addCards(list, meta) { // skips a card whose front already exists in the same subject
    const have = new Set(SN.list('card').filter(c => c.subjectId === meta.subjectId).map(c => L.norm(c.front))); let added = 0, dup = 0
    for (const c of list) {
      if (have.has(L.norm(c.front))) { dup++; continue } have.add(L.norm(c.front))
      SN.put('card', 'c_' + SN.uid(), L.newCard(Object.assign({ front: c.front, back: c.back, subjectId: meta.subjectId || '', chapter: meta.chapter || '', topic: meta.topic || '', source: meta.source || 'manual', created: Date.now() }), Date.now()), true); added++
    }
    SN.put('setting', 'touch', { t: Date.now() }, true); window.dispatchEvent(new CustomEvent('sn-data', { detail: { kind: 'card' } })); SN.checkAwards && SN.checkAwards(); return { added, dup }
  }
  SN.addCards = addCards
  const cardsPrompt = (text, meta, n) => SN.ICSE_ROLE + '\nMake ' + (n || 10) + ' flashcards from the lesson below. Subject: ' + meta.subject + '. Topic: ' + meta.topic + '.\nReply with ONLY this JSON: {"cards":[{"front":"a clear question or term","back":"a short answer in at most 2 sentences"}]}\nCover the main ideas. Use only facts that are in the lesson. Do not repeat a question.\n' + SN.rules(true) + '\n\nLESSON:\n' + text.slice(0, MAXL)
  // Shows a list of generated cards with tick boxes, then adds the ticked ones.
  function cardPreview(out, cards, meta, done) {
    clear(out); const checks = []
    out.appendChild(h('p', { class: 'sn-note' }, 'Tick the cards you want to keep.'))
    const list = h('div', { class: 'sn-list' }); cards.forEach((c, i) => { const cb = h('input', { type: 'checkbox', checked: true, id: 'pc' + i, 'aria-label': 'Keep card ' + (i + 1) }); checks.push(cb); list.appendChild(h('label', { class: 'sn-item', for: 'pc' + i }, cb, h('div', { class: 'grow' }, h('strong', null, c.front), h('small', null, c.back)))) })
    out.appendChild(list)
    out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { const pick = cards.filter((_, i) => checks[i].checked); if (!pick.length) { showToast('Tick at least one card.'); return } const r = addCards(pick, meta); showToast(r.added + ' card' + (r.added === 1 ? '' : 's') + ' added to your review deck' + (r.dup ? ' (' + r.dup + ' already there)' : '') + '.'); if (done) done() } }, 'Add to my review deck'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { clear(out); if (done) done(true) } }, 'Discard')))
  }

  /* ---------- Lesson -> material buttons on the study page ---------- */
  const PIPE = {
    keypoints: ['Key points', 'List the 8 to 10 most important points of this lesson as short bullet points. Bold the key word in each point. No introduction.'],
    definitions: ['Definitions', 'List every important term from this lesson with a clear one-line definition, as bullet points in the form **Term**: definition. Use only terms that appear in the lesson.'],
    revision: ['Revision sheet', 'Make a one-page revision sheet: a title, "Remember" key points, formulas or dates if they appear, "Common mistakes", and 3 self-check questions at the end (do NOT give their answers). Keep it short enough to print on one page.']
  }
  function pipeInit() {
    const out = $('pipeOut'); if (!out) return
    document.querySelectorAll('[data-pipe]').forEach(b => b.addEventListener('click', async () => {
      const Lx = currentLesson; if (!Lx) { showToast('Open a lesson first.'); return } const kind = b.dataset.pipe, sub = lessonSubject(Lx)
      const meta = { subjectId: sub.id, subject: sub.name, topic: Lx.topic, chapter: Lx.chapter || '', source: 'ai' }
      if (kind === 'note') { saveNote({ title: Lx.topic, body: Lx.text, subjectId: sub.id, chapter: Lx.chapter || '', source: 'lesson' }); showToast('Saved to your notes.'); return }
      b.disabled = true; clear(out); out.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('strong', null, 'Working on it…')))
      try {
        if (kind === 'cards') {
          const r = await SN.ai({ prompt: cardsPrompt(Lx.text, meta, 10), json: true, validate: validateCards, key: 'cards|' + sub.id + '|' + SN.hash(Lx.text) })
          cardPreview(out, r.value, meta, () => {}); out.appendChild(SN.modelNote(r)); return
        }
        const [label, task] = PIPE[kind]
        const r = await SN.ai({ prompt: SN.ICSE_ROLE + '\nTASK: ' + task + '\nSubject: ' + sub.name + '. Topic: ' + Lx.topic + '. Use only the lesson below; do not add facts that are not in it.\n' + SN.rules() + '\n\nLESSON:\n' + Lx.text.slice(0, MAXL), key: 'pipe|' + kind + '|' + sub.id + '|' + SN.hash(Lx.text) })
        clear(out); const title = label + ': ' + Lx.topic
        out.appendChild(h('h3', { class: 'sn-sec' }, title)); out.appendChild(md(r.value)); out.appendChild(SN.modelNote(r))
        out.appendChild(h('div', { class: 'action-row' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { saveNote({ title, body: r.value, subjectId: sub.id, chapter: Lx.chapter || '', source: 'ai', kindOf: kind }); showToast('Saved to your notes.') } }, 'Save to notes'),
          h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => copyText(title + '\n\n' + r.value, md(r.value)) }, '⧉ Copy'),
          h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => printNote(title, r.value, sub.name) }, '⎙ Print'),
          h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => clear(out) }, 'Discard')))
      } catch (err) { clear(out); out.appendChild(SN.errBox(err, () => b.click())) } finally { b.disabled = false }
    }))
  }
  async function copyText(plain, htmlNode) {
    try {
      if (htmlNode && window.ClipboardItem && navigator.clipboard.write) { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([htmlNode.outerHTML], { type: 'text/html' }) })]) }
      else await navigator.clipboard.writeText(plain)
      showToast('Copied.')
    } catch (e) { try { await navigator.clipboard.writeText(plain); showToast('Copied as plain text.') } catch (x) { showToast('Your browser blocked copying.') } }
  }
  function printNote(title, body, subjectName) {
    const wrap = h('div', null, h('h1', null, title), h('div', { class: 'meta' }, h('span', null, subjectName || 'StudyNest'), h('span', null, fmtDate(Date.now()))), md(body), h('p', { class: 'practice' }, 'Made with StudyNest. Study material, not an official CISCE document.'))
    SN.printNode('note', wrap, 'StudyNest - ' + title)
  }
  function saveNote(n) { const id = n.id || 'n_' + SN.uid(), old = n.id ? SN.get('note', n.id) : null; SN.put('note', id, Object.assign({ created: Date.now() }, old || {}, { title: L.clean(n.title, 120) || 'Untitled note', body: String(n.body || '').slice(0, 60000), subjectId: n.subjectId || '', chapter: n.chapter || '', source: n.source || (old && old.source) || 'manual', kindOf: n.kindOf || (old && old.kindOf) || '' })); SN.checkAwards && SN.checkAwards(); return id }

  /* ---------- Notes ---------- */
  function renderNotes(box, arg) {
    let editing = null, page = 0, q = '', subj = ''
    const PER = 10
    const list = () => {
      clear(box); SN.setDirty(null)
      box.appendChild(h('div', { class: 'sn-row sp' }, h('p', { class: 'sn-sub', style: 'margin:0' }, 'Write your own notes or keep the ones made from lessons. You can edit, print and copy them.'), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => edit({}) }, '+ New note')))
      box.appendChild(h('div', { class: 'sn-form', style: 'margin:12px 0' },
        h('div', null, h('label', { class: 'sn-lbl', for: 'nq' }, 'Search'), h('input', { id: 'nq', type: 'text', value: q, placeholder: 'Search your notes', oninput: e => { q = e.target.value; page = 0; paint() } })),
        h('div', null, h('label', { class: 'sn-lbl', for: 'ns' }, 'Subject'), h('select', { id: 'ns', onchange: e => { subj = e.target.value; page = 0; paint() } }, [h('option', { value: '' }, 'All subjects')].concat(DB.map(s => { const o = h('option', { value: s.id }, s.name); if (s.id === subj) o.selected = true; return o }))))))
      box.appendChild(h('div', { id: 'noteList' })); paint()
    }
    const paint = () => {
      const host = $('noteList'); if (!host) return; clear(host)
      let items = SN.list('note').sort((a, b) => b.updatedAt - a.updatedAt); if (subj) items = items.filter(n => n.subjectId === subj); const t = q.trim().toLowerCase(); if (t) items = items.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(t))
      if (!items.length) { host.appendChild(empty('🗒', SN.list('note').length ? 'No notes match' : 'No notes yet', SN.list('note').length ? 'Try a different search or subject.' : 'Press "New note", or open a lesson and press "Save as note".', SN.list('note').length ? null : 'Write my first note', () => edit({}))); return }
      const pages = Math.ceil(items.length / PER); page = Math.min(page, pages - 1)
      const ul = h('div', { class: 'sn-list' }); items.slice(page * PER, page * PER + PER).forEach(n => ul.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'sn-ico', 'aria-hidden': 'true' }, n.source === 'ai' ? '✦' : '✎'), h('div', { class: 'grow' }, h('strong', null, n.title), h('small', null, [SN.subjectName(n.subjectId), n.chapter, fmtDate(n.updatedAt)].filter(Boolean).join(' · ')), h('small', null, n.body.replace(/\s+/g, ' ').slice(0, 90))), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => edit(n) }, 'Open'))))
      host.appendChild(ul)
      if (pages > 1) host.appendChild(h('div', { class: 'sn-row' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page === 0 ? true : null, onclick: () => { page--; paint() } }, '← Newer'), h('span', { class: 'sn-note' }, 'Page ' + (page + 1) + ' of ' + pages), h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page >= pages - 1 ? true : null, onclick: () => { page++; paint() } }, 'Older →')))
    }
    const edit = n => {
      editing = n; clear(box)
      const init = { title: n.title || '', body: n.body || '', subjectId: n.subjectId || (n.id ? '' : selectedSubject), chapter: n.chapter || '' }
      const cur = Object.assign({}, init); const isDirty = () => cur.title !== init.title || cur.body !== init.body || cur.subjectId !== init.subjectId || cur.chapter !== init.chapter
      SN.setDirty(() => isDirty() ? 'You have unsaved changes in this note. Leave without saving?' : '')
      const title = h('input', { id: 'ntitle', type: 'text', maxlength: 120, value: cur.title, placeholder: 'Note title', oninput: e => { cur.title = e.target.value } })
      const subSel = h('select', { id: 'nsub', onchange: e => { cur.subjectId = e.target.value; fillCh() } }, [h('option', { value: '' }, 'No subject')].concat(DB.map(s => { const o = h('option', { value: s.id }, s.name); if (s.id === cur.subjectId) o.selected = true; return o })))
      const chSel = h('select', { id: 'nch', onchange: e => { cur.chapter = e.target.value } })
      const fillCh = () => { clear(chSel); chSel.appendChild(h('option', { value: '' }, 'No chapter')); const s = SN.subjectById(cur.subjectId); if (s) s.chapters.forEach(c => { const o = h('option', { value: c[0] }, c[0]); if (c[0] === cur.chapter) o.selected = true; chSel.appendChild(o) }); else cur.chapter = '' }
      fillCh()
      const body = h('textarea', { id: 'nbody', rows: 14, maxlength: 60000, placeholder: 'Write your note here. You can use # headings, - bullets and **bold**.', oninput: e => { cur.body = e.target.value; if (prev.dataset.on) preview() } }, cur.body)
      const prev = h('div', { class: 'sn-card hidden', 'aria-live': 'polite' }), preview = () => { clear(prev); prev.dataset.on = '1'; prev.appendChild(md(cur.body || '*Nothing to show yet.*')) }
      const back = async () => { if (await SN.canLeave()) list() }
      box.appendChild(h('div', { class: 'sn-row sp' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: back }, '← All notes'), n.id ? h('span', { class: 'sn-note' }, 'Last saved ' + fmtDate(n.updatedAt)) : null))
      box.appendChild(h('div', { class: 'sn-form', style: 'margin-top:10px' }, h('div', { class: 'full' }, h('label', { class: 'sn-lbl', for: 'ntitle' }, 'Title'), title), h('div', null, h('label', { class: 'sn-lbl', for: 'nsub' }, 'Subject'), subSel), h('div', null, h('label', { class: 'sn-lbl', for: 'nch' }, 'Chapter'), chSel), h('div', { class: 'full' }, h('label', { class: 'sn-lbl', for: 'nbody' }, 'Note'), body)))
      box.appendChild(h('div', { class: 'action-row' },
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { const id = saveNote({ id: n.id, title: cur.title, body: cur.body, subjectId: cur.subjectId, chapter: cur.chapter }); const s = SN.get('note', id); n = s; init.title = s.title; init.body = s.body; init.subjectId = s.subjectId; init.chapter = s.chapter; cur.title = s.title; title.value = s.title; showToast('Note saved.') } }, '✓ Save'),
        h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { if (prev.classList.toggle('hidden')) delete prev.dataset.on; else preview() } }, '👁 Preview'),
        h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => copyText((cur.title ? cur.title + '\n\n' : '') + cur.body, md(cur.body)) }, '⧉ Copy'),
        h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => cur.body.trim() ? printNote(cur.title || 'Note', cur.body, SN.subjectName(cur.subjectId)) : showToast('Write something first.') }, '⎙ Print'),
        h('button', { class: 'btn btn-light btn-sm', type: 'button', id: 'noteCards', onclick: makeCards }, '▧ Make flashcards'),
        n.id ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { if (await SN.confirm('Delete this note? This cannot be undone.', 'Delete note')) { SN.setDirty(null); SN.remove('note', n.id); showToast('Note deleted.'); list() } } }, 'Delete') : null))
      box.appendChild(prev); const out = h('div'); box.appendChild(out)
      async function makeCards(e) {
        if (cur.body.trim().length < 40) { showToast('Write a little more first (at least a few sentences).'); return }
        const b = e.currentTarget; b.disabled = true; clear(out); out.appendChild(h('p', { class: 'sn-note' }, 'Making flashcards…'))
        const s = SN.subjectById(cur.subjectId), meta = { subjectId: cur.subjectId, subject: s ? s.name : 'General', topic: cur.title || 'My note', chapter: cur.chapter, source: 'note' }
        try { const r = await SN.ai({ prompt: cardsPrompt(cur.body, meta, 8), json: true, validate: validateCards, key: 'cards|note|' + SN.hash(cur.body) }); cardPreview(out, r.value, meta); out.appendChild(SN.modelNote(r)) } catch (err) { clear(out); out.appendChild(SN.errBox(err)) } finally { b.disabled = false }
      }
      title.focus()
    }
    list(); if (arg && arg.new) edit({}); if (arg && arg.id) { const n = SN.get('note', arg.id); if (n) edit(n) }
    return () => { SN.setDirty(null) }
  }

  /* ---------- Revise ---------- */
  function renderRevise(box) {
    let session = null, keyHandler = null, page = 0
    const home = () => {
      clear(box); const now = Date.now(), cards = SN.list('card'), rc = L.reviewCounts(cards, now), p = SN.prefs(), queue = L.buildQueue(cards, now, p.sessionSize)
      box.appendChild(h('p', { class: 'sn-sub' }, 'Flashcards come back just before you would forget them. Rate each card honestly: Again, Hard, Good or Easy.'))
      box.appendChild(h('div', { class: 'sn-grid' }, stat(rc.overdue, 'Overdue', 'due before today'), stat(rc.today, 'Due today'), stat(rc.newCards, 'New cards', 'not reviewed yet'), stat(rc.week, 'Coming in 7 days')))
      const row = h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', disabled: queue.length ? null : true, onclick: () => start(queue) }, queue.length ? '▶ Start review (' + queue.length + ' card' + (queue.length > 1 ? 's' : '') + ')' : 'Nothing to review now'), h('button', { class: 'btn btn-light', type: 'button', onclick: () => form() }, '+ Add a card'), h('button', { class: 'btn btn-light', type: 'button', onclick: lessonCards }, '▧ Cards from a saved lesson')); box.appendChild(row)
      const out = h('div', { id: 'reviseOut' }); box.appendChild(out)
      if (!cards.length) box.appendChild(empty('↻', 'No flashcards yet', 'Add a card yourself, make cards from a saved lesson, or open any lesson and press "Review cards".', null))
      else {
        if (!queue.length) { const nxt = cards.filter(c => c.count).sort((a, b) => a.due - b.due)[0]; box.appendChild(h('div', { class: 'sn-fb ok' }, nxt ? 'All caught up! Your next card is due ' + SN.fmtDateTime(nxt.due) + '.' : 'All caught up!')) }
        const weak = cards.filter(c => c.lapses >= 2); if (weak.length) { const m = {}; weak.forEach(c => { const k = c.topic || SN.subjectName(c.subjectId) || 'General'; m[k] = (m[k] || 0) + 1 }); box.appendChild(h('h3', { class: 'sn-sec' }, 'Topics that need repeat practice')); box.appendChild(h('p', { class: 'sn-note' }, 'Cards you pressed "Again" on 2 or more times:')); box.appendChild(h('div', { class: 'sn-checks' }, Object.keys(m).map(k => h('span', { class: 'sn-badge warn' }, k + ' · ' + m[k])))) }
        const due = getSaved().filter(isDue).length; if (due) box.appendChild(h('p', { class: 'sn-note' }, due + ' saved lesson' + (due > 1 ? 's are' : ' is') + ' also due for review in "My library".'))
        box.appendChild(h('h3', { class: 'sn-sec' }, 'All cards (' + cards.length + ')')); const host = h('div', { id: 'cardList' }); box.appendChild(host); paintCards()
      }
    }
    const paintCards = () => {
      const host = $('cardList'); if (!host) return; clear(host); const PER = 10, cards = SN.list('card').sort((a, b) => b.created - a.created), pages = Math.ceil(cards.length / PER); page = Math.min(page, Math.max(0, pages - 1))
      const ul = h('div', { class: 'sn-list' }); cards.slice(page * PER, page * PER + PER).forEach(c => ul.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, c.front), h('small', null, c.back), h('small', null, [SN.subjectName(c.subjectId), c.count ? 'Next: ' + SN.fmtDateTime(c.due) : 'New'].filter(Boolean).join(' · '))), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => form(c) }, 'Edit'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'Delete card: ' + c.front, onclick: async () => { if (await SN.confirm('Delete this card?', 'Delete card')) { SN.remove('card', c.id); home() } } }, '×')))); host.appendChild(ul)
      if (pages > 1) host.appendChild(h('div', { class: 'sn-row' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page === 0 ? true : null, onclick: () => { page--; paintCards() } }, '← Newer'), h('span', { class: 'sn-note' }, 'Page ' + (page + 1) + ' of ' + pages), h('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: page >= pages - 1 ? true : null, onclick: () => { page++; paintCards() } }, 'Older →')))
    }
    const form = c => {
      clear(box); c = c || {}; const cur = { front: c.front || '', back: c.back || '', subjectId: c.subjectId || selectedSubject || '' }
      const init = Object.assign({}, cur); SN.setDirty(() => (cur.front !== init.front || cur.back !== init.back) ? 'You have an unsaved card. Leave without saving?' : '')
      box.appendChild(h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { if (await SN.canLeave()) { SN.setDirty(null); home() } } }, '← Back'))
      box.appendChild(h('div', { class: 'sn-form', style: 'margin-top:12px' },
        h('div', { class: 'full' }, h('label', { class: 'sn-lbl', for: 'cf' }, 'Front (question or term)'), h('textarea', { id: 'cf', maxlength: 300, oninput: e => { cur.front = e.target.value } }, cur.front)),
        h('div', { class: 'full' }, h('label', { class: 'sn-lbl', for: 'cb' }, 'Back (answer)'), h('textarea', { id: 'cb', maxlength: 600, oninput: e => { cur.back = e.target.value } }, cur.back)),
        h('div', null, h('label', { class: 'sn-lbl', for: 'cs' }, 'Subject'), h('select', { id: 'cs', onchange: e => { cur.subjectId = e.target.value } }, [h('option', { value: '' }, 'No subject')].concat(DB.map(s => { const o = h('option', { value: s.id }, s.name); if (s.id === cur.subjectId) o.selected = true; return o }))))))
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
        const f = L.clean(cur.front, 300), b = L.clean(cur.back, 600); if (!f || !b) { showToast('Please fill in both the front and the back.'); return }
        if (c.id) SN.update('card', c.id, { front: f, back: b, subjectId: cur.subjectId }); else { const r = addCards([{ front: f, back: b }], { subjectId: cur.subjectId, source: 'manual' }); if (!r.added) { showToast('You already have a card with that front.'); return } }
        SN.setDirty(null); showToast('Card saved.'); home()
      } }, '✓ Save card')))
    }
    async function lessonCards(e) {
      const out = $('reviseOut'), saved = getSaved().filter(x => x.mode !== 'quiz'); clear(out)
      if (!saved.length) { out.appendChild(h('p', { class: 'sn-note' }, 'You have no saved lessons yet. Save a lesson first.')); return }
      const sel = h('select', { id: 'lessonPick', class: 'sn-in' }, saved.map(x => h('option', { value: x.id }, x.topic + ' (' + x.subject + ')')))
      out.appendChild(h('div', { class: 'sn-card' }, h('label', { class: 'sn-lbl', for: 'lessonPick' }, 'Choose a lesson'), sel, h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async ev => {
        const x = saved.find(y => y.id === sel.value), s = lessonSubject(x), meta = { subjectId: s.id, subject: s.name, topic: x.topic, chapter: x.chapter || '', source: 'ai' }, b = ev.currentTarget, area = h('div'); b.disabled = true; out.appendChild(area); area.appendChild(h('p', { class: 'sn-note' }, 'Making flashcards…'))
        try { const r = await SN.ai({ prompt: cardsPrompt(x.text, meta, 10), json: true, validate: validateCards, key: 'cards|' + s.id + '|' + SN.hash(x.text) }); cardPreview(area, r.value, meta, () => home()); area.appendChild(SN.modelNote(r)) } catch (err) { clear(area); area.appendChild(SN.errBox(err)) } finally { b.disabled = false }
      } }, 'Make cards'))))
    }
    /* review session */
    function start(queue) {
      session = { ids: queue.map(c => c.id), i: 0, shown: false, rated: { again: 0, hard: 0, good: 0, easy: 0 }, seen: {}, total: queue.length, started: Date.now() }; draw()
      keyHandler = e => { if (!session || /input|textarea|select/i.test((e.target.tagName || ''))) return; if (e.key === ' ' || e.key === 'Enter') { if (!session.shown) { e.preventDefault(); reveal() } } else if (session.shown && '1234'.includes(e.key)) rate(L.RATINGS['1234'.indexOf(e.key)]) }
      document.addEventListener('keydown', keyHandler)
    }
    function reveal() { session.shown = true; draw() }
    function draw() {
      clear(box); const id = session.ids[session.i]; const c = SN.get('card', id)
      if (!c) { session.i++; if (session.i >= session.ids.length) return finish(); return draw() }
      const done = session.total - (session.ids.length - session.i) + 0
      box.appendChild(h('div', { class: 'sn-row sp' }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { if (await SN.confirm('Stop this review? Cards you already rated are saved.', 'Stop review', false)) finish(true) } }, '✕ Stop'), h('span', { class: 'sn-note', role: 'status' }, 'Card ' + Math.min(session.i + 1, session.ids.length) + ' of ' + session.ids.length)))
      box.appendChild(bar(pct(session.i, session.ids.length)))
      const card = h('div', { class: 'sn-flash', tabindex: '0', 'aria-live': 'polite' }, h('div', { class: 'side' }, 'FRONT'), h('div', null, c.front))
      if (session.shown) { card.appendChild(h('div', { class: 'ans' }, h('div', { class: 'side' }, 'BACK'), h('div', null, c.back))) }
      box.appendChild(card)
      if (!session.shown) box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'revealBtn', onclick: reveal }, 'Show answer (Space)')))
      else { const nx = L.nextIntervals(c, Date.now()), lab = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }; box.appendChild(h('div', { class: 'sn-rate' }, L.RATINGS.map((r, i) => h('button', { class: 'btn ' + (r === 'good' ? 'btn-primary' : 'btn-light'), type: 'button', onclick: () => rate(r) }, lab[r] + ' (' + (i + 1) + ')', h('small', null, nx[r]))))) }
      const f = $('revealBtn') || box.querySelector('.sn-rate button'); if (f) f.focus({ preventScroll: true })
    }
    function rate(r) {
      const id = session.ids[session.i], c = SN.get('card', id); if (c) { const n = L.schedule(c, r, Date.now()); SN.put('card', id, n) }
      session.rated[r]++; session.seen[id] = (session.seen[id] || 0) + 1
      if (r === 'again' && session.seen[id] < 3) session.ids.push(id) // see it again later in this session (at most twice)
      session.i++; session.shown = false; if (session.i >= session.ids.length) finish(); else draw()
    }
    function finish(early) {
      document.removeEventListener('keydown', keyHandler); keyHandler = null; const s = session; session = null; clear(box)
      const n = s ? s.rated.again + s.rated.hard + s.rated.good + s.rated.easy : 0
      if (n > 0) { SN.activity('review'); SN.checkAwards && SN.checkAwards() }
      if (!n) { home(); return }
      box.appendChild(h('h3', { class: 'sn-sec' }, early ? 'Review stopped' : '🎉 Session complete'))
      box.appendChild(h('div', { class: 'sn-grid' }, stat(n, 'Ratings given'), stat(s.rated.again, 'Again'), stat(s.rated.hard, 'Hard'), stat(s.rated.good, 'Good'), stat(s.rated.easy, 'Easy')))
      const nxt = SN.list('card').filter(c => c.count).sort((a, b) => a.due - b.due)[0]; if (nxt) box.appendChild(h('p', { class: 'sn-note' }, 'Next card is due ' + SN.fmtDateTime(nxt.due) + '.'))
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: home }, 'Back to revision')))
    }
    home(); return () => { if (keyHandler) document.removeEventListener('keydown', keyHandler); session = null; SN.setDirty(null) }
  }

  SN.views.notes = { title: 'Notes', render: renderNotes, noAuto: true }
  SN.views.revise = { title: 'Revise', render: renderRevise, noAuto: true }
  SN.printNote = printNote; SN.saveNote = saveNote; SN.copyText = copyText; SN.cardsPrompt = cardsPrompt; SN.validateCards = validateCards; SN.cardPreview = cardPreview
  pipeInit()
})()
