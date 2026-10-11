/* Skillforge LMS — quiz list and quiz builder. */
SkillforgeApp.prototype.amQuizzes = function (c) {
  const { MEDIA_LABEL, defaultDraft, role, s, segs, tg } = c;
  // quiz builder
  const d = s.quizDraft;
  const setD = patch => this.setState(st => ({ quizDraft: { ...st.quizDraft, ...patch } }));
  const draftQs = d.ids.map((id, i) => { const q = s.qs.find(x => x.id === id); return { n:i + 1, text:q.text, topic:q.topic, type:q.type + (q.media ? ' · ' + MEDIA_LABEL[q.media.kind] : ''), diff:q.diff, diffBg:DIFF[q.diff][0], diffFg:DIFF[q.diff][1], up: () => this.moveQ(i, -1), down: () => this.moveQ(i, 1), remove: () => setD({ ids: d.ids.filter(x => x !== id) }) }; });
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
  const quizCards = s.quizzes.map((z, i) => { const c = VIVIDS[(i * 3 + 1) % 7]; return { name:z.name, count:z.ids.length, countLabel: z.dynamic ? Math.min(z.drawCount, z.ids.length) + ' of ' + z.ids.length + ' questions · random draw' : z.ids.length + (z.ids.length === 1 ? ' question' : ' questions') + (z.shuffle ? ' · shuffled' : ''), pass:'Pass ' + z.pass + '%', time: z.time ? z.time + ' min' : 'No time limit', attempts: z.attempts === 'Unlimited' ? 'Unlimited attempts' : z.attempts + (z.attempts === '1' ? ' attempt' : ' attempts'), course: z.course || 'Not attached yet', color:c, colorFg:VIVID_FG[c], edit: () => { this.setState({ quizDraft: { ...defaultDraft, ...z, editId:z.id } }); this.go('quizBuild', { adminView:true }); } }; });
  return {
    quizCards,
    newQuiz: () => { this.setState({ quizDraft: defaultDraft }); this.go('quizBuild', { adminView:true }); },
    qd: d,
    setQdName: e => setD({ name: e.target.value }),
    quizBuildLabel: d.editId ? 'EDIT QUIZ' : s.qFromLcms ? 'NEW ASSESSMENT · SAVES TO LCMS' : 'NEW QUIZ',
    qdCountLabel: d.ids.length + (d.ids.length === 1 ? ' question' : ' questions') + (d.dynamic && d.ids.length ? ' selected · learners see ' + (parseInt(d.drawCount, 10) > 0 ? Math.min(parseInt(d.drawCount, 10), d.ids.length) : '—') : ''),
    qdEmpty: d.ids.length === 0,
    draftQs,
    saveQuiz,
    addFromBank: () => { this.setState(st => ({ bankReturn:true, bankSel: Object.fromEntries(st.quizDraft.ids.map(id => [id, true])) })); this.go('qbank', { adminView:true }); },
    passOpts: segs(d.pass, [60, 70, 80, 90], v => setD({ pass:v }), v => v + '%'),
    timeOpts: segs(d.time, [0, 10, 15, 30], v => setD({ time:v }), v => v ? v + ' min' : 'None'),
    attemptOpts: segs(d.attempts, ['1', '2', '3', 'Unlimited'], v => setD({ attempts:v })),
    dynToggle: tg(d.dynamic, () => setD({ dynamic: !d.dynamic, drawCount: !d.dynamic && d.ids.length && !(d.drawCount <= d.ids.length) ? Math.max(1, Math.round(d.ids.length * 0.6)) : d.drawCount })),
    qdPoolSize: d.ids.length,
    qdDraw: d.drawCount,
    setDrawCount: e => setD({ drawCount: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) }),
    dynNote: (() => { const n = parseInt(d.drawCount, 10), M = d.ids.length; if (!M) return 'Add questions first, then choose how many each learner sees.'; if (!(n >= 1)) return 'Enter how many questions each learner should see.'; if (n > M) return 'Only ' + M + ' questions are selected. Add more or lower this number.'; if (n === M) return 'Learners see every question. Lower the number to give each learner a different set.'; const w = d.ids.filter(id => { const q = s.qs.find(x => x.id === id); return q && Assessment.isWritten(q); }).length; return 'Each attempt draws ' + n + ' of ' + M + ' at random, so retakes get a new set. The pass mark applies to the questions shown.' + (w ? ' Written answers in the draw are rated by a trainer.' : ''); })(),
    dynWarn: (() => { const n = parseInt(d.drawCount, 10); return !(n >= 1 && n < d.ids.length); })(),
    quizToggles: [{ label:'Shuffle question order', ...tg(d.shuffle, () => setD({ shuffle: !d.shuffle })) }, { label:'Shuffle answer options', ...tg(d.shuffleOpts, () => setD({ shuffleOpts: !d.shuffleOpts })) }],
  };
};
