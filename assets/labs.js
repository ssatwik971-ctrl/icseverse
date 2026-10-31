/* StudyNest Labs: interactive practice for Biology, Physics, Chemistry and Geography (ICSE Class 9).
   Every activity checks answers with code. Diagrams are simple drawings made for StudyNest, and simulations are simplified (not real lab measurements). */
(function () {
  'use strict'
  const L = window.SNL, SN = window.SN, { h, clear, stat, bar, pct } = SN
  const NS = 'http://www.w3.org/2000/svg'
  const svg = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const k in (attrs || {})) { if (attrs[k] != null) e.setAttribute(k, attrs[k]) } kids.forEach(x => { if (x != null) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x) }); return e }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
  const sub = f => f.replace(/(?<=[A-Za-z)\]])(\d+)/g, d => d.split('').map(c => SUBS[c]).join(''))
  const finish = (sid, topic, correct, total, act) => { SN.recordAttempt('lab', sid, topic, correct, total, 'lab_' + act + '_' + SN.uid()); SN.activity('lab', sid); SN.checkAwards && SN.checkAwards() }
  const fb = (ok, text, mid) => h('div', { class: 'sn-fb ' + (ok ? 'ok' : mid ? 'mid' : 'no'), role: 'status' }, text)
  const note = text => h('p', { class: 'sn-note' }, text)
  const back = (fn) => h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: fn }, '← All activities')
  const scoreLine = (c, t) => h('div', { class: 'sn-fb ' + (c / t >= 0.6 ? 'ok' : 'mid'), role: 'status' }, h('strong', null, 'Score: ' + c + ' / ' + t + ' (' + pct(c, t) + '%). '), 'Your result was saved.')

  /* ===================== BIOLOGY ===================== */
  const CELL = [ // [name, what it does]
    ['Cell wall', 'A stiff outer layer (made of cellulose) in plant cells that gives shape and protection'], ['Cell membrane', 'A thin layer around the cell that controls what goes in and out'],
    ['Cytoplasm', 'The jelly-like fluid where the cell parts sit and many reactions happen'], ['Nucleus', 'Holds the genetic material (DNA) and controls the cell\'s activities'],
    ['Mitochondrion', 'Releases energy from food during respiration'], ['Chloroplast', 'Contains chlorophyll and carries out photosynthesis'],
    ['Vacuole', 'Stores water, food and waste; large and central in plant cells'], ['Ribosome', 'Makes proteins'], ['Lysosome', 'Digests worn-out parts and germs (mainly in animal cells)'],
    ['Golgi apparatus', 'Packs substances and sends them out of the cell'], ['Endoplasmic reticulum', 'A network of tubes that carries substances inside the cell']
  ]
  function plantCellSvg() {
    const pins = [[1, 'Cell wall', 350, 200, 398, 222], [2, 'Cell membrane', 342, 80, 398, 70], [3, 'Cytoplasm', 100, 205, 28, 235], [4, 'Nucleus', 285, 100, 398, 28], [5, 'Chloroplast', 268, 190, 398, 160], [6, 'Vacuole', 150, 125, 28, 125], [7, 'Mitochondrion', 100, 72, 28, 38]]
    const s = svg('svg', { viewBox: '0 0 430 260', class: 'sn-svg', role: 'img', 'aria-label': 'Simple drawing of a plant cell with seven numbered parts. Use the choices below the drawing.', width: 430, height: 260 })
    s.appendChild(svg('rect', { x: 50, y: 20, width: 300, height: 220, rx: 18, fill: '#fffbe6', stroke: '#2f6f3e', 'stroke-width': 7 }))
    s.appendChild(svg('rect', { x: 59, y: 29, width: 282, height: 202, rx: 12, fill: 'none', stroke: '#c98f1a', 'stroke-width': 2 }))
    s.appendChild(svg('ellipse', { cx: 150, cy: 130, rx: 66, ry: 58, fill: '#cfe8ff', stroke: '#4a8fd1', 'stroke-width': 2 }))
    s.appendChild(svg('circle', { cx: 275, cy: 95, r: 32, fill: '#e3d3f5', stroke: '#7a4aa8', 'stroke-width': 2 })); s.appendChild(svg('circle', { cx: 280, cy: 98, r: 9, fill: '#7a4aa8' }))
    ;[[268, 190], [222, 212]].forEach(([x, y]) => s.appendChild(svg('ellipse', { cx: x, cy: y, rx: 22, ry: 12, fill: '#4caf50', stroke: '#2e7d32', 'stroke-width': 2 })))
    s.appendChild(svg('ellipse', { cx: 100, cy: 72, rx: 22, ry: 11, fill: '#ffb26b', stroke: '#c4631a', 'stroke-width': 2 }))
    pins.forEach(([n, , tx, ty, mx, my]) => { s.appendChild(svg('line', { x1: tx, y1: ty, x2: mx, y2: my, stroke: '#333', 'stroke-width': 1.5 })); s.appendChild(svg('circle', { cx: tx, cy: ty, r: 3, fill: '#333' })); s.appendChild(svg('circle', { cx: mx, cy: my, r: 11, fill: '#fff', stroke: '#333', 'stroke-width': 1.5 })); s.appendChild(svg('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#111' }, String(n))) })
    return { s, names: pins.map(p => p[1]) }
  }
  const bioActs = {
    label: { title: 'Label the plant cell', desc: 'Name the 7 numbered parts of a simplified plant cell.', run(box, done) {
      const { s, names } = plantCellSvg(), opts = shuffle(names), sels = []
      box.appendChild(s); box.appendChild(note('A simplified drawing made for StudyNest. It is not to scale. The cell wall is the thick outer line; the cell membrane is the thin line just inside it.'))
      const grid = h('div', { class: 'sn-form' }); names.forEach((n, i) => { const sel = h('select', { id: 'lb' + i, 'aria-label': 'Part number ' + (i + 1) }, [h('option', { value: '' }, 'Choose…')].concat(opts.map(o => h('option', { value: o }, o)))); sels.push(sel); grid.appendChild(h('div', null, h('label', { class: 'sn-lbl', for: 'lb' + i }, 'Part ' + (i + 1)), sel)) }); box.appendChild(grid)
      const out = h('div', { 'aria-live': 'polite' }), btn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        if (sels.some(x => !x.value)) { showToast('Choose a name for every number first.'); return } let c = 0; clear(out)
        sels.forEach((x, i) => { const ok = x.value === names[i]; if (ok) c++; x.style.borderColor = ok ? '#16856b' : '#b42318'; x.setAttribute('aria-invalid', ok ? 'false' : 'true') })
        out.appendChild(scoreLine(c, 7)); const wrong = names.map((n, i) => sels[i].value !== n ? (i + 1) + ' is ' + n : null).filter(Boolean); if (wrong.length) out.appendChild(fb(false, 'Check again: ' + wrong.join('; ') + '.', true)); finish('bio', 'Cell organelles', c, 7, 'label'); btn.disabled = true } }, 'Check my labels')
      box.appendChild(h('div', { class: 'action-row' }, btn, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); box.appendChild(out) } },
    match: { title: 'Match structure and function', desc: 'Pair each cell part with what it does.', run(box, done) {
      const items = shuffle(CELL).slice(0, 8), terms = items.map(x => x[0]), funcs = shuffle(items.map(x => x[1])); let selT = null, matched = 0, firstTry = 0, tries = {}
      const left = h('div'), right = h('div'), out = h('div', { 'aria-live': 'polite' }); box.appendChild(note('Tap a cell part, then tap what it does.'))
      const pairBox = h('div', { class: 'sn-pair' }, left, right); box.appendChild(pairBox); box.appendChild(out)
      const tb = {}, fbn = {}
      terms.forEach(t => { const b = h('button', { type: 'button', onclick: () => { selT = t; Object.values(tb).forEach(x => x.classList.remove('sel')); b.classList.add('sel') } }, t); tb[t] = b; left.appendChild(b) })
      funcs.forEach(f => { const b = h('button', { type: 'button', onclick: () => {
        if (!selT) { showToast('Tap a cell part first.'); return } const right1 = items.find(x => x[0] === selT)[1] === f; tries[selT] = (tries[selT] || 0) + 1
        if (right1) { if (tries[selT] === 1) firstTry++; matched++; tb[selT].classList.add('gone'); b.classList.add('gone'); selT = null; clear(out); out.appendChild(fb(true, 'Correct!')); if (matched === items.length) { clear(out); out.appendChild(scoreLine(firstTry, items.length)); out.appendChild(note('Score = pairs you got right on the first try.')); finish('bio', 'Cell organelles', firstTry, items.length, 'match') } }
        else { clear(out); out.appendChild(fb(false, 'Not quite. Think about what that part does and try again.')) } } }, f); right.appendChild(b) })
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) } },
    quiz: { title: 'Cell quiz', desc: '8 quick questions about what cell parts do.', run(box, done) { termQuiz(box, done, CELL.map(([a, b]) => ({ q: 'Which cell part does this? ' + b + '.', a })), 'bio', 'Cell organelles', 'bioquiz') } },
    cards: { title: 'Biology term flashcards', desc: 'Add the cell part flashcards to your review deck.', run(box, done) {
      box.appendChild(note('These 11 cards are written for StudyNest. Add them to your review deck to practise them at the right times.')); const ul = h('div', { class: 'sn-list' }); CELL.forEach(([a, b]) => ul.appendChild(h('div', { class: 'sn-item' }, h('div', { class: 'grow' }, h('strong', null, a), h('small', null, b))))); box.appendChild(ul)
      box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { const r = SN.addCards(CELL.map(([a, b]) => ({ front: 'What is the ' + a.toLowerCase() + '?', back: b })), { subjectId: 'bio', topic: 'Cell organelles', source: 'lab' }); showToast(r.added + ' card' + (r.added === 1 ? '' : 's') + ' added' + (r.dup ? ' (' + r.dup + ' were already there)' : '') + '.') } }, '▧ Add to my review deck'), h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) } }
  }
  // Generic multiple-choice term quiz: items [{q, a}] where a is the right name; wrong options come from the other answers.
  function termQuiz(box, done, pool, sid, topic, act) {
    const items = shuffle(pool).slice(0, 8); let i = 0, c = 0; const area = h('div'); box.appendChild(area)
    const ask = () => {
      clear(area); if (i >= items.length) { area.appendChild(scoreLine(c, items.length)); finish(sid, topic, c, items.length, act); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
      const it = items[i], opts = shuffle([it.a].concat(shuffle(pool.filter(p => p.a !== it.a).map(p => p.a)).slice(0, 3))); let locked = false
      area.appendChild(h('p', { class: 'sn-note' }, 'Question ' + (i + 1) + ' of ' + items.length)); area.appendChild(h('p', { class: 'qt' }, it.q))
      const out = h('div', { 'aria-live': 'polite' }); opts.forEach(o => { const b = h('button', { type: 'button', class: 'sn-opt', style: 'width:100%;text-align:left', onclick: () => { if (locked) return; locked = true; const ok = o === it.a; if (ok) c++; b.classList.add(ok ? 'ok' : 'no'); out.appendChild(fb(ok, ok ? 'Correct!' : 'The answer is ' + it.a + '.')); out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { i++; ask() } }, i + 1 < items.length ? 'Next' : 'See my score'))) } }, o); area.appendChild(b) }); area.appendChild(out)
    }; ask()
  }

  /* ===================== PHYSICS ===================== */
  const FORMULAS = [['Average speed', 'speed = distance ÷ time', 'm/s'], ['Acceleration', 'a = (v − u) ÷ t', 'm/s²'], ['First equation of motion', 'v = u + at', 'v in m/s'], ['Second equation of motion', 's = ut + ½at²', 's in m'], ['Third equation of motion', 'v² = u² + 2as', 'm²/s²'], ['Force (Newton\'s second law)', 'F = ma', 'newton (N)'], ['Momentum', 'p = mv', 'kg m/s'], ['Pressure', 'P = F ÷ A', 'pascal (Pa) = N/m²'], ['Density', 'density = mass ÷ volume', 'kg/m³']]
  const phyActs = {
    ref: { title: 'Formula and unit reference', desc: 'Formulas with their SI units. Check your textbook for your exact syllabus.', run(box, done) {
      box.appendChild(h('div', { class: 'sn-scroll' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Quantity'), h('th', null, 'Formula'), h('th', null, 'SI unit'))), h('tbody', null, FORMULAS.map(r => h('tr', null, r.map(x => h('td', null, x))))))))
      box.appendChild(note('Symbols: u = starting speed, v = final speed, a = acceleration, t = time, s = distance moved in a straight line, m = mass, F = force, A = area. Use SI units in every calculation.')); box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) } },
    num: { title: 'Numerical practice', desc: '5 problems with step-by-step solutions. Write the number and the unit.', run(box, done) {
      let n = 0, c = 0, seed = Math.floor(Math.random() * 1e6); const area = h('div'); box.appendChild(area)
      const next = () => {
        clear(area); if (n >= 5) { area.appendChild(scoreLine(c, 5)); area.appendChild(note('A problem counts only when both the number and the unit are right.')); finish('physics', 'Numericals', c, 5, 'num'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const p = L.physicsProblem(seed + n * 7919); const inp = h('input', { type: 'text', class: 'sn-in', id: 'pAns', placeholder: 'For example 12 m/s', autocomplete: 'off', 'aria-label': 'Your answer with unit' }), out = h('div', { 'aria-live': 'polite' })
        area.appendChild(note('Problem ' + (n + 1) + ' of 5 · formula family: ' + p.formula)); area.appendChild(h('p', { class: 'qt' }, p.text)); area.appendChild(inp)
        const check = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
          if (!inp.value.trim()) { showToast('Type your answer first.'); return } const r = L.checkNumeric(inp.value, p.answer, 1); clear(out); if (r.status === 'correct') c++
          out.appendChild(fb(r.status === 'correct', (r.status === 'correct' ? 'Correct! ' : r.status === 'partial' ? 'Almost. ' : 'Not quite. ') + r.reason, r.status === 'partial')); out.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Steps'), h('ol', null, p.steps.map(x => h('li', null, x))), h('p', null, 'Answer: ' + p.answer.value + ' ' + p.answer.unit.replace('3', '³')))); check.disabled = true; inp.disabled = true
          out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n < 4 ? 'Next problem' : 'See my score'))) } }, 'Check'); area.appendChild(h('div', { class: 'action-row' }, check)); area.appendChild(out); inp.focus()
      }; next() } },
    sim: { title: 'Motion simulator', desc: 'Change the starting speed, acceleration and time and watch the speed–time graph.', run(box, done) {
      const st = { u: 5, a: 2, t: 6 }, out = h('div', { 'aria-live': 'polite' }), holder = h('div')
      const slider = (k, label, min, max, step, unit) => { const val = h('strong', null, st[k] + ' ' + unit), inp = h('input', { type: 'range', id: 'sim_' + k, min, max, step, value: st[k], oninput: e => { st[k] = Number(e.target.value); val.textContent = st[k] + ' ' + unit; draw() } }); return h('div', null, h('label', { class: 'sn-lbl', for: 'sim_' + k }, label + ': ', val), inp) }
      box.appendChild(h('div', { class: 'sn-warn' }, 'Simplified simulation: constant acceleration in a straight line, with no friction or air. It is not a real lab measurement.'))
      box.appendChild(h('div', { class: 'sn-form' }, slider('u', 'Starting speed u', 0, 20, 1, 'm/s'), slider('a', 'Acceleration a', -5, 5, 0.5, 'm/s²'), slider('t', 'Time t', 1, 10, 1, 's'))); box.appendChild(holder); box.appendChild(out)
      function draw() {
        const v = st.u + st.a * st.t, s = st.u * st.t + 0.5 * st.a * st.t * st.t; clear(holder); clear(out)
        const W = 380, H = 220, pad = 36, vmax = Math.max(st.u, v, 5), vmin = Math.min(0, st.u, v), X = x => pad + x / st.t * (W - pad - 12), Y = y => H - pad - (y - vmin) / (vmax - vmin) * (H - pad - 14)
        const g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sn-svg', role: 'img', 'aria-label': 'Speed against time graph. The line goes from ' + st.u + ' metres per second to ' + v + ' metres per second over ' + st.t + ' seconds.' })
        g.appendChild(svg('line', { x1: pad, y1: Y(0), x2: W - 8, y2: Y(0), stroke: '#888' })); g.appendChild(svg('line', { x1: pad, y1: 10, x2: pad, y2: H - pad, stroke: '#888' }))
        g.appendChild(svg('polygon', { points: [X(0) + ',' + Y(0), X(0) + ',' + Y(st.u), X(st.t) + ',' + Y(v), X(st.t) + ',' + Y(0)].join(' '), fill: '#ffb26b55', stroke: 'none' })); g.appendChild(svg('polyline', { points: X(0) + ',' + Y(st.u) + ' ' + X(st.t) + ',' + Y(v), fill: 'none', stroke: '#d9622a', 'stroke-width': 3 }))
        g.appendChild(svg('text', { x: W / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'currentColor' }, 'time (s)')); g.appendChild(svg('text', { x: 12, y: 16, 'font-size': 12, fill: 'currentColor' }, 'speed (m/s)')); g.appendChild(svg('text', { x: X(st.t) - 4, y: Y(v) - 6, 'text-anchor': 'end', 'font-size': 12, fill: 'currentColor' }, 'v = ' + v))
        holder.appendChild(g)
        out.appendChild(h('div', { class: 'sn-grid' }, stat(v + ' m/s', 'Final speed v = u + at', st.u + ' + (' + st.a + ' × ' + st.t + ')'), stat(s + ' m', 'Displacement s = ut + ½at²', 'the shaded area under the line')))
        if (v < 0) out.appendChild(note('v is negative: the object is now moving in the opposite direction.'))
      }
      draw(); box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) } },
    press: { title: 'Pressure explorer', desc: 'See how force and area change pressure (P = F ÷ A).', run(box, done) {
      const st = { f: 100, a: 2 }, out = h('div', { 'aria-live': 'polite' })
      const slider = (k, label, min, max, step, unit) => { const val = h('strong', null, st[k] + ' ' + unit); return h('div', null, h('label', { class: 'sn-lbl', for: 'pr_' + k }, label + ': ', val), h('input', { type: 'range', id: 'pr_' + k, min, max, step, value: st[k], oninput: e => { st[k] = Number(e.target.value); val.textContent = st[k] + ' ' + unit; draw() } })) }
      box.appendChild(h('div', { class: 'sn-warn' }, 'Simplified model: the force pushes evenly and straight onto the area.')); box.appendChild(h('div', { class: 'sn-form' }, slider('f', 'Force F', 10, 500, 10, 'N'), slider('a', 'Area A', 0.1, 5, 0.1, 'm²'))); box.appendChild(out)
      function draw() { clear(out); const p = Math.round(st.f / st.a * 100) / 100; out.appendChild(h('div', { class: 'sn-grid' }, stat(p + ' Pa', 'Pressure P = F ÷ A', st.f + ' ÷ ' + st.a))); out.appendChild(bar(Math.min(100, p / 5000 * 100))); out.appendChild(note('Same force on a smaller area gives more pressure. That is why a sharp knife cuts better than a blunt one.')) }
      draw(); box.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) } }
  }

  /* ===================== CHEMISTRY ===================== */
  const EQS = ['H2 + O2 -> H2O', 'Mg + O2 -> MgO', 'N2 + H2 -> NH3', 'Al + O2 -> Al2O3', 'CH4 + O2 -> CO2 + H2O', 'Na + H2O -> NaOH + H2', 'Zn + HCl -> ZnCl2 + H2', 'KClO3 -> KCl + O2', 'H2SO4 + NaOH -> Na2SO4 + H2O', 'Ca(OH)2 + HCl -> CaCl2 + H2O', 'Fe + O2 -> Fe2O3', 'Fe + H2O -> Fe3O4 + H2']
  const REACTIONS = [['2Mg + O2 → 2MgO', 'Combination', 'Two substances join to make one product.'], ['N2 + 3H2 → 2NH3', 'Combination', 'Two substances join to make one product.'], ['2KClO3 → 2KCl + 3O2', 'Decomposition', 'One substance breaks into simpler substances.'], ['CaCO3 → CaO + CO2', 'Decomposition', 'One substance breaks into simpler substances.'], ['Zn + 2HCl → ZnCl2 + H2', 'Displacement', 'A more reactive element (zinc) takes the place of hydrogen.'], ['Fe + CuSO4 → FeSO4 + Cu', 'Displacement', 'Iron is more reactive than copper, so it takes copper\'s place.'], ['NaCl + AgNO3 → NaNO3 + AgCl', 'Double decomposition', 'The two compounds swap partners.'], ['H2SO4 + 2NaOH → Na2SO4 + 2H2O', 'Double decomposition', 'An acid and a base swap partners (this is also neutralisation).']]
  const chemActs = {
    balance: { title: 'Balance the equation', desc: 'Choose the numbers (coefficients) that balance the equation.', run(box, done) {
      let order = shuffle(EQS), i = 0, score = 0, played = 0; const area = h('div'); box.appendChild(area)
      const next = () => {
        clear(area); const str = order[i % order.length], eq = L.parseEquation(str), species = eq.left.concat(eq.right), best = L.balance(eq); let firstTry = true, hints = 0
        area.appendChild(note('Equation ' + (played + 1) + '. Atoms are never created or destroyed, so every element must have the same number on both sides. Change the numbers in front of the formulas, never the small numbers inside them.'))
        const ins = species.map((f, k) => h('input', { type: 'number', min: 1, max: 20, value: 1, class: 'sn-in sn-coef', 'aria-label': 'Number in front of ' + f })), row = h('div', { class: 'sn-eq' })
        species.forEach((f, k) => { if (k) row.appendChild(document.createTextNode(k === eq.left.length ? ' →' : ' +')); row.appendChild(ins[k]); row.appendChild(h('span', null, sub(f))) }); area.appendChild(row)
        const out = h('div', { 'aria-live': 'polite' }), table = () => { const co = ins.map(x => Math.max(1, Math.round(Number(x.value) || 1))); return { co, counts: L.atomCounts(eq, co) } }
        const chk = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => {
          const { co, counts } = table(); clear(out); out.appendChild(h('div', { class: 'sn-scroll' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Atom'), h('th', null, 'Left side'), h('th', null, 'Right side'), h('th', null, ''))), h('tbody', null, counts.map(c => h('tr', null, h('td', null, c.el), h('td', null, String(c.left)), h('td', null, String(c.right)), h('td', null, c.ok ? '✓' : '✗')))))))
          if (counts.every(c => c.ok)) { const g = co.reduce((a, b) => L.gcd(a, b), 0); const simplest = g === 1; out.appendChild(fb(simplest, simplest ? 'Balanced! These are the simplest numbers.' : 'Balanced, but you can divide every number by ' + g + ' to get the simplest whole numbers.', !simplest)); if (simplest) { played++; if (firstTry && !hints) score++; chk.disabled = true; out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { i++; next() } }, 'Next equation'), h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: end }, 'Finish'))) } }
          else { firstTry = false; out.appendChild(fb(false, 'Not balanced yet. Look at the ✗ rows: those atoms differ on the two sides.')) } } }, 'Check')
        area.appendChild(h('div', { class: 'action-row' }, chk, h('button', { class: 'btn btn-light btn-sm', type: 'button', onclick: () => { hints++; const { counts } = table(), bad = counts.find(c => !c.ok); clear(out); out.appendChild(fb(true, bad ? 'Hint: start with ' + bad.el + '. It has ' + bad.left + ' on the left and ' + bad.right + ' on the right.' : 'It already looks balanced. Press Check.', true)) } }, 'Hint'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { hints++; clear(out); out.appendChild(fb(true, 'Answer: ' + species.map((f, k) => (k === eq.left.length ? '→ ' : k ? '+ ' : '') + (best[k] > 1 ? best[k] : '') + sub(f)).join(' ').replace('+ →', '→'), true)) } }, 'Show answer')))
        area.appendChild(out)
      }
      const end = () => { clear(area); if (!played) { done(); return } area.appendChild(scoreLine(score, played)); area.appendChild(note('Score = equations balanced on the first try without a hint.')); finish('chem', 'Chemical equations', score, played, 'balance'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))) }
      next() } },
    valency: { title: 'Formulas and valency', desc: 'Write the formula of a compound using valencies.', run(box, done) {
      box.appendChild(h('details', { class: 'sn-how' }, h('summary', null, 'Valency table'), h('div', { class: 'sn-scroll' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Symbol'), h('th', null, 'Valency'))), h('tbody', null, L.IONS.map(x => h('tr', null, h('td', null, x.name), h('td', null, sub(x.sym)), h('td', null, String(x.val))))))), note('Rule: swap the valencies and use them as small numbers (then divide by a common factor). Put polyatomic groups like OH or SO₄ in brackets if you need more than one.')))
      const cats = L.IONS.filter(x => x.cat), ans = L.IONS.filter(x => !x.cat); const pairs = []; cats.forEach(a => ans.forEach(b => { if (!((a.sym === 'H' && (b.sym === 'OH' || b.sym === 'O')) || (a.sym === b.sym))) pairs.push([a, b]) }))
      let n = 0, c = 0; const qs = shuffle(pairs).slice(0, 6), area = h('div'); box.appendChild(area)
      const next = () => {
        clear(area); if (n >= qs.length) { area.appendChild(scoreLine(c, qs.length)); finish('chem', 'Valency and formulae', c, qs.length, 'valency'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const [a, b] = qs[n], exp = L.formulaFromIons(a, b), inp = h('input', { type: 'text', class: 'sn-in', 'aria-label': 'Formula', placeholder: 'For example Ca(OH)2', autocomplete: 'off', autocapitalize: 'off' }), out = h('div', { 'aria-live': 'polite' })
        area.appendChild(note('Question ' + (n + 1) + ' of ' + qs.length)); area.appendChild(h('p', { class: 'qt' }, 'Write the formula of ' + a.name + ' ' + b.name + '. (Type 2 as a normal number, like H2O.)')); area.appendChild(inp)
        const chk = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { if (!inp.value.trim()) { showToast('Type the formula first.'); return } const r = L.checkFormula(inp.value, exp); clear(out); if (r.status === 'correct') c++
          out.appendChild(fb(r.status === 'correct', r.reason)); out.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Working: '), a.sym + ' has valency ' + a.val + ' and ' + b.sym + ' has valency ' + b.val + '. Swap them, then simplify: ' + sub(exp))); chk.disabled = true; inp.disabled = true; out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n + 1 < qs.length ? 'Next' : 'See my score'))) } }, 'Check'); area.appendChild(h('div', { class: 'action-row' }, chk)); area.appendChild(out); inp.focus()
      }; next() } },
    types: { title: 'Types of reactions', desc: 'Decide if each reaction is combination, decomposition, displacement or double decomposition.', run(box, done) {
      const TY = ['Combination', 'Decomposition', 'Displacement', 'Double decomposition']; let n = 0, c = 0; const qs = shuffle(REACTIONS), area = h('div'); box.appendChild(area)
      const next = () => {
        clear(area); if (n >= qs.length) { area.appendChild(scoreLine(c, qs.length)); finish('chem', 'Types of chemical reactions', c, qs.length, 'types'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const [eq, type, why] = qs[n], out = h('div', { 'aria-live': 'polite' }); let locked = false; area.appendChild(note('Reaction ' + (n + 1) + ' of ' + qs.length)); area.appendChild(h('p', { class: 'qt', style: 'font-size:18px' }, eq))
        TY.forEach(t => { const b = h('button', { type: 'button', class: 'sn-opt', style: 'width:100%;text-align:left', onclick: () => { if (locked) return; locked = true; const ok = t === type; if (ok) c++; b.classList.add(ok ? 'ok' : 'no'); out.appendChild(fb(ok, (ok ? 'Correct! ' : 'It is ' + type + '. ') + why)); out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n + 1 < qs.length ? 'Next' : 'See my score'))) } }, t); area.appendChild(b) }); area.appendChild(out)
      }; next() } }
  }

  /* ===================== GEOGRAPHY ===================== */
  const LINES = [['Equator', 0, 'h'], ['Tropic of Cancer', 23.5, 'h'], ['Tropic of Capricorn', -23.5, 'h'], ['Arctic Circle', 66.5, 'h'], ['Antarctic Circle', -66.5, 'h'], ['Prime Meridian', 0, 'v']]
  const CURRENTS = [['Gulf Stream', 'Warm', 'Atlantic'], ['North Atlantic Drift', 'Warm', 'Atlantic'], ['Brazil Current', 'Warm', 'Atlantic'], ['Labrador Current', 'Cold', 'Atlantic'], ['Canary Current', 'Cold', 'Atlantic'], ['Benguela Current', 'Cold', 'Atlantic'], ['Kuroshio (Japan) Current', 'Warm', 'Pacific'], ['Oyashio Current', 'Cold', 'Pacific'], ['California Current', 'Cold', 'Pacific'], ['Peru (Humboldt) Current', 'Cold', 'Pacific'], ['Agulhas Current', 'Warm', 'Indian'], ['Mozambique Current', 'Warm', 'Indian'], ['West Australian Current', 'Cold', 'Indian']]
  const geoActs = {
    lines: { title: 'Find the line', desc: 'Click or tab to the correct line of latitude or longitude on a simple grid.', run(box, done) {
      const qs = shuffle(LINES); let n = 0, c = 0; const area = h('div'); box.appendChild(area)
      const next = () => {
        clear(area); if (n >= qs.length) { area.appendChild(scoreLine(c, qs.length)); finish('geog', 'Latitudes and longitudes', c, qs.length, 'lines'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const [name] = qs[n], out = h('div', { 'aria-live': 'polite' }); let locked = false; area.appendChild(note('Question ' + (n + 1) + ' of ' + qs.length)); area.appendChild(h('p', { class: 'qt' }, 'Choose the line that is the ' + name + '.'))
        const W = 380, H = 200, Y = lat => H / 2 - lat / 90 * (H / 2 - 12), X = lon => W / 2 + lon / 180 * (W / 2 - 12), g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sn-svg', role: 'group', 'aria-label': 'Grid of the Earth with six lines to choose from, labelled A to F' })
        g.appendChild(svg('rect', { x: 12, y: 12, width: W - 24, height: H - 24, fill: '#eaf4ff', stroke: '#888' })); const letters = 'ABCDEF'
        const lineEls = shuffle(LINES).map((ln, k) => { const [nm, v, dir] = ln, hit = () => { if (locked) return; locked = true; const ok = nm === name; if (ok) c++; out.appendChild(fb(ok, ok ? 'Correct! ' + nm + '.' : 'That line is the ' + nm + '. The ' + name + ' is the one marked in green.')); lineEls.forEach(x => { if (x.nm === name) x.line.setAttribute('stroke', '#16856b') }); out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n + 1 < qs.length ? 'Next' : 'See my score'))) }
          const x1 = dir === 'h' ? 12 : X(v), y1 = dir === 'h' ? Y(v) : 12, x2 = dir === 'h' ? W - 12 : X(v), y2 = dir === 'h' ? Y(v) : H - 12
          const line = svg('line', { x1, y1, x2, y2, stroke: '#d9622a', 'stroke-width': 2.5, 'stroke-dasharray': nm === 'Equator' || nm === 'Prime Meridian' ? '' : '6 4' }), wide = svg('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 18, style: 'cursor:pointer' })
          const grp = svg('g', { tabindex: 0, role: 'button', 'aria-label': 'Line ' + letters[k] }); grp.appendChild(line); grp.appendChild(wide); grp.appendChild(svg('text', { x: dir === 'h' ? W - 20 : x1 + 6, y: dir === 'h' ? y1 - 4 : 26, 'font-size': 13, 'font-weight': 700, fill: '#111' }, letters[k])); grp.addEventListener('click', hit); grp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit() } }); g.appendChild(grp); return { nm, line }
        }); area.appendChild(g); area.appendChild(note('Simple grid for practice: it is not a map of the continents. Each line has a letter A to F; choose the one you think is right.'))
        area.appendChild(h('div', { class: 'action-row' }, letters.split('').map((l, k) => h('button', { class: 'btn btn-light btn-sm', type: 'button', 'aria-label': 'Choose line ' + l, onclick: () => { const t = g.querySelectorAll('g')[k]; t.dispatchEvent(new Event('click')) } }, 'Line ' + l)))); area.appendChild(out)
      }; next() } },
    time: { title: 'Longitude and time', desc: 'The Earth turns 15° in 1 hour (1° = 4 minutes). Work out time differences.', run(box, done) {
      let n = 0, c = 0; const seed = Math.floor(Math.random() * 1e6), area = h('div'); box.appendChild(area); box.appendChild(note('East of Greenwich (E) is ahead in time; west (W) is behind.'))
      const next = () => {
        clear(area); if (n >= 5) { area.appendChild(scoreLine(c, 5)); finish('geog', 'Longitude and time', c, 5, 'time'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const p = L.longitudeProblem(seed + n * 104729), inp = h('input', { type: 'number', class: 'sn-in', 'aria-label': 'Minutes', min: 0, inputmode: 'decimal' }), out = h('div', { 'aria-live': 'polite' }); area.appendChild(note('Problem ' + (n + 1) + ' of 5')); area.appendChild(h('p', { class: 'qt' }, p.text)); area.appendChild(inp)
        const chk = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { if (inp.value === '') { showToast('Type your answer first.'); return } const ok = Math.abs(Number(inp.value) - p.answer) < 0.5; if (ok) c++; clear(out); out.appendChild(fb(ok, ok ? 'Correct!' : 'Not quite. The answer is ' + p.answer + ' minutes.')); out.appendChild(h('div', { class: 'sn-fb' }, h('strong', null, 'Steps'), h('ol', null, p.steps.map(x => h('li', null, x))))); chk.disabled = true; inp.disabled = true; out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n < 4 ? 'Next' : 'See my score'))) } }, 'Check'); area.appendChild(h('div', { class: 'action-row' }, chk)); area.appendChild(out); inp.focus()
      }; next() } },
    currents: { title: 'Ocean currents', desc: 'Learn warm and cold currents and the ocean they flow in, then take the quiz.', run(box, done) {
      box.appendChild(h('div', { class: 'sn-scroll' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Current'), h('th', null, 'Warm or cold'), h('th', null, 'Ocean'))), h('tbody', null, CURRENTS.map(r => h('tr', null, h('td', null, r[0]), h('td', null, h('span', { class: 'sn-badge ' + (r[1] === 'Warm' ? 'bad' : 'ok') }, r[1])), h('td', null, r[2]))))))); box.appendChild(note('This is a list, not a map, because StudyNest has no checked map picture to show. Use your atlas to see where each current flows. Check your textbook for the exact currents in your syllabus.'))
      const qs = shuffle(CURRENTS).slice(0, 8); let n = 0, c = 0; const area = h('div'); box.appendChild(h('h3', { class: 'sn-sec' }, 'Quiz')); box.appendChild(area)
      const next = () => {
        clear(area); if (n >= qs.length) { area.appendChild(scoreLine(c, qs.length)); area.appendChild(note('A question counts when both answers are right.')); finish('geog', 'Ocean currents', c, qs.length, 'currents'); area.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-light', type: 'button', onclick: done }, 'Done'))); return }
        const [nm, temp, ocean] = qs[n], t = h('select', { id: 'ct', class: 'sn-in' }, ['Choose…', 'Warm', 'Cold'].map(x => h('option', { value: x === 'Choose…' ? '' : x }, x))), o = h('select', { id: 'co', class: 'sn-in' }, ['Choose…', 'Atlantic', 'Pacific', 'Indian'].map(x => h('option', { value: x === 'Choose…' ? '' : x }, x))), out = h('div', { 'aria-live': 'polite' })
        area.appendChild(note('Question ' + (n + 1) + ' of ' + qs.length)); area.appendChild(h('p', { class: 'qt' }, nm)); area.appendChild(h('div', { class: 'sn-form' }, h('div', null, h('label', { class: 'sn-lbl', for: 'ct' }, 'Warm or cold?'), t), h('div', null, h('label', { class: 'sn-lbl', for: 'co' }, 'Which ocean?'), o)))
        const chk = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { if (!t.value || !o.value) { showToast('Choose both answers.'); return } const ok = t.value === temp && o.value === ocean; if (ok) c++; out.appendChild(fb(ok, ok ? 'Correct!' : nm + ' is a ' + temp.toLowerCase() + ' current in the ' + ocean + ' Ocean.')); chk.disabled = true; out.appendChild(h('div', { class: 'action-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { n++; next() } }, n + 1 < qs.length ? 'Next' : 'See my score'))) } }, 'Check'); area.appendChild(h('div', { class: 'action-row' }, chk)); area.appendChild(out)
      }; next() } }
  }

  const GROUPS = [['bio', '🌿 Biology', bioActs], ['physics', '⚡ Physics', phyActs], ['chem', '⚗️ Chemistry', chemActs], ['geog', '🌍 Geography', geoActs]]
  function render(box, arg) {
    let group = (arg && arg.group) || 'bio'
    const menu = () => {
      clear(box); box.appendChild(h('p', { class: 'sn-sub' }, 'Practise with activities that check your answers. Results are saved and show up on your Home page.'))
      box.appendChild(h('div', { class: 'sn-tabs2', role: 'tablist' }, GROUPS.map(([id, label]) => h('button', { class: 'btn ' + (id === group ? 'btn-primary' : 'btn-light') + ' btn-sm', type: 'button', role: 'tab', 'aria-selected': id === group ? 'true' : 'false', onclick: () => { group = id; menu() } }, label))))
      const acts = GROUPS.find(g => g[0] === group)[2], grid = h('div', { class: 'sn-grid' })
      Object.keys(acts).forEach(k => grid.appendChild(h('button', { class: 'sn-card', type: 'button', style: 'text-align:left;cursor:pointer;color:inherit', onclick: () => open(acts[k]) }, h('h3', null, acts[k].title), h('p', null, acts[k].desc)))); box.appendChild(grid)
    }
    const open = act => { clear(box); box.appendChild(back(menu)); box.appendChild(h('h3', { class: 'sn-sec' }, act.title)); const body = h('div'); box.appendChild(body); act.run(body, menu) }
    menu()
  }
  SN.views.labs = { title: 'Labs', render, noAuto: true }
})()
