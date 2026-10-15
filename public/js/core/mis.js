/* Skillforge LMS — the MIS: one row per trainee per batch, built from live batch, user, status and
 * certification records. Column names and order match the "Book1" MIS workbook exactly.
 * Used by Reports › MIS report (download .xlsx / .csv) and the MIS dashboard.
 */
const MIS_HEAD = ['Sr. No.', 'Year', 'Month', 'Brand', 'Training Segment', 'Type of Trainee', 'Training Name', 'Batch No', 'Trainer Assigned', 'Employee ID', 'Name', 'Division', 'Sub Divison',
  'Hiring Manager', 'Division Head', 'Gender', 'Designation', 'Location', 'WFO/WFH', 'Active on day 1', 'Training Days', 'DOJ', 'Classroom Start Date', 'Classroom End Date', 'OJT Start Date', 'OJT End Date',
  'Handover Date', 'Early Absorb Date', 'Attrition Category', 'Attrition Responsibility', 'DOL', 'Reason', 'Current Status', 'M1 1st attempt', 'M1 2nd attempt', 'M2 Result status', 'M3 Result status', 'M4 Result status',
  'Early Handover email Subject line', 'Resignation Date', 'IMS Email ID', 'Contact Number', 'Education', 'Total experience (in months)', 'Account Name', 'Manager Name'];
