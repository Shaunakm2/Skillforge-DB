/* Skillforge LMS — Users › Bulk upload (fallback when the ZingHR API is down, or for urgent accounts).
 * Columns follow the UserMaster template. Only UserId, EmailId, UserName and MobileNumber are required;
 * every other column is optional and stored on the profile. Rows whose UserId already exists update that account
 * (only the columns given), new UserIds create accounts with the default password.
 * Result: created / updated / rejected, with a downloadable rejected-rows file (reason per row).
 * v41.32: rows are checked with the SAME rules as Create account (users.js USER_RULES): name letters only, employee ID
 * pattern, phone characters, designation, lengths, and no < or > in any column.
 */
const UM_COLS = [
  // [template header, profile field, required]
  ['UserId', 'empId', true], ['EmailId', 'email', true], ['UserName', 'name', true], ['MobileNumber', 'phone', true],
  ['Designation', 'designation'], ['Type of work profile', 'workProfile'], ['Type of employment', 'employment'], ['Location', 'site'],
  ['Division Head', 'divisionHead'], ['Division', 'dept'], ['Sub Division Head', 'subDivisionHead'], ['Sub Division', 'subDivision'],
  ['Client Name', 'client'], ['Company Name', 'company'], ['Brand Name', 'brand'], ['Brand Code', 'brandCode'],
  ['Reporting Manager', 'manager'], ['Language', 'language'], ['Currency', 'currency'], ['DateOfBirth', 'dob'], ['DateOfJoining', 'joined'],
  ['AccountExpiryDate', 'expires'], ['Gender', 'gender'], ['ReportsTo', 'reportsTo'], ['UserType', 'role'], ['UserRole', 'roleName'],
  ['JobRole', 'jobRole'], ['DateIntoRole', 'dateIntoRole'], ['Companion', 'companion'], ['Mentor', 'mentor'], ['HR Partner', 'hrPartner'], ['Country', 'country'],
];
const UM_DATES = ['dob', 'joined', 'expires', 'dateIntoRole'];
const UM_MAX = 120;   // v41.32: any optional text column (Designation: 60)
/* Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY and DD-Mon-YYYY. Returns YYYY-MM-DD or null. */
/* A real calendar date (rejects 31-31-2026, 30-02-2026…). */
const umReal = (y, mo, d) => { const t = new Date(Date.UTC(+y, +mo - 1, +d)); return t.getUTCFullYear() === +y && t.getUTCMonth() === +mo - 1 && t.getUTCDate() === +d ? y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null; };
const umDate = v => { v = String(v || '').trim(); if (!v) return ''; let m;
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return umReal(m[1], m[2], m[3]);
  if ((m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return umReal(m[3], m[2], m[1]);
  const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  if ((m = v.match(/^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})$/)) && MON[m[2].toLowerCase()]) return umReal(m[3], MON[m[2].toLowerCase()], m[1]);
  return null; };
