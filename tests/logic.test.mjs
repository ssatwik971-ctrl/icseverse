// Unit tests for assets/logic.js (marks, answer checking, revision schedule, dates, coach, chemistry).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const L = createRequire(import.meta.url)('../assets/logic.js')

const mcq = (t, a = 'B') => ({ type: 'mcq', text: t, options: ['one', 'two', 'three', 'four'], answer: a, topic: 'T' })
const rawSet = () => [
  mcq('What is the powerhouse of the cell found in animals?'), mcq('Which organelle makes proteins inside the cell body?', 'C'),
  { type: 'fill', text: 'The control centre of a cell is the ____.', answer: 'nucleus', topic: 'T' },
  { type: 'tf', text: 'Plant cells have a cell wall.', answer: 'true', topic: 'T' },
  { type: 'short', text: 'Why do plant cells need chloroplasts for making food?', modelAnswer: 'They hold chlorophyll.', markingScheme: ['chlorophyll', 'light'], topic: 'T' },
  { type: 'num', text: 'Find v when u=2, a=3, t=2', answer: { value: 8, unit: 'm/s' }, topic: 'P' }
]
const cfg = (s) => ({ title: 'Test', subject: 'Biology', subjectId: 'bio', sections: s, durationMin: 30 })

test('planSections hits the exact total marks', () => {
  for (const total of [10, 20, 25, 30, 40, 50, 60, 80]) {
    const p = L.planSections(['mcq', 'fill', 'short', 'long'], total)
    const sum = Object.entries(p.counts).reduce((a, [t, n]) => a + n * L.marksOf(t), 0)
    assert.equal(sum, total); assert.ok(p.exact)
  }
  assert.equal(L.planSections(['long'], 7).exact, false) // 5-mark questions cannot make 7
  assert.equal(L.planSections([], 20).total, 0)
})

test('assemblePaper numbers questions, adds up marks and passes the validator', () => {
  const { paper, missing } = L.assemblePaper(cfg([{ type: 'mcq', count: 2 }, { type: 'fill', count: 1 }, { type: 'tf', count: 1 }, { type: 'short', count: 1 }]), rawSet())
  assert.deepEqual(missing, {}); assert.equal(paper.count, 5); assert.equal(paper.totalMarks, 2 * 1 + 1 + 1 + 2)
  assert.deepEqual(L.allQuestions(paper).map(q => q.n), [1, 2, 3, 4, 5])
  const v = L.validatePaper(paper); assert.ok(v.ok, v.errors.join('; '))
})

test('AI-supplied marks are ignored and missing questions are reported', () => {
  const raw = rawSet(); raw[0].marks = 99
  const { paper, missing } = L.assemblePaper(cfg([{ type: 'mcq', count: 3 }]), raw)
  assert.equal(missing.mcq, 1); assert.equal(paper.totalMarks, 2); assert.ok(L.validatePaper(paper).ok)
})

test('duplicate and near-duplicate questions are dropped', () => {
  const raw = [mcq('What is the powerhouse of the cell?'), mcq('What is the powerhouse of the cell ?'), mcq('Name the organelle that stores water in plant cells.')]
  const { paper } = L.assemblePaper(cfg([{ type: 'mcq', count: 3 }]), raw)
  assert.equal(paper.count, 2)
})

test('validator catches broken papers', () => {
  const { paper } = L.assemblePaper(cfg([{ type: 'mcq', count: 2 }]), rawSet())
  const bad = JSON.parse(JSON.stringify(paper)); bad.totalMarks = 9; assert.ok(!L.validatePaper(bad).ok)
  const bad2 = JSON.parse(JSON.stringify(paper)); bad2.sections[0].questions[1].n = 7; assert.ok(!L.validatePaper(bad2).ok)
  const bad3 = JSON.parse(JSON.stringify(paper)); bad3.sections[0].questions[0].answer = 'Z'; assert.ok(!L.validatePaper(bad3).ok)
})

