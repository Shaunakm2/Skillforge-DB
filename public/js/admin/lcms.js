/* Skillforge LMS — LCMS: the upload hub for every module used in courses. */
SkillforgeApp.prototype.amLcms = function (c) {
  const { INK, W, role, s, segs, perms } = c;
  // Trainers (LCMS: surveys and feedback forms) see and create only surveys and Kirkpatrick feedback forms.
  const formsOnly = !perms.has('lcms'), TYPES = Object.keys(MOD_TYPES).filter(t => !formsOnly || MOD_TYPES[t].form);
  // LCMS — upload hub for every module used in courses
  const usedIn = mid => s.adminCourses.filter(c => c.items.some(it => it.moduleId === mid));
  const fmtSize = b => !b ? '' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const lq = s.lcmsQuery.trim().toLowerCase();
  const modDetail = m => { const T = MOD_TYPES[m.type]; if (T.kp) return m.level + ' · ' + (m.qs || []).length + ' questions · ' + m.audience + ' · ' + (m.days ? m.days + ' days after' : 'on completion') + ' · ' + (m.applyAll ? 'all courses' : (m.courses || []).length + ' courses, ' + (m.trainings || []).length + ' trainings'); if (T.form) return (m.qs || []).length + ' questions · not scored'; if (T.quiz) { const z = s.quizzes.find(x => x.id === m.quizId); return z ? (z.dynamic ? z.drawCount + ' of ' + z.ids.length : z.ids.length) + ' questions · pass ' + z.pass + '% · ' + (z.attempts === 'Unlimited' ? 'unlimited' : z.attempts) + ' attempts' + (z.dynamic || z.shuffle ? ' · randomised' : '') : 'Assessment not found'; } if (T.link) return m.url || 'No link'; if (T.text) return m.text || ''; return m.file ? m.file.name + (m.file.size ? ' · ' + fmtSize(m.file.size) : '') : 'No file uploaded'; };
  const modRows = s.lcms.filter(m => (!formsOnly || MOD_TYPES[m.type].form) && (s.lcmsType === 'All' || m.type === s.lcmsType) && (!lq || (m.title + ' ' + m.code + ' ' + m.type + ' ' + (m.desc || '') + ' ' + modDetail(m)).toLowerCase().includes(lq))).map(m => { const T = MOD_TYPES[m.type], u = usedIn(m.id);
  return { ...m, glyph:T.glyph, gBg:T.bg, gFg:T.fg, detail: modDetail(m), minsLabel: (m.mins || 0) + ' min', usedLabel: u.length ? u.length + (u.length === 1 ? ' course' : ' courses') : 'Not used', usedTitle: u.map(c => c.title).join(', '), updatedLabel: m.updated ? shortDate(m.updated) : '',
      edit: () => { if (formsOnly && !MOD_TYPES[m.type].form) return this.toastMsg('Only admins can change this module'); this.setState({ mod: { ...JSON.parse(JSON.stringify(m)), file: m.file ? { ...m.file } : null, err:'' } }); }, preview: () => (Backend.on && m.type === 'SCORM' && m.file && m.file.path ? Backend.scormPreview(m.id).then(u => this.setState({ modPreview: m.id, pvUrl: u })).catch(e => this.toastMsg(e.message)) : this.setState({ modPreview: m.id, pvUrl: '' })),
      del: () => { if (u.length) return this.toastMsg('Used in ' + u.map(c => c.title).join(', ') + '. Remove it from ' + (u.length === 1 ? 'that course' : 'those courses') + ' first.'); this.setState({ modDelete: m.id }); } }; });
  const md = s.mod || {}, setMd = patch => this.setState(st => ({ mod: { ...st.mod, err:'', ...patch } })), MT = MOD_TYPES[md.type] || {};
  // v41.8: file types are detected from the file; the rest are created from a card
  const FILE_TYPES = ['SCORM / xAPI', 'Video', 'Audio', 'Image', 'Document'];
  const blankOf = t => ({ id:null, type:t, step:'form', title:'', desc:'', mins: MOD_TYPES[t].form ? 3 : 10, file:null, url:'', text:'', quizId: (s.quizzes[0] || {}).id || null,
    qs: t === 'Feedback form' ? JSON.parse(JSON.stringify(KP_DEFAULT().L1.qs)) : [{ t:'', kind:'rating' }], level:'L1', audience:'Learner', days:0, applyAll:false, courses:[], trainings:[], err:'' });
  // Connected + SCORM: the .zip is extracted in the browser and every file stored in the private SCORM bucket,
  // served same-origin from /content so the package can reach the SCORM API.
  const pickScorm = f => { setMd({ file:null, err:'', scormBusy:'Reading the package…' });
      Files.scorm(f, (n, t) => setMd({ scormBusy:'Uploading ' + n + ' of ' + t + ' files…' })).then(file => setMd({ file, scormBusy:'', title: md.title || file.title || f.name.replace(/\.zip$/i, '') }))
        .catch(e => setMd({ scormBusy:'', err: e.message })); };
  const takeFile = f => { const t = FILE_TYPES.find(k => MOD_TYPES[k].ok(f));
    if (!t) return setMd({ err: '“' + f.name + '” isn’t a supported file. Use PDF, Word, PowerPoint, Excel, text, video, audio, an image, or a SCORM .zip.' });
    const title = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    if (Backend.on && t === 'SCORM / xAPI') { this.setState({ mod: { ...blankOf(t), title } }); return pickScorm(f); }
    this.setState({ mod: { ...blankOf(t), title, file: { src: Files.local(f, 'lcms'), name: f.name, size: f.size } } }); };
  const pv = s.lcms.find(m => m.id === s.modPreview);
  const pvItem = pv ? itemFromModule(pv) : null;
  const lcmsVals = {
    modRows, lcmsEmpty: modRows.length === 0, lcmsCount: s.lcms.length, lcmsQuery: s.lcmsQuery, setLcmsQuery: e => this.setState({ lcmsQuery: e.target.value }),
    lcmsTypeVal: s.lcmsType, setLcmsType: e => this.setState({ lcmsType: e.target.value }),
    lcmsTypeOpts: ['All'].concat(TYPES).map(t => ({ v: t, l: (t === 'All' ? 'All types' : t) + ' · ' + (t === 'All' ? s.lcms.length : s.lcms.filter(m => m.type === t).length) })),
    lcmsChips: ['All'].concat(TYPES).map(t => { const n = t === 'All' ? s.lcms.length : s.lcms.filter(m => m.type === t).length, on = s.lcmsType === t; return { label: t + ' · ' + n, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => this.setState({ lcmsType:t }) }; }),
    lcmsStats: [['modules', s.lcms.length], ['assessments', s.lcms.filter(m => m.type === 'Assessment').length], ['media & documents', s.lcms.filter(m => !['Assessment', 'Acknowledgment', 'Web link'].includes(m.type)).length], ['not used in a course', s.lcms.filter(m => !usedIn(m.id).length).length]].map(([l, v]) => ({ l, v })),
    // v41.8: one "+ Add module" button. Step 1 picks what to add (upload a file — the type is detected — or create one); step 2 is that type's form.
    newModule: () => this.setState({ mod: { id:null, step:'pick', err:'' } }), lcmsFormsOnly: formsOnly,
    modStepPick: md.step === 'pick', modStepForm: !!s.mod && md.step !== 'pick', modCanUpload: !formsOnly, modDragOver: !!md.over,
    modAnyAccept: FILE_TYPES.map(t => MOD_TYPES[t].accept).join(','),
    modPickAny: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) takeFile(f); },
    modDragOverFn: e => { e.preventDefault(); if (!md.over) setMd({ over:true }); },
    modDragLeave: () => setMd({ over:false }),
    modDropFile: e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; setMd({ over:false }); if (f) takeFile(f); },
    modPickCards: TYPES.filter(t => !FILE_TYPES.includes(t)).map(t => ({ label: t, hint: MOD_TYPES[t].hint, glyph: MOD_TYPES[t].glyph, bg: MOD_TYPES[t].bg, fg: MOD_TYPES[t].fg, pick: () => this.setState({ mod: blankOf(t) }) })),
    modTypeGlyph: MT.glyph || '', modTypeBg: MT.bg || '', modTypeFg: MT.fg || '', modCanChange: !md.id && !md.scormBusy,
    modBackToPick: () => this.setState({ mod: { id:null, step:'pick', err:'' } }),
    modOpen: !!s.mod, md, modTitleLabel: md.id ? 'Edit module · ' + md.code : md.step === 'pick' ? 'Add a module' : 'New ' + (md.type || 'module').toLowerCase(), closeMod: () => this.setState({ mod:null }),
    modTypes: segs(md.type, TYPES, v => setMd({ type:v, file: MOD_TYPES[v].accept && md.file && MOD_TYPES[v].ok({ name: md.file.name, type:'' }) ? md.file : null })),
    // Survey and feedback-form editor
    modIsForm: !!MT.form, modIsKp: !!MT.kp,
    mdQs: (md.qs || []).map((q, i) => ({ n: i + 1, t: q.t, kind: q.kind, kindOpts: [{ v:'rating', l:'Rating 1–5' }, { v:'text', l:'Free text' }],
      setT: e => { const v = e.target.value; this.setState(st => { const qs = st.mod.qs.slice(); qs[i] = { ...qs[i], t: v }; return { mod: { ...st.mod, qs, err:'' } }; }); },
      setKind: e => { const v = e.target.value; this.setState(st => { const qs = st.mod.qs.slice(); qs[i] = { ...qs[i], kind: v }; return { mod: { ...st.mod, qs } }; }); },
      up: () => { if (!i) return; const qs = md.qs.slice(); [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; setMd({ qs }); }, isFirst: i === 0,
      del: () => { if (md.qs.length === 1) return this.toastMsg('Keep at least one question'); setMd({ qs: md.qs.filter((_, j) => j !== i) }); } })),
    mdAddQ: () => { if ((md.qs || []).length >= 15) return this.toastMsg('Up to 15 questions'); setMd({ qs: (md.qs || []).concat([{ t:'', kind:'rating' }]) }); },
    mdLevels: KP_LEVELS.map(([lv, name]) => UI.chip(md.level, lv, lv + ' · ' + name, () => setMd({ level: lv, days: lv === 'L1' ? 0 : lv === 'L2' ? 30 : lv === 'L3' ? 60 : 90 }))),
    mdLevelQ: (KP_LEVELS.find(x => x[0] === md.level) || [])[2] || '',
    mdAud: ['Learner', 'Manager', 'Learner & manager'].map(v => UI.chip(md.audience, v, v, () => setMd({ audience: v }))),
    mdDays: [0, 30, 60, 90].map(v => UI.chip(md.days, v, v ? v + ' days after' : 'On completion', () => setMd({ days: v }))),
    mdAll: UI.toggle(md.applyAll, () => setMd({ applyAll: !md.applyAll })), mdNotAll: !md.applyAll,
    mdCq: md.cq || '', setMdCq: e => setMd({ cq: e.target.value }),
    mdCourseChips: (() => { const q = (md.cq || '').trim().toLowerCase(), chosen = md.courses || [];
      const list = s.adminCourses.filter(a => a.status === 'Published' && (chosen.includes(a.id) || (q && (a.code + ' ' + a.title).toLowerCase().includes(q)))).slice(0, 24);
      return list.map(a => { const on = chosen.includes(a.id); return { label: a.code + ' · ' + a.title, bg: on ? '#F3E8FF' : W, border: on ? '#7E22CE' : '#C9D7E2', pick: () => setMd({ courses: on ? chosen.filter(x => x !== a.id) : chosen.concat([a.id]) }) }; }); })(),
    mdTrainChips: s.masters.trainingNames.map(t => { const on = (md.trainings || []).includes(t); return { label: t, bg: on ? '#F3E8FF' : W, border: on ? '#7E22CE' : '#C9D7E2', pick: () => setMd({ trainings: on ? md.trainings.filter(x => x !== t) : (md.trainings || []).concat([t]) }) }; }),
    mdApplyNote: md.applyAll ? 'Sent for every course completion. With many courses this is a lot of requests; prefer choosing courses or trainings.' : ((md.courses || []).length + ' courses and ' + (md.trainings || []).length + ' trainings selected. For trainings, the form goes to everyone in a batch of that training after the classroom ends.'),
    mdScormBusy: md.scormBusy || '', modIsFile: !!MT.accept, modIsLink: !!MT.link, modIsQuiz: !!MT.quiz, modIsText: !!MT.text, modAccept: MT.accept || '', modHint: MT.hint || '',
    modHasFile: !!(md.file && md.file.src), modUpLabel: md.file && md.file.src ? 'Replace file' : 'Upload file', modFileLabel: md.file ? md.file.name + (md.file.size ? ' · ' + fmtSize(md.file.size) : '') : '',
    modPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (Backend.on && md.type === 'SCORM') { e.target.value = ''; return pickScorm(f); } if (!MT.ok(f)) { e.target.value = ''; return setMd({ err: 'That file type isn’t supported for ' + md.type + '. Use ' + MT.hint + '.' }); } setMd({ file:{ src: Files.local(f, 'lcms'), name:f.name, size:f.size }, title: md.title || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }); },
    modClearFile: () => setMd({ file:null }),
    setMdTitle: e => setMd({ title: e.target.value }), setMdDesc: e => setMd({ desc: e.target.value }), setMdMins: e => setMd({ mins: Math.max(0, parseInt(e.target.value, 10) || 0) }), setMdUrl: e => setMd({ url: e.target.value }), setMdText: e => setMd({ text: e.target.value }),
    modQuizOpts: s.quizzes.map(z => ({ v: String(z.id), l: z.name + ' · ' + z.ids.length + ' questions' })), modQuizVal: String(md.quizId || ''), setMdQuiz: e => { const z = s.quizzes.find(x => x.id === Number(e.target.value)); setMd({ quizId: Number(e.target.value), title: md.title && !s.quizzes.some(x => x.name === md.title) ? md.title : (z ? z.name : '') }); },
    modQuizSummary: md.type === 'Assessment' ? modDetail(md) : '',
    buildQuizFromLcms: () => { this.setState({ mod:null, qFromLcms:true, quizDraft: { name:'', ids:[], pass:80, time:15, attempts:'2', shuffle:true, shuffleOpts:true, dynamic:false, drawCount:10, editId:null } }); this.go('qbank', { adminView:true, bankReturn:true, bankSel:{} }); this.toastMsg('Select questions, then bundle them into an assessment'); },
    modUsedNote: md.id && usedIn(md.id).length ? 'Used in ' + usedIn(md.id).map(c => c.title).join(', ') + '. Saving updates it in ' + (usedIn(md.id).length === 1 ? 'that course' : 'those courses') + '.' : '', modHasUsed: !!(md.id && usedIn(md.id).length),
    modErr: !!md.err,
    saveMod: () => {
      const t = (md.title || '').trim();
      if (!t) return setMd({ err:'Give the module a title.' });
      if (MT.accept && !(md.file && md.file.src)) return setMd({ err:'Upload a file (' + MT.hint + ').' });
      if (MT.link && !/^https?:\/\/\S+\.\S+/.test((md.url || '').trim())) return setMd({ err:'Enter a full web address starting with https://' });
      if (MT.quiz && !s.quizzes.some(z => z.id === md.quizId)) return setMd({ err:'Choose an assessment, or build a new one from the question bank.' });
      if (MT.text && !(md.text || '').trim()) return setMd({ err:'Write the statement learners agree to.' });
      if (MT.form) { const qs = (md.qs || []).map(q => ({ t: (q.t || '').trim(), kind: q.kind }));
        if (!qs.length) return setMd({ err:'Add at least one question.' });
        const bad = qs.findIndex(q => !q.t || q.t.length > 200); if (bad >= 0) return setMd({ err:'Question ' + (bad + 1) + ' is empty or longer than 200 characters.' });
        if (MT.kp && !md.applyAll && !(md.courses || []).length && !(md.trainings || []).length) return setMd({ err:'Choose the courses or trainings this form is sent for (or switch on “All courses”).' });
        if (MT.kp) { const clash = s.lcms.find(m => m.id !== md.id && m.type === 'Feedback form' && m.level === md.level && ((m.courses || []).some(x => (md.courses || []).includes(x)) || (m.trainings || []).some(x => (md.trainings || []).includes(x))));
          if (clash) return setMd({ err:'“' + clash.title + '” already sends an ' + md.level + ' form for some of the same courses or trainings. Remove them from one of the forms.' }); } }
      const clean = { id: md.id, code: md.code, type: md.type, title:t, desc:(md.desc || '').trim(), mins: md.mins || 0, file: MT.accept ? md.file : null, url: MT.link ? md.url.trim() : '', quizId: MT.quiz ? md.quizId : null, text: MT.text ? md.text.trim() : '', by: role.name, ownerEmp: md.ownerEmp || (Backend.on ? Backend.empOfName(role.name) : ''), updated: TODAY_KEY,
        ...(MT.form ? { qs: md.qs.map(q => ({ t: q.t.trim(), kind: q.kind })) } : {}), ...(MT.kp ? { level: md.level, audience: md.audience, days: md.days, applyAll: !!md.applyAll, courses: md.courses || [], trainings: md.trainings || [] } : {}) };
      if (md.id) {
        // Courses keep a copy of each module; refresh those copies so edits reach learners.
        const fresh = itemFromModule(clean);
        this.setState({ lcms: s.lcms.map(m => m.id === md.id ? clean : m), adminCourses: s.adminCourses.map(c => c.items.some(it => it.moduleId === md.id) ? { ...c, items: c.items.map((it, i) => it.moduleId === md.id ? { ...fresh, uid: Progress.stepUid(it, i) } : it) } : c), mod:null });
        this.toastMsg('Module updated' + (usedIn(md.id).length ? ' in ' + usedIn(md.id).length + (usedIn(md.id).length === 1 ? ' course' : ' courses') : ''));
      } else {
        const n = Math.max(0, ...s.lcms.map(m => parseInt(m.code.slice(4), 10) || 0)) + 1;
        this.setState({ lcms: [{ ...clean, id: 'm' + Date.now(), code:'MOD-' + String(n).padStart(3, '0') }].concat(s.lcms), mod:null, lcmsType:'All' });
        this.toastMsg('Module MOD-' + String(n).padStart(3, '0') + ' added');
      }
    },
    modPreviewOpen: !!pv, pv: pv || {}, pvKind: pvItem ? pvItem.kind : '', pvSrc: pvItem && pvItem.kind === 'scorm' && Backend.on ? (s.pvUrl || 'about:blank') : pvItem && pvItem.file ? pvItem.file.src : '', pvDetail: pv ? modDetail(pv) : '', closePreview: () => this.setState({ modPreview:null }),
    pvIsPdf: !!pvItem && pvItem.kind === 'pdf', pvIsVideo: !!pvItem && pvItem.kind === 'video', pvIsAudio: !!pvItem && pvItem.kind === 'audio', pvIsImage: !!pvItem && pvItem.kind === 'image', pvIsScorm: !!pvItem && pvItem.kind === 'scorm' && !!(pvItem.file && pvItem.file.launch), pvIsOther: !!pvItem && (['doc', 'link', 'quiz', 'ack'].includes(pvItem.kind) || (pvItem.kind === 'scorm' && !(pvItem.file && pvItem.file.launch))), pvHasLink: !!pvItem && !!(pvItem.file && pvItem.file.src) && ['doc', 'link', 'scorm'].includes(pvItem.kind),
    modDeleteOpen: !!s.modDelete, delModName: (s.lcms.find(m => m.id === s.modDelete) || {}).title || '', closeModDelete: () => this.setState({ modDelete:null }),
    confirmModDelete: () => { const m = s.lcms.find(x => x.id === s.modDelete); this.setState({ lcms: s.lcms.filter(x => x.id !== s.modDelete), modDelete:null }); if (m) this.toastMsg(m.code + ' deleted'); },
  };
  return {
    ...lcmsVals,
  };
};
