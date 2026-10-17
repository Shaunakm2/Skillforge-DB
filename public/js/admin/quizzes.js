/* Skillforge LMS — quiz list and quiz builder.
 * v41.22: questions are picked from the bank by Metadata (the label that groups them, e.g. "Post Assessment Telephone Etiquette 2026"),
 * the assessment keeps only the question ids (so a fix in the bank reaches every assessment), and the type is explicit:
 *   Static   every learner sees all selected questions (20 of 20)
 *   Dynamic  every learner gets a random N of the selected pool, a new set on each attempt
 * "Shuffle question order" and "Shuffle answer options" apply to both. */
SkillforgeApp.prototype.amQuizzes = function (c) {
  const { MEDIA_LABEL, defaultDraft, role, s, segs, tg } = c;
  // quiz builder
  const d = s.quizDraft;
  const setD = patch => this.setState(st => ({ quizDraft: { ...st.quizDraft, ...patch } }));
  const marksOf = q => Assessment.weight(q), r2 = n => +(+n).toFixed(2), markTxt = n => r2(n) + (r2(n) === 1 ? ' mark' : ' marks');
  const draftQs = d.ids.map((id, i) => { const q = s.qs.find(x => x.id === id); return { n:i + 1, text:q.text, topic:(q.meta || 'No metadata') + ' · ' + markTxt(marksOf(q)), type:q.type + (q.media ? ' · ' + MEDIA_LABEL[q.media.kind] : ''), diff:q.diff, diffBg:DIFF[q.diff][0], diffFg:DIFF[q.diff][1], up: () => this.moveQ(i, -1), down: () => this.moveQ(i, 1), remove: () => setD({ ids: d.ids.filter(x => x !== id) }) }; });
  const saveQuiz = () => {
    if (!d.name.trim()) return this.toastMsg('Give the quiz a name first');
    if (!d.ids.length) return this.toastMsg('Add at least one question');
    const nDraw = parseInt(d.drawCount, 10);
    if (d.dynamic && !(nDraw >= 1 && nDraw <= d.ids.length)) return this.toastMsg('Set how many questions to show: 1 to ' + d.ids.length);
    const id = d.editId || Math.max(0, ...s.quizzes.map(z => z.id)) + 1;
    const prev = s.quizzes.find(x => x.id === id) || {};
    const z = { id, name:d.name.trim(), ids:d.ids, pass:d.pass, time:d.time, attempts:d.attempts, shuffle:d.shuffle, shuffleOpts:d.shuffleOpts, dynamic:d.dynamic, drawCount: d.dynamic ? nDraw : (prev.drawCount || d.ids.length), course: prev.course || '' };
    const quizzes = d.editId ? s.quizzes.map(x => x.id === id ? z : x) : s.quizzes.concat([z]);
    const used = {}; quizzes.forEach(x => x.ids.forEach(q => { used[q] = (used[q] || 0) + 1; }));
    this.setState({ quizzes, qs: s.qs.map(q => ({ ...q, used: used[q.id] || 0 })) });
    if (s.qFromLcms && !d.editId) {
      // Built from LCMS: the new assessment becomes a module straight away.
      const mid = 'm' + Date.now(), n = Math.max(0, ...s.lcms.map(m => parseInt(m.code.slice(4), 10) || 0)) + 1;
      this.setState({ qFromLcms:false, lcms: [{ id:mid, code:'MOD-' + String(n).padStart(3, '0'), type:'Assessment', title:z.name, desc:'', mins: Math.max(5, Math.round(z.ids.length * 1.5)), quizId:id, by: role.name, updated: TODAY_KEY }].concat(s.lcms) });
      this.go('lcms', { adminView:true }); this.toastMsg('Assessment module “' + z.name + '” added to LCMS');
      return;
    }
    this.go('quizzes', { adminView:true }); this.toastMsg('Quiz saved · ' + (z.dynamic ? z.drawCount + ' of ' + z.ids.length + ' questions per attempt' : z.ids.length + ' questions'));
  };
  const quizCards = s.quizzes.map((z, i) => { const c = VIVIDS[(i * 3 + 1) % 7]; return { name:z.name, count:z.ids.length, countLabel: z.dynamic ? 'Dynamic · ' + Math.min(z.drawCount, z.ids.length) + ' of ' + z.ids.length + ' questions' + (z.shuffleOpts ? ' · options shuffled' : '') : 'Static · ' + z.ids.length + (z.ids.length === 1 ? ' question' : ' questions') + (z.shuffle ? ' · shuffled' : '') + (z.shuffleOpts ? ' · options shuffled' : ''), pass:'Pass ' + z.pass + '%', time: z.time ? z.time + ' min' : 'No time limit', attempts: z.attempts === 'Unlimited' ? 'Unlimited attempts' : z.attempts + (z.attempts === '1' ? ' attempt' : ' attempts'), course: z.course || 'Not attached yet', color:c, colorFg:VIVID_FG[c], edit: () => { this.setState({ quizDraft: { ...defaultDraft, ...z, editId:z.id }, qFromLcms:false }); this.go('quizBuild', { adminView:true }); } }; });
  return {
    quizCards,
    newQuiz: () => { this.setState({ quizDraft: defaultDraft, qFromLcms:false }); this.go('quizBuild', { adminView:true }); },
    qd: d,
    setQdName: e => setD({ name: e.target.value }),
    quizBuildLabel: d.editId ? 'EDIT QUIZ' : s.qFromLcms ? 'NEW ASSESSMENT · SAVES TO LCMS' : 'NEW QUIZ',
    qdCountLabel: d.ids.length + (d.ids.length === 1 ? ' question' : ' questions') + ' · ' + markTxt(d.ids.reduce((t, id) => { const q = s.qs.find(x => x.id === id); return t + (q ? marksOf(q) : 0); }, 0)) + (d.dynamic && d.ids.length ? ' in the pool · learners see ' + (parseInt(d.drawCount, 10) > 0 ? Math.min(parseInt(d.drawCount, 10), d.ids.length) : '—') : ''),
    qdEmpty: d.ids.length === 0,
    draftQs,
    saveQuiz,
    addFromBank: () => { this.setState(st => ({ bankReturn:true, bankSel: Object.fromEntries(st.quizDraft.ids.map(id => [id, true])) })); this.go('qbank', { adminView:true }); },
    passOpts: segs(d.pass, [60, 70, 80, 90], v => setD({ pass:v }), v => v + '%'),
    timeOpts: segs(d.time, [0, 10, 15, 30], v => setD({ time:v }), v => v ? v + ' min' : 'None'),
    attemptOpts: segs(d.attempts, ['1', '2', '3', 'Unlimited'], v => setD({ attempts:v })),
    // Add questions by metadata: every active question that carries the label, added in one click
    qdMetaQ: d.metaQ || '', setQdMetaQ: e => setD({ metaQ: e.target.value }),
    qdMetaGroups: (() => { const groups = new Map(); s.qs.forEach(q => { const m = (q.meta || '').trim(); if (!m || q.archived) return; if (!groups.has(m)) groups.set(m, []); groups.get(m).push(q); });
      const mq = (d.metaQ || '').trim().toLowerCase(), have = new Set(d.ids);
      return [...groups.entries()].filter(([m]) => !mq || m.toLowerCase().includes(mq)).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 40).map(([m, qs]) => {
        const ids = qs.map(q => q.id), missing = ids.filter(id => !have.has(id)), n = ids.length - missing.length, tot = qs.reduce((t, q) => t + marksOf(q), 0);
        return { name: m, sub: n + ' of ' + ids.length + ' added · ' + markTxt(tot) + ' in all', full: !missing.length, hasAny: n > 0,
          label: !n ? '+ Add all ' + ids.length : missing.length ? '+ Add remaining ' + missing.length : '✓ All ' + ids.length + ' added',
          add: () => { if (missing.length) setD({ ids: d.ids.concat(missing) }); }, remove: () => setD({ ids: d.ids.filter(id => !ids.includes(id)) }) }; }); })(),
    qdMetaNone: !s.qs.some(q => (q.meta || '').trim() && !q.archived),
    qdMetaHas: s.qs.some(q => (q.meta || '').trim() && !q.archived),
    // Static or dynamic
    modeOpts: segs(d.dynamic ? 'dynamic' : 'static', ['static', 'dynamic'], v => setD({ dynamic: v === 'dynamic', drawCount: v === 'dynamic' && d.ids.length && !(d.drawCount <= d.ids.length) ? Math.max(1, Math.round(d.ids.length * 0.6)) : d.drawCount }), v => v === 'static' ? 'Static · everyone sees all questions' : 'Dynamic · random draw from the pool'),
    qdStatic: !d.dynamic,
    qdStaticNote: !d.ids.length ? 'Add questions first.' : 'Every learner sees all ' + d.ids.length + ' selected questions (' + d.ids.length + ' of ' + d.ids.length + ').' + (d.shuffle ? ' The order is shuffled for each learner.' : ' The order stays as listed.'),
    dynToggle: tg(d.dynamic, () => setD({ dynamic: !d.dynamic, drawCount: !d.dynamic && d.ids.length && !(d.drawCount <= d.ids.length) ? Math.max(1, Math.round(d.ids.length * 0.6)) : d.drawCount })),
    qdPoolSize: d.ids.length,
    qdDraw: d.drawCount,
    setDrawCount: e => setD({ drawCount: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) }),
    dynNote: (() => { const n = parseInt(d.drawCount, 10), M = d.ids.length; if (!M) return 'Add questions first, then choose how many each learner sees.'; if (!(n >= 1)) return 'Enter how many questions each learner should see.'; if (n > M) return 'Only ' + M + ' questions are selected. Add more or lower this number.'; if (n === M) return 'Learners see every question. Lower the number to give each learner a different set.'; const w = d.ids.filter(id => { const q = s.qs.find(x => x.id === id); return q && Assessment.isWritten(q); }).length; return 'Each attempt draws ' + n + ' of ' + M + ' at random, so retakes get a new set. The pass mark applies to the questions shown.' + (w ? ' Written answers in the draw are rated by a trainer.' : ''); })(),
    dynWarn: (() => { const n = parseInt(d.drawCount, 10); return !(n >= 1 && n < d.ids.length); })(),
    quizToggles: [{ label:'Shuffle question order', ...tg(d.shuffle, () => setD({ shuffle: !d.shuffle })) }, { label:'Shuffle answer options', ...tg(d.shuffleOpts, () => setD({ shuffleOpts: !d.shuffleOpts })) }],
  };
};
