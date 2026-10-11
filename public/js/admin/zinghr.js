/* Skillforge LMS — Settings › Platform › ZingHR employee master.
 * ZingHR is the source of truth for employees. A scheduled sync (nightly by default) pulls the employee master,
 * maps ZingHR fields to Skillforge fields and applies changes:
 *   new employee → account created (role from the designation rules) and essential/role courses assigned
 *   department, manager, designation, location, email, phone changes → profile updated
 *   exit (status Inactive / last working day) → account deactivated, learning history kept
 * Every change is written to the Data migration report. The real API call needs the backend (credentials stay on the
 * server); this screen configures it and simulates runs with the same record shapes.
 */
const ZH_FIELDS = [
  ['EmployeeCode', 'Employee ID', 'empId', true], ['EmployeeName', 'Full name', 'name', true], ['OfficialEmail', 'Work email (username)', 'email', true],
  ['MobileNo', 'Phone', 'phone', false], ['Department', 'Department', 'dept', true], ['Designation', 'Designation', 'designation', false],
  ['ReportingManagerCode', 'Manager', 'manager', false], ['DateOfJoining', 'Date of joining', 'joined', true], ['Location', 'Site', 'site', false],
  ['Grade', 'Grade', 'grade', false], ['Gender', 'Gender', 'gender', false], ['EmploymentStatus', 'Status (Active / Inactive)', 'status', true],
];
const ZH0 = { baseUrl:'https://northwind.zinghr.com/api/v2', clientId:'skillforge-lms', secretSet:true, schedule:'Nightly 02:00 IST', on:true,
  rules:{ create:true, deactivate:true, update:true, essentials:true, roleByDesig:true }, desigRoles:[['Trainer', 'r_trainer'], ['Team Manager', 'r_learner'], ['L&D Administrator', 'r_admin']],
  runs:[{ id:'zr1', at:'2026-10-03T02:00', by:'Schedule', read:3, created:0, updated:2, deactivated:0, failed:1, ms:4200 }, { id:'zr2', at:'2026-10-02T02:00', by:'Schedule', read:5, created:1, updated:3, deactivated:0, failed:1, ms:4600 }] };

