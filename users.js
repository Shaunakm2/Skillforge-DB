/* Skillforge LMS — users and accounts. */
/* v41.32: one set of field rules for Create / Edit account and the bulk upload (user-import.js). Returns plain messages
 * (empty list = all good). typedOnly: skip "required" messages for fields left empty (the live list while typing). */
const USER_RULES = {
  name: /^[\p{L}][\p{L} .'\u2019-]*$/u,
  emp: /^[A-Za-z0-9][A-Za-z0-9_\-/]{1,29}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[0-9+ ()-]+$/,
  desig: /^[\p{L}0-9][\p{L}0-9 .,&()/'\u2019-]*$/u,
};
/* v41.33: one message per field (field -> message); a field that is fine is absent. */
function userFieldErrors(ud, users, typedOnly) {
  const er = {}, n = Identity.plain(ud.name || '').trim(), em = String(ud.email || '').trim().toLowerCase(), emp = String(ud.empId || '').trim(),
    ph = String(ud.phone || '').trim(), dg = String(ud.designation || '').trim();
  const lt = v => /[<>]/.test(v) ? 'the characters < and > are not allowed' : '';
  if (!n) { if (!typedOnly) er.name = 'add a full name'; }
  else if (lt(n)) er.name = lt(n);
  else if (n.length < 2 || n.length > 80 || !USER_RULES.name.test(n) || !/\p{L}.*\p{L}/u.test(n)) er.name = 'letters, spaces, apostrophes, dots and hyphens only (2\u201380 characters)';
  if (!em) { if (!typedOnly) er.email = 'add a work email'; }
  else if (lt(em)) er.email = lt(em);
  else if (em.length > 254 || !USER_RULES.email.test(em)) er.email = 'enter a valid email, like name@company.com';
  else if ((users || []).some(u => u.id !== ud.id && String(u.email || '').toLowerCase() === em)) er.email = 'another account already uses this email';
  if (!emp) { if (!typedOnly) er.empId = 'add an employee ID'; }
  else if (lt(emp)) er.empId = lt(emp);
  else if (!USER_RULES.emp.test(emp)) er.empId = 'letters, numbers, - _ / only (2\u201330 characters, starting with a letter or number)';
  else if ((users || []).some(u => u.id !== ud.id && String(u.empId || '').toLowerCase() === emp.toLowerCase())) er.empId = emp + ' is already in use';
  if (ph && (lt(ph) || !USER_RULES.phone.test(ph) || ph.replace(/\D/g, '').length < 7 || ph.replace(/\D/g, '').length > 15)) er.phone = '7 to 15 digits (+, spaces, brackets and dashes allowed)';
  if (dg && (lt(dg) || dg.length > 60 || !USER_RULES.desig.test(dg) || !/\p{L}/u.test(dg))) er.designation = 'must contain letters (letters, numbers, spaces and . , & ( ) / - only; 60 characters max)';
  if (ud.joined && !/^\d{4}-\d{2}-\d{2}$/.test(ud.joined)) er.joined = 'not a valid date';
  else if (ud.joined && ud.joined > Progress.plus(TODAY_KEY, 180)) er.joined = 'can\u2019t be more than 6 months ahead';
  return er;
}
const USER_FIELD_LABELS = { name: 'Full name', email: 'Work email', empId: 'Employee ID', phone: 'Phone number', designation: 'Designation', joined: 'Date of joining' };
function userFieldProblems(ud, users, typedOnly) {
  const er = userFieldErrors(ud, users, typedOnly);
  return Object.keys(USER_FIELD_LABELS).filter(k => er[k]).map(k => USER_FIELD_LABELS[k] + ': ' + er[k]);
}
SkillforgeApp.prototype.amUsers = function (c) {
  const { chipsOf, isSuper, role, s, segs } = c;
  // users
  const ROLE_C = { 'Learner':['#EAF1F6', '#334E68'], 'Trainer':['#CCFBF1', '#115E59'], 'Admin':['#EDE9FE', '#5B21B6'], 'Super admin':['#16324F', '#F8FBFD'] };
  const ST = { Active:['#DCFCE7', '#166534'], Deactivated:['#EAF1F6', '#526B7A'], Invited:['#DBEAFE', '#1E40AF'] };
  const uq = s.userQuery.trim().toLowerCase();
  // Status filter: Active (active + invited) or Inactive (deactivated), then role and search.
  const stOk = u => s.userStatus === 'All' || (s.userStatus === 'Inactive' ? u.status === 'Deactivated' : u.status !== 'Deactivated');
  const userAll = s.users.filter(u => stOk(u) && (s.userRole === 'All' || u.role === s.userRole) && (!uq || (u.name + ' ' + u.email + ' ' + (u.empId || '') + ' ' + (u.phone || '') + ' ' + (u.dept || '')).toLowerCase().includes(uq)));
  // Only the visible page of users is decorated and rendered.
  const UPG = Pager(this, s, 'users', userAll, 50);
  /* v36: one path for single and bulk (de)activation, always after a confirmation, and written to the audit log. */
  const setActive = (list, deact) => {
    const apply = ids => { this.setState(st => ({ users: st.users.map(x => ids.includes(x.id) ? { ...x, status: deact ? 'Deactivated' : 'Active' } : x), uSel:{}, uAsk:null, uMng:null }));
      list.filter(u => ids.includes(u.id)).forEach(u => this.logAudit(deact ? 'Deactivated account' : 'Reactivated account', u.name)); };
    const done = ok => this.toastMsg(list.length === 1 && ok.length === 1 ? list[0].name + (deact ? ' deactivated · sign-in disabled' : ' reactivated')
      : ok.length + (deact ? ' deactivated' : ' reactivated') + (ok.length < list.length ? ' · ' + (list.length - ok.length) + ' could not be changed (nothing changed for them)' : ''));
    if (!Backend.on) { const ids = list.map(u => u.id); apply(ids); return done(ids); }
    // v41.19: the person is found by e-mail or employee ID; someone without a login yet is changed here only (they can't sign in anyway).
    let why = '';
    Promise.all(list.map(u => Backend.adminUsers(deact ? 'ban' : 'unban', { email: u.email, empId: u.empId }).then(() => u.id, e => { if (/no login yet/i.test(e.message || '')) return u.id; why = why || e.message; return null; }))).then(r => { const ok = r.filter(Boolean);
      if (!ok.length) { this.setState({ uAsk:null }); return this.toastMsg('Nothing changed: ' + (why || 'the server refused the change.')); } apply(ok); done(ok); }); };
  const userRows = UPG.rows.map(u => ({ ...u, roleName: (Access.roleFor(s, u) || {}).name || u.role })).map(u => { const prot = u.role === 'Super admin' && !isSuper; const active = u.status !== 'Deactivated'; return { ...u, initials: ini(u.name), av: AV[u.id % 5], roleBg: ROLE_C[u.role][0], roleFg: ROLE_C[u.role][1], stBg: ST[u.status][0], stFg: ST[u.status][1], op: active ? 1 : 0.55, canEdit: !prot, locked: prot, toggleLabel: active ? 'Deactivate' : 'Reactivate', toggleFg: active ? '#B91C1C' : '#166534', edit: () => this.setState({ userModal:true, ud:{ ...u, name: Identity.plain(u.name) }, uMng:null, udTried:false }), toggle: () => this.setState({ uAsk: { ids: [u.id], deact: active }, uMng:null }) }; });
  const uProt = u => false;
  const userRows2 = userRows.map(u => { const on = !!s.uSel[u.id]; return { ...u, phoneLabel: u.phone || '—', termsLabel: u.terms ? 'Yes' : 'No', termsBg: u.terms ? '#DCFCE7' : '#FDECEC', termsFg: u.terms ? '#166534' : '#A63232', attempts: () => this.setState({ attModal: u.name, uMng:null }), resetPw: () => this.setState({ pwReset: u.id, uMng:null }), sel: !!on, tick: on ? '✓' : '', bg: on ? '#16324F' : '#FFFFFF', bd: on ? '#16324F' : '#BFCFDB', rowBg: on ? '#F4F8FC' : 'transparent', pick: () => this.setState(st => ({ uSel: { ...st.uSel, [u.id]: !st.uSel[u.id] } })), viewL: () => this.go('reports', { adminView:true, repType:'learning', repUser: u.name, repCourse:'All', repStatus:'All', repDept:'All', uMng:null }),   // v36: was a message only
      manage: () => this.setState({ uMng: u.id }), assignL: () => this.setState({ enrModal: { user: u.name }, uMng:null }) }; });
  const uSelIds = userRows2.filter(u => s.uSel[u.id]).map(u => u.id), uAllOn = userRows2.length > 0 && uSelIds.length === userRows2.length;
  const ud = s.ud || { id:null, roleId:'r_learner', name:'', email:'', role:'Learner', dept:deptList(s)[0] || '', manager:'None', status:'Active', lastLogin:'Never', empId:'', phone:'', gender:'Prefer not to say', terms:false, designation:'', joined:TODAY_KEY };
  const setUd = k => e => this.setState(st => ({ ud: { ...(st.ud || ud), [k]: e.target.value } }));
  const V = {
    attModal: !!s.attModal,
    attUser: s.attModal || '',
    closeAtt: () => this.setState({ attModal:null }),
    attRows: s.attModal ? s.quizzes.map(z => { const u = s.attModal; const info = Assessment.attemptsInfo(z, (s.attemptsUsed[u] || {})[z.id], (s.extraAttempts[u] || {})[z.id]); const setX = n => { this.setState(st => ({ extraAttempts: { ...st.extraAttempts, [u]: { ...(st.extraAttempts[u] || {}), [z.id]: n } } })); }; return { name: z.name, course: z.course || 'Not attached yet', unlimited: info.unlimited, limited: !info.unlimited, allowedLabel: info.unlimited ? 'Unlimited' : info.base + (info.extra ? ' + ' + info.extra + ' extra' : ''), used: info.used, leftLabel: info.unlimited ? '—' : String(info.left), leftFg: !info.unlimited && info.left === 0 ? '#A63232' : '#16324F', extra: info.extra, canRemove: info.extra > 0, add: () => { setX(info.extra + 1); this.toastMsg('1 extra attempt granted to ' + u.split(' ')[0] + ' · ' + z.name); }, remove: () => { if (info.extra > 0) setX(info.extra - 1); } }; }) : [],
    userRows: userRows2, userPager: UPG.pager, userCountLabel: userAll.length.toLocaleString('en-US') + ' people',
    userEmpty: userRows2.length === 0,
    uSelCount: uSelIds.length,
    uAll: { on: uAllOn, sel: !!uAllOn, tick: uAllOn ? '✓' : '', bg: uAllOn ? '#16324F' : '#FFFFFF', bd: uAllOn ? '#16324F' : '#BFCFDB' },
    toggleAllUsers: () => this.setState({ uSel: uAllOn ? {} : Object.fromEntries(userRows2.map(u => [u.id, true])) }),
    bulkAssign: () => this.setState({ assignOpen:true }),
    bulkRemind: () => this.sendNudges(s.users.filter(u => uSelIds.includes(u.id)).map(u => u.name), () => this.setState({ uSel:{} })),
    bulkClear: () => this.setState({ uSel:{} }),
    // Connected: each sign-in is disabled on the server too (ban), like the single-person switch. The database also cuts access
    // as soon as the row says Deactivated (sf_user_active_sync), so nobody keeps reading data until their token expires.
    bulkDeactivate: () => { const ids = userRows2.filter(u => s.uSel[u.id] && !uProt(u) && !u.locked && u.status !== 'Deactivated').map(u => u.id);
      if (!ids.length) return this.toastMsg('Everyone selected is already deactivated, or is an account you can’t change.'); this.setState({ uAsk: { ids, deact:true } }); },
    // v36: confirmation for deactivate / reactivate (single and bulk)
    uAskOpen: !!s.uAsk, uAskDeact: !!(s.uAsk && s.uAsk.deact), uAskReact: !!(s.uAsk && !s.uAsk.deact),
    uAskTitle: (() => { if (!s.uAsk) return ''; const L = s.uAsk.ids.map(id => s.users.find(u => u.id === id)).filter(Boolean); const who = L.length === 1 ? L[0].name : L.length + ' people';
      return (s.uAsk.deact ? 'Deactivate ' : 'Reactivate ') + who + '?'; })(),
    uAskText: s.uAsk && s.uAsk.deact ? 'They are signed out on every device and can’t sign in. Their learning history, scores and certificates are kept, and you can reactivate them later.' : 'They can sign in again with their existing password. Their learning history is unchanged.',
    uAskNo: () => this.setState({ uAsk:null }),
    uAskYes: () => { const L = ((s.uAsk || {}).ids || []).map(id => s.users.find(u => u.id === id)).filter(Boolean); if (L.length) setActive(L, !!s.uAsk.deact); },
    // v36: “Manage” menu: every action for one person, with labels (the row had six unlabelled icons)
    uMngOpen: !!s.uMng, uMngClose: () => this.setState({ uMng:null }),
    uMngRow: (() => { const r = s.uMng ? userRows2.find(u => u.id === s.uMng) : null; return r ? { ...r, sub: [r.empId, r.roleName, r.status].filter(Boolean).join(' · ') } : {}; })(),
    userQuery: s.userQuery,
    setUserQuery: e => this.setState({ userQuery: e.target.value }),
    userRoleChips: chipsOf(s.userRole, ['All', 'Learner', 'Trainer', 'Admin'], v => this.setState({ userRole:v, pages:{ ...s.pages, users:1 } })).map(ch => ch.label === 'All' ? { ...ch, label:'All roles' } : ch),
    // v39: one-line toolbar. Status and Role are dropdowns; Export and Create account open small menus.
    userStatus: s.userStatus, userRole: s.userRole,
    setUserStatusSel: e => this.setState({ userStatus: e.target.value, pages:{ ...s.pages, users:1 } }),
    setUserRoleSel: e => this.setState({ userRole: e.target.value, pages:{ ...s.pages, users:1 } }),
    userRoleOpts: [['All', 'All roles'], ['Learner', 'Learner'], ['Trainer', 'Trainer'], ['Admin', 'Admin']].map(([v, l]) => ({ v, l })),
    userStatusOpts: (() => { let a = 0, i = 0; s.users.forEach(u => { if (u.status === 'Deactivated') i++; else a++; });
      const f = n => n.toLocaleString('en-US');
      return [['Active', 'Active · ' + f(a)], ['Inactive', 'Inactive · ' + f(i)], ['All', 'All statuses · ' + f(s.users.length)]].map(([v, l]) => ({ v, l })); })(),
    uMenuCreateOpen: s.uMenu === 'create', uMenuExportOpen: s.uMenu === 'export', uMenuAny: !!s.uMenu,
    uMenuCreate: () => this.setState({ uMenu: s.uMenu === 'create' ? null : 'create' }),
    uMenuExport: () => this.setState({ uMenu: s.uMenu === 'export' ? null : 'export' }),
    uMenuClose: () => this.setState({ uMenu: null }),
    createSingle: () => this.setState({ uMenu: null, userModal:true, ud:null, udTried:false }),
    createBulk: () => this.setState({ uMenu: null, uImp: {} }),
    exportUsersMenu: () => { this.setState({ uMenu: null }); V.exportUsers(); },
    userStatusChips: (() => { let a = 0, i = 0; s.users.forEach(u => { if (u.status === 'Deactivated') i++; else a++; });
      return [['Active', 'Active · ' + a.toLocaleString('en-US')], ['Inactive', 'Inactive · ' + i.toLocaleString('en-US')], ['All', 'All statuses · ' + s.users.length.toLocaleString('en-US')]].map(([v, l]) => UI.chip(s.userStatus, v, l, () => this.setState({ userStatus: v, pages:{ ...s.pages, users:1 } }))); })(),
    exportUsers: () => { csvDownload('teammates-' + s.userStatus.toLowerCase() + '-' + TODAY_KEY + '.csv', [['Employee ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Manager', 'Role', 'User type', 'Status', 'Date of joining', 'Last sign-in', 'Terms accepted', 'Source']]
        .concat(userAll.map(u => [u.empId, u.name, u.email, u.phone, u.dept, u.designation, u.manager, (Access.roleFor(s, u) || {}).name || u.role, u.role, u.status === 'Deactivated' ? 'Inactive' : 'Active', u.joined, u.lastLogin, u.terms ? 'Yes' : 'No', u.source || 'Skillforge'])));
      this.toastMsg(userAll.length.toLocaleString('en-US') + ' teammates exported'); },
    userStats: (() => { const n = { Active:0, Deactivated:0, Admin:0 }; s.users.forEach(u => { if (u.status === 'Deactivated') n.Deactivated++; else n.Active++; if (u.role === 'Admin') n.Admin++; }); return [['Active', n.Active, '#166534'], ['Deactivated', n.Deactivated, '#526B7A'], ['Admins', n.Admin, '#5B21B6']].map(([l, v, fg]) => ({ l, v: v.toLocaleString('en-US'), fg })); })(),
    newUser: () => this.setState({ userModal:true, ud:null, udTried:false }),
    importUsers: () => { const base = nextUserId(s.users) - 1; const add = [['Owen Hart', 'Sales'], ['Priya Nair', 'Engineering'], ['Lucas Moreau', 'Customer Success']].map(([n, dp], i) => ({ id: base + i + 1, name:n, email: n.toLowerCase().split(' ').join('.') + '@example.com', role:'Learner', dept:dp, manager:'Priya Raman', status:'Invited', lastLogin:'Never' })); this.setState({ users: s.users.concat(add) }); this.toastMsg('3 accounts imported from new_hires_oct.csv · invites sent'); },
    userModal: s.userModal,
    closeUserModal: () => this.setState({ userModal:false, ud:null, udTried:false }),   // v41.21: the draft goes too
    ud,
    setUdName: setUd('name'),
    setUdEmail: setUd('email'),
    setUdDept: setUd('dept'),
    setUdManager: setUd('manager'),
    udRoleOpts: ((s.roles || []).length ? s.roles : ROLES0.filter(r => r.builtin)).map(r => ({ v: r.id, l: r.name + ' · ' + r.base })), setUdRole: e => { const r = (s.roles || []).concat(ROLES0).find(x => x.id === e.target.value); this.setState(st => ({ ud: { ...(st.ud || ud), roleId: r.id, role: r.base } })); },
    udRoleHint: ((s.roles.find(r => r.id === ud.roleId) || {}).desc || ''),
    // v41.32: problems shown under the form. While typing, only fields already filled are checked; after Create account is
    // pressed once (udTried), empty required fields are listed too.
    udProblems: s.userModal ? userFieldProblems(ud, s.users, !s.udTried) : [], udHasProblems: !!(s.userModal && userFieldProblems(ud, s.users, !s.udTried).length),
    // v41.33: per field, the moment it is wrong: red border (udBd.x), aria-invalid (udBad.x) and the reason under the box (udMsg.x)
    ...(() => { const er = s.userModal ? userFieldErrors(ud, s.users, !s.udTried) : {}, ks = Object.keys(USER_FIELD_LABELS);
      return { udBd: Object.fromEntries(ks.map(k => [k, er[k] ? '#D64545' : '#C9D7E2'])), udBg: Object.fromEntries(ks.map(k => [k, er[k] ? '#FFF5F5' : '#FFFFFF'])),
        udBad: Object.fromEntries(ks.map(k => [k, er[k] ? 'true' : 'false'])), udMsg: Object.fromEntries(ks.map(k => [k, er[k] || ''])) }; })(),
    udTitle: ud.id ? 'Edit account' : 'Create account',
    udBtn: ud.id ? 'Save changes' : 'Create account',   // v36: no invite e-mail is sent
    deptOptions: (l => ud.dept && !l.includes(ud.dept) ? [ud.dept, ...l] : l)(deptList(s)),
    managerOptions: s.userModal ? ['None'].concat(s.users.filter(u => u.status !== 'Deactivated' && u.name !== ud.name && (u.role !== 'Learner' || /Manager/.test(u.designation || ''))).map(u => u.name).sort()) : [],
    setUdEmp: setUd('empId'),
    setUdPhone: setUd('phone'),
    setUdDesig: setUd('designation'),
    setUdJoined: setUd('joined'),
    udGenders: segs(ud.gender, GENDERS, v => this.setState(st => ({ ud: { ...(st.ud || ud), gender:v } }))),
    udTerms: segs(ud.terms ? 'Yes' : 'No', ['Yes', 'No'], v => this.setState(st => ({ ud: { ...(st.ud || ud), terms: v === 'Yes' } }))),
    saveUser: () => {
      const n = Identity.plain(ud.name).trim(), em = ud.email.trim().toLowerCase(), emp = (ud.empId || '').trim(), ph = (ud.phone || '').trim();
      // v41.32: every problem is listed at once, with the same rules as the bulk upload and the admin-users function.
      // The same list shows under the form while it is open (udProblems).
      const bad = userFieldProblems(ud, s.users);
      if (bad.length) { this.setState({ udTried: true }); return this.toastMsg(bad.length === 1 ? bad[0] : 'Please fix the ' + bad.length + ' fields marked in red'); }
      const prevU = s.users.find(x => x.id === ud.id);
      // The employee ID links the login and every learning record: it can't change once the account is connected.
      if (Backend.on && prevU && prevU.empId && prevU.empId.toLowerCase() !== emp.toLowerCase()) return this.toastMsg('The employee ID links this person’s login and history, so it can’t be changed. Create a new account instead.');
      // Names must be unique (the app refers to people by name): a clash gets the employee ID added.
      const nu = Identity.uniqueName(s.users, n, emp, ud.id);
      const rec = { ...ud, name:nu, email:em, empId:emp, phone:ph, designation:(ud.designation || '').trim() };
      const rRole = s.roles.find(r => r.id === ud.roleId) || null;
      if (rRole) rec.role = rRole.base;
      if (Backend.on && s.uBusy) return;
      if (ud.id) {
        const apply = () => { const st = this.state, renamed = prevU && prevU.name !== rec.name ? Identity.rename(st, prevU.name, rec.name) : {};
          const users0 = renamed.users || st.users, enroll0 = renamed.enroll || st.enroll;
          const rc = prevU && prevU.roleId !== rec.roleId ? Access.applyCourses(enroll0, rRole, rec.name, Progress.plus(TODAY_KEY, 30)) : { enroll: enroll0, added:0 };
          this.setState({ ...renamed, users: users0.map(u => u.id === ud.id ? rec : u), userModal:false, uBusy:false, enroll: rc.enroll });
          this.logAudit('Edited account', nu); this.toastMsg('Account updated' + (Identity.plain(nu) !== n ? ' · saved as “' + nu + '” because the name is already used' : '') + (rc.added ? ' · ' + rc.added + ' role courses assigned' : '')); };
        if (!Backend.on) return apply();
        // Connected: change the login first; only if that works is the record updated (no half-done changes).
        this.setState({ uBusy:true });
        const jobs = []; if (prevU.role !== rec.role || prevU.roleId !== rec.roleId) jobs.push(() => Backend.adminUsers('setRole', { email: prevU.email, empId: prevU.empId, role: rec.role, roleId: rec.roleId }));
        if (prevU.name !== rec.name) jobs.push(() => Backend.adminUsers('rename', { email: prevU.email, empId: prevU.empId, name: rec.name }));
        jobs.reduce((p, j) => p.then(j), Promise.resolve()).then(apply).catch(e => { this.setState({ uBusy:false }); this.toastMsg('Not saved: ' + e.message); });
        return; }
      else {
        const id = nextUserId(s.users);
        // Courses set to auto-assign new joiners (everyone, or the person's department) are assigned straight away.
        const auto = s.adminCourses.filter(c => c.autoNew && c.status === 'Published' && (c.aud === 'Everyone' || (c.aud === 'Departments' && (c.depts || {})[rec.dept])));
        const enroll = auto.length ? { ...s.enroll, [n]: Object.fromEntries(auto.map(c => [c.id, c.due])) } : s.enroll;
        const rcs = Access.applyCourses(enroll, rRole, n, Progress.plus(TODAY_KEY, 30));
        const ess = Essentials.apply(rcs.enroll, s.adminCourses, [{ ...rec, id }], s.holidays, s.assignedOn);
        const extras = (rcs.added ? ' · ' + rcs.added + ' role ' + (rcs.added === 1 ? 'course' : 'courses') : '') + (ess.added ? ' · ' + ess.added + ' essential ' + (ess.added === 1 ? 'training' : 'trainings') + ' assigned' : '');
        if (Backend.on) {   // create the login first (random temporary password, must be changed at first sign-in)
          this.setState({ uBusy:true });
          Backend.adminUsers('create', { email: rec.email, empId: rec.empId, name: rec.name, role: rec.role, roleId: rec.roleId, userKey: String(id) }).then(r => {
            this.setState(st => ({ users: st.users.concat([{ ...rec, id }]), userModal:false, uBusy:false, enroll: ess.enroll, assignedOn: ess.assignedOn, tempPw: { name: rec.name, email: rec.email, pw: r.tempPassword, why:'new' } }));
            this.logAudit('Created account', rec.name); this.toastMsg('Account created · first password ' + r.tempPassword + extras); }).catch(e => { this.setState({ uBusy:false }); this.toastMsg('Not created: ' + e.message); });
          return; }
        this.setState({ users: s.users.concat([{ ...rec, id }]), userModal:false, enroll: ess.enroll, assignedOn: ess.assignedOn, passwords: { ...s.passwords, [rec.email]: DEFAULT_PASSWORD } });
        this.logAudit('Created account', rec.name); this.toastMsg('Account created for ' + em + ' · first password ' + DEFAULT_PASSWORD + (rcs.added ? ' · ' + rcs.added + ' role ' + (rcs.added === 1 ? 'course' : 'courses') : '') + (ess.added ? ' · ' + ess.added + ' essential ' + (ess.added === 1 ? 'training' : 'trainings') + ' assigned' : '') + (auto.length ? ' · auto-assigned ' + auto.length + (auto.length === 1 ? ' course' : ' courses') : ''));
      }
    },
    // Temporary password, shown once to the admin (connected mode).
    tempPwOpen: !!s.tempPw, tempPw: s.tempPw || {}, tempPwTitle: s.tempPw && s.tempPw.why === 'reset' ? 'Password reset' : 'Account created',
    closeTempPw: () => this.setState({ tempPw:null }), copyTempPw: () => { try { navigator.clipboard.writeText(s.tempPw.pw); this.toastMsg('Copied'); } catch (e) { this.toastMsg(s.tempPw.pw); } },
    uSaving: !!s.uBusy,
    pwResetOpen: !!s.pwReset, pwResetName: (s.users.find(u => u.id === s.pwReset) || {}).name || '', defaultPw: DEFAULT_PASSWORD,
    pwResetText: Backend.on ? 'Their password goes back to the default first password (' + DEFAULT_PASSWORD + '). They must choose a new one when they sign in, and every device they are signed in on is signed out.' : 'Their password becomes the default ' + DEFAULT_PASSWORD + '. Share it with them; they can change it from Password & security after signing in.',
    closePwReset: () => this.setState({ pwReset:null }),
    confirmPwReset: () => { const u = s.users.find(x => x.id === s.pwReset); if (!u) return;
      if (Backend.on) { Backend.adminUsers('resetPassword', { email: u.email, empId: u.empId }).then(r => { this.logAudit('Reset password', u.name); this.setState({ pwReset:null, tempPw: { name: u.name, email: u.email, pw: r.tempPassword, why:'reset' } }); }).catch(e => this.toastMsg('Password not reset: ' + e.message)); return; }
      this.setState(st => ({ passwords: { ...st.passwords, [u.email]: DEFAULT_PASSWORD }, pwReset:null }));
      this.logAudit('Reset password', u.name); this.toastMsg(u.name + '’s password was reset to ' + DEFAULT_PASSWORD); },
  };
  return V;
};
