/* Skillforge LMS — Question bank list: filters, table and preview.
 * Filters: question type, difficulty, category, course, module, status, author, usage (+ search and sort).
 * "Used in" is worked out from quizzes: question → quizzes that include it → courses and LCMS assessment
 * modules that use those quizzes.
 * Adds SkillforgeApp.prototype.qbankVals(), merged into renderVals() after adminVals() so it replaces the old list.
 */
const QTYPE = {
  'Multiple choice':     { short:'MCQ',          bg:'#EDE9FE', fg:'#5B21B6', glyph:'◉' },
  'Multiple select':     { short:'Multi-select', bg:'#E0E7FF', fg:'#3730A3', glyph:'☑' },
  'True / False':        { short:'True / False', bg:'#CCFBF1', fg:'#115E59', glyph:'⇄' },
  'Image options':       { short:'Image choice', bg:'#FEF3C7', fg:'#92400E', glyph:'▣' },
  'Match the following': { short:'Match',        bg:'#FCE7F3', fg:'#9D174D', glyph:'⇆' },
  'Likert scale':        { short:'Likert',       bg:'#DBEAFE', fg:'#1E40AF', glyph:'≋' },
  'Fill in the blank':   { short:'Fill blank',   bg:'#DCFCE7', fg:'#166534', glyph:'_' },
  'Ordering':            { short:'Ordering',     bg:'#FFEDD5', fg:'#9A3412', glyph:'↕' },
  'Written answer':      { short:'Written',      bg:'#EAF1F6', fg:'#334E68', glyph:'✎' },
};
const QDIFF = { Easy:['#DCFCE7', '#166534', '#22C55E'], Medium:['#FEF3C7', '#92400E', '#0066A1'], Hard:['#FDECEC', '#A63232', '#D64545'] };

