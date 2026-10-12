/* Skillforge LMS — Settings › Migration (admins).
 *  Data migration report   Every change received from HRMS or other API providers between two dates; download as CSV.
 *  Migrate to Skillforge   Upload course completions and other learning records from another LMS (CSV),
 *                          with a rejected-rows file listing the reason for each row that wasn't imported.
 *  Migrate out             Download every dataset (users, courses, modules, assignments, completions, attempts,
 *                          batches, question bank, LCMS, imported history) as CSV files.
 */
const MIG_HEAD = ['Employee ID', 'Email', 'Course code', 'External course name', 'Source LMS', 'Status', 'Started on (YYYY-MM-DD)', 'Completed on (YYYY-MM-DD)', 'Score %', 'Certificate ID'];
const MIG_STATUS = ['Completed', 'In progress', 'Not started'];
const MIG_COUNT = {
  users: s => s.users.length, courses: s => s.adminCourses.length, modules: s => s.adminCourses.reduce((t, a) => t + a.items.length, 0),
  assignments: s => Object.values(s.enroll).reduce((t, m) => t + Object.keys(m || {}).length, 0),
  completions: s => Object.values(s.enroll).reduce((t, m) => t + Object.keys(m || {}).reduce((x, cid) => x + ((Progress.courseOf(s, cid) || { items:[] }).items.length), 0), 0),
  questions: s => s.qs.length, lcms: s => s.lcms.length, history: s => s.extHistory.length,
};