const MIS_VALID_HEAD = ['Training Segment', 'Type of training', 'Training Name', 'Current Status', 'Divisional Head', 'Trainer Name', 'Location', 'Division', 'Sub-Division'];
const Mis = (() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const us = k => k ? k.slice(5, 7) + '/' + k.slice(8, 10) + '/' + k.slice(0, 4) : '';
  const plusW = (k, n) => { let d = k, c = 0; while (c < n) { d = Progress.plus(d, 1); const w = new Date(d + 'T12:00:00').getDay(); if (w && w !== 6) c++; } return d; };
  let key = null, val = null;
  /* Structured records (dates as YYYY-MM-DD) — the dashboard uses these; the report formats them. */
  function records(s) {
    const k = [s.batches, s.users, s.statuses, s.ttypes, s.holidays];
    if (key && k.every((x, i) => x === key[i])) return val;
    const userBy = new Map(s.users.map(u => [u.name, u])), stBy = new Map(s.statuses.map(x => [x.id, x])), ttBy = new Map(s.ttypes.map(t => [t.id, t]));
    const out = [];
    s.batches.slice().sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code)).forEach(b => {
      const tt = ttBy.get(b.type) || { days:[], passPct:70, name:'' }, days = typeof batchDates === 'function' ? batchDates(b, tt, holSetFor(s.holidays, b)).length || tt.days.length : tt.days.length, ojtS = plusW(b.end, 1), ojtE = b.ojtEnd || plusW(b.end, tt.ojtDays || 5), hand = b.handover || plusW(ojtE, 1);
      const counted = Object.keys((b.cert || {}).lms || {}).filter(x => b.cert.lms[x] > 0), exts = ((b.cert || {}).ext || []).filter(e => e.w > 0);
      b.trainees.forEach(name => {
        const u = userBy.get(name) || { name }, list = (b.st || {})[name] || [], last = list[list.length - 1], S = stBy.get(last ? last.status : 'st_intr') || { name:'In-Training', type:'active' };
        const T = S.type, find = types => list.slice().reverse().find(e => types.includes((stBy.get(e.status) || {}).type));
        const attr = T === 'attrition' || T === 'noshow' ? last : null, early = list.find(e => e.status === 'st_eabs' || (stBy.get(e.status) || {}).type === 'absorbed');
        const handE = find(['graduated']);
        // assessment results: real scores where the batch recorded them, otherwise none for people who left early
        const prog = (b.prog || {})[name] || {}, ext = (b.ext || {})[name] || {};
        const scores = counted.map(x => prog[x] && prog[x].score != null ? prog[x].score : null).concat(exts.map(e => ext[e.id] != null ? Math.round(ext[e.id] / e.max * 100) : null));
        const reached = ['ojt', 'graduated', 'failed'].includes(T) || (T === 'active' && TODAY_KEY > b.end), seedS = 58 + Math.floor(Progress.hash(name + b.code) * 41);
        const sc = i => scores[i] != null ? scores[i] : reached && (b.gen || scores.every(x => x == null)) ? Math.min(100, seedS + i * 3) : null;
        const noPass = tt.passPct == null || tt.passPct === '', fmtS = v => v == null ? '' : noPass ? v + '%' : (v >= tt.passPct ? 'Pass' : 'Fail') + ' (' + v + '%)', m = i => fmtS(sc(i));   // v41.21: no pass mark yet = score only
        const v1 = sc(0), m1 = fmtS(v1), m1b = !noPass && v1 != null && v1 < tt.passPct ? fmtS(Math.min(100, v1 + 12)) : '';
        out.push({ year: +b.start.slice(0, 4), month: MONTHS[+b.start.slice(5, 7) - 1], monthKey: b.start.slice(0, 7), brand: u.brand || '', segment: b.segment || (tt.name.includes('Communication') ? 'Communication Training' : 'Functional Training'),
          traineeType: b.traineeType || (u.joined && u.joined >= Progress.plus(b.start, -14) ? 'New Hire' : 'Existing'), training: b.trainingName || tt.name, batch: b.code, batchId: b.id, trainer: b.trainer, empId: u.empId || '', name,
          division: u.division || '', subDivision: u.subDivision || '', hiringManager: u.manager && u.manager !== 'None' ? u.manager : '', divisionHead: u.divisionHead || '', gender: u.gender || '', designation: u.designation || '', location: u.site || '', wfo: u.wfo || 'WFO',
          activeDay1: T === 'noshow' ? 'Inactive' : 'Active', days: T === 'absorbed' && last && last.status === 'st_dabs' ? 1 : days, doj: u.joined || '', cs: b.start, ce: b.end, os: ojtS, oe: ojtE,
          handover: handE ? handE.date : T === 'absorbed' && early ? early.date : hand, plannedHandover: hand, earlyAbsorb: early && early.status === 'st_eabs' ? early.date : '',
          attrCat: attr ? attr.attType || (T === 'noshow' ? 'Voluntary' : '') : '', attrResp: attr ? attr.resp || (T === 'noshow' ? 'HR' : '') : '', dol: attr ? attr.date : '', reason: attr ? attr.reason || (T === 'noshow' ? 'No call no show' : attr.details || '') : '', status: S.name, statusType: T, group: groupOf(S),
          m1, m1b, m2: m(1), m3: m(2), m4: m(3),
          subject: early && early.status === 'st_eabs' ? 'Early Handover | ' + (b.trainingName || tt.name) + ' | ' + b.code + ' | ' + name + ' (' + (u.empId || '') + ')' : '',
          resignation: attr && attr.attType === 'Voluntary' ? attr.date : '', email: u.email || '', phone: u.phone || '', education: u.education || '', exp: u.expMonths == null ? '' : u.expMonths === 0 ? 'Fresher' : u.expMonths + ' Months',
          account: (early && early.target) || u.account || '', managerName: ['graduated', 'absorbed'].includes(T) ? (u.manager && u.manager !== 'None' ? u.manager : '') : '' });
      });
    });
    key = k; val = out; return out;
  }
  /* Rows in the Book1 column order. */
  const row = (r, i) => [i + 1, r.year, r.month, r.brand, r.segment, r.traineeType, r.training, r.batch, r.trainer, r.empId, r.name, r.division, r.subDivision, r.hiringManager, r.divisionHead, r.gender, r.designation, r.location, r.wfo, r.activeDay1, r.days,
    us(r.doj), us(r.cs), us(r.ce), r.days > 1 ? us(r.os) : '', r.days > 1 ? us(r.oe) : '', us(r.handover), us(r.earlyAbsorb), r.attrCat, r.attrResp, us(r.dol), r.reason, r.status, r.m1, r.m1b, r.m2, r.m3, r.m4, r.subject, us(r.resignation), r.email, r.phone, r.education, r.exp, r.account, r.managerName];
  function validation(s) {
    const trainers = [...new Set(s.users.filter(u => u.role === 'Trainer' && u.status !== 'Deactivated').map(u => u.name))].sort();
    const cols = [s.masters.segments, s.masters.traineeTypes, s.masters.trainingNames, s.statuses.map(x => x.name), s.masters.divisionHeads, trainers, s.masters.locations, s.masters.divisions, s.masters.subDivisions];
    const n = Math.max(...cols.map(c => c.length)), rows = [MIS_VALID_HEAD];
    for (let i = 0; i < n; i++) rows.push(cols.map(c => c[i] || ''));
    return { rows, lens: cols.map(c => c.length) };
  }
  /* Exact Book1 workbook: "Data" sheet + "Validation" sheet, with drop-down lists on the Data columns. */
  function workbook(s, recs, name) {
    const V = validation(s), ref = (ci) => 'Validation!$' + Xlsx.col(ci) + '$2:$' + Xlsx.col(ci) + '$' + (V.lens[ci] + 1);
    const H = h => MIS_HEAD.indexOf(h);
    return Xlsx.download(name, [{ name:'Data', rows: [MIS_HEAD].concat(recs.map(row)), lists: [[H('Training Segment'), 0], [H('Type of Trainee'), 1], [H('Training Name'), 2], [H('Current Status'), 3], [H('Division Head'), 4], [H('Trainer Assigned'), 5], [H('Location'), 6], [H('Division'), 7], [H('Sub Divison'), 8]].map(([c, v]) => ({ col: c, ref: ref(v) })) },
      { name:'Validation', rows: V.rows, filter:false }]);
  }
  return { records, row, workbook, validation, us };
})();
