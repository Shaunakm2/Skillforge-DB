/* Skillforge LMS — sample data for Settings › Migration.
 *  SYNC_LOG0      Every change received from HRMS and other API providers (nightly and weekly sync runs).
 *  EXT_HISTORY0   Learning records already imported from another LMS.
 */
const SYNC_SOURCES = ['ZingHR (HRMS)', 'SAP SuccessFactors', 'Okta (SSO)', 'Payroll API'];
const SYNC_TYPES = ['New hire', 'Department change', 'Manager change', 'Designation change', 'Location change', 'Email change', 'Phone change', 'Exit'];
const SYNC_LOG0 = (() => {
  const out = [], users = USERS0, depts = DEPTS, locs = ['Ahmedabad', 'Pune', 'Bengaluru', 'London', 'Berlin', 'Austin'];
  const h = str => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967295; };
  const add = (date, time, source, type, u, field, from, to, status, note) => out.push({ id:'sl' + out.length, at: date + 'T' + time, source, run: (source === 'ZingHR (HRMS)' ? 'WD-' : source === 'SAP SuccessFactors' ? 'SF-' : source === 'Okta (SSO)' ? 'OK-' : 'PY-') + date.slice(5).replace('-', ''), type, empId: u.empId, name: u.name, field, from, to, status, note: note || '' });
  // New hires that match the joining dates of recent trainees
  users.filter(u => u.joined >= '2026-07-01').forEach(u => add(u.joined, '02:10', 'ZingHR (HRMS)', 'New hire', u, 'Employee record', '', 'Created · ' + u.dept + ' · ' + u.designation, 'Applied'));
  // Routine changes across the quarter
  const start = new Date('2026-07-01T12:00:00');
  for (let i = 0; i < 64; i++) {
    const d = new Date(start); d.setDate(d.getDate() + (i * 37 + Math.floor(h('d' + i) * 13)) % 95); const date = dateKey(d); if (date > TODAY_KEY) continue;
    const u = users[Math.floor(h('u' + i) * users.length)], src = SYNC_SOURCES[Math.floor(h('s' + i) * (i % 5 === 0 ? 4 : 2))];
    const type = SYNC_TYPES[1 + Math.floor(h('t' + i) * 6)], time = String(1 + Math.floor(h('h' + i) * 5)).padStart(2, '0') + ':' + String(Math.floor(h('m' + i) * 60)).padStart(2, '0');
    const r = h('r' + i), status = r < 0.08 ? 'Failed' : r < 0.16 ? 'Skipped' : 'Applied';
    if (type === 'Department change') { const to = depts[Math.floor(h('x' + i) * depts.length)]; add(date, time, src, type, u, 'Department', u.dept, to, to === u.dept ? 'Skipped' : status, to === u.dept ? 'No change' : status === 'Failed' ? 'Department not mapped in Skillforge' : ''); }
    else if (type === 'Manager change') add(date, time, src, type, u, 'Manager', u.manager || 'None', ['Priya Raman', 'Hugo Laurent', 'Lena Fischer'][i % 3], status, status === 'Failed' ? 'Manager not found in Skillforge' : status === 'Skipped' ? 'Duplicate of an earlier change' : '');
    else if (type === 'Designation change') add(date, time, src, type, u, 'Designation', u.designation, ['Senior Associate', 'Team Lead', 'Specialist', 'Analyst'][i % 4], status, status === 'Failed' ? 'Value longer than 40 characters' : '');
    else if (type === 'Location change') add(date, time, src, type, u, 'Location', locs[i % locs.length], locs[(i + 2) % locs.length], status);
    else if (type === 'Email change') add(date, time, 'Okta (SSO)', type, u, 'Email', u.email, u.email.replace('@', '.work@'), status === 'Failed' ? 'Failed' : 'Applied', status === 'Failed' ? 'Email already used by another account' : '');
    else add(date, time, 'Payroll API', type, u, 'Phone', u.phone, '+91 98' + String(10000000 + Math.floor(h('p' + i) * 89999999)).slice(0, 8), status);
  }
  const fw = users.find(u => u.status === 'Deactivated');
  if (fw) add('2026-08-28', '02:05', 'ZingHR (HRMS)', 'Exit', fw, 'Status', 'Active', 'Deactivated', 'Applied', 'Last working day Aug 27');
  return out.sort((a, b) => a.at.localeCompare(b.at));
})();
const EXT_HISTORY0 = [
  { id:'ex1', user:'Lena Fischer', empId:'NW-1007', courseId:null, courseCode:'', extCourse:'Instructional Design Foundations', source:'Cornerstone OnDemand', status:'Completed', startedOn:'2024-02-05', completedOn:'2024-03-01', score:88, certId:'CSOD-55120', importedOn:'2026-09-02', importedBy:'Lena Fischer' },
  { id:'ex2', user:'Daniel Reyes', empId:'NW-1005', courseId:null, courseCode:'', extCourse:'Facilitation Skills Level 2', source:'Cornerstone OnDemand', status:'Completed', startedOn:'2023-10-10', completedOn:'2023-11-02', score:92, certId:'CSOD-48811', importedOn:'2026-09-02', importedBy:'Lena Fischer' },
  { id:'ex4', user:'Maya Okafor', empId:'NW-1001', courseId:'feedback', courseCode:'CRS-1003', extCourse:'Giving Feedback That Lands', source:'Instructor-led session (recorded offline)', status:'Completed', startedOn:'2026-09-22', completedOn:'2026-09-25', score:88, certId:'', importedOn:'2026-09-26', importedBy:'Lena Fischer' },
  { id:'ex3', user:'Priya Raman', empId:'NW-1004', courseId:'oneonones', courseCode:'CRS-1004', extCourse:'Running Effective 1:1s', source:'Cornerstone OnDemand', status:'Completed', startedOn:'2025-05-12', completedOn:'2025-05-20', score:'', certId:'', importedOn:'2026-09-02', importedBy:'Lena Fischer' },
];