test('bad AI questions are rejected', () => {
  assert.equal(L.normQuestion({ text: 'x', options: ['a', 'a', 'b', 'c'], answer: 'A' }, 'mcq'), null) // repeated option
  assert.equal(L.normQuestion({ text: 'x', options: ['a', 'b', 'c'], answer: 'A' }, 'mcq'), null) // 3 options
  assert.equal(L.normQuestion({ text: 'x', options: ['a', 'b', 'c', 'd'], answer: 'E' }, 'mcq'), null)
  assert.equal(L.normQuestion({ text: 'x', answer: 'maybe' }, 'tf'), null)
  assert.equal(L.normQuestion({ text: 'x' }, 'short'), null)
  assert.equal(L.normQuestion({ text: 'x', answer: 'abc' }, 'num'), null)
})

test('objective checking: correct, wrong, blank, equivalent wording', () => {
  const m = { type: 'mcq', options: ['a', 'b', 'c', 'd'], answer: 'B', marks: 1 }
  for (const a of ['B', 'b', '(b)', 'B.', 'b)', 'b']) assert.equal(L.checkObjective(m, a).status, 'correct', a)
  assert.equal(L.checkObjective(m, 'b').marks, 1); assert.equal(L.checkObjective(m, 'C').status, 'incorrect'); assert.equal(L.checkObjective(m, '  ').status, 'blank')
  assert.equal(L.checkObjective({ ...m, options: ['red', 'green', 'blue', 'pink'] }, 'Green').status, 'correct')
  const t = { type: 'tf', answer: true, marks: 1 }
  assert.equal(L.checkObjective(t, 'True').status, 'correct'); assert.equal(L.checkObjective(t, 't').status, 'correct'); assert.equal(L.checkObjective(t, 'false').status, 'incorrect')
  const f = { type: 'fill', answer: 'nucleus', accept: ['nucleus'], marks: 1 }
  assert.equal(L.checkObjective(f, 'The Nucleus').status, 'correct'); assert.equal(L.checkObjective(f, 'nuclues').status, 'close'); assert.equal(L.checkObjective(f, 'nuclues').marks, 1); assert.equal(L.checkObjective(f, 'cell wall').status, 'incorrect')
  assert.equal(L.checkObjective({ type: 'fill', answer: '4', accept: ['4'], marks: 1 }, '4.0').status, 'correct')
})

test('numeric checking: unit handling and tolerance', () => {
  const q = { type: 'num', answer: { value: 8, unit: 'm/s' }, marks: 3 }
  assert.equal(L.checkObjective(q, '8 m/s').status, 'correct'); assert.equal(L.checkObjective(q, '8.0 ms-1').status, 'correct'); assert.equal(L.checkObjective(q, '8').status, 'partial'); assert.equal(L.checkObjective(q, '8').marks, 2)
  assert.equal(L.checkObjective(q, '9 m/s').status, 'incorrect'); assert.equal(L.checkObjective(q, 'eight').status, 'incorrect')
  assert.equal(L.checkObjective({ type: 'num', answer: { value: 10, unit: 'm/s2' }, marks: 2 }, '10 m/s²').status, 'correct')
})

test('scoring: auto marks, written marks, unmarked, percentage', () => {
  const { paper } = L.assemblePaper(cfg([{ type: 'mcq', count: 2 }, { type: 'short', count: 1 }]), rawSet())
  const qs = L.allQuestions(paper), ans = { [qs[0].id]: qs[0].answer, [qs[1].id]: 'D' === qs[1].answer ? 'A' : 'D', [qs[2].id]: 'They hold chlorophyll' }
  let s = L.scorePaper(paper, ans, {}); assert.equal(s.got, 1); assert.equal(s.unmarked, 2); assert.equal(s.complete, false); assert.equal(s.totalOut, 4)
  s = L.scorePaper(paper, ans, { [qs[2].id]: 2 }); assert.equal(s.got, 3); assert.ok(s.complete); assert.equal(s.percent, 75)
  s = L.scorePaper(paper, {}, {}); assert.equal(s.got, 0); assert.ok(s.complete) // blank written answers need no marking
  assert.equal(L.scorePaper(paper, ans, { [qs[2].id]: 99 }).got, 3) // marks above the maximum are capped
})