SkillforgeApp.prototype.amMigration = function (c) {
  const { s, role, W, INK } = c;
  const scr = this._scrV;
  if (scr !== 'migReport' && scr !== 'migrate') return { isMigReport:false, isMigrate:false };
  const chip = (cur, v, label, pick) => UI.chip(cur, v, label, pick);
  const fmtT = t => { const d = new Date(t); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); };
  const fmtD = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  const ST = { Applied:['#DCFCE7', '#166534'], Skipped:['#EAF1F6', '#526B7A'], Failed:['#FDECEC', '#A63232'] };

  // ---- data migration report ----
  const R = s.mr, setR = patch => this.setState(st => ({ mr: { ...st.mr, ...patch } }));
  const badRange = R.from && R.to && R.from > R.to;
  const inRange = x => !badRange && (!R.from || x.at.slice(0, 10) >= R.from) && (!R.to || x.at.slice(0, 10) <= R.to);
  const ranged = s.syncLog.filter(inRange);
  const shown = ranged.filter(x => (R.source === 'All' || x.source === R.source) && (R.type === 'All' || x.type === R.type) && (R.status === 'All' || x.status === R.status)).slice().reverse();
  const bySource = SYNC_SOURCES.map(src => ({ label: src, n: ranged.filter(x => x.source === src).length })).map(x => ({ ...x, w: ranged.length ? Math.max(2, Math.round(x.n / ranged.length * 100)) + '%' : '0%' }));
  const preset = days => () => { const d = new Date(TODAY_KEY + 'T12:00:00'); d.setDate(d.getDate() - days); setR({ from: dateKey(d), to: TODAY_KEY }); };
  const reportVals = {
    mr: R, mrBad: badRange, setMrFrom: e => setR({ from: e.target.value }), setMrTo: e => setR({ to: e.target.value }),
    mrPresets: [['Last 7 days', 7], ['Last 30 days', 30], ['Last 90 days', 90]].map(([l, d]) => ({ label: l, pick: preset(d) })),
    mrSourceOpts: [{ v:'All', l:'All sources' }].concat(SYNC_SOURCES.map(v => ({ v, l:v }))), setMrSource: e => setR({ source: e.target.value }),
    mrTypeOpts: [{ v:'All', l:'All change types' }].concat(SYNC_TYPES.map(v => ({ v, l:v }))), setMrType: e => setR({ type: e.target.value }),
    mrStatusChips: ['All', 'Applied', 'Skipped', 'Failed'].map(v => chip(R.status, v, v === 'All' ? 'All · ' + ranged.length : v + ' · ' + ranged.filter(x => x.status === v).length, () => setR({ status:v }))),
    mrTiles: [['Changes received', ranged.length, INK], ['Applied', ranged.filter(x => x.status === 'Applied').length, '#166534'], ['Skipped', ranged.filter(x => x.status === 'Skipped').length, '#526B7A'], ['Failed', ranged.filter(x => x.status === 'Failed').length, '#A63232'], ['People affected', new Set(ranged.map(x => x.empId)).size, '#0369A1']].map(([l, v, col]) => ({ l, v, c: col })),
    mrBySource: bySource,
    mrRows: shown.slice(0, 100).map(x => ({ ...x, when: fmtT(x.at), sBg: ST[x.status][0], sFg: ST[x.status][1], hasNote: !!x.note, fromLabel: x.from || '—', toLabel: x.to || '—' })),
    mrEmpty: !shown.length, mrCount: shown.length > 100 ? 'Showing the latest 100 of ' + shown.length + ' changes. The download has all of them.' : shown.length + (shown.length === 1 ? ' change' : ' changes'),
    mrRangeLabel: badRange ? 'The “from” date is after the “to” date.' : fmtD(R.from) + ' – ' + fmtD(R.to),
    mrDownload: () => {
      if (badRange) return this.toastMsg('Fix the dates first: “from” is after “to”');
      if (!shown.length) return this.toastMsg('No changes in this range to download');
      csvDownload('data-migration-report-' + (R.from || 'start') + '-to-' + (R.to || TODAY_KEY) + '.csv', [['Received at', 'Source', 'Sync run', 'Change type', 'Employee ID', 'Name', 'Field', 'Before', 'After', 'Result', 'Note']]
        .concat(shown.slice().reverse().map(x => [x.at.replace('T', ' '), x.source, x.run, x.type, x.empId, x.name, x.field, x.from, x.to, x.status, x.note])));
      this.toastMsg('Data migration report downloaded · ' + shown.length + ' changes');
    },
  };

  // ---- migrate in: learning records from another LMS ----
  const M = s.mgIn || {};
  const setM = patch => this.setState(st => ({ mgIn: { ...st.mgIn, ...patch } }));
  const dateOk = realDate;
  const importFile = () => {
    if (!M.text) return setM({ msg:'Choose a file first.' });
    const rows = parseCsv(M.text); if (!rows.length) return setM({ msg:'The file is empty.' });
    const head = rows[0].map(h => h.trim().toLowerCase()), col = n => head.findIndex(h => h.startsWith(n));
    const I = { emp: col('employee id'), mail: col('email'), code: col('course code'), ext: col('external course'), src: col('source'), st: col('status'), from: col('started'), to: col('completed'), sc: col('score'), cert: col('certificate') };
    if ((I.emp < 0 && I.mail < 0) || I.st < 0 || I.src < 0 || (I.code < 0 && I.ext < 0)) return setM({ msg:'The header row must include Employee ID or Email, Course code or External course name, Source LMS and Status. Download the template to see the format.' });
    if (rows.length === 1) return setM({ msg:'The file has a header row but no data rows.' });
    const ok = [], bad = [], seen = {};
    rows.slice(1).forEach((r, i) => {
      const n = i + 2, g = k => k < 0 ? '' : (r[k] || '').trim(), rej = why => bad.push({ n, raw: MIG_HEAD.map((_, j) => g([I.emp, I.mail, I.code, I.ext, I.src, I.st, I.from, I.to, I.sc, I.cert][j])), why });
      const emp = g(I.emp), mail = g(I.mail).toLowerCase(), code = g(I.code), ext = g(I.ext), src = g(I.src), status = MIG_STATUS.find(x => x.toLowerCase() === g(I.st).toLowerCase()), from = g(I.from), to = g(I.to), scRaw = g(I.sc);
      if (!emp && !mail) return rej('Employee ID or email is required');
      const byE = emp ? s.users.find(u => (u.empId || '').toLowerCase() === emp.toLowerCase()) : null, byM = mail ? s.users.find(u => u.email.toLowerCase() === mail) : null;
      if (emp && !byE) return rej('No user with employee ID ' + emp);
      if (mail && !byM) return rej('No user with email ' + g(I.mail));
      if (byE && byM && byE.id !== byM.id) return rej('Employee ID and email belong to different users');
      const u = byE || byM;
      let course = null;
      if (code) { course = s.adminCourses.find(a => (a.code || '').toLowerCase() === code.toLowerCase()); if (!course) return rej('No Skillforge course with code ' + code); }
      else if (!ext) return rej('Give a Skillforge course code or the external course name');
      if (!src) return rej('Source LMS is required');
      if (!status) return rej('Status must be Completed, In progress or Not started');
      if (from && !dateOk(from)) return rej('Started on must be YYYY-MM-DD');
      if (to && !dateOk(to)) return rej('Completed on must be YYYY-MM-DD');
      if (status === 'Completed' && !to) return rej('Completed records need a completion date');
      if (to && to > TODAY_KEY) return rej('Completion date ' + to + ' is in the future');
      if (from && to && from > to) return rej('Started on is after completed on');
      const sc = scRaw === '' ? '' : Number(scRaw); if (scRaw !== '' && (isNaN(sc) || sc < 0 || sc > 100)) return rej('Score must be a number from 0 to 100');
      const key = u.id + '|' + (course ? course.id : ext.toLowerCase());
      if (seen[key]) return rej('Duplicate of row ' + seen[key]);
      if (s.extHistory.some(x => x.user === u.name && (course ? x.courseId === course.id : x.extCourse.toLowerCase() === ext.toLowerCase()))) return rej(u.name + ' already has an imported record for this course');
      seen[key] = n;
      ok.push({ id:'ex' + Date.now() + '-' + n, user: u.name, empId: u.empId, courseId: course ? course.id : null, courseCode: course ? course.code : '', extCourse: course ? course.title : ext, source: src, status, startedOn: from, completedOn: to, score: sc, certId: g(I.cert), importedOn: TODAY_KEY, importedBy: role.name });
    });
    this.setState(st => ({ extHistory: st.extHistory.concat(ok), mgIn: { ...st.mgIn, msg:'', result:{ total: rows.length - 1, ok: ok.length, people: new Set(ok.map(x => x.user)).size, linked: ok.filter(x => x.courseId).length, bad } } }));
  };
  const xq = (s.mgOut.q || '').trim().toLowerCase();
  const hist = s.extHistory.filter(x => !xq || (x.user + ' ' + x.empId + ' ' + x.extCourse + ' ' + x.courseCode + ' ' + x.source).toLowerCase().includes(xq)).slice().reverse();
  const MR = M.result;
  const inVals = {
    mgTemplate: () => { const us = s.users.filter(u => u.role === 'Learner').slice(0, 3);
      const U = i => us[i] || us[0] || { empId:'EMP-0001', email:'name@company.com' };   // v41.5: works before any users exist
      csvDownload('lms-migration-template.csv', [MIG_HEAD, [U(0).empId, '', 'CRS-1003', '', 'Cornerstone OnDemand', 'Completed', '2025-04-01', '2025-04-12', '86', 'CSOD-90012'], ['', U(1).email, '', 'Anti-bribery and corruption', 'SAP Litmos', 'Completed', '2025-01-10', '2025-01-11', '', 'LIT-2231'], [U(2).empId, '', '', 'Advanced Excel', 'Moodle', 'In progress', '2026-08-01', '', '', '']]);
      this.toastMsg('Template downloaded'); },
    mgFileName: M.name || '', mgNoFile: !M.text, mgMsg: M.msg || '', mgHasMsg: !!M.msg,
    mgPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/\.csv$/i.test(f.name)) { e.target.value = ''; return setM({ name:'', text:'', msg:'Upload a .csv file. In Excel, use File › Save As › CSV.' }); } f.text().then(t => setM({ name: f.name, text: t, msg:'', result:null })); },
    mgImport: importFile, mgHasResult: !!MR,
    mgRes: MR ? { okLine: MR.ok ? MR.ok + (MR.ok === 1 ? ' record imported' : ' records imported') + ' for ' + MR.people + (MR.people === 1 ? ' person' : ' people') + (MR.linked ? ' · ' + MR.linked + ' matched to Skillforge courses (they now count as completed there)' : '') + '.' : 'Nothing was imported.',
      hasOk: MR.ok > 0, hasBad: MR.bad.length > 0, badLine: MR.bad.length + ' of ' + MR.total + (MR.total === 1 ? ' row' : ' rows') + ' not imported.',
      badRows: MR.bad.slice(0, 5).map(x => ({ n: 'Row ' + x.n, why: x.why })), more: MR.bad.length > 5 ? '+ ' + (MR.bad.length - 5) + ' more in the download' : '' } : {},
    mgRejects: () => { csvDownload('lms-migration-rejected-' + TODAY_KEY + '.csv', [['Row'].concat(MIG_HEAD).concat(['Reason'])].concat(MR.bad.map(x => [x.n].concat(x.raw).concat([x.why])))); this.toastMsg(MR.bad.length + ' rejected rows downloaded'); },
    mgReset: () => this.setState({ mgIn:{} }),
    mgQ: s.mgOut.q || '', setMgQ: e => this.setState({ mgOut: { ...s.mgOut, q: e.target.value } }),
    mgHist: hist.slice(0, 50).map(x => ({ ...x, linkLabel: x.courseId ? x.courseCode + ' · ' + x.extCourse : x.extCourse, linked: !!x.courseId, scoreLabel: x.score === '' ? '—' : x.score + '%', doneLabel: fmtD(x.completedOn), sBg: x.status === 'Completed' ? '#DCFCE7' : '#EAF1F6', sFg: x.status === 'Completed' ? '#166534' : '#334E68' })),
    mgHistEmpty: !hist.length, mgHistCount: s.extHistory.length + (s.extHistory.length === 1 ? ' imported record' : ' imported records'),
  };

  // ---- migrate out: every dataset as CSV ----
  const DS = [
    ['users', 'Users', 'Accounts, user types, departments and joining dates', () => [['Employee ID', 'Name', 'Email', 'Phone', 'User type', 'Department', 'Designation', 'Manager', 'Status', 'Date of joining', 'Gender', 'Terms accepted']].concat(s.users.map(u => [u.empId, u.name, u.email, u.phone, u.role, u.dept, u.designation, u.manager, u.status, u.joined, u.gender, u.terms ? 'Yes' : 'No']))],
    ['courses', 'Courses', 'Every course with category, availability and rules', () => [['Course ID', 'Title', 'Category', 'Status', 'Availability', 'Modules', 'Learning approach', 'Learners can mark complete', 'Essential for new joiners', 'Essential within (working days)', 'Author', 'Director']].concat(s.adminCourses.map(a => { const p = catPath(s.cats, a); return [a.code, a.title, [p.cat, p.sub, p.subsub].filter(Boolean).join(' > '), a.status, availability(a), a.items.length, a.features.linear ? 'Linear' : 'Non-linear', a.features.selfComplete ? 'Yes' : 'No', a.essential ? 'Yes' : 'No', a.essential ? a.essentialDays : '', a.author || '', a.director || '']; }))],
    ['modules', 'Course modules', 'The steps of every course, in order', () => [['Course ID', 'Step', 'Module ID', 'Title', 'Type', 'Minutes']].concat(s.adminCourses.flatMap(a => a.items.map((it, i) => { const m = it.moduleId ? s.lcms.find(x => x.id === it.moduleId) : null, z = it.kind === 'quiz' ? s.quizzes.find(q => q.id === it.quizId) : null; return [a.code, i + 1, m ? m.code : '', m ? m.title : z ? z.name : it.title, it.kind, it.mins || '']; })))],
    ['assignments', 'Assignments', 'Who is assigned to which course, with dates', () => [['Employee ID', 'Name', 'Course ID', 'Course', 'Assigned on', 'Due date']].concat(s.users.flatMap(u => Object.entries(s.enroll[u.name] || {}).map(([cid, due]) => { const a = s.adminCourses.find(x => x.id === cid); return a ? [u.empId, u.name, a.code, a.title, Progress.assignedOn(s, u.name, cid), due] : null; }).filter(Boolean)))],
    ['completions', 'Course completions', 'One row per person, course and module (same as the all-course completion report)', () => Progress.completionRows(s)],
    ['attempts', 'Assessment attempts', 'Attempts used and extra attempts given', () => [['Employee ID', 'Name', 'Assessment', 'Attempts used', 'Extra attempts given']].concat(s.users.flatMap(u => s.quizzes.map(z => { const used = (s.attemptsUsed[u.name] || {})[z.id] || 0, extra = (s.extraAttempts[u.name] || {})[z.id] || 0; return used || extra ? [u.empId, u.name, z.name, used, extra] : null; }).filter(Boolean)))],
    ['batches', 'Batches and trainees', 'Every batch with each trainee’s current status', () => [['Batch ID', 'Batch', 'Training type', 'Trainer', 'Division', 'Start', 'End', 'Trainee', 'Current status', 'Since']].concat(s.batches.flatMap(b => b.trainees.map(u => { const l = (b.st || {})[u] || [], e = l[l.length - 1], st = e ? (s.statuses.find(x => x.id === e.status) || {}).name : 'In-Training'; return [b.code, b.name, (s.ttypes.find(t => t.id === b.type) || {}).name, b.trainer, b.division, b.start, b.end, u, st, e ? e.date : b.start]; })))],
    ['questions', 'Question bank', 'Every question with type, difficulty and author', () => [['ID', 'Question', 'Type', 'Difficulty', 'Category', 'Author', 'Status']].concat(s.qs.map(q => [q.id, q.text, q.type, q.diff, q.topic, q.author || '', q.archived ? 'Archived' : 'Active']))],
    ['lcms', 'LCMS modules', 'Uploaded modules (file names, not the files themselves)', () => [['Module ID', 'Title', 'Type', 'File or link', 'Minutes', 'Updated']].concat(s.lcms.map(m => [m.code, m.title, m.type, m.file ? m.file.name : m.url || '', m.mins, m.updated]))],
    ['history', 'Imported learning history', 'Records brought in from other LMSs', () => [['Employee ID', 'Name', 'Course', 'Source LMS', 'Status', 'Started on', 'Completed on', 'Score %', 'Certificate ID', 'Imported on']].concat(s.extHistory.map(x => [x.empId, x.user, x.courseCode ? x.courseCode + ' ' + x.extCourse : x.extCourse, x.source, x.status, x.startedOn, x.completedOn, x.score, x.certId, x.importedOn]))],
  ];
  const dlOne = ([k, t, d, build]) => { const rows = build(); csvDownload('skillforge-export-' + k + '-' + TODAY_KEY + '.csv', rows); return rows.length - 1; };
  const outVals = {
    // Row counts are worked out from indexes; the files themselves are only built when downloaded.
    mgSets: DS.map(x => { const n = MIG_COUNT[x[0]] ? MIG_COUNT[x[0]](s) : x[3]().length - 1; return { title: x[1], desc: x[2], count: n.toLocaleString('en-US') + (n === 1 ? ' row' : ' rows'), dl: () => { dlOne(x); this.toastMsg(x[1] + ' downloaded'); } }; }),
    mgAll: () => { DS.forEach((x, i) => setTimeout(() => dlOne(x), i * 250)); this.toastMsg(DS.length + ' files downloading'); },
    mgAllLabel: 'Download all ' + DS.length + ' files',
  };
  return { isMigReport: scr === 'migReport', isMigrate: scr === 'migrate', ...reportVals, ...inVals, ...outVals };
};