SkillforgeApp.prototype.amZingHR = function (c) {
  const { s, role, INK, W } = c;
  if (this._scrV !== 'zinghr') return { isZingHR:false };
  const Z = s.zh, setZ = patch => this.setState(st => ({ zh: { ...st.zh, ...patch } }));
  const fmtT = t => Fmt.dt(t);
  const runSync = () => {
    // Simulated incremental run: a handful of realistic changes from the employee master.
    const now = nowStamp(), t0 = performance.now(), active = s.users.filter(u => u.status === 'Active' && u.role === 'Learner');
    const pick = k => active[Math.floor(Progress.hash(now + k) * active.length)];
    const changes = [], users = s.users.slice(), log = [];
    const add = (type, u, field, from, to, status, note) => log.push({ id:'sl' + Date.now() + log.length, at: now, source:'ZingHR (HRMS)', run:'ZH-' + now.slice(5, 10).replace('-', '') + '-M', type, empId: u.empId, name: u.name, field, from, to, status, note: note || '' });
    if (Z.rules.update) { const u = pick('d'); if (u) { const to = DEPTS.find(d => d !== u.dept); users[users.indexOf(u)] = { ...u, dept: to }; add('Department change', u, 'Department', u.dept, to, 'Applied'); }
      const v = pick('p'); if (v) { const ph = '+91 98' + String(Math.floor(Progress.hash(now + 'ph') * 1e8)).padStart(8, '0'); users[users.indexOf(v)] = { ...v, phone: ph }; add('Phone change', v, 'Phone', v.phone, ph, 'Applied'); } }
    let created = 0, enroll = s.enroll, assignedOn = s.assignedOn;
    if (Z.rules.create) { const id = Math.max(...users.map(u => u.id)) + 1, nm = 'Tanya Bhatt ' + (id % 1000);
      const nu = { id, name: Identity.uniqueName(users, nm, 'ZH' + (300000 + id)), email: nm.toLowerCase().replace(/ /g, '.') + '@northwind.com', role:'Learner', roleId:'r_learner', dept:'Customer Success', status:'Active', lastLogin:'Never', manager:'Priya Raman', empId:'ZH' + (300000 + id), phone:'', gender:'Female', terms:false, designation:'Associate', joined: TODAY_KEY, source:'ZingHR' };
      users.push(nu); created = 1; add('New hire', nu, 'Employee record', '', 'Created · Customer Success · Associate', 'Applied');
      if (Z.rules.essentials) { const e = Essentials.apply(enroll, s.adminCourses, [nu], s.holidays, assignedOn); enroll = e.enroll; assignedOn = e.assignedOn; } }
    const bad = { empId:'ZH-UNKNOWN', name:'(no match)' }; add('Manager change', bad, 'Manager', '', 'EMP99999', 'Failed', 'Reporting manager code not found in Skillforge');
    const run = { id:'zr' + Date.now(), at: now, by: role.name, read: log.length, created, updated: log.filter(x => x.status === 'Applied' && x.type !== 'New hire').length, deactivated: 0, failed: log.filter(x => x.status === 'Failed').length, ms: Math.max(800, Math.round(performance.now() - t0) + 900) };
    this.setState(st => ({ users, enroll, assignedOn, syncLog: st.syncLog.concat(log), zh: { ...st.zh, runs: [run].concat(st.zh.runs) } }));
    // Connected: new joiners get a login straight away (temporary password, changed at first sign-in).
    if (Backend.on && created) { const nj = users[users.length - 1]; Backend.createLogins([{ email: nj.email, empId: nj.empId, name: nj.name, role: nj.role, roleId: nj.roleId, userKey: String(nj.id) }]).then(r => this.toastMsg(r.created.length ? 'Login created for ' + nj.name + ' · temporary password ' + r.created[0].tempPassword : 'Login not created: ' + (r.skipped[0] || {}).reason)).catch(e => this.toastMsg('Login not created: ' + e.message)); }
    this.toastMsg('ZingHR sync finished · ' + run.read + ' changes · ' + run.failed + ' failed (see Data migration report)');
  };
  const loadScale = () => {
    const t0 = performance.now(), d = ScaleData.build(s), ms = Math.round(performance.now() - t0), now = nowStamp();
    const run = { id:'zr' + Date.now(), at: now, by: role.name, read: d.stats.users, created: d.stats.users - s.users.length, updated: 0, deactivated: d.users.filter(u => u.status === 'Deactivated').length - s.users.filter(u => u.status === 'Deactivated').length, failed: 0, ms, full:true };
    this.setState(st => ({ ...d, zh: { ...st.zh, runs: [run].concat(st.zh.runs), scale: d.stats }, pages:{} }));
    this.toastMsg('Full employee master loaded · ' + d.stats.users.toLocaleString('en-US') + ' people · ' + d.stats.moduleRecords.toLocaleString('en-US') + ' module records');
  };
  const st = Z.scale;
  return {
    isZingHR:true, zh: Z, zhOn: UI.toggle(Z.on, () => setZ({ on: !Z.on })),
    setZhUrl: e => setZ({ baseUrl: e.target.value }), setZhClient: e => setZ({ clientId: e.target.value }),
    zhSchedules: ['Nightly 02:00 IST', 'Every 6 hours', 'Hourly', 'Manual only'].map(v => UI.chip(Z.schedule, v, v, () => setZ({ schedule: v }))),
    zhRules: [['create', 'Create accounts for new employees', 'Role from the designation rules below; essential and role courses are assigned automatically.'], ['update', 'Update profile changes', 'Department, manager, designation, site, email and phone.'], ['deactivate', 'Deactivate leavers', 'On status Inactive. Learning history is kept for reports.'], ['essentials', 'Assign essential trainings to new joiners', 'Uses each course’s “Essential for new joiners” rule.'], ['roleByDesig', 'Set role from designation', 'Matches the rules below; everyone else gets the Learner role.']]
      .map(([k, l, d]) => ({ label: l, desc: d, ...UI.toggle(Z.rules[k], () => setZ({ rules: { ...Z.rules, [k]: !Z.rules[k] } })) })),
    zhMap: ZH_FIELDS.map(([zf, sf, , req]) => ({ zf, sf, req: req ? 'Required' : 'Optional', reqBg: req ? '#FDECEC' : '#EAF1F6', reqFg: req ? '#A63232' : '#526B7A' })),
    zhDesig: Z.desigRoles.map(([d, r]) => ({ d, r: (s.roles.find(x => x.id === r) || {}).name || r })),
    zhRuns: Z.runs.slice(0, 8).map(r => ({ ...r, when: fmtT(r.at), kind: r.full ? 'Full load' : 'Incremental', secs: (r.ms / 1000).toFixed(1) + ' s', failFg: r.failed ? '#A63232' : '#166534' })),
    zhTest: () => this.toastMsg(Z.baseUrl.startsWith('https://') ? 'Connection settings look valid. The live test runs from the server.' : 'The base URL must start with https://'),
    zhRun: runSync, zhLoadScale: loadScale, zhIsScale: !!st,
    zhStats: [['People', s.users.length], ['Active', s.users.filter(u => u.status === 'Active').length], ['Courses', s.adminCourses.length], ['Assignments', Object.values(s.enroll).reduce((t, m) => t + Object.keys(m || {}).length, 0)], ['Module records', st ? st.moduleRecords : Object.values(s.enroll).reduce((t, m) => t + Object.keys(m || {}).reduce((x, cid) => x + ((Progress.courseOf(s, cid) || { items:[] }).items.length), 0), 0)]]
      .map(([l, v]) => ({ l, v: v.toLocaleString('en-US') })),
    zhGoReport: () => this.go('migReport', { adminView:true, mr: { ...s.mr, source:'ZingHR (HRMS)' } }),
  };
};