test('spaced repetition: Again, Hard, Good, Easy', () => {
  const now = new Date(2026, 9, 30, 10, 0).getTime(), DAY = L.DAY
  const c0 = L.newCard({}, now)
  const a = L.schedule(c0, 'again', now); assert.equal(a.due - now, 10 * 60000); assert.equal(a.lapses, 1)
  const g1 = L.schedule(c0, 'good', now); assert.equal(g1.interval, 1); const g2 = L.schedule(g1, 'good', now + DAY); assert.equal(g2.interval, 3); const g3 = L.schedule(g2, 'good', now + 4 * DAY); assert.equal(g3.interval, Math.round(3 * g2.ease))
  const e1 = L.schedule(c0, 'easy', now); assert.equal(e1.interval, 3); assert.ok(e1.ease > 2.5)
  const h = L.schedule(g3, 'hard', now); assert.ok(h.interval < Math.round(g3.interval * g3.ease)); assert.ok(h.ease < g3.ease)
  assert.ok(g1.due !== e1.due && a.due < g1.due && g1.due < e1.due) // different ratings, different times
  assert.equal(g1.due % DAY, now % DAY) // keeps the time of day
  let c = L.newCard({}, now); for (let i = 0; i < 40; i++) c = L.schedule(c, 'easy', now); assert.ok(c.interval <= 365)
  let d = L.newCard({}, now); for (let i = 0; i < 30; i++) d = L.schedule(d, 'again', now); assert.ok(d.ease >= 1.3)
  assert.throws(() => L.schedule(c0, 'perfect', now))
})

test('due, overdue and empty queues around midnight', () => {
  const now = new Date(2026, 9, 30, 23, 59).getTime()
  const mk = (due, count = 1) => L.newCard({ due, count }, now)
  assert.equal(L.bucket(mk(new Date(2026, 9, 29, 23, 0).getTime()), now), 'overdue')
  assert.equal(L.bucket(mk(new Date(2026, 9, 30, 0, 1).getTime()), now), 'due')
  assert.equal(L.bucket(mk(new Date(2026, 9, 31, 0, 1).getTime()), now), 'later')
  assert.equal(L.bucket(mk(0, 0), now), 'new')
  const rc = L.reviewCounts([mk(1), mk(now - 1000), mk(now + 86400000 * 3), mk(0, 0)], now); assert.equal(rc.overdue, 1); assert.equal(rc.today, 1); assert.equal(rc.newCards, 1); assert.equal(rc.week, 1)
  assert.deepEqual(L.buildQueue([], now, 20), []); assert.equal(L.buildQueue([mk(now + 86400000 * 3)], now).length, 0)
  const q = L.buildQueue([mk(0, 0), mk(now - 5), mk(now - 9e6)], now); assert.equal(q[0].due, now - 9e6); assert.equal(q.length, 3)
})