SkillforgeApp.prototype.qbankVals = function (s, role) {
  if (this._scrV !== 'qbank') return { qPrevOpen:false };
  const W = '#FFFFFF', INK = '#16324F', F = s.qf, me = role.name;
  const setF = patch => this.setState(st => ({ qf: { ...st.qf, ...patch } }));
  // usage map
  const quizzesOf = id => s.quizzes.filter(z => z.ids.includes(id));
  // quiz → courses index, built once per render instead of scanning every course for every question.
  const QC = new Map(); s.adminCourses.forEach(c => c.items.forEach(i => { if (i.kind === 'quiz') { if (!QC.has(i.quizId)) QC.set(i.quizId, []); const l = QC.get(i.quizId); if (l[l.length - 1] !== c) l.push(c); } }));
  const coursesOfQuiz = z => QC.get(z.id) || [];
  const modsOfQuiz = z => s.lcms.filter(m => m.type === 'Assessment' && m.quizId === z.id);
  const U = {}; s.qs.forEach(q => { const zs = quizzesOf(q.id), cs = [], ms = []; zs.forEach(z => { coursesOfQuiz(z).forEach(c => { if (!cs.includes(c)) cs.push(c); }); modsOfQuiz(z).forEach(m => { if (!ms.includes(m)) ms.push(m); }); }); U[q.id] = { zs, cs, ms }; });
  const uq = (F.q || '').trim().toLowerCase();
  const match = (q, skip) => { const u = U[q.id];
    return (skip === 'type' || F.type === 'All' || q.type === F.type) && (skip === 'diff' || F.diff === 'All' || q.diff === F.diff) && (skip === 'cat' || F.cat === 'All' || q.topic === F.cat)
      && (skip === 'course' || F.course === 'All' || u.cs.some(c => c.id === F.course)) && (skip === 'module' || F.module === 'All' || u.ms.some(m => m.id === F.module))
      && (skip === 'status' || F.status === 'All' || (F.status === 'Archived') === !!q.archived) && (skip === 'author' || F.author === 'All' || q.author === F.author)
      && (skip === 'usage' || F.usage === 'All' || (F.usage === 'course' ? u.cs.length > 0 : F.usage === 'quiz' ? u.zs.length > 0 && !u.cs.length : F.usage === 'multi' ? u.cs.length >= 2 : !u.zs.length))
      && (skip === 'skill' || F.skill === 'All' || q.skill === F.skill) && (skip === 'bloom' || F.bloom === 'All' || q.bloom === F.bloom) && (skip === 'tag' || F.tag === 'All' || (q.tags || []).includes(F.tag))
      && (!uq || (q.text + ' ' + q.topic + ' ' + q.type + ' ' + (q.author || '') + ' ' + (q.skill || '') + ' ' + (q.bloom || '') + ' ' + (q.ref || '') + ' ' + (q.tags || []).join(' ')).toLowerCase().includes(uq)); };
  // Option counts: one pass per filter over the questions that match every other filter (a tally, not a re-scan per option).
  const valsOf = (key, q) => { const u = U[q.id]; switch (key) { case 'type': return [q.type]; case 'diff': return [q.diff]; case 'cat': return [q.topic]; case 'course': return u.cs.map(c => c.id); case 'module': return u.ms.map(m => m.id);
    case 'skill': return [q.skill]; case 'bloom': return [q.bloom]; case 'tag': return q.tags || []; case 'status': return [q.archived ? 'Archived' : 'Active']; case 'author': return [q.author];
    case 'usage': return [u.cs.length ? 'course' : null, u.cs.length >= 2 ? 'multi' : null, u.zs.length && !u.cs.length ? 'quiz' : null, !u.zs.length ? 'unused' : null].filter(Boolean); } return []; };
  const tallies = {};
  const count = (key, val) => { if (!tallies[key]) { const t = new Map(); s.qs.forEach(q => { if (match(q, key)) valsOf(key, q).forEach(v => t.set(v, (t.get(v) || 0) + 1)); }); tallies[key] = t; } return tallies[key].get(val) || 0; };
  const uniq = a => Array.from(new Set(a)).filter(Boolean).sort();
  const opt = (key, all, vals, lab) => [{ v:'All', l: all }].concat(vals.map(v => ({ v, l: (lab ? lab(v) : v) + ' (' + count(key, v) + ')' })));
  const usedCourses = uniq(s.qs.flatMap(q => U[q.id].cs.map(c => c.id))), usedMods = uniq(s.qs.flatMap(q => U[q.id].ms.map(m => m.id)));
  const cById = id => Progress.courseOf(s, id), mById = id => s.lcms.find(m => m.id === id);
  const USAGE = { course:'Used in a course', multi:'Used in 2+ courses', quiz:'In a quiz, no course yet', unused:'Not used anywhere' };
  const FILTERS = [
    ['type', 'Question type', opt('type', 'All types', Object.keys(QTYPE).filter(t => s.qs.some(q => q.type === t)), t => QTYPE[t].short)],
    ['diff', 'Difficulty', opt('diff', 'All difficulties', ['Easy', 'Medium', 'Hard'])],
    ['cat', 'Category', opt('cat', 'All categories', uniq(s.qs.map(q => q.topic)))],
    ['course', 'Course', opt('course', 'All courses', usedCourses, id => cById(id).code + ' · ' + cById(id).title)],
    ['module', 'Module', opt('module', 'All modules', usedMods, id => mById(id).code + ' · ' + mById(id).title)],
    ['status', 'Status', opt('status', 'All statuses', ['Active', 'Archived'])],
    ['author', 'Author', opt('author', 'All authors', uniq(s.qs.map(q => q.author)))],
    ['usage', 'Usage', opt('usage', 'Any usage', Object.keys(USAGE), k => USAGE[k])],
    ['skill', 'Skill', opt('skill', 'All skills', uniq(s.qs.map(q => q.skill)))],
    ['bloom', 'Bloom level', opt('bloom', 'All levels', BLOOM.filter(b => s.qs.some(q => q.bloom === b)))],
    ['tag', 'Tag', opt('tag', 'All tags', uniq(s.qs.flatMap(q => q.tags || [])), t => '#' + t)],
  ];
  const labelOf = (k, v) => k === 'tag' ? '#' + v : k === 'type' ? QTYPE[v].short : k === 'course' ? (cById(v) || {}).code : k === 'module' ? (mById(v) || {}).code : k === 'usage' ? USAGE[v] : v;
  const active = FILTERS.filter(([k]) => F[k] !== 'All').map(([k, name]) => ({ label: name + ': ' + labelOf(k, F[k]), clear: () => setF({ [k]: 'All' }) }));
  const SORTS = { new:['Newest first', (a, b) => (b.created || '').localeCompare(a.created || '') || b.id - a.id], used:['Most used', (a, b) => U[b.id].cs.length - U[a.id].cs.length || U[b.id].zs.length - U[a.id].zs.length], az:['Question A–Z', (a, b) => a.text.localeCompare(b.text)], diff:['Difficulty', (a, b) => ['Easy', 'Medium', 'Hard'].indexOf(a.diff) - ['Easy', 'Medium', 'Hard'].indexOf(b.diff)] };
  const list = s.qs.filter(q => match(q)).sort(SORTS[F.sort][1]);
  const allOn = list.length > 0 && list.every(q => s.bankSel[q.id]);
  const usedText = u => u.cs.length ? u.cs.length + (u.cs.length === 1 ? ' course' : ' courses') : u.zs.length ? u.zs.length + (u.zs.length === 1 ? ' quiz' : ' quizzes') + ', no course' : 'Not used';
  const rows = list.map(q => { const T = QTYPE[q.type] || QTYPE['Multiple choice'], d = QDIFF[q.diff], u = U[q.id], on = !!s.bankSel[q.id];
    return { ref: q.ref || '', skill: q.skill || '', bloom: q.bloom || '', tags: (q.tags || []).map(t => ({ t: '#' + t, pick: () => setF({ tag: t }) })), id: q.id, text: q.text, cat: q.topic, author: q.author || '—', media: q.media ? { image:'Image', audio:'Audio', video:'Video' }[q.media.kind] : '', hasMedia: !!q.media,
      tShort: T.short, tBg: T.bg, tFg: T.fg, tGlyph: T.glyph, diff: q.diff, dBg: d[0], dFg: d[1], dDot: d[2],
      used: usedText(u), usedSub: u.cs.length ? u.cs.map(c => c.code).join(', ') : u.zs.map(z => z.name).join(', '), usedOn: u.cs.length > 0, usedMuted: !u.cs.length, usedTitle: u.cs.map(c => c.code + ' ' + c.title).concat(u.zs.map(z => 'Quiz: ' + z.name)).join('\n') || 'Not used in any quiz or course',
      st: q.archived ? 'Archived' : 'Active', stBg: q.archived ? '#EAF1F6' : '#DCFCE7', stFg: q.archived ? '#526B7A' : '#166534', op: q.archived ? 0.6 : 1,
      on, tick: on ? '✓' : '', boxBg: on ? '#7C5CFF' : W, boxBd: on ? '#7C5CFF' : '#BFCFDB', rowBg: on ? '#F4F1FF' : 'transparent',
      toggle: () => this.setState(st => ({ bankSel: { ...st.bankSel, [q.id]: !st.bankSel[q.id] } })), open: () => this.setState({ qPrev: q.id }), edit: () => this.setState({ qModal:true, qm:null, qEditId: q.id }),
      archLabel: q.archived ? 'Restore' : 'Archive', arch: () => { this.setState(st => ({ qs: st.qs.map(x => x.id === q.id ? { ...x, archived: !x.archived } : x) })); this.toastMsg(q.archived ? 'Question restored' : 'Question archived' + (u.zs.length ? '. It stays in ' + u.zs.length + (u.zs.length === 1 ? ' quiz' : ' quizzes') + ' but won’t be drawn in new attempts.' : '')); } }; });
  // preview
  const pq = s.qs.find(q => q.id === s.qPrev);
  let prev = { qPrevOpen:false };
  if (pq) {
    const T = QTYPE[pq.type], u = U[pq.id], d = QDIFF[pq.diff];
    const opts = pq.type === 'Match the following' ? pq.pairs.map(([a, b]) => ({ t: a + '  →  ' + b, ok:true }))
      : pq.type === 'Ordering' ? pq.items.map((t, i) => ({ t: (i + 1) + '. ' + t, ok:true }))
      : pq.type === 'Fill in the blank' ? (pq.accept || []).map(t => ({ t: 'Accepted: ' + t, ok:true }))
      : pq.type === 'Likert scale' ? Assessment.LIKERT.map(t => ({ t, ok:false }))
      : pq.type === 'Written answer' ? [{ t: 'Rated 0–' + pq.points + ' by a trainer' + (pq.guide ? '. Look for: ' + pq.guide : ''), ok:false }]
      : (pq.opts || []).map((o, i) => ({ t: typeof o === 'string' ? o : o.label, src: typeof o === 'string' ? '' : o.src, ok: pq.type === 'Multiple select' ? (pq.answers || []).includes(i) : i === pq.ans }));
    prev = { qPrevOpen: true, pv2: { text: pq.text, tShort: T.short, tBg: T.bg, tFg: T.fg, diff: pq.diff, dBg: d[0], dFg: d[1], why: pq.why || '', hasWhy: !!pq.why, media: pq.media || null,
        isImg: !!pq.media && pq.media.kind === 'image', isAud: !!pq.media && pq.media.kind === 'audio', isVid: !!pq.media && pq.media.kind === 'video',
        opts: opts.map((o, i) => ({ ...o, key: 'ABCDEFGH'[i] || '', hasSrc: !!o.src, bg: o.ok ? '#DCFCE7' : '#F4F8FC', fg: o.ok ? '#166534' : '#16324F', mark: o.ok ? '✓' : '' })),
        meta: [['Reference', pq.ref || '—'], ['Category', pq.topic], ['Skill', pq.skill || '—'], ['Bloom level', pq.bloom || '—'], ['Tags', (pq.tags || []).map(t => '#' + t).join(' ') || '—'], ['Author', pq.author || '—'], ['Status', pq.archived ? 'Archived' : 'Active'], ['Created', pq.created ? shortDate(pq.created) : '—']].map(([l, v]) => ({ l, v })),
        courses: u.cs.map(c => ({ t: c.code + ' · ' + c.title })), quizzes: u.zs.map(z => ({ t: z.name })), mods: u.ms.map(m => ({ t: m.code + ' · ' + m.title })), noUse: !u.zs.length,
        archLabel: pq.archived ? 'Restore' : 'Archive' },
      closeQPrev: () => this.setState({ qPrev:null }),
      qPrevEdit: () => this.setState({ qPrev:null, qModal:true, qm:null, qEditId: pq.id }),
      qPrevArch: () => { const q = pq; this.setState(st => ({ qs: st.qs.map(x => x.id === q.id ? { ...x, archived: !x.archived } : x) })); this.toastMsg(q.archived ? 'Question restored' : 'Question archived'); },
      qPrevDup: () => { const id = Math.max(...s.qs.map(q => q.id)) + 1; this.setState(st => ({ qs: [{ ...pq, id, text: pq.text + ' (copy)', used:0, archived:false, author: me, created: TODAY_KEY }].concat(st.qs), qPrev: id })); this.toastMsg('Question duplicated. You’re now viewing the copy.'); } };
  }
  const nAct = s.qs.filter(q => !q.archived).length;
  const QPG = Pager(this, s, 'qbank', rows, 50);
  return {
    ...prev, qbRows: QPG.rows, qbPager: QPG.pager, qbEmpty: !rows.length, qbFilters: FILTERS.map(([k, name, opts]) => ({ name, opts, val: F[k], on: F[k] !== 'All', set: e => setF({ [k]: e.target.value }) })),
    qbActive: active, qbHasActive: active.length > 0 || !!uq, qbClear: () => setF({ type:'All', diff:'All', cat:'All', course:'All', module:'All', status:'All', author:'All', usage:'All', skill:'All', bloom:'All', tag:'All', q:'' }),
    qbQ: F.q || '', setQbQ: e => setF({ q: e.target.value }),
    qbSortOpts: Object.entries(SORTS).map(([v, [l]]) => ({ v, l })), qbSort: F.sort, setQbSort: e => setF({ sort: e.target.value }),
    qbCount: 'Showing ' + rows.length + ' of ' + s.qs.length + ' questions',
    qbStats: [['Total', s.qs.length, '#16324F', () => setF({ status:'All', usage:'All' })], ['Active', nAct, '#166534', () => setF({ status:'Active' })], ['Archived', s.qs.length - nAct, '#526B7A', () => setF({ status:'Archived' })], ['Not used anywhere', s.qs.filter(q => !U[q.id].zs.length).length, '#A63232', () => setF({ usage:'unused', status:'All' })]].map(([l, v, c, pick]) => ({ l, v, c, pick })),
    qbAll: { tick: allOn ? '✓' : '', bg: allOn ? '#7C5CFF' : W, bd: allOn ? '#7C5CFF' : '#BFCFDB' },
    qbToggleAll: () => { const sel = { ...s.bankSel }; list.forEach(q => { sel[q.id] = !allOn; }); this.setState({ bankSel: sel }); },
  };
};
