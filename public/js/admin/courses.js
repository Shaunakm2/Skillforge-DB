/* Skillforge LMS — Course catalog (admin) and the course pop-up editor. */
SkillforgeApp.prototype.amCourses = function (c) {
  const { INK, W, role, s, segs, tg } = c;
  // courses
  const featShort = { incorrect:'Shows incorrect answers', cert:'Certificate', mandatory:'Mandatory', ack:'Acknowledgment' };
  const AV_C = { Active:['#DCFCE7', '#166534'], Scheduled:['#DBEAFE', '#1E40AF'], Ended:['#EAF1F6', '#526B7A'], Inactive:['#FDECEC', '#A63232'] };
  const availNote = c => { const a = availability(c); return a === 'Scheduled' ? 'Goes live ' + fmtDateTime(c.availFrom) : a === 'Ended' ? 'Ended ' + fmtDateTime(c.availUntil) : a === 'Active' && c.availUntil ? 'Until ' + fmtDateTime(c.availUntil) : a === 'Inactive' ? 'Hidden from learners' : 'No end date'; };
  const adminCourseRows = s.adminCourses.map(c => ({ ...c, catLabel: (() => { const p = catPath(s.cats, c); return [p.cat, p.sub, p.subsub].filter(Boolean).join(' › ') || 'Uncategorized'; })(), hasIcon: !!(c.icon && c.icon.src), iconSrc: c.icon ? c.icon.src : '', noIcon: !(c.icon && c.icon.src), avail: availability(c), availBg: AV_C[availability(c)][0], availFg: AV_C[availability(c)][1], availNote: availNote(c), toggleLabel: c.active ? 'Deactivate' : 'Activate', toggleFg: c.active ? '#B91C1C' : '#166534', toggleActive: () => { this.setState(st => ({ adminCourses: st.adminCourses.map(x => x.id === c.id ? { ...x, active: !x.active } : x) })); this.toastMsg(c.title + (c.active ? ' deactivated · hidden from learners' : ' activated')); }, statusBg: c.status === 'Published' ? '#DCFCE7' : '#EAF1F6', statusFg: c.status === 'Published' ? '#166534' : '#334E68', itemsLabel: c.items.length + (c.items.length === 1 ? ' module' : ' modules'), approachLabel: c.features.linear ? 'Linear' : 'Non-linear', audLabel: c.aud || 'Assign later', chips: Object.keys(featShort).filter(k => c.features[k]).map(k => featShort[k]).concat(c.essential ? ['Essential · ' + c.essentialDays + ' working days'] : []).concat(c.recert !== 'Never' ? ['Recertify ' + c.recert] : []), enrolledFmt: fmt(c.enrolled), edit: () => this.setState({ cDraft: (d => ({ ...d, items: d.items.map((it, i) => ({ ...it, uid: Progress.stepUid(it, i) })) }))(JSON.parse(JSON.stringify(c))), cTab:'basics', cModQuery:'', cModType:'All', audQuery:'' }) }));
  const cd = s.cDraft || s.adminCourses[0];
  const setCd = patch => this.setState(st => ({ cDraft: { ...(st.cDraft || cd), ...patch } }));
  const cdCatObj = s.cats.find(x => x.id === cd.catId), cdSubObj = cdCatObj ? cdCatObj.subs.find(x => x.id === cd.subId) : null;
  const cdImg = key => { const m = cd[key]; return { has: !!(m && m.src), src: m ? m.src : '', name: m ? m.name : '', url: m && !m.uploaded ? m.src : '', pick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!f.type.startsWith('image/')) { e.target.value = ''; return this.toastMsg('Choose an image file'); } setCd({ [key]: { src: Files.local(f, 'courses'), name: f.name, uploaded:true } }); }, setUrl: e => setCd({ [key]: e.target.value.trim() ? { src: e.target.value.trim(), name: e.target.value.trim().split('/').pop(), uploaded:false } : null }), clear: () => setCd({ [key]: null }) }; };
  const KINDS = { survey:['☰', '#E0F2FE', '#0369A1', 'Survey'], lesson:['≡', '#E3F1EE', '#245E52', 'Lesson'], quiz:['?', '#FFEDD5', '#9A3412', 'Assessment'], scorm:['▦', '#DBEAFE', '#1E40AF', 'SCORM / xAPI'], ack:['✓', '#FCE7F3', '#9D174D', 'Acknowledgment'], pdf:['▤', '#FDECEC', '#A63232', 'Document'], doc:['▤', '#FDECEC', '#A63232', 'Document'], video:['▶', '#CCFBF1', '#115E59', 'Video'], audio:['♪', '#EDE9FE', '#5B21B6', 'Audio'], image:['▣', '#FEF3C7', '#92400E', 'Image'], link:['↗', '#E0F2FE', '#075985', 'Web link'] };
  const moveIt = (i, d) => { const j = i + d; if (j < 0 || j >= cd.items.length) return; const items = [...cd.items]; [items[i], items[j]] = [items[j], items[i]]; setCd({ items }); };
  const cItems = cd.items.map((it, i) => { const k = KINDS[it.kind] || KINDS.lesson, m = it.moduleId ? s.lcms.find(x => x.id === it.moduleId) : null, z = it.kind === 'quiz' ? s.quizzes.find(x => x.id === it.quizId) : null;
    return { n:i + 1, title: m ? m.title : z ? z.name : it.title, editable: !m && it.kind === 'lesson', fixed: !!m || it.kind !== 'lesson', glyph:k[0], gBg:k[1], gFg:k[2],
      kindLabel: (m ? m.type + ' · ' + m.code : k[3]) + (z ? ' · pass ' + z.pass + '%' : '') + (it.mins ? ' · ' + it.mins + ' min' : ''),
      step: cd.features.linear ? 'STEP ' + (i + 1) : 'ANY ORDER', locked: cd.features.linear && i > 0,
      setTitle: e => setCd({ items: cd.items.map((x, j) => j === i ? { ...x, title:e.target.value } : x) }), remove: () => setCd({ items: cd.items.filter((_, j) => j !== i) }),
      up: () => moveIt(i, -1), down: () => moveIt(i, 1), isFirst: i === 0, isLast: i === cd.items.length - 1 }; });
  // module picker (from LCMS)
  const cmq = s.cModQuery.trim().toLowerCase();
  const cModRows = s.lcms.filter(m => m.type !== 'Feedback form' && (s.cModType === 'All' || m.type === s.cModType) && (!cmq || (m.title + ' ' + m.code + ' ' + m.type).toLowerCase().includes(cmq))).map(m => { const T = MOD_TYPES[m.type], added = cd.items.some(it => it.moduleId === m.id);
    return { title:m.title, code:m.code, type:m.type, glyph:T.glyph, gBg:T.bg, gFg:T.fg, mins:(m.mins || 0) + ' min', added, notAdded: !added, add: () => { if (!added) setCd({ items: cd.items.concat([{ ...itemFromModule(m), uid: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }]) }); } }; });
  const AUDS = ['Everyone', 'Departments', 'User groups', 'Specific people', 'Assign later'];
  const activeUsers2 = s.users.filter(u => u.status !== 'Deactivated');
  const audTargets = c => { const a = c.aud || 'Assign later';
    if (a === 'Everyone') return activeUsers2.map(u => u.name);
    if (a === 'Departments') return activeUsers2.filter(u => (c.depts || {})[u.dept]).map(u => u.name);
    if (a === 'User groups') return Array.from(new Set(s.groups.filter(g => (c.groups || {})[g.id]).flatMap(g => g.members))).filter(n => activeUsers2.some(u => u.name === n));
    if (a === 'Specific people') return activeUsers2.filter(u => (c.people || {})[u.name]).map(u => u.name);
    return []; };
  const audN = audTargets(cd).length;
  const aq = s.audQuery.trim().toLowerCase();
  const audVals = {
    audOpts: segs(cd.aud || 'Assign later', AUDS, v => setCd({ aud:v })),
    audDepts: (cd.aud || '') === 'Departments', audGroups: cd.aud === 'User groups', audPeople: cd.aud === 'Specific people',
    audHint: { Everyone:'Everyone in the organisation with an active account (' + activeUsers2.length + ' people).', Departments:'Everyone in the selected departments.', 'User groups':'Members of the selected groups.', 'Specific people':'Only the people you pick.', 'Assign later':'Not assigned on publish. Assign people later from Users or the Gradebook.' }[cd.aud || 'Assign later'],
    audCount: (cd.aud || 'Assign later') === 'Assign later' ? '' : audN + (audN === 1 ? ' person' : ' people') + ' will be assigned when you publish', hasAudCount: (cd.aud || 'Assign later') !== 'Assign later',
    groupChips: s.groups.map(g => { const on = !!(cd.groups || {})[g.id]; return { label: g.name + ' · ' + g.members.length, bg: on ? '#CCFBF1' : W, border: on ? '#08AE6E' : '#C9D7E2', pick: () => setCd({ groups: { ...(cd.groups || {}), [g.id]: !on } }) }; }),
    audQuery: s.audQuery, setAudQuery: e => this.setState({ audQuery: e.target.value }),
    peopleChips: activeUsers2.filter(u => !aq || (u.name + ' ' + u.dept + ' ' + (u.empId || '')).toLowerCase().includes(aq)).map(u => { const on = !!(cd.people || {})[u.name]; return { label: u.name, sub: u.dept, bg: on ? '#CCFBF1' : W, border: on ? '#08AE6E' : '#C9D7E2', pick: () => setCd({ people: { ...(cd.people || {}), [u.name]: !on } }) }; }),
    approachOpts: segs(cd.features.linear ? 'Linear' : 'Non-linear', ['Linear', 'Non-linear'], v => setCd({ features: { ...cd.features, linear: v === 'Linear' } })),
    approachHint: cd.features.linear ? 'Each step unlocks after the one before it is finished.' : 'Learners can open the steps in any order.',
    completionNote: (() => { const zs = cd.items.filter(x => x.kind === 'quiz').map(x => s.quizzes.find(q => q.id === x.quizId)).filter(Boolean); if (!cd.items.length) return 'Add steps of any type, in any order and as many as you need. The course completes when every step is done.'; return zs.length === 1 ? 'Complete when every step is done and the learner passes “' + zs[0].name + '” (' + zs[0].pass + '%).' : zs.length ? 'Complete when every step is done and the learner passes all ' + zs.length + ' assessments.' : 'Complete when every step is done. Add a quiz if learners must pass an assessment.'; })(),
    setCdAuthor: e => setCd({ author: e.target.value }), setCdDirector: e => setCd({ director: e.target.value }), setCdAbout: e => setCd({ about: e.target.value }),
  };
  const nextCode = () => 'CRS-' + (Math.max(1000, ...s.adminCourses.map(c => parseInt((c.code || '').slice(4), 10) || 0)) + 1);
  const ccq = s.ccQuery.trim().toLowerCase();
  const isAct = c => availability(c) === 'Active';
  const ccMatch = c => !ccq || (c.title + ' ' + (c.code || '') + ' ' + c.catLabel + ' ' + (c.author || '')).toLowerCase().includes(ccq);
  const ccRows = adminCourseRows.filter(c => ccMatch(c) && (s.ccFilter === 'All' || (s.ccFilter === 'Active' ? isAct(c) : !isAct(c))));
  const csvCell = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const exportCourses = () => {
    const head = ['Course ID', 'Title', 'Category', 'Status', 'Availability', 'Live from', 'Live until', 'Modules', 'Learning approach', 'Assigned to', 'Enrolled', 'Author', 'Director', 'Due date'];
    const rows = ccRows.map(c => [c.code, c.title, c.catLabel, c.status, c.avail, c.availFrom ? fmtDateTime(c.availFrom) : '', c.availUntil ? fmtDateTime(c.availUntil) : '', c.items.length, c.features.linear ? 'Linear' : 'Non-linear', c.aud || 'Assign later', c.enrolled, c.author || '', c.director || '', c.due || '']);
    const csv = '\ufeff' + [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'skillforge-courses-' + TODAY_KEY + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toastMsg(ccRows.length + (ccRows.length === 1 ? ' course' : ' courses') + ' exported');
  };
  const CTABS = [['basics', 'Basics'], ['modules', 'Modules'], ['assign', 'Assignment'], ['settings', 'Availability & rules']];
  const ctIdx = CTABS.findIndex(t => t[0] === s.cTab);
  const ccVals = {
    ccRows, ccEmpty: ccRows.length === 0, ccQuery: s.ccQuery, setCcQuery: e => this.setState({ ccQuery: e.target.value }), exportCourses,
    ccChips: [['All', s.adminCourses.length], ['Active', s.adminCourses.filter(isAct).length], ['Inactive', s.adminCourses.filter(c => !isAct(c)).length]].map(([k, n]) => { const on = s.ccFilter === k; return { label: k + ' · ' + n, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => this.setState({ ccFilter:k }) }; }),
    ccSummary: ccRows.length + ' of ' + s.adminCourses.length + ' courses' + (s.ccFilter === 'Inactive' ? ' · inactive means switched off, scheduled or ended' : ''),
    cModal: !!s.cDraft && s.screen === 'courseAdmin', closeCourse: () => this.setState({ cDraft:null }), cdCode: cd.code || nextCode(), cdIsNew: !cd.id,
    cTabs: CTABS.map(([id, label], i) => { const on = s.cTab === id; return { n: i + 1, label: label + (id === 'modules' ? ' · ' + cd.items.length : ''), on, bg: on ? INK : 'transparent', fg: on ? '#F8FBFD' : '#334E68', pick: () => this.setState({ cTab:id }) }; }),
    ctBasics: s.cTab === 'basics', ctModules: s.cTab === 'modules', ctAssign: s.cTab === 'assign', ctSettings: s.cTab === 'settings',
    ctHasPrev: ctIdx > 0, ctHasNext: ctIdx < CTABS.length - 1, ctPrev: () => this.setState({ cTab: CTABS[Math.max(0, ctIdx - 1)][0] }), ctNext: () => this.setState({ cTab: CTABS[Math.min(CTABS.length - 1, ctIdx + 1)][0] }),
    cModRows, cModEmpty: cModRows.length === 0, cModQuery: s.cModQuery, setCModQuery: e => this.setState({ cModQuery: e.target.value }),
    cModTypes: [{ v:'All', l:'All types' }].concat(Object.keys(MOD_TYPES).map(t => ({ v:t, l:t }))), cModType: s.cModType, setCModType: e => this.setState({ cModType: e.target.value }),
    goLcms: () => { this.go('lcms', { adminView:true }); this.toastMsg('Your course draft is kept. Return to Course catalog to continue.'); },
    cdEssential: tg(cd.essential, () => setCd({ essential: !cd.essential, essentialDays: cd.essentialDays || 30, essentialFrom: cd.essential ? cd.essentialFrom : (cd.essentialFrom || TODAY_KEY) })),
    cdEssOn: !!cd.essential, setCdEssDays: e => setCd({ essentialDays: e.target.value === '' ? '' : parseInt(e.target.value, 10) }), setCdEssFrom: e => setCd({ essentialFrom: e.target.value }),
    cdEssNote: cd.essential ? 'People who joined on or after the start date must finish this course within ' + (cd.essentialDays || '…') + ' working days of joining (weekends and holidays don’t count). They’re assigned automatically, with that deadline as the due date. If they miss it, they see a reminder pop-up every time they sign in.' : 'Off. Turn on to require new joiners to finish this course within a set number of working days.',
    cdAutoNew: tg(cd.autoNew, () => setCd({ autoNew: !cd.autoNew })), autoNewShown: ['Everyone', 'Departments'].includes(cd.aud),
    featRowsModal: FEAT.filter(([k]) => k !== 'linear').map(([k, label, desc]) => ({ label, desc, ...tg(cd.features[k], () => setCd({ features: { ...cd.features, [k]: !cd.features[k] } })) })),
  };
  const saveCourseAs = status => {
    if (!cd.title.trim()) { this.setState({ cTab:'basics' }); return this.toastMsg('Add a course title first'); }
    // A title clash blocks a new title only: a course that already shared its title (imported or migrated data) can still be edited.
    const oldT = ((s.adminCourses.find(x => x.id === cd.id) || {}).title || '').trim().toLowerCase();
    if (cd.title.trim().toLowerCase() !== oldT && s.adminCourses.some(c => c.id !== cd.id && c.title.trim().toLowerCase() === cd.title.trim().toLowerCase())) return this.toastMsg('Another course already uses this title');
    if (!cd.catId) return this.toastMsg('Choose a category');
    if (status === 'Published' && !cd.items.length) { this.setState({ cTab:'modules' }); return this.toastMsg('Add at least one module before publishing'); }
    if (status === 'Published' && cd.aud === 'Specific people' && !audN) { this.setState({ cTab:'assign' }); return this.toastMsg('Pick at least one person, or choose “Assign later”'); }
    if (cd.essential && !(cd.essentialDays >= 1 && cd.essentialDays <= 365)) { this.setState({ cTab:'assign' }); return this.toastMsg('Set the essential-training window: 1 to 365 working days'); }
    if (status === 'Published' && cd.aud !== 'Assign later' && (!cd.due || cd.due < TODAY_KEY)) { this.setState({ cTab:'assign' }); return this.toastMsg('The due date is in the past: everyone would be overdue on day one. Pick a date from today on.'); }
    if (cd.availFrom && cd.availUntil && new Date(cd.availUntil) <= new Date(cd.availFrom)) { this.setState({ cTab:'settings' }); return this.toastMsg('“Live until” must be after “Live from”'); }
    const id = cd.id || 'c' + Date.now(), code = cd.code && !s.adminCourses.some(x => x.id !== cd.id && x.code === cd.code) ? cd.code : nextCode();
    const c = { ...cd, id, code, status, cat: (s.cats.find(x => x.id === cd.catId) || {}).name || cd.cat };
    const exists = s.adminCourses.some(x => x.id === id);
    // Steps moved, removed or inserted on a course people have already worked on: their records follow their steps.
    let remap = { patch: {}, people: 0, dropped: 0 };
    if (exists) { const old = s.adminCourses.find(x => x.id === id), sm = Progress.stepMap(old.items, c.items);
      if (!sm.identity) { remap = Progress.remapCourse(s, id, sm.map);
        if (remap.people && Backend.on && (Backend.me() || {}).role !== 'Admin') return this.toastMsg('People have progress on this course. Reordering or removing steps must be done by an admin, so their records can be moved with the steps.'); } }
    c.items = c.items.map((it, i) => ({ ...it, uid: Progress.stepUid(it, i) }));
    const quizzes = s.quizzes.map(z => cd.items.some(it => it.kind === 'quiz' && it.quizId === z.id) ? { ...z, course: c.title } : z);
    // Publishing assigns the course to its audience (existing due dates are kept).
    const targets = status === 'Published' ? audTargets(c) : [], enroll = { ...s.enroll };
    targets.forEach(n => { if (!(enroll[n] || {})[id]) enroll[n] = { ...(enroll[n] || {}), [id]: c.due }; });
    // Essential for new joiners: everyone covered by the rule is assigned with their deadline as the due date.
    if (c.essential && !c.essentialFrom) c.essentialFrom = TODAY_KEY;
    const ess = Essentials.apply(enroll, [c], s.users, s.holidays, s.assignedOn);
    if (!exists) c.enrolled = targets.length + ess.added;
    this.setState({ ...remap.patch, adminCourses: exists ? s.adminCourses.map(x => x.id === id ? c : x) : [c].concat(s.adminCourses), quizzes, cDraft:null, enroll: ess.enroll, assignedOn: ess.assignedOn, ccFilter:'All', ccQuery:'' });
    const moved = remap.people ? ' · progress of ' + remap.people + (remap.people === 1 ? ' person' : ' people') + ' moved with the steps' + (remap.dropped ? ' (' + remap.dropped + ' completion' + (remap.dropped === 1 ? '' : 's') + ' of removed steps no longer count)' : '') : '';
    this.logAudit(status === 'Published' ? 'Published course' : 'Saved course draft', c.code + ' · ' + c.title);
    this.toastMsg((status === 'Published' ? c.code + ' · ' + c.title + ' published' + (targets.length ? ' · assigned to ' + targets.length + (targets.length === 1 ? ' person' : ' people') : '') : c.code + ' · ' + c.title + ' saved as draft') + moved);
  };
  return {
    adminCourseRows,
    adminCourseCount: s.adminCourses.length,
    newCourse: () => this.setState({ cTab:'basics', cModQuery:'', cModType:'All', audQuery:'', cDraft: { id:null, code: nextCode(), title:'', author: role.name, director:'', about:'', aud:'Assign later', autoNew:false, essential:false, essentialDays: +((s.platform || PLATFORM0).defaults.essDays) || 30, essentialFrom:'', groups:{}, people:{}, cat:'Leadership', catId:'c1', subId:'c1a', subsubId:'c1a1', active:true, availFrom:'', availUntil:'', icon:null, banner:null, desc:'', color:'#08AE6E', status:'Draft', enrolled:0, items:[], features: { ...blankFeatures(), linear:true }, reports:{ learning:true, completion:true, progress:true, login:false, coursewise:true }, depts:{}, due: defaultDue(s), enroll:'Manual', recert:'Never', lang:'English' } }),
    ...ccVals,
    cd,
    courseFormLabel: cd.id ? 'EDIT COURSE' : 'NEW COURSE',
    cdTitleShown: cd.title.trim() || 'Untitled course',
    cdStatus: cd.id ? cd.status : 'Draft · not saved yet',
    cdStatusBg: cd.status === 'Published' ? '#DCFCE7' : '#EAF1F6',
    cdStatusFg: cd.status === 'Published' ? '#166534' : '#334E68',
    setCdTitle: e => setCd({ title: e.target.value }),
    setCdDesc: e => setCd({ desc: e.target.value }),
    setCdCat: e => setCd({ cat: e.target.value }),
    setCdDue: e => setCd({ due: e.target.value }),
    cdCatOpts: s.cats.map(c => ({ v:c.id, l:c.name })),
    cdSubOpts: [{ v:'', l: cdCatObj && cdCatObj.subs.length ? 'Choose…' : 'None yet' }].concat(cdCatObj ? cdCatObj.subs.map(x => ({ v:x.id, l:x.name })) : []),
    cdSubSubOpts: [{ v:'', l: cdSubObj && cdSubObj.subs.length ? 'Choose…' : 'None yet' }].concat(cdSubObj ? cdSubObj.subs.map(x => ({ v:x.id, l:x.name })) : []),
    setCdCatId: e => { const c = s.cats.find(x => x.id === e.target.value); const sb = c && c.subs[0]; setCd({ catId: e.target.value, cat: c ? c.name : '', subId: sb ? sb.id : '', subsubId: sb && sb.subs[0] ? sb.subs[0].id : '' }); },
    setCdSubId: e => { const sb = cdCatObj && cdCatObj.subs.find(x => x.id === e.target.value); setCd({ subId: e.target.value, subsubId: sb && sb.subs[0] ? sb.subs[0].id : '' }); },
    setCdSubSubId: e => setCd({ subsubId: e.target.value }),
    manageCats: () => this.go('categories', { adminView:true }),
    cdActive: tg(cd.active, () => setCd({ active: !cd.active })),
    setCdFrom: e => setCd({ availFrom: e.target.value }),
    setCdUntil: e => setCd({ availUntil: e.target.value }),
    clearCdFrom: () => setCd({ availFrom:'' }),
    clearCdUntil: () => setCd({ availUntil:'' }),
    cdAvail: availability(cd),
    cdAvailBg: AV_C[availability(cd)][0],
    cdAvailFg: AV_C[availability(cd)][1],
    cdAvailNote: availNote(cd),
    cdImgFields: [{ label:'Course icon', hint:'Square image, at least 128 × 128 px', kind:'icon', m: cdImg('icon') }, { label:'Banner image', hint:'Wide image, about 1600 × 500 px', kind:'banner', m: cdImg('banner') }],
    cdSwatches: VIVIDS.map(c => ({ c, ring: cd.color === c ? INK : 'transparent', pick: () => setCd({ color:c }) })),
    cItems,
    cEmpty: cd.items.length === 0,
    linearNote: cd.features.linear ? 'Linear: learners unlock each item in this order.' : 'Open order: learners can start any item.',
    ...audVals,
    cQuizOptions: s.quizzes.map(z => ({ id:z.id, name:z.name })),
    cQuizPick: s.cQuizPick,
    setCQuizPick: e => this.setState({ cQuizPick: Number(e.target.value) }),
    featRows: FEAT.map(([k, label, desc]) => ({ label, desc, ...tg(cd.features[k], () => setCd({ features: { ...cd.features, [k]: !cd.features[k] } })) })),
    courseRepRows: COURSE_REPS.map(([k, label]) => ({ label, ...tg(cd.reports[k], () => setCd({ reports: { ...cd.reports, [k]: !cd.reports[k] } })) })),
    deptChips: DEPTS.map(dp => { const on = !!cd.depts[dp]; return { label:dp, bg: on ? '#CCFBF1' : W, border: on ? '#08AE6E' : '#C9D7E2', pick: () => setCd({ depts: { ...cd.depts, [dp]: !on } }) }; }),
    enrollOpts: segs(cd.enroll, ['Manual', 'Role-based', 'On hire'], v => setCd({ enroll:v })),
    enrollHint: { 'Manual':'You assign people or departments.', 'Role-based':'Everyone in the selected departments, including future joiners.', 'On hire':'New accounts are enrolled on their start date.' }[cd.enroll],
    recertOpts: segs(cd.recert, ['Never', '12 months', '24 months'], v => setCd({ recert:v })),
    langOpts: segs(cd.lang, ['English', 'Spanish', 'German', 'Hindi'], v => setCd({ lang:v })),
    saveDraftCourse: () => saveCourseAs('Draft'),
    publishCourse: () => saveCourseAs('Published'),
    publishLabel2: cd.status === 'Published' ? 'Save changes' : 'Save & publish',
  };
};
