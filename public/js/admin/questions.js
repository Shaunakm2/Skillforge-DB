/* Skillforge LMS — question bank actions (select, bundle, bulk upload) and the Add question editor. */
SkillforgeApp.prototype.amQuestions = function (c) {
  const { W, chipsOf, role, s, segs } = c;
  // question bank
  const MEDIA_LABEL = { image:'Image', audio:'Audio', video:'Video' };
  const topics = ['All'].concat(Array.from(new Set(s.qs.map(q => q.topic))));
  const bq = s.bankQuery.trim().toLowerCase();
  const bankList = s.qs.filter(q => (s.bankTopic === 'All' || q.topic === s.bankTopic) && (!bq || q.text.toLowerCase().includes(bq))).map(q => { const on = !!s.bankSel[q.id]; return { ...q, on, boxBg: on ? '#7C5CFF' : W, boxBorder: on ? '#7C5CFF' : '#BFCFDB', rowBg: on ? '#F4F1FF' : 'transparent', typeLabel: q.type + (q.media ? ' · ' + MEDIA_LABEL[q.media.kind] : ''), diffBg: DIFF[q.diff][0], diffFg: DIFF[q.diff][1], usedLabel: q.used ? q.used + (q.used === 1 ? ' quiz' : ' quizzes') : 'Unused', toggle: () => this.setState(st => ({ bankSel: { ...st.bankSel, [q.id]: !st.bankSel[q.id] } })) }; });
  const bankList2 = bankList.map(q => ({ ...q, stLabel: q.archived ? 'Archived' : 'Active', stBg: q.archived ? '#EAF1F6' : '#D6EBE6', stFg: q.archived ? '#526B7A' : '#245E52', archLabel: q.archived ? 'Restore' : 'Archive', preview: () => this.toastMsg('Preview: ' + q.text.slice(0, 80)), dup: () => { this.setState(st => ({ qs: st.qs.concat([{ ...q, id: 'q' + Date.now(), text: q.text + ' (copy)', used: 0, archived:false }]) })); this.toastMsg('Question duplicated'); }, arch: () => this.setState(st => ({ qs: st.qs.map(x => x.id === q.id ? { ...x, archived: !x.archived } : x) })) }));
  const selIds = s.qs.filter(q => s.bankSel[q.id]).map(q => q.id);
  const allOn = bankList.length > 0 && bankList.every(q => q.on);
  const defaultDraft = { name:'', ids:[], pass:80, time:15, attempts:'2', shuffle:true, shuffleOpts:true, dynamic:false, drawCount:10, editId:null };
  // v39: editing loads the saved question into the same editor (qEditId). Ids, reference, author and usage are kept.
  const editQ = s.qEditId != null ? s.qs.find(q => q.id === s.qEditId) : null;
  const pad4 = a => (a || []).concat(['', '', '', '']).slice(0, 4);
  const pad5 = a => (a || []).concat(['', '', '', '', '']).slice(0, 5);   // v41.22: choice questions can have 2 to 5 options
  const draftOf = q => ({ editId: q.id, text: q.text || '', type: q.type, why: q.why || '', meta: q.meta || '', marks: q.marks > 0 ? q.marks : 1, topic: q.topic || 'General', diff: q.diff || 'Medium', skill: q.skill || '', bloom: q.bloom || 'Understand',
    tagsText: (q.tags || []).join(', '), points: q.points || 5, guide: q.guide || '', media: q.media ? { ...q.media, uploaded: q.media.uploaded !== false } : null,
    opts: ['Multiple choice', 'True / False', 'Multiple select'].includes(q.type) ? pad5(q.opts) : ['', '', '', '', ''], optN: Math.min(5, Math.max(2, (q.opts || []).length || 4)), ans: typeof q.ans === 'number' ? q.ans : 0, answers: (q.answers || []).slice(),
    imgs: q.type === 'Image options' ? [0, 1, 2, 3].map(k => { const o = (q.opts || [])[k]; return o && typeof o === 'object' ? { ...o, uploaded: o.uploaded !== false } : { src:'', label:'' }; }) : [{ src:'', label:'' }, { src:'', label:'' }, { src:'', label:'' }, { src:'', label:'' }],
    pairs: q.type === 'Match the following' ? (q.pairs || []).map(p => p.slice()) : [['', ''], ['', ''], ['', '']], accept: (q.accept || []).join(', '), items: q.type === 'Ordering' ? (q.items || []).slice() : ['', '', ''] });
  const qm = s.qm || (editQ ? draftOf(editQ) : null) || { text:'', type:'Multiple choice', opts:['', '', '', '', ''], optN:4, ans:0, answers:[], why:'', meta:'', marks:1, topic:'General', diff:'Medium', skill:'', bloom:'Understand', tagsText:'', points:5, guide:'', media:null, imgs:[{ src:'', label:'' }, { src:'', label:'' }, { src:'', label:'' }, { src:'', label:'' }], pairs:[['', ''], ['', ''], ['', '']], accept:'', items:['', '', ''] };
  const qmUsedQuizzes = qm.editId != null ? (s.quizzes || []).filter(z => (z.ids || []).includes(qm.editId)) : [];
  // Courses that carry those quizzes (only worked out while the editor is open on a used question).
  const qmCourseN = qmUsedQuizzes.length ? (() => { const ids = new Set(qmUsedQuizzes.map(z => z.id)); return s.adminCourses.filter(c => (c.items || []).some(i => i.kind === 'quiz' && ids.has(i.quizId))).length; })() : 0;
  const qmUsedIn = qmUsedQuizzes.length ? qmUsedQuizzes.length + (qmUsedQuizzes.length === 1 ? ' quiz' : ' quizzes') + (qmCourseN ? ' across ' + qmCourseN.toLocaleString('en-US') + (qmCourseN === 1 ? ' course' : ' courses') : '') : '';
  const setQm = patch => this.setState(st => ({ qm: { ...(st.qm || qm), ...patch } }));
  const optCount = qm.type === 'True / False' ? 2 : ['Multiple choice', 'Multiple select'].includes(qm.type) ? Math.min(5, Math.max(2, qm.optN || 4)) : 0;
  const qmMulti = qm.type === 'Multiple select';
  const qmKind = qm.media ? qm.media.kind : 'none';
  const qmPickFile = e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!f.type.startsWith(qmKind + '/')) { e.target.value = ''; return this.toastMsg('That file is not ' + (qmKind === 'image' ? 'an image' : 'a' + (qmKind === 'audio' ? 'n audio' : ' video') + ' file')); } if (qm.media && qm.media.uploaded) URL.revokeObjectURL(qm.media.src); setQm({ media: { kind: qmKind, src: Files.local(f, 'questions'), name: f.name, size: f.size, uploaded:true } }); };
  const qmOpts = qm.opts.slice(0, optCount).map((v, i) => { const on = qmMulti ? qm.answers.includes(i) : qm.ans === i; return { v, letter:'ABCDE'[i], on, markBg: on ? '#7C5CFF' : W, markBorder: on ? '#7C5CFF' : '#BFCFDB', mark: () => setQm(qmMulti ? { answers: on ? qm.answers.filter(x => x !== i) : qm.answers.concat([i]) } : { ans:i }), set: e => { const o = [...qm.opts]; o[i] = e.target.value; setQm({ opts:o }); } }; });
  const setArr = (key, i, val) => { const a = JSON.parse(JSON.stringify(qm[key])); a[i] = val; setQm({ [key]: a }); };
  const qmImgs = qm.imgs.map((im, i) => { const on = qm.ans === i; return { ...im, letter:'ABCD'[i], on, has: !!im.src, markBg: on ? '#7C5CFF' : W, markBorder: on ? '#7C5CFF' : '#BFCFDB', mark: () => setQm({ ans:i }), setLabel: e => setArr('imgs', i, { ...im, label: e.target.value }), setUrl: e => setArr('imgs', i, { ...im, src: e.target.value.trim(), uploaded:false }), url: im.uploaded ? '' : im.src, pick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!f.type.startsWith('image/')) { e.target.value = ''; return this.toastMsg('That file is not an image'); } setArr('imgs', i, { ...im, src: Files.local(f, 'questions'), uploaded:true, label: im.label || f.name.replace(/\.[^.]+$/, '') }); }, clear: () => setArr('imgs', i, { src:'', label: im.label }) }; });
  const qmPairs = qm.pairs.map((p, i) => ({ n: i + 1, left: p[0], right: p[1], setL: e => setArr('pairs', i, [e.target.value, p[1]]), setR: e => setArr('pairs', i, [p[0], e.target.value]), canRemove: qm.pairs.length > 2, remove: () => setQm({ pairs: qm.pairs.filter((_, j) => j !== i) }) }));
  const qmItems = qm.items.map((t, i) => ({ n: i + 1, t, set: e => setArr('items', i, e.target.value), canRemove: qm.items.length > 3, remove: () => setQm({ items: qm.items.filter((_, j) => j !== i) }), up: () => { if (i) { const a = qm.items.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setQm({ items:a }); } } }));
  Object.assign(c, { MEDIA_LABEL, defaultDraft });
  return {
    qCount: s.qs.length,
    bankList: bankList2,
    bankQuery: s.bankQuery,
    setBankQuery: e => this.setState({ bankQuery: e.target.value }),
    topicChips: chipsOf(s.bankTopic, topics, v => this.setState({ bankTopic:v })),
    allBox: { on: allOn, bg: allOn ? '#7C5CFF' : W, border: allOn ? '#7C5CFF' : '#BFCFDB' },
    toggleAllBank: () => { const sel = { ...s.bankSel }; bankList.forEach(q => { sel[q.id] = !allOn; }); this.setState({ bankSel: sel }); },
    uploadSample: () => { const base = nextUserId(s.qs) - 1; this.setState({ qs: s.qs.concat(IMPORT_Q.map((q, i) => ({ ...q, id: base + i + 1, used:0, author: role.name, created: TODAY_KEY }))) }); this.toastMsg(IMPORT_Q.length + ' questions imported from coaching_questions_oct.csv'); },
    downloadTemplate: () => this.toastMsg('question_template.csv downloaded'),
    showBundle: s.screen === 'qbank' && selIds.length > 0,
    bundleCount: selIds.length + (selIds.length === 1 ? ' question selected' : ' questions selected'),
    bundleLabel: s.bankReturn ? 'Update quiz →' : 'Bundle into quiz →',
    clearBundle: () => this.setState({ bankSel:{} }),
    bundle: () => { this.setState(st => ({ quizDraft: { ...(st.bankReturn ? st.quizDraft : defaultDraft), ids: selIds }, bankSel:{}, bankReturn:false })); this.go('quizBuild', { adminView:true }); },
    qModal: s.qModal,
    openQModal: () => this.setState({ qModal:true, qm:null, qEditId:null }),
    closeQModal: () => this.setState({ qModal:false, qm:null, qEditId:null }),
    qmEditing: qm.editId != null, qmTitle: qm.editId != null ? 'Edit question' + (editQ && editQ.ref ? ' · ' + editQ.ref : '') : 'Add question',
    qmSaveLabel: qm.editId != null ? 'Save changes' : 'Add to bank',
    qmUsedNote: qm.editId != null && qmUsedIn ? 'Used in ' + qmUsedIn + '. Saved changes apply to new attempts; results already recorded are not re-marked.' : '',
    qm,
    qmOpts,
    qmHasOpts: optCount > 0,
    qmShort: qm.type === 'Written answer',
    setQmWhy: e => setQm({ why: e.target.value }),
    setQmGuide: e => setQm({ guide: e.target.value }),
    qmPointOpts: segs(qm.points, [5, 10], v => setQm({ points:v }), v => '0–' + v),
    qmMediaKinds: segs(qmKind, ['none'].concat(Assessment.MEDIA_KINDS), v => setQm({ media: v === 'none' ? null : { kind:v, src:'', name:'' } }), v => v === 'none' ? 'None' : MEDIA_LABEL[v]),
    qmMediaOn: !!qm.media,
    qmMediaKindLabel: qm.media ? MEDIA_LABEL[qmKind].toLowerCase() : '',
    qmMediaAccept: Assessment.MEDIA_ACCEPT[qmKind] || '',
    qmMediaHint: qm.media ? Assessment.MEDIA_HINT[qmKind] + '. Learners see it above the question.' : '',
    qmPickFile,
    qmMediaUrl: qm.media && !qm.media.uploaded ? qm.media.src : '',
    setQmMediaUrl: e => setQm({ media: { kind: qmKind, src: e.target.value.trim(), name: e.target.value.trim().split('/').pop(), uploaded:false } }),
    qmMediaHasSrc: !!(qm.media && qm.media.src),
    qmMediaName: qm.media ? (qm.media.name || 'Linked file') + (qm.media.size ? ' · ' + (qm.media.size / 1048576).toFixed(1) + ' MB' : '') : '',
    qmPrev: { isImage: qmKind === 'image', isAudio: qmKind === 'audio', isVideo: qmKind === 'video', src: qm.media ? qm.media.src : '' },
    qmClearMedia: () => setQm({ media: { kind: qmKind, src:'', name:'' } }),
    setQmText: e => setQm({ text: e.target.value }),
    qmTypes: segs(qm.type, Assessment.TYPES, v => setQm({ type:v, optN: v === 'True / False' ? 2 : qm.type === 'True / False' ? 4 : qm.optN, opts: v === 'True / False' ? ['True', 'False', '', '', ''] : qm.type === 'True / False' ? ['', '', '', '', ''] : qm.opts, ans:0, answers:[] })),
    qmCanAddOpt: ['Multiple choice', 'Multiple select'].includes(qm.type) && optCount < 5, addOpt: () => setQm({ optN: optCount + 1 }),
    qmCanDropOpt: ['Multiple choice', 'Multiple select'].includes(qm.type) && optCount > 2,
    dropOpt: () => { const last = optCount - 1, o = pad5(qm.opts); o[last] = ''; setQm({ optN: last, opts: o, ans: qm.ans >= last ? 0 : qm.ans, answers: (qm.answers || []).filter(x => x < last) }); },
    qmMulti,
    qmImgOpts: qm.type === 'Image options',
    qmImgs,
    qmMatch: qm.type === 'Match the following',
    qmPairs,
    qmCanAddPair: qm.pairs.length < 8,
    addPair: () => setQm({ pairs: qm.pairs.concat([['', '']]) }),
    qmLikert: qm.type === 'Likert scale',
    likertScale: Assessment.LIKERT.join(' · '),
    qmFill: qm.type === 'Fill in the blank',
    setQmAccept: e => setQm({ accept: e.target.value }),
    qmOrder: qm.type === 'Ordering',
    qmItems,
    qmCanAddItem: qm.items.length < 8,
    addItem: () => setQm({ items: qm.items.concat(['']) }),
    qmExplain: !['Written answer', 'Likert scale'].includes(qm.type),
    qmOptsLabel: qmMulti ? 'Options · mark every correct one' : 'Options · mark the correct one',
    qmDiffs: segs(qm.diff, ['Easy', 'Medium', 'Hard'], v => setQm({ diff:v })),
    // v41.22: Metadata groups questions (e.g. "Post Assessment Telephone Etiquette 2026") so an assessment can pick them together; Marks is what the question is worth.
    qmMetaOpts: Array.from(new Set(s.qs.map(x => (x.meta || '').trim()).filter(Boolean))).sort(),
    setQmMeta: e => setQm({ meta: e.target.value }),
    setQmMarks: e => setQm({ marks: e.target.value === '' ? '' : e.target.value }),
    qmNotWritten: qm.type !== 'Written answer',
    saveQ: () => {
      if (!qm.text.trim()) return this.toastMsg('Write the question first');
      const metaTxt = (qm.meta || '').replace(/\s+/g, ' ').trim();
      if (!metaTxt && qm.editId == null) return this.toastMsg('Add the metadata, e.g. Post Assessment Telephone Etiquette 2026');
      if (metaTxt.length > 160) return this.toastMsg('Metadata is too long (160 characters at most)');
      const mk = Math.round(Number(String(qm.marks).replace(',', '.')) * 100) / 100;
      if (qm.type !== 'Written answer' && !(mk > 0 && mk <= 100)) return this.toastMsg('Marks must be a number above 0 (up to 100)');
      const t = qm.type, need = m => this.toastMsg(m);
      if (qm.media && !qm.media.src) return need('Upload a file or paste a link for the ' + MEDIA_LABEL[qm.media.kind].toLowerCase());
      const old = qm.editId != null ? s.qs.find(q => q.id === qm.editId) : null;
      if (qm.editId != null && !old) return need('This question no longer exists. Close the editor and refresh.');
      const id = old ? old.id : nextUserId(s.qs);
      const base = { id, ref: 'QB-' + String(id).padStart(4, '0'), meta: metaTxt, marks: t === 'Written answer' ? qm.points : mk, skill: (qm.skill || '').trim() || Q_SKILL[qm.topic] || qm.topic || 'General', bloom: qm.bloom || 'Understand', tags: tagsOf(qm.tagsText), lang:'English', text: qm.text.trim(), topic: qm.topic || 'General', type: t, diff: qm.diff, used:0, author: role.name, created: TODAY_KEY, media: qm.media ? { kind: qm.media.kind, src: qm.media.src, name: qm.media.name } : null, why: qm.why.trim() };
      let extra;
      if (t === 'Multiple choice' || t === 'True / False' || t === 'Multiple select') {
        const opts = qm.opts.slice(0, optCount).map(o => o.trim());
        if (opts.some(o => !o)) return need('Fill in every answer option');
        if (new Set(opts.map(o => o.toLowerCase())).size < opts.length) return need('The answer options must all be different');
        if (t === 'Multiple select' && !qm.answers.length) return need('Mark at least one correct option');
        extra = t === 'Multiple select' ? { opts, answers: qm.answers.slice().sort() } : { opts, ans: qm.ans };
      } else if (t === 'Image options') {
        if (qm.imgs.some(im => !im.src)) return need('Add an image for every option');
        extra = { opts: qm.imgs.map((im, k) => ({ src: im.src, label: im.label.trim() || 'Option ' + 'ABCD'[k] })), ans: qm.ans };
      } else if (t === 'Match the following') {
        const pairs = qm.pairs.map(p => [p[0].trim(), p[1].trim()]);
        if (pairs.some(p => !p[0] || !p[1])) return need('Fill in both sides of every pair');
        if (new Set(pairs.map(p => p[1].toLowerCase())).size < pairs.length) return need('Each right-hand answer must be different');
        extra = { pairs };
      } else if (t === 'Fill in the blank') {
        const accept = qm.accept.split(',').map(a => a.trim()).filter(Boolean);
        if (!accept.length) return need('Add at least one accepted answer');
        extra = { accept };
      } else if (t === 'Ordering') {
        const items = qm.items.map(x => x.trim());
        if (items.some(x => !x)) return need('Fill in every item');
        extra = { items };
      } else if (t === 'Written answer') {
        extra = { points: qm.points, guide: qm.guide.trim() };
      } else extra = {};
      if (old) {
        // Keep stored files (their storage path) when the picture or media did not change.
        if (old.media && base.media && old.media.src === base.media.src) base.media = old.media;
        if (t === 'Image options' && Array.isArray(old.opts)) extra.opts = extra.opts.map((o, k) => { const p = old.opts[k]; return p && typeof p === 'object' && p.src === o.src ? { ...p, label: o.label } : o; });
        const keep = { id: old.id, ref: old.ref || base.ref, used: old.used || 0, author: old.author || base.author, created: old.created || base.created, archived: !!old.archived, lang: old.lang || base.lang,
          updated: TODAY_KEY, updatedBy: role.name };
        const next = { ...base, ...extra, ...keep };   // fields of the old type (opts, pairs…) are not carried over
        this.setState(st => ({ qs: st.qs.map(q => q.id === old.id ? next : q), qModal:false, qm:null, qEditId:null }));
        this.logAudit && this.logAudit('Edited question', next.ref);
        return this.toastMsg('Question updated' + (qmUsedIn ? '. The change applies to new attempts in ' + qmUsedIn : ''));
      }
      this.setState({ qs: [{ ...base, ...extra }].concat(s.qs), qModal:false }); this.toastMsg('Question added to the bank');
    },
  };
};