SkillforgeApp.prototype.amUserImport = function (c) {
  const { s, role } = c;
  if (this._scrV !== 'users') return { uiOpen:false };
  const M = s.uImp, setM = patch => this.setState(st => ({ uImp: { ...(st.uImp || {}), ...patch } }));
  const run = () => {
    if (!M || !M.text) return setM({ msg:'Choose a file first.' });
    const rows = parseCsv(M.text); if (rows.length < 2) return setM({ msg: rows.length ? 'The file has a header row but no users.' : 'The file is empty.' });
    const norm = h => h.replace(/\*/g, '').trim().toLowerCase();
    const head = rows[0].map(norm), idx = Object.fromEntries(UM_COLS.map(([h]) => [h, head.indexOf(h.toLowerCase())]));
    const missingCols = UM_COLS.filter(x => x[2] && idx[x[0]] < 0).map(x => x[0]);
    if (missingCols.length) return setM({ msg:'The header row is missing ' + missingCols.join(', ') + '. Download the template to see the format.' });
    const users = s.users.slice(), byEmp = new Map(users.map((u, i) => [String(u.empId || '').toLowerCase(), i])), byMail = new Map(users.map((u, i) => [u.email.toLowerCase(), i]));
    const roleBy = new Map(s.roles.map(r => [r.name.toLowerCase(), r])), seen = new Map(), bad = [], created = [], updated = [];
    const pw = { ...s.passwords }; let enroll = s.enroll, assignedOn = s.assignedOn; let nextId = nextUserId(users);
    rows.slice(1).forEach((r, i) => { const n = i + 2, g = h => idx[h] < 0 ? '' : String(r[idx[h]] || '').trim(), rej = why => bad.push({ n, raw: UM_COLS.map(([h]) => g(h)), why });
      const emp = g('UserId'), mail = g('EmailId').toLowerCase(), name = g('UserName').replace(/\s+/g, ' '), phone = g('MobileNumber');
      if (!emp) return rej('UserId is required'); if (!mail) return rej('EmailId is required'); if (!name) return rej('UserName is required'); if (!phone) return rej('MobileNumber is required');
      // v41.32: same field rules as Create account
      const angled = UM_COLS.find(([h]) => /[<>]/.test(g(h))); if (angled) return rej(angled[0] + ' contains < or >, which are not allowed');
      if (!USER_RULES.emp.test(emp)) return rej('UserId “' + emp + '” can use letters, numbers, - _ / (2–30 characters, starting with a letter or number)');
      if (mail.length > 254 || !USER_RULES.email.test(mail)) return rej('EmailId “' + g('EmailId') + '” is not a valid email');
      if (name.length < 2 || name.length > 80 || !USER_RULES.name.test(name) || !/\p{L}.*\p{L}/u.test(name)) return rej('UserName “' + name + '” can use letters, spaces, apostrophes, dots and hyphens (2–80 characters)');
      if (!USER_RULES.phone.test(phone)) return rej('MobileNumber can use digits, +, spaces, brackets and dashes only');
      if (phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15) return rej('MobileNumber must have 7 to 15 digits');
      { const dg = g('Designation'); if (dg && (dg.length > 60 || !USER_RULES.desig.test(dg) || !/\p{L}/u.test(dg))) return rej('Designation must contain letters (letters, numbers, spaces and . , & ( ) / - only; 60 characters max)'); }
      { const long = UM_COLS.find(([h, f]) => !['empId', 'email', 'name', 'phone', 'designation'].includes(f) && g(h).length > UM_MAX); if (long) return rej(long[0] + ' is too long (' + UM_MAX + ' characters max)'); }
      if (seen.has(emp.toLowerCase())) return rej('UserId repeated in this file (row ' + seen.get(emp.toLowerCase()) + ')'); seen.set(emp.toLowerCase(), n);
      const ui = byEmp.get(emp.toLowerCase()), mi = byMail.get(mail);
      if (mi !== undefined && mi !== ui) return rej('EmailId already belongs to ' + users[mi].name + ' (' + users[mi].empId + ')');
      const rec = {};
      for (const [h, f] of UM_COLS) { const v = g(h); if (!v || ['empId', 'email', 'name', 'phone'].includes(f)) continue;
        if (UM_DATES.includes(f)) { const d = umDate(v); if (d === null) return rej(h + ' “' + v + '” is not a date (use YYYY-MM-DD or DD-MM-YYYY)'); rec[f] = d; continue; }
        rec[f] = v; }
      if (rec.gender && !['male', 'female', 'other', 'prefer not to say'].includes(rec.gender.toLowerCase())) return rej('Gender must be Male, Female, Other or Prefer not to say');
      if (rec.gender) rec.gender = rec.gender.charAt(0).toUpperCase() + rec.gender.slice(1).toLowerCase();
      if (rec.joined && rec.joined > Progress.plus(TODAY_KEY, 180)) return rej('DateOfJoining ' + rec.joined + ' is more than 6 months ahead');   // v41.32: same as the single form
      let roleRec = null;
      if (rec.roleName) { roleRec = roleBy.get(rec.roleName.toLowerCase()); if (!roleRec) return rej('UserRole “' + rec.roleName + '” does not exist. Create it under Roles & permissions or leave it blank'); }
      if (rec.role) { const t = ['Learner', 'Trainer', 'Admin'].find(x => x.toLowerCase() === rec.role.toLowerCase()); if (!t) return rej('UserType must be Learner, Trainer or Admin'); rec.role = t; }
      if (rec.expires && rec.expires < TODAY_KEY) return rej('AccountExpiryDate ' + rec.expires + ' is in the past');
      delete rec.roleName;
      if (roleRec) { rec.roleId = roleRec.id; rec.role = roleRec.base; }
      // Division fills both the division (dashboards, MIS) and the department (it used to fill only the department, so uploaded
      // people showed as “Unassigned” on every division dashboard). A Reporting Manager given as an employee code is linked by code.
      if (rec.dept) rec.division = rec.dept;
      if (rec.manager) { const mi2 = byEmp.get(String(rec.manager).toLowerCase()); if (mi2 !== undefined) rec.manager = users[mi2].name; }
      // Checked BEFORE anything changes (a rejected row used to be applied anyway).
      if (ui !== undefined && name !== Identity.plain(users[ui].name)) return rej('UserName differs from the existing account (' + users[ui].name + '). Rename people from their profile');
      if (ui !== undefined) { const before = users[ui]; users[ui] = { ...before, ...rec, email: mail, name: before.name, phone, status: before.status === 'Deactivated' ? 'Active' : before.status };
        updated.push(name); return; }   // name unchanged: the existing (possibly marked) name is kept
      const uname = Identity.uniqueName(users, name, emp);   // v41.20: same name allowed (invisible marker), only UserId and EmailId must be unique
      const nu = { id: nextId++, empId: emp, email: mail, name: uname, phone, role:'Learner', roleId:'r_learner', dept: rec.dept || 'Unassigned', designation: rec.designation || 'Associate', manager: rec.manager || 'None', status:'Active', lastLogin:'Never', gender: rec.gender || 'Prefer not to say', terms:false, joined: rec.joined || TODAY_KEY, source:'Bulk upload', ...rec };
      if (!nu.roleId) nu.roleId = ({ Learner:'r_learner', Trainer:'r_trainer', Admin:'r_admin' })[nu.role] || 'r_learner';
      users.push(nu); byEmp.set(emp.toLowerCase(), users.length - 1); byMail.set(mail, users.length - 1); pw[mail] = DEFAULT_PASSWORD; created.push(nu);
    });
    // New accounts get their role's courses and any essential trainings.
    created.forEach(u => { const r = s.roles.find(x => x.id === u.roleId); enroll = Access.applyCourses(enroll, r, u.name, Progress.plus(TODAY_KEY, 30)).enroll; });
    const ess = Essentials.apply(enroll, s.adminCourses, created, s.holidays, assignedOn);
    this.setState({ users, passwords: pw, enroll: ess.enroll, assignedOn: ess.assignedOn, uImp: { ...M, msg:'', result:{ total: rows.length - 1, created: created.length, updated: updated.length, bad } } });
    // Connected: create a login for every new person (random temporary passwords, changed at first sign-in).
    if (Backend.on && created.length) {
      this.setState(st => ({ uImp: { ...st.uImp, logins: { busy:true } } }));
      Backend.createLogins(created.map(u => ({ email: u.email, empId: u.empId, name: u.name, role: u.role, roleId: u.roleId, userKey: String(u.id) }))).then(r => this.setState(st => ({ uImp: { ...st.uImp, logins: r } })))
        .catch(e => this.setState(st => ({ uImp: { ...st.uImp, logins: { error: e.message } } }))); }
  };
  const R = M && M.result;
  return {
    uiOpen: !!M, uiM: M || {}, uiMsg: !!(M && M.msg), uiNoFile: !(M && M.text), uiHasRes: !!R,
    uiOpenModal: () => this.setState({ uImp: {} }), uiClose: () => this.setState({ uImp:null }), uiReset: () => this.setState({ uImp: {} }),
    uiRequired: UM_COLS.filter(x => x[2]).map(x => x[0]).join(', '), uiOptCount: UM_COLS.filter(x => !x[2]).length,
    uiTemplate: () => { csvDownload('UserMaster-template.csv', [UM_COLS.map(([h, , req]) => h + (req ? '*' : '')),
        ['EMP-2101', 'riya.shah@example.com', 'Riya Shah', '+91 98250 11223', 'Associate', 'Voice', 'Full-time', 'Ahmedabad', 'Lena Fischer', 'Customer Success', 'Priya Raman', 'Tier 1 support', 'Sample Client', 'Sample Company Pvt Ltd', 'Sample Brand', 'SB', 'Priya Raman', 'English', 'INR', '1999-04-12', '2026-10-05', '', 'Female', 'Priya Raman', 'Learner', 'Learner', 'Customer Support Associate', '2026-10-05', 'Aisha Khan', 'Jonas Berg', 'Hugo Laurent', 'India'],
        ['EMP-2102', 'kabir.mehta@example.com', 'Kabir Mehta', '9876543210'].concat(Array(UM_COLS.length - 4).fill(''))]);
      this.toastMsg('UserMaster template downloaded'); },
    uiPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/\.csv$/i.test(f.name)) { e.target.value = ''; return setM({ name:'', text:'', msg:'Upload a .csv file. In Excel, use File › Save As › CSV (UTF-8).' }); } f.text().then(t => setM({ name: f.name, text: t, msg:'', result:null })); },
    uiImport: run,
    uiLogins: !!(M && M.logins), uiLoginsBusy: !!(M && M.logins && M.logins.busy), uiLoginsErr: (M && M.logins && M.logins.error) || '',
    uiLoginsLine: M && M.logins && M.logins.created ? M.logins.created.length + ' logins created' + (M.logins.skipped.length ? ' · ' + M.logins.skipped.length + ' skipped' : '') + '. Download the temporary passwords now: they are not shown again.' : '',
    uiLoginsCsv: () => { const L = M.logins; csvDownload('temporary-passwords-' + TODAY_KEY + '.csv', [['Email', 'Employee ID', 'Temporary password', 'Note']].concat(L.created.map(x => [x.email, x.empId, x.tempPassword, 'Must be changed at first sign-in'])).concat(L.skipped.map(x => [x.email, '', '', 'Skipped: ' + x.reason]))); },
    uiRes: R ? { okLine: (R.created || R.updated) ? R.created + (R.created === 1 ? ' account created' : ' accounts created') + ' · ' + R.updated + (R.updated === 1 ? ' updated' : ' updated') + (Backend.on ? '.' : '. New accounts use the password ' + DEFAULT_PASSWORD + '.') : 'No accounts were created or updated.',
      hasOk: R.created + R.updated > 0, hasBad: R.bad.length > 0, badLine: R.bad.length + ' of ' + R.total + (R.total === 1 ? ' row' : ' rows') + ' rejected.',
      badRows: R.bad.slice(0, 5).map(x => ({ n:'Row ' + x.n, why: x.why })), more: R.bad.length > 5 ? '+ ' + (R.bad.length - 5) + ' more in the download' : '' } : {},
    uiRejects: () => { csvDownload('UserMaster-rejected-' + TODAY_KEY + '.csv', [['Row'].concat(UM_COLS.map(x => x[0])).concat(['Reason'])].concat(R.bad.map(x => [x.n].concat(x.raw).concat([x.why])))); this.toastMsg(R.bad.length + ' rejected rows downloaded'); },
  };
};