test('days, week keys and streaks use the local day', () => {
  const now = new Date(2026, 9, 30, 0, 5).getTime() // Fri 30 Oct, just after midnight
  assert.equal(L.dayKey(now), '2026-10-30'); assert.equal(L.addDays('2026-10-31', 1), '2026-11-01'); assert.equal(L.addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(L.weekKey(now), '2026-10-26'); assert.equal(L.weekKey(new Date(2026, 10, 1, 23, 59).getTime()), '2026-10-26') // Sunday still belongs to the Monday before
  assert.equal(L.daysUntil('2026-11-09', now), 10); assert.equal(L.daysUntil('2026-10-30', now), 0); assert.equal(L.daysUntil('nonsense', now), null)
  assert.equal(L.streakFrom(['2026-10-29', '2026-10-28', '2026-10-27'], now), 3) // not studied yet today: streak is kept
  assert.equal(L.streakFrom(['2026-10-30', '2026-10-29', '2026-10-27'], now), 2); assert.equal(L.streakFrom(['2026-10-20'], now), 0); assert.equal(L.streakFrom([], now), 0)
})

test('weak topics need enough evidence', () => {
  const r = (topic, correct, total, at = 1) => ({ subjectId: 'bio', topic, correct, total, at })
  assert.equal(L.weakTopics([r('Cells', 0, 2)]).length, 0) // only 2 questions: not enough evidence
  const w = L.weakTopics([r('Cells', 1, 3), r('Tissues', 5, 6), r('Cells', 0, 2)]); assert.equal(w.length, 1); assert.equal(w[0].topic, 'Cells'); assert.equal(w[0].total, 5)
  assert.equal(L.weakTopics([r('Cells', 3, 5)]).length, 0) // exactly 60% is not weak
})

test('achievements are earned only from real data and never twice', () => {
  const empty = { saved: 0, studyCount: 0, attempts: 0, reviewSessions: 0, papers: 0, notes: 0, reviewDays: [], weeklyGoalMet: false, chaptersDone: 0 }
  assert.deepEqual(L.earnedAchievements(empty), [])
  const s = { ...empty, saved: 5, attempts: 1, reviewDays: ['2026-10-26', '2026-10-28', '2026-10-31'] }
  const e = L.earnedAchievements(s); assert.ok(e.includes('five_saved') && e.includes('first_quiz') && e.includes('consistent_revision') && e.includes('first_lesson')); assert.equal(new Set(e).size, e.length)
  assert.ok(!L.earnedAchievements({ ...empty, reviewDays: ['2026-10-01', '2026-10-10', '2026-10-20'] }).includes('consistent_revision'))
})

test('coach: reasons come from real data, nothing invented', () => {
  const now = new Date(2026, 9, 30, 12).getTime(), subjects = [{ id: 'bio', name: 'Biology', chapters: [['Cell', '7'], ['Tissues', '21'], ['Flower', '40']] }]
  const base = { now, cards: [], weak: [], mistakes: [], dueLessons: [], subjects, progress: {}, studyCount: 0 }
  const first = L.recommend(base); assert.equal(first.length, 1); assert.equal(first[0].id, 'start')
  assert.equal(L.recommend({ ...base, studyCount: 3 }).length, 0)
  const r = L.recommend({ ...base, studyCount: 3, cards: [L.newCard({ count: 1, due: now - 3 * 86400000 }, now)], weak: [{ subjectId: 'bio', topic: 'Cell', correct: 1, total: 4 }], progress: { bio: [0] }, examDate: '2026-11-05', examSubjectId: 'bio', papersBySubject: {} })
  assert.equal(r[0].id, 'cards-overdue'); assert.ok(r.every(x => x.reason && x.reason.length > 10))
  assert.ok(r.find(x => x.id.startsWith('weak-')).reason.includes('1 of 4')); assert.ok(r.find(x => x.id.startsWith('exam-')).reason.includes('6 days')); assert.ok(r.find(x => x.id.startsWith('chapter-')).title.includes('Tissues'))
})

test('JSON is pulled out of messy AI text', () => {
  assert.deepEqual(L.extractJson('Sure!\n```json\n{"a":[1,2,],"b":"x"}\n```\nDone'), { a: [1, 2], b: 'x' })
  assert.deepEqual(L.extractJson('here {"q":"say \\"}\\" ok"} bye'), { q: 'say "}" ok' })
  assert.deepEqual(L.extractJson('[{"front":"a","back":"b"}]'), [{ front: 'a', back: 'b' }]); assert.equal(L.extractJson('no json here'), null); assert.equal(L.extractJson('{broken'), null)
})

test('chemistry: formulas, balancing and valency', () => {
  assert.deepEqual(L.parseFormula('Ca(OH)2'), { Ca: 1, O: 2, H: 2 }); assert.deepEqual(L.parseFormula('H₂SO₄'), { H: 2, S: 1, O: 4 }); assert.deepEqual(L.parseFormula('Al2(SO4)3'), { Al: 2, S: 3, O: 12 })
  assert.throws(() => L.parseFormula('h2o')); assert.throws(() => L.parseFormula('H2)'))
  const eqs = ['H2 + O2 -> H2O', 'Mg + O2 -> MgO', 'N2 + H2 -> NH3', 'Fe + O2 -> Fe2O3', 'CH4 + O2 -> CO2 + H2O', 'Na + H2O -> NaOH + H2', 'Zn + HCl -> ZnCl2 + H2', 'Al + O2 -> Al2O3', 'KClO3 -> KCl + O2', 'CaCO3 -> CaO + CO2', 'H2SO4 + NaOH -> Na2SO4 + H2O', 'Ca(OH)2 + HCl -> CaCl2 + H2O', 'Fe + H2O -> Fe3O4 + H2']
  for (const e of eqs) { const eq = L.parseEquation(e), c = L.balance(eq); assert.ok(c, e); assert.ok(L.atomCounts(eq, c).every(x => x.ok), e) }
  assert.deepEqual(L.balance(L.parseEquation('H2 + O2 -> H2O')), [2, 1, 2]); assert.deepEqual(L.balance(L.parseEquation('CaCO3 -> CaO + CO2')), [1, 1, 1])
  const ion = s => L.IONS.find(i => i.sym === s)
  assert.equal(L.formulaFromIons(ion('Ca'), ion('OH')), 'Ca(OH)2'); assert.equal(L.formulaFromIons(ion('Al'), ion('O')), 'Al2O3'); assert.equal(L.formulaFromIons(ion('Mg'), ion('O')), 'MgO'); assert.equal(L.formulaFromIons(ion('Na'), ion('SO4')), 'Na2SO4'); assert.equal(L.formulaFromIons(ion('NH4'), ion('Cl')), 'NH4Cl'); assert.equal(L.formulaFromIons(ion('Al'), ion('PO4')), 'AlPO4')
  assert.equal(L.checkFormula('Ca(OH)2', 'Ca(OH)2').status, 'correct'); assert.equal(L.checkFormula('CaO2H2', 'Ca(OH)2').status, 'correct'); assert.equal(L.checkFormula('CaOH', 'Ca(OH)2').status, 'incorrect'); assert.equal(L.checkFormula('ca(oh)2', 'Ca(OH)2').status, 'incorrect')
})

test('physics and geography generators give correct, repeatable answers', () => {
  for (let seed = 1; seed <= 60; seed++) { const p = L.physicsProblem(seed); assert.ok(isFinite(p.answer.value) && p.answer.unit && p.steps.length >= 2 && p.text); assert.equal(L.checkNumeric(p.answer.value + ' ' + p.answer.unit, p.answer, 3).status, 'correct') }
  assert.deepEqual(L.physicsProblem(7), L.physicsProblem(7)); assert.equal(L.physicsProblem(1, 'f').formula, 'F = ma')
  assert.equal(L.timeDiffMinutes(75, -30), 420); assert.equal(L.timeDiffMinutes(170, -170), 80); assert.equal(L.timeDiffMinutes(0, 0), 0)
  for (let seed = 1; seed <= 40; seed++) { const g = L.longitudeProblem(seed); assert.ok(Number.isInteger(g.answer) && g.answer > 0 && g.answer <= 720) }
})

test('backup files are validated before import', () => {
  assert.ok(L.validateBackup({ app: 'studynest', v: 1, data: { note: [{ id: 'a' }] }, lessons: [] }).ok)
  assert.ok(!L.validateBackup(null).ok); assert.ok(!L.validateBackup({ app: 'x', v: 1 }).ok); assert.ok(!L.validateBackup({ app: 'studynest', v: 1, data: { note: [{ nope: 1 }] } }).ok); assert.ok(!L.validateBackup({ app: 'studynest', v: 1, data: { note: 'x' } }).ok)
})
