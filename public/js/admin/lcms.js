/* Skillforge LMS — LCMS: the upload hub for every module used in courses. */
SkillforgeApp.prototype.amLcms = function (c) {
  const { INK, W, role, s, segs, perms } = c;
  // Trainers (LCMS: surveys and feedback forms) see and create only surveys and Kirkpatrick feedback forms.
  const formsOnly = !perms.has('lcms'), TYPES = Object.keys(MOD_TYPES).filter(t => !formsOnly || MOD_TYPES[t].form);
  // LCMS — upload hub for every module used in courses
  const usedIn = mid => s.adminCourses.filter(c => c.items.some(it => it.moduleId === mid));
  const fmtSize = b => !b ? '' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const lq = s.lcmsQuery.trim().toLowerCase();
  const modDetail = m => { const T = MOD_TYPES[m.type]; if (T.kp) return m.level + ' · ' + (m.qs || []).length + ' questions · ' + m.audience + ' · ' + (m.days ? m.days + ' days after' : 'on completion') + ' · ' + (m.applyAll ? 'all courses' : (m.courses || []).length + ' courses, ' + (m.trainings || []).length + ' trainings'); if (T.form) return (m.qs || []).length + ' questions · not scored';
    if (T.list) return (m.list || []).length + ' items to tick';
    if (T.asg) return 'Reviewed by a trainer' + (m.allowLink === false ? ' · written answer' : ' · answer or link');
    if (T.link) return m.url || '';
    if (T.pkg && m.file) return (m.file.name || '') + (m.file.version ? ' · ' + m.file.version : '') + (m.file.size ? ' · ' + fmtSize(m.file.size) : ''); if (T.quiz) { const z = s.quizzes.find(x => x.id === m.quizId); return z ? (z.dynamic ? z.drawCount + ' of ' + z.ids.length : z.ids.length) + ' questions · pass ' + z.pass + '% · ' + (z.attempts === 'Unlimited' ? 'unlimited' : z.attempts) + ' attempts' + (z.dynamic || z.shuffle ? ' · randomised' : '') : 'Assessment not found'; } if (T.link) return m.url || 'No link'; if (T.text) return m.text || ''; return m.file ? m.file.name + (m.file.size ? ' · ' + fmtSize(m.file.size) : '') : 'No file uploaded'; };
  const modRows = s.lcms.filter(m => (!formsOnly || MOD_TYPES[m.type].form) && (s.lcmsType === 'All' || m.type === s.lcmsType) && (!lq || (m.title + ' ' + m.code + ' ' + m.type + ' ' + (m.desc || '') + ' ' + modDetail(m)).toLowerCase().includes(lq))).map(m => { const T = MOD_TYPES[m.type], u = usedIn(m.id);
  return { ...m, type: modLabel(m.type), glyph:T.glyph, gBg:T.bg, gFg:T.fg, detail: modDetail(m), minsLabel: (m.mins || 0) + ' min', usedLabel: u.length ? u.length + (u.length === 1 ? ' course' : ' courses') : 'Not used', usedTitle: u.map(c => c.title).join(', '), updatedLabel: m.updated ? shortDate(m.updated) : '',
      edit: () => { if (formsOnly && !MOD_TYPES[m.type].form) return this.toastMsg('Only admins can change this module'); this.setState({ mod: { ...JSON.parse(JSON.stringify(m)), file: m.file ? { ...m.file } : null, err:'' } }); }, preview: () => (Backend.on && MOD_TYPES[m.type].kind === 'scorm' && m.file && m.file.path ? Backend.scormPreview(m.id).then(u => this.setState({ modPreview: m.id, pvUrl: u })).catch(e => this.toastMsg(e.message)) : this.setState({ modPreview: m.id, pvUrl: '' })),
      del: () => { if (u.length) return this.toastMsg('Used in ' + u.map(c => c.title).join(', ') + '. Remove it from ' + (u.length === 1 ? 'that course' : 'those courses') + ' first.'); this.setState({ modDelete: m.id }); } }; });
  const md = s.mod || {}, setMd = patch => this.setState(st => ({ mod: { ...st.mod, err:'', ...patch } })), MT = MOD_TYPES[md.type] || {};
  // v41.8: file types are detected from the file; the rest are created from a card
  const FILE_TYPES = ['SCORM / xAPI', 'Video', 'Audio', 'Image', 'Document'];
  const LV0 = () => [{ n:'Beginner', min:0 }, { n:'Intermediate', min:60 }, { n:'Advanced', min:85 }];
  const blankOf = t => ({ id:null, type:t, step:'form', title:'', desc:'', mins: MOD_TYPES[t].form ? 3 : 10, file:null, url:'', text:'', quizId: (s.quizzes[0] || {}).id || null,
    comp:'', levels: LV0(), list:[{ t:'' }, { t:'' }], allowLink:true,
    qs: t === 'Feedback form' ? JSON.parse(JSON.stringify(KP_DEFAULT().L1.qs)) : [{ t:'', kind:'rating' }], level:'L1', audience:'Learner', days:0, applyAll:false, courses:[], trainings:[], err:'' });
  // Connected + SCORM: the .zip is extracted in the browser and every file stored in the private SCORM bucket,
  // served same-origin from /content so the package can reach the SCORM API.
  const pickScorm = f => { setMd({ file:null, err:'', scormBusy:'Reading the package…' });
      Files.scorm(f, (n, t) => setMd({ scormBusy:'Uploading ' + n + ' of ' + t + ' files…' })).then(file => this.setState(st => ({ mod: { ...st.mod, err:'', file, scormBusy:'', type: Unzip.PKG_TYPE[file.std] || st.mod.type, title: st.mod.title || file.title || f.name.replace(/\.zip$/i, '') } })))
        .catch(e => setMd({ scormBusy:'', err: e.message })); };
  const takeFile = f => { if (/\.zip$/i.test(f.name)) return takeZip(f);
    const t = FILE_TYPES.find(k => MOD_TYPES[k].ok(f));
    if (!t) return setMd({ err: '“' + f.name + '” isn’t a supported file. Use PDF, Word, PowerPoint, Excel, text, video, audio, an image, or a SCORM .zip.' });
    const title = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    if (Backend.on && t === 'SCORM / xAPI') { this.setState({ mod: { ...blankOf(t), title } }); return pickScorm(f); }
    this.setState({ mod: { ...blankOf(t), title, file: { src: Files.local(f, 'lcms'), name: f.name, size: f.size } } }); };
  // v41.11: a .zip is opened to see what it is: SCORM (imsmanifest.xml), xAPI / cmi5 (tincan.xml / cmi5.xml) or an HTML5 package
  const takeZip = f => f.arrayBuffer().then(b => Unzip.read(b)).then(files => { const info = Unzip.packageInfo(files), t = Unzip.PKG_TYPE[info.std];
      const title = info.title || f.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim();
      if (Backend.on) { this.setState({ mod: { ...blankOf(t), title } }); return pickScorm(f); }
      this.setState({ mod: { ...blankOf(t), title, file: { src: Files.local(f, 'lcms'), name: f.name, size: f.size, launch: '', std: info.std } } }); })
    .catch(e => setMd({ err: e.message || 'That ZIP could not be read' }));
  const pv = s.lcms.find(m => m.id === s.modPreview);
  const pvItem = pv ? itemFromModule(pv) : null;
  const lcmsVals = {
    modRows, lcmsEmpty: modRows.length === 0, lcmsCount: s.lcms.length, lcmsQuery: s.lcmsQuery, setLcmsQuery: e => this.setState({ lcmsQuery: e.target.value }),
    lcmsTypeVal: s.lcmsType, setLcmsType: e => this.setState({ lcmsType: e.target.value }),
    lcmsTypeOpts: ['All'].concat(TYPES).map(t => ({ v: t, l: (t === 'All' ? 'All types' : modLabel(t)) + ' · ' + (t === 'All' ? s.lcms.length : s.lcms.filter(m => m.type === t).length) })),
    lcmsChips: ['All'].concat(TYPES).map(t => { const n = t === 'All' ? s.lcms.length : s.lcms.filter(m => m.type === t).length, on = s.lcmsType === t; return { label: t + ' · ' + n, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => this.setState({ lcmsType:t }) }; }),
    lcmsStats: [['modules', s.lcms.length], ['tests', s.lcms.filter(m => (MOD_TYPES[m.type] || {}).quiz).length], ['media, packages & links', s.lcms.filter(m => { const T = MOD_TYPES[m.type] || {}; return !!(T.accept || T.link); }).length], ['not used in a course', s.lcms.filter(m => !usedIn(m.id).length).length]].map(([l, v]) => ({ l, v })),
    // v41.8: one "+ Add module" button. Step 1 picks what to add (upload a file — the type is detected — or create one); step 2 is that type's form.
    newModule: () => this.setState({ mod: { id:null, step:'pick', err:'' } }), lcmsFormsOnly: formsOnly,
    modStepPick: md.step === 'pick', modStepForm: !!s.mod && md.step !== 'pick', modCanUpload: !formsOnly, modDragOver: !!md.over,
    modAnyAccept: FILE_TYPES.map(t => MOD_TYPES[t].accept).join(','),
    modPickAny: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) takeFile(f); },
    modDragOverFn: e => { e.preventDefault(); if (!md.over) setMd({ over:true }); },
    modDragLeave: () => setMd({ over:false }),
    modDropFile: e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; setMd({ over:false }); if (f) takeFile(f); },
    modPickGroups: [['Packages, links and embeds', ['Non-SCORM', 'xAPI / cmi5', 'H5P', 'YouTube / Vimeo', 'Web link']], ['Tests', ['Assessment', 'Competency test']],
      ['Forms and activities', ['Feedback form', 'Survey', 'Checklist', 'Assignment', 'Acknowledgment']]]
      .map(([h, ks]) => ({ h, cards: ks.filter(t => TYPES.includes(t)).map(t => ({ label: modLabel(t), hint: MOD_TYPES[t].hint, glyph: MOD_TYPES[t].glyph, bg: MOD_TYPES[t].bg, fg: MOD_TYPES[t].fg, pick: () => this.setState({ mod: blankOf(t) }) })) })).filter(g => g.cards.length),
    modTypeLabel: modLabel(md.type), modTypeGlyph: MT.glyph || '',
    modLinkLabel: md.type === 'YouTube / Vimeo' ? 'YouTube or Vimeo link' : md.type === 'H5P' ? 'H5P embed link' : 'Web address',
    modLinkPh: md.type === 'YouTube / Vimeo' ? 'https://www.youtube.com/watch?v=…' : md.type === 'H5P' ? 'https://yourname.h5p.com/content/…/embed' : 'https://',
    modLinkNote: md.type === 'YouTube / Vimeo' ? 'Plays inside the LMS (YouTube privacy mode). The step completes after the minimum viewing time.'
      : md.type === 'H5P' ? 'In H5P use Embed and copy the address inside src="…". H5P.com and H5P.org show inside the LMS; other H5P sites open in a new tab unless added to EMBED_ORIGINS.'
      : md.type === 'Web link' ? (md.url && Embed.ok(md.url) ? 'This site will show inside the LMS.' : 'Opens in a new tab. Sites listed in EMBED_ORIGINS (config.js) show inside the LMS.') : '',
    modIsComp: !!MT.comp, modIsList: !!MT.list, modIsAsg: !!MT.asg, setMdComp: e => setMd({ comp: e.target.value }),
    mdLevelRows: (md.levels || []).map((l, i, all) => ({ n: l.n, min: i ? l.min : 0, first: i === 0, canDel: all.length > 2 && i > 0,
      setN: e => { const v = e.target.value; this.setState(st => { const lv = st.mod.levels.slice(); lv[i] = { ...lv[i], n: v }; return { mod: { ...st.mod, levels: lv, err:'' } }; }); },
      setMin: e => { const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)); this.setState(st => { const lv = st.mod.levels.slice(); lv[i] = { ...lv[i], min: v }; return { mod: { ...st.mod, levels: lv, err:'' } }; }); },
      del: () => setMd({ levels: md.levels.filter((_, j) => j !== i) }) })),
    mdAddLevel: () => { if ((md.levels || []).length >= 6) return this.toastMsg('Up to 6 levels'); const last = (md.levels || []).slice(-1)[0] || { min: 0 }; setMd({ levels: (md.levels || []).concat([{ n:'', min: Math.min(100, last.min + 10) }]) }); },
    mdListRows: (md.list || []).map((r, i) => ({ n: i + 1, t: r.t, set: e => { const v = e.target.value; this.setState(st => { const l = st.mod.list.slice(); l[i] = { t: v }; return { mod: { ...st.mod, list: l, err:'' } }; }); },
      del: () => { if (md.list.length === 1) return this.toastMsg('Keep at least one item'); setMd({ list: md.list.filter((_, j) => j !== i) }); } })),
    mdAddItem: () => { if ((md.list || []).length >= 30) return this.toastMsg('Up to 30 items'); setMd({ list: (md.list || []).concat([{ t:'' }]) }); },
    mdAllowLink: UI.toggle(md.allowLink !== false, () => setMd({ allowLink: md.allowLink === false })), modTypeBg: MT.bg || '', modTypeFg: MT.fg || '', modCanChange: !md.id && !md.scormBusy,
    modBackToPick: () => this.setState({ mod: { id:null, step:'pick', err:'' } }),
    modOpen: !!s.mod, md, modTitleLabel: md.id ? 'Edit module · ' + md.code : md.step === 'pick' ? 'Add a module' : 'New: ' + modLabel(md.type), closeMod: () => this.setState({ mod:null }),
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
    modHasFile: !!(md.file && (md.file.src || md.file.path)), modUpLabel: md.file && (md.file.src || md.file.path) ? 'Replace file' : 'Upload file', modFileLabel: md.file ? md.file.name + (md.file.size ? ' · ' + fmtSize(md.file.size) : '') : '',
    modPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (Backend.on && MT.pkg) {   // v41.9: the type is 'SCORM / xAPI' (was compared with 'SCORM', so packages were never extracted)
       e.target.value = ''; return pickScorm(f); } if (!MT.ok(f)) { e.target.value = ''; return setMd({ err: 'That file type isn’t supported for ' + md.type + '. Use ' + MT.hint + '.' }); } setMd({ file:{ src: Files.local(f, 'lcms'), name:f.name, size:f.size }, title: md.title || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }); },
    modClearFile: () => setMd({ file:null }),
    setMdTitle: e => setMd({ title: e.target.value }), setMdDesc: e => setMd({ desc: e.target.value }), setMdMins: e => setMd({ mins: Math.max(0, parseInt(e.target.value, 10) || 0) }), setMdUrl: e => setMd({ url: e.target.value }), setMdText: e => setMd({ text: e.target.value }),
    modQuizOpts: s.quizzes.map(z => ({ v: String(z.id), l: z.name + ' · ' + z.ids.length + ' questions' })), modQuizVal: String(md.quizId || ''), setMdQuiz: e => { const z = s.quizzes.find(x => x.id === Number(e.target.value)); setMd({ quizId: Number(e.target.value), title: md.title && !s.quizzes.some(x => x.name === md.title) ? md.title : (z ? z.name : '') }); },
    modQuizSummary: md.type === 'Assessment' ? modDetail(md) : '',
    buildQuizFromLcms: () => { this.setState({ mod:null, qFromLcms:true, quizDraft: { name:'', ids:[], pass:80, time:15, attempts:'2', shuffle:true, shuffleOpts:true, dynamic:false, drawCount:10, editId:null } }); this.go('qbank', { adminView:true, bankReturn:true, bankSel:{} }); this.toastMsg('Select questions, then bundle them into an assessment'); },
    modUsedNote: md.id && usedIn(md.id).length ? 'Used in ' + usedIn(md.id).map(c => c.title).join(', ') + '. Saving updates it in ' + (usedIn(md.id).length === 1 ? 'that course' : 'those courses') + '.' : '', modHasUsed: !!(md.id && usedIn(md.id).length),
    modErr: !!md.err,
    saveMod: () => {
      if (md.scormBusy) return setMd({ err:'Wait until the package has finished uploading.', scormBusy: md.scormBusy });
      const t = (md.title || '').trim();
      if (!t) return setMd({ err:'Give the module a title.' });
      if (MT.accept && !(md.file && (md.file.src || md.file.path))) return setMd({ err:'Upload the file (' + MT.hint + ').' });
      if (MT.link && !/^https:\/\/\S+\.\S+/.test((md.url || '').trim())) return setMd({ err:'Enter a full web address starting with https://' });
      if (md.type === 'YouTube / Vimeo' && !Embed.video(md.url)) return setMd({ err:'That isn’t a YouTube or Vimeo video link. Copy the address of the video page, e.g. https://www.youtube.com/watch?v=…' });
      if (MT.comp && !(md.comp || '').trim()) return setMd({ err:'Name the competency this test measures.' });
      if (MT.comp) { const lv = md.levels || []; if (lv.length < 2) return setMd({ err:'Add at least two levels.' });
        if (lv.some(l => !(l.n || '').trim())) return setMd({ err:'Give every level a name.' });
        if (lv.some((l, i) => i && l.min <= lv[i - 1].min)) return setMd({ err:'Each level must start at a higher score than the one before it.' }); }
      if (MT.list) { const l = (md.list || []).map(r => (r.t || '').trim()); if (!l.length || l.some(x => !x)) return setMd({ err:'Fill in every checklist item, or remove the empty ones.' }); }
      if (MT.asg && !(md.text || '').trim()) return setMd({ err:'Write the instructions for the learner.' });
      if (MT.quiz && !s.quizzes.some(z => z.id === md.quizId)) return setMd({ err:'Choose an assessment, or build a new one from the question bank.' });
      if (MT.text && !(md.text || '').trim()) return setMd({ err:'Write the statement learners agree to.' });
      if (MT.form) { const qs = (md.qs || []).map(q => ({ t: (q.t || '').trim(), kind: q.kind }));
        if (!qs.length) return setMd({ err:'Add at least one question.' });
        const bad = qs.findIndex(q => !q.t || q.t.length > 200); if (bad >= 0) return setMd({ err:'Question ' + (bad + 1) + ' is empty or longer than 200 characters.' });
        if (MT.kp && !md.applyAll && !(md.courses || []).length && !(md.trainings || []).length) return setMd({ err:'Choose the courses or trainings this form is sent for (or switch on “All courses”).' });
        if (MT.kp) { const clash = s.lcms.find(m => m.id !== md.id && m.type === 'Feedback form' && m.level === md.level && ((m.courses || []).some(x => (md.courses || []).includes(x)) || (m.trainings || []).some(x => (md.trainings || []).includes(x))));
          if (clash) return setMd({ err:'“' + clash.title + '” already sends an ' + md.level + ' form for some of the same courses or trainings. Remove them from one of the forms.' }); } }
      const clean = { id: md.id, code: md.code, type: md.type, title:t, desc:(md.desc || '').trim(), mins: md.mins || 0, file: MT.accept ? md.file : null, url: MT.link ? md.url.trim() : '', quizId: MT.quiz ? md.quizId : null, text: MT.text || MT.asg ? md.text.trim() : '', by: role.name, ownerEmp: md.ownerEmp || (Backend.on ? Backend.empOfName(role.name) : ''), updated: TODAY_KEY,
        ...(MT.form ? { qs: md.qs.map(q => ({ t: q.t.trim(), kind: q.kind })) } : {}),
        ...(MT.comp ? { comp: md.comp.trim(), levels: md.levels.map((l, i) => ({ n: l.n.trim(), min: i ? l.min : 0 })) } : {}), ...(MT.list ? { list: md.list.map(r => ({ t: r.t.trim() })) } : {}), ...(MT.asg ? { allowLink: md.allowLink !== false } : {}), ...(MT.kp ? { level: md.level, audience: md.audience, days: md.days, applyAll: !!md.applyAll, courses: md.courses || [], trainings: md.trainings || [] } : {}) };
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
