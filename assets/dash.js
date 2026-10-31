/* StudyNest Home (dashboard, study coach, achievements) and Settings. Every number comes from records saved by the student. */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN, { h, md, clear, fmtDate, pct, bar, stat, empty } = SN
  const TYPE_LABEL = { quiz: 'Quiz', exam: 'Practice paper', detective: 'Answer check', lab: 'Lab practice' }
  const totalChaptersDone = () => { const p = lsGet(LS_PROG, {}); return DB.reduce((n, s) => n + ((p[s.id] || []).filter(i => i < s.chapters.length).length), 0) }

  /* ---------- state used by the coach and the achievements ---------- */
  function weeklyGoalMet(goal) {
    const byWeek = {}; SN.activities().forEach(a => { const wk = L.weekKey(new Date(a.id + 'T12:00').getTime()); byWeek[wk] = (byWeek[wk] || 0) + SN.ACTIONS.reduce((m, t) => m + ((a.counts && a.counts[t]) || 0), 0) })
    return Object.values(byWeek).some(n => n >= goal)
  }
  function state() {
    const p = SN.prefs(), acts = SN.activities(), sum = t => acts.reduce((n, a) => n + ((a.counts && a.counts[t]) || 0), 0), papers = SN.list('paper').filter(x => x.status === 'submitted')
    const last = acts.slice().sort((a, b) => (b.id > a.id ? 1 : -1)).find(a => a.last)
    const bySubject = {}; papers.forEach(x => { bySubject[x.subjectId] = (bySubject[x.subjectId] || 0) + 1 })
    const attempts = SN.list('attempt')
    return {
      now: Date.now(), cards: SN.list('card'), attempts, weak: L.weakTopics(attempts), mistakes: SN.list('mistake'), dueLessons: getSaved().filter(isDue),
      examDate: p.examDate, examSubjectId: p.examSubjectId, papersBySubject: bySubject, progress: lsGet(LS_PROG, {}), lastSubjectId: last ? last.last : '',
      subjects: DB.map(s => ({ id: s.id, name: s.name, chapters: s.chapters })), studyCount: sum('study'),
      saved: getSaved().length, reviewSessions: sum('review'), reviewDays: SN.activeDays(['review']), papers: papers.length, notes: SN.list('note').length,
      chaptersDone: totalChaptersDone(), weeklyGoalMet: weeklyGoalMet(p.weeklyGoal), attempts: attempts.length
    }
  }
  SN.state = state
  SN.dueCount = () => { const now = Date.now(); return SN.list('card').filter(c => c.count && c.due <= now).length }

  /* ---------- achievements: each one is saved once, with the time it was earned ---------- */
  function checkAwards(quiet) {
    const s = state(); const have = new Set(SN.list('award').map(a => a.id)), now = L.earnedAchievements(s)
    now.forEach(id => { if (!have.has(id)) { SN.put('award', id, { at: Date.now() }, true); const a = L.ACHIEVEMENTS.find(x => x.id === id); if (!quiet && a) showToast('🏆 Achievement: ' + a.title) } })
    return now
  }
  SN.checkAwards = checkAwards

  /* ---------- coach ---------- */
  function coachItems() {
    const day = L.dayKey(), marks = {}; SN.list('coach').forEach(c => { if (c.day === day) marks[c.id] = c.state })
    const all = L.recommend(state()), shown = all.filter(r => !marks[r.id.slice(0, 80)]), doneToday = all.filter(r => marks[r.id.slice(0, 80)] === 'done').length
    return { shown, doneToday, hidden: all.length - shown.length }
  }
  function act(a) {
    if (a.type === 'review') SN.show('revise'); else if (a.type === 'exam') SN.show('exam', { subjectId: a.subjectId }); else if (a.type === 'detective') SN.show('detective')
    else if (a.type === 'teach') SN.startTeach(a.subjectId, a.topic); else if (a.type === 'lesson') SN.openLesson(a.id); else SN.show('study')
  }
  const mark = (r, st) => SN.put('coach', r.id.slice(0, 80), { state: st, day: L.dayKey() })

  /* ---------- Home ---------- */
  function renderHome(box) {
    let off = null
    const paint = () => {
      clear(box); const p = SN.prefs(), now = Date.now(), cards = SN.list('card'), rc = L.reviewCounts(cards, now), attempts = SN.list('attempt'), saved = getSaved(), notes = SN.list('note')
      box.appendChild(h('p', { class: 'sn-sub' }, 'Welcome back! Everything on this page comes from what you have really done in StudyNest.'))
      // quick actions
      box.appendChild(h('div', { class: 'sn-grid' },
        qa('✦', 'Learn something', 'Ask the AI teacher', () => SN.show('study')), qa('📝', 'Practice paper', 'Make an exam-style paper', () => SN.show('exam')),
        qa('↻', 'Revise', rc.overdue + rc.today ? (rc.overdue + rc.today) + ' card' + (rc.overdue + rc.today > 1 ? 's' : '') + ' to review' : 'No cards due now', () => SN.show('revise')), qa('🔍', 'Check a mistake', 'Find out why you were wrong', () => SN.show('detective'))))
      // coach
      const co = coachItems(); box.appendChild(h('h3', { class: 'sn-sec' }, 'Recommended for you'))
      if (!co.shown.length) box.appendChild(empty('🌟', 'You are all caught up', co.hidden ? 'You dismissed or finished today\'s suggestions. New ones appear when there is something to do.' : 'Suggestions appear here after you study, take quizzes or add flashcards.', 'Start a lesson', () => SN.show('study')))
      else {
        const list = h('div', { class: 'sn-list' }); co.shown.slice(0, 5).forEach(r => list.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'sn-ico', 'aria-hidden': 'true' }, r.icon), h('div', { class: 'grow' }, h('strong', null, r.title), h('small', null, 'Why: ' + r.reason)),
          h('div', { class: 'sn-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => act(r.action) }, 'Do it'), h('button', { class: 'btn btn-light btn-sm', type: 'button', title: 'Mark as done for today', onclick: () => mark(r, 'done') }, '✓ Done'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'aria-label': 'Dismiss: ' + r.title, onclick: () => mark(r, 'dismissed') }, '×')))))
        box.appendChild(list)
        const out = h('div'); box.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: async e => {
          const b = e.currentTarget; b.disabled = true; clear(out); out.appendChild(h('p', { class: 'sn-note' }, 'Thinking…'))
          const items = co.shown.slice(0, 5).map((r, i) => (i + 1) + '. ' + r.title + ' (' + r.reason + ')').join('\n')
          try { const r = await SN.ai({ prompt: SN.ICSE_ROLE + '\nA student has these study tasks, already found from their real study records:\n' + items + '\n\nIn at most 5 short sentences, say which to do first and why, in a friendly way. Do not add tasks or invent facts about the student.\n' + SN.rules(), key: 'coach|' + L.dayKey() + '|' + SN.hash(items) }); clear(out); out.appendChild(md(r.value)); out.appendChild(SN.modelNote(r)) }
          catch (err) { clear(out); out.appendChild(SN.errBox(err)) } finally { b.disabled = false }
        } }, '✦ Ask the AI which to do first'), out)
      }
      // overall + subject progress
      const done = totalChaptersDone(), all = DB.reduce((n, s) => n + s.chapters.length, 0)
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Your progress'))
      box.appendChild(h('div', { class: 'sn-grid' }, stat(done + '/' + all, 'Chapters studied', pct(done, all) + '% of the syllabus'), stat(saved.length, 'Saved lessons'), stat(notes.length, 'Notes'), stat(cards.length, 'Flashcards', cards.length ? rc.newCards + ' not reviewed yet' : 'None yet')))
      const subs = h('div', { class: 'sn-grid', style: 'margin-top:12px' })
      DB.forEach(s => {
        const n = (lsGet(LS_PROG, {})[s.id] || []).length, at = attempts.filter(a => a.subjectId === s.id), c = at.reduce((x, a) => x + a.correct, 0), t = at.reduce((x, a) => x + a.total, 0)
        subs.appendChild(h('button', { class: 'sn-card', type: 'button', style: 'text-align:left;cursor:pointer;color:inherit', onclick: () => SN.startTeach(s.id, '') }, h('h3', null, s.icon + ' ' + s.name), bar(pct(n, s.chapters.length)),
          h('p', null, n ? n + ' of ' + s.chapters.length + ' chapters studied' : 'Not started yet'), h('p', null, t ? 'Practice score: ' + c + '/' + t + ' (' + pct(c, t) + '%)' : (n ? 'No scored practice yet' : ''))))
      })
      box.appendChild(subs)
      // revision
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Revision'))
      if (!cards.length) box.appendChild(empty('↻', 'No flashcards yet', 'Open a lesson and press "Review cards" to turn it into flashcards that come back at the right time.', 'Go to my lessons', () => SN.show('study')))
      else {
        box.appendChild(h('div', { class: 'sn-grid' }, stat(rc.overdue, 'Overdue', 'due before today'), stat(rc.today, 'Due today'), stat(rc.week, 'Coming in 7 days'), stat(rc.hard, 'Need repeat practice', 'missed 2 or more times')))
        box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => SN.show('revise') }, '↻ Open revision')))
      }
      // weak topics from results
      const weak = L.weakTopics(attempts); box.appendChild(h('h3', { class: 'sn-sec' }, 'Topics to practise'))
      if (!weak.length) box.appendChild(h('p', { class: 'sn-note' }, attempts.length ? 'No weak topic yet. A topic shows here after at least 3 questions with a score under 60%.' : 'Take a quiz or a practice paper and your weak topics will show here.'))
      else { const l = h('div', { class: 'sn-list' }); weak.slice(0, 4).forEach(w => l.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, w.topic), h('small', null, SN.subjectName(w.subjectId) + ' · ' + w.correct + ' of ' + w.total + ' right (' + pct(w.correct, w.total) + '%)')), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => SN.startTeach(w.subjectId, w.topic) }, 'Revise')))); box.appendChild(l) }
      // recent
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Recent lessons'))
      if (!saved.length) box.appendChild(h('p', { class: 'sn-note' }, 'Lessons you save will show here.'))
      else { const l = h('div', { class: 'sn-list' }); saved.slice(0, 4).forEach(x => l.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, x.topic), h('small', null, x.subject + ' · ' + fmtDate(x.created))), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => SN.openLesson(x.id) }, 'Open')))); box.appendChild(l) }
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Recent scored practice'))
      const rec = attempts.slice().sort((a, b) => b.at - a.at).slice(0, 5)
      if (!rec.length) box.appendChild(h('p', { class: 'sn-note' }, 'No scored practice yet. Try a quiz, a practice paper or a lab activity.'))
      else { const l = h('div', { class: 'sn-list' }); rec.forEach(a => l.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, a.topic || 'Practice'), h('small', null, (TYPE_LABEL[a.type] || 'Practice') + ' · ' + SN.subjectName(a.subjectId) + ' · ' + fmtDate(a.at))), h('span', { class: 'sn-badge ' + (a.correct / a.total >= 0.6 ? 'ok' : 'bad') }, a.correct + '/' + a.total)))); box.appendChild(l) }
      // goals + exam
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Goals'))
      const wk = SN.weekActions(), goal = p.weeklyGoal, st = getStreak(), dd = L.daysUntil(p.examDate, now)
      box.appendChild(h('div', { class: 'sn-grid' },
        h('div', { class: 'sn-card' }, h('h3', null, 'This week'), bar(pct(Math.min(wk, goal), goal)), h('p', null, wk + ' of ' + goal + ' study actions' + (wk >= goal ? ' · goal reached 🎉' : '')), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => SN.show('settings') }, 'Change goal')),
        h('div', { class: 'sn-card' }, h('h3', null, 'Today'), h('p', null, 'Lessons today: ' + (st.day === L.dayKey() ? st.count : 0) + ' of ' + (st.goal || 3)), h('p', { class: 'sn-note' }, 'Study days in a row: ' + L.streakFrom(SN.activeDays(), now) + '. Missing a day is okay. You can start again any time.')),
        h('div', { class: 'sn-card' }, h('h3', null, 'Exam countdown'), dd == null ? h('p', null, 'No exam date set.') : dd < 0 ? h('p', null, 'Your exam date has passed.') : h('p', null, dd === 0 ? 'Your exam is today. Good luck!' : dd + ' day' + (dd === 1 ? '' : 's') + ' to go' + (p.examSubjectId ? ' (' + SN.subjectName(p.examSubjectId) + ')' : '')), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => SN.show('settings') }, dd == null ? 'Set exam date' : 'Change'))))
      // achievements
      checkAwards(); const earned = new Map(SN.list('award').map(a => [a.id, a.at]))
      box.appendChild(h('h3', { class: 'sn-sec' }, 'Achievements (' + earned.size + '/' + L.ACHIEVEMENTS.length + ')'))
      const ag = h('div', { class: 'sn-grid' }); L.ACHIEVEMENTS.forEach(a => { const got = earned.has(a.id); ag.appendChild(h('div', { class: 'sn-card', style: got ? '' : 'opacity:.75' }, h('h3', null, (got ? a.icon : '🔒') + ' ' + a.title), h('p', null, a.how), got ? h('small', { class: 'sn-note' }, 'Earned ' + fmtDate(earned.get(a.id))) : null)) }); box.appendChild(ag)
      // how it is calculated
      box.appendChild(h('details', { class: 'sn-how' }, h('summary', null, 'How is this calculated?'), h('ul', null,
        h('li', null, 'Chapters studied: chapters you ticked, or opened a lesson for. Progress % = studied chapters ÷ all chapters.'),
        h('li', null, 'Practice score: right answers ÷ questions answered in saved quiz, paper and lab results. The same quiz answers on the same day count once.'),
        h('li', null, 'Weak topic: at least 3 questions answered on the topic and under 60% right. "Not started" is different from a low score.'),
        h('li', null, 'Study actions (weekly goal): lessons opened (once per topic per day), quizzes, papers, review sessions, lab activities and answer checks, counted from Monday.'),
        h('li', null, 'Cards: overdue = due before today, due today = due before midnight, using your device\'s local time.'),
        h('li', null, 'Suggestions are chosen by simple rules from your records. Each one shows its reason.'))))
    }
    paint(); let t = null
    const on = () => { clearTimeout(t); t = setTimeout(paint, 250) }
    window.addEventListener('sn-data', on); window.addEventListener('sn-sync', on)
    return () => { window.removeEventListener('sn-data', on); window.removeEventListener('sn-sync', on); clearTimeout(t) }
  }
  const qa = (icon, title, sub, fn) => h('button', { class: 'sn-card', type: 'button', style: 'text-align:left;cursor:pointer;color:inherit', onclick: fn }, h('h3', null, icon + ' ' + title), h('p', null, sub))

  /* ---------- Settings ---------- */
  function applyPrefs(p) {
    if (LANG_RULES[p.lang]) { selectedLang = p.lang; rawSet(LS_LANG, p.lang); document.querySelectorAll('input[name=lang]').forEach(r => { r.checked = r.value === p.lang }) }
    if (LEVEL_RULES[p.level]) { selectedLevel = p.level; rawSet(LS_LEVEL, p.level); document.querySelectorAll('input[name=level]').forEach(r => { r.checked = r.value === p.level }) }
    if (MODELS[p.model]) { selectedModel = p.model; rawSet(STORAGE_MODEL, p.model); $('modelSelect').value = p.model; updateModelHint() }
    document.documentElement.dataset.contrast = p.contrast ? 'high' : ''; document.documentElement.dataset.motion = p.reduceMotion ? 'reduce' : ''
  }
  SN.applyPrefs = applyPrefs
  function renderSettings(box) {
    const p = SN.prefs(); const set = patch => { SN.setPrefs(patch); applyPrefs(SN.prefs()) }
    const sel = (id, opts, val, fn) => h('select', { id, class: 'sn-in', onchange: e => fn(e.target.value) }, opts.map(([v, l]) => { const o = h('option', { value: v }, l); if (String(v) === String(val)) o.selected = true; return o }))
    const num = (id, val, min, max, fn) => h('input', { id, type: 'number', class: 'sn-in', min, max, value: val, inputmode: 'numeric', onchange: e => { const n = Math.round(Number(e.target.value)); if (!isFinite(n) || n < min || n > max) { showToast('Please type a number from ' + min + ' to ' + max + '.'); e.target.value = val; return } fn(n) } })
    const f = (label, ctl, hint) => h('div', null, h('label', { for: ctl.id, class: 'sn-lbl' }, label), ctl, hint ? h('small', { class: 'sn-note' }, hint) : null)
    box.appendChild(h('p', { class: 'sn-sub' }, 'Your choices are saved on this device' + (SN.isSynced() ? ' and in your account.' : '. Log in to keep them on all your devices.')))
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Learning'))
    box.appendChild(h('div', { class: 'sn-form' },
      f('Language', sel('sLang', [['english', 'English'], ['hinglish', 'Hinglish'], ['hindi', 'हिन्दी (Hindi)']], p.lang, v => set({ lang: v }))),
      f('Teaching level', sel('sLevel', Object.keys(LEVEL_LABEL).map(k => [k, LEVEL_LABEL[k]]), p.level, v => set({ level: v }))),
      f('AI model', sel('sModel', Object.keys(MODELS).map(k => [k, MODELS[k].name + ' · ' + MODELS[k].note]), p.model, v => set({ model: v })), 'Puter uses your own free Puter credits. Higher cost models use them faster.')))
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Goals and exam'))
    box.appendChild(h('div', { class: 'sn-form' },
      f('Weekly goal (study actions)', num('sWeek', p.weeklyGoal, 1, 100, v => set({ weeklyGoal: v }))),
      f('Lessons per day', sel('sDay', [1, 3, 5, 10].map(n => [n, String(n)]), getStreak().goal || 3, v => { const s = getStreak(); s.goal = Number(v); lsSet(LS_STREAK, s); renderStats() })),
      f('Exam date (optional)', h('input', { id: 'sExam', type: 'date', class: 'sn-in', value: p.examDate, onchange: e => { const v = e.target.value; if (v && L.daysUntil(v) == null) { showToast('That date is not valid.'); return } set({ examDate: v }) } })),
      f('Exam subject (optional)', sel('sExamSub', [['', 'Not set']].concat(DB.map(s => [s.id, s.name])), p.examSubjectId, v => set({ examSubjectId: v }))),
      f('Flashcards per review session', num('sSess', p.sessionSize, 5, 100, v => set({ sessionSize: v })))))
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Reminders'))
    box.appendChild(h('label', { class: 'sn-checks' }, h('span', null, h('input', { type: 'checkbox', id: 'sRemind', checked: p.remind ? true : null, onchange: e => { set({ remind: e.target.checked }); SN.renderNav() } }), ' Show a number on the Revise tab when flashcards are due')))
    box.appendChild(h('p', { class: 'sn-note' }, 'Reminders appear inside StudyNest when you open it. StudyNest does not send browser or phone notifications.'))
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Accessibility'))
    box.appendChild(h('div', { class: 'sn-form' },
      f('Theme', sel('sTheme', [['light', 'Light'], ['dark', 'Dark']], document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', v => { rawSet(LS_THEME, v); applyTheme(v) })),
      f('Lesson text size', sel('sFont', [[1, '100%'], [1.15, '115%'], [1.3, '130%'], [1.5, '150%']], parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1, v => { document.documentElement.style.setProperty('--fs', v); rawSet(LS_FONT, String(v)) }))))
    box.appendChild(h('div', { class: 'sn-checks', style: 'margin-top:10px' },
      h('label', null, h('input', { type: 'checkbox', checked: p.reduceMotion ? true : null, onchange: e => set({ reduceMotion: e.target.checked }) }), ' Reduce motion'),
      h('label', null, h('input', { type: 'checkbox', checked: p.contrast ? true : null, onchange: e => set({ contrast: e.target.checked }) }), ' High contrast')))
    // data and sync
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Your data'))
    const stat1 = h('p', { class: 'sn-note', id: 'syncLine', role: 'status' }), paintSync = () => { const s = SN.sync; stat1.textContent = !SN.isSynced() ? 'Saved on this device only. Log in to sync notes, flashcards and results to your account and your other devices.' : s.state === 'ok' ? 'Synced to your account. Last sync: ' + new Date(s.last).toLocaleTimeString() : s.state === 'syncing' ? 'Syncing…' : s.state === 'offline' ? 'You are offline. Changes are saved on this device and will sync when you are back online.' : s.state === 'error' ? s.error : 'Signed in. Not synced yet.' }
    paintSync(); window.addEventListener('sn-sync', paintSync); box.appendChild(stat1)
    const row = h('div', { class: 'action-row' }); box.appendChild(row)
    if (SN.isSynced()) row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: async e => { e.target.disabled = true; const ok = await SN.syncNow(); e.target.disabled = false; showToast(ok ? 'Synced.' : (SN.sync.error || 'Could not sync right now.')) } }, '⟳ Sync now'))
    row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { const blob = new Blob([JSON.stringify(SN.exportAll(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = h('a', { href: url, download: 'studynest-backup-' + L.dayKey() + '.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } }, '⇩ Export my data'))
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', id: 'sImport', onchange: async e => {
      const f0 = e.target.files[0]; e.target.value = ''; if (!f0) return; if (f0.size > 8e6) { showToast('That file is too big to be a StudyNest backup.'); return }
      let o; try { o = JSON.parse(await f0.text()) } catch (x) { showToast('That file could not be read.'); return }
      const r = SN.importAll(o); showToast(r.ok ? 'Imported ' + r.added + ' item' + (r.added === 1 ? '' : 's') + (r.lessons ? ' and ' + r.lessons + ' lesson' + (r.lessons === 1 ? '' : 's') : '') + '. Newer items on this device were kept.' : r.error); if (r.ok) SN.show('settings', { force: true })
    } })
    row.appendChild(file); row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => file.click() }, '⇧ Import a backup'))
    if (SN.isSynced() && SN.guestCount()) row.appendChild(h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { const n = SN.adoptGuest(); showToast(n ? 'Copied ' + n + ' item' + (n === 1 ? '' : 's') + ' into your account.' : 'Nothing new to copy.') } }, 'Copy this device\'s guest data to my account'))
    row.appendChild(h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => {
      if (!(await SN.confirm('Delete all your notes, flashcards, results, papers and settings' + (SN.isSynced() ? ' from this device and from your account' : ' from this device') + '? Your saved lessons are not touched. This cannot be undone. Export a backup first if you are not sure.', 'Delete my study data'))) return
      const cloud = await SN.deleteAll(); showToast(cloud === false ? 'Deleted on this device. The cloud copy could not be reached, so try again when online.' : 'Your study data was deleted.'); SN.show('settings', { force: true })
    } }, 'Delete my study data'))
    box.appendChild(h('p', { class: 'sn-note' }, 'Saved lessons are in "My library" and have their own export and delete buttons there.'))
    // account
    box.appendChild(h('h3', { class: 'sn-sec' }, 'Account'))
    const acc = h('div', { class: 'action-row' }); box.appendChild(acc)
    if (signedIn) { acc.appendChild(h('a', { class: 'btn btn-light btn-sm', href: '/account' }, 'Account page')); acc.appendChild(h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { const b = $('logoutBtn'); if (b) b.click(); else location.assign('/account') } }, 'Log out')) }
    else { acc.appendChild(h('a', { class: 'btn btn-primary btn-sm', href: '/login' }, 'Log in')); acc.appendChild(h('a', { class: 'btn btn-light btn-sm', href: '/signup' }, 'Create account')) }
    return () => window.removeEventListener('sn-sync', paintSync)
  }

  SN.views.home = { title: 'Home', render: renderHome, noAuto: true }
  SN.views.settings = { title: 'Settings', render: renderSettings, noAuto: true }

  /* ---------- keep the study page choices and the saved preferences together ---------- */
  function boot() {
    if (SN.hasPrefs()) applyPrefs(SN.prefs())
    document.querySelectorAll('input[name=lang]').forEach(r => r.addEventListener('change', () => { if (r.checked) SN.setPrefs({ lang: r.value }) }))
    document.querySelectorAll('input[name=level]').forEach(r => r.addEventListener('change', () => { if (r.checked) SN.setPrefs({ level: r.value }) }))
    $('modelSelect').addEventListener('change', e => { if (MODELS[e.target.value]) SN.setPrefs({ model: e.target.value }) })
    window.addEventListener('sn-data', e => { if (e.detail && (e.detail.kind === '*' || e.detail.kind === 'setting') && SN.hasPrefs()) applyPrefs(SN.prefs()) })
    checkAwards(true)
  }
  boot()
})()
