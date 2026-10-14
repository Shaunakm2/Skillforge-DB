/* Skillforge LMS — Analytics dashboards (Power BI–style, customisable) and the MIS dashboard.
 *
 *  Three data sources:
 *    Learning   course assignments and completions (≈125k assignments)
 *    Training   the training MIS: one row per trainee per batch (Mis.records), batches, their live status and day-wise attendance
 *    People     the HRMS employee master (synced from ZingHR): status, division, location, date of joining
 *  Visuals: KPI, bar, column, line, donut, stacked bar, heat map (any two dimensions), table (choose its columns),
 *  handover-TAT matrix, batch tracker, spider web (radar), gauge and treemap. Custom KPIs (KPI builder, js/core/formula.js)
 *  work wherever a built-in measure does. Clicking a bar, slice, cell or row shows the records behind it.
 *  Each visual picks a source, measure and dimension; learning visuals can carry their own course drop-down.
 *  Page filters (division, sub division, course, training, location, date range) apply to every visual.
 *  Dashboards are saved by name; "MIS dashboard" is a ready-made board on the training source.
 */
const DB_SRC = { learn:'Learning (courses)', train:'Training (batches / MIS)', hr:'People (HRMS employee master)' };
const DB_MEASURES = {
  learn: { assignments:['Assignments', 'n'], completed:['Completed', 'n'], certs:['Certificates issued', 'n'], certCourses:['Assignments on courses with a certificate', 'n'], inProgress:['In progress', 'n'], overdue:['Overdue', 'n'], notStarted:['Not started', 'n'], completionRate:['Completion rate', 'pct'], overdueRate:['Overdue rate', 'pct'], learners:['Learners', 'n'], avgScore:['Average assessment score', 'pct'], modules:['Modules completed', 'n'] },
  hr: { employees:['People (active)', 'n'], active:['Active', 'n'], deactivated:['Deactivated (left)', 'n'], accounts:['All accounts (incl. deactivated)', 'n'], joiners:['Joiners (From–To, else last 30 days)', 'n'] },
  train: { joined:['Joined', 'n'], classDone:['Completed classroom', 'n'], volShare:['Voluntary share of attrition', 'pct'], earlyLeft:['Left before OJT', 'n'], daysToLeave:['Average days before leaving', 'dec'], participants:['Participants', 'n'], unique:['Unique trainees', 'n'], handover:['Handed over', 'n'], earlyAbsorb:['Early absorbed', 'n'], inTraining:['In training', 'n'], attrited:['Attrited (incl. did not join)', 'n'], attrJoined:['Left after joining', 'n'], noshow:['Did not join', 'n'], throughput:['Throughput', 'pct'], attritionRate:['Attrition rate', 'pct'], avgTat:['Avg handover TAT (weeks)', 'dec'], batches:['Batches', 'n'] },
};
const DB_DIMS = {
  learn: { division:'Division', subDivision:'Sub division', dept:'Department', category:'Course category', site:'Location', status:'Assignment status', month:'Completion month (completed only)', dueMonth:'Due month', course:'Course (top 10)', role:'User type' },
  hr: { division:'Division', subDivision:'Sub division', dept:'Department', site:'Location', role:'User type', gender:'Gender', designation:'Designation', status:'Account status', joinMonth:'Joining month' },
  train: { segment:'Training segment', training:'Training name', month:'Month', attrMonth:'Attrition month (DOL)', reason:'Attrition reason', attrCat:'Voluntary / involuntary', attrResp:'Attrition responsibility', attrStage:'Stage at attrition', location:'Location', brand:'Brand', traineeType:'Type of trainee', status:'Current status', group:'Status group', subDivision:'Sub division', division:'Division', trainer:'Trainer', batch:'Batch' },
};
const DB_TYPES = {
  kpi:['KPI card', 'One number', false], funnel:['Pipeline funnel', 'Mapped → joined → classroom → handed over', false], rank:['Ranked list', 'Top items with share of total', true], bar:['Bar chart', 'Compare across a dimension', true], column:['Column chart', 'Compare across a dimension', true], line:['Line chart', 'Trend over months', true], donut:['Donut', 'Share of a whole', true],
  stack:['Stacked bar', 'Status split per group', true], heat:['Heat map', 'Two dimensions at once', false], table:['Table', 'Rows with several measures', true], matrix:['Handover TAT matrix', 'Weeks from joining to handover, by group', true], batches:['Batch tracker', 'Where each batch is right now', false],
  pipeline:['Handover pipeline', 'Per week: handed over and expected on the floor', false], attrend:['Attrition trend', 'People who left each month, last 12 months', false],
  radar:['Spider web (radar)', 'Several measures compared across up to 6 groups', true], gauge:['Gauge', 'One number against its target', false], tree:['Treemap', 'Share of a whole as nested tiles', true],
};
const DB_TRAIN_ONLY = ['matrix', 'batches', 'funnel', 'pipeline', 'attrend'];
const DB_COLORS = ['#007A4D', '#0066A1', '#D64545', '#5B7DB8', '#8C5A9E', '#08AE6E', '#CA8A04', '#DB2777', '#0891B2', '#65A30D'];
const TAT_BUCKETS = [['≤3', 0, 3], ['4-5', 4, 5], ['6-7', 6, 7], ['8-9', 8, 9], ['10+', 10, 999]];
const DB_DEFAULT = [
  { id:'v1', src:'learn', type:'kpi', measure:'learners', w:3 }, { id:'v2', src:'learn', type:'kpi', measure:'assignments', w:3 }, { id:'v3', src:'learn', type:'kpi', measure:'completionRate', w:3 }, { id:'v4', src:'learn', type:'kpi', measure:'overdue', w:3 },
  { id:'v7', src:'learn', type:'line', measure:'completed', dim:'month', w:8, title:'Courses completed each month', pick:true },
  { id:'v11', src:'learn', type:'donut', measure:'assignments', dim:'status', w:4, title:'Course-wise completion', pick:true },
  { id:'v5', src:'learn', type:'rank', measure:'completionRate', dim:'division', w:6, title:'Completion rate by division', pick:true },
  { id:'v8', src:'learn', type:'rank', measure:'overdue', dim:'category', w:6, title:'Where overdue learning sits' },
  { id:'v10', src:'learn', type:'rank', dim:'course', measure:'assignments', w:12, title:'Most assigned courses' },
];
/* Training overview: original layout (pipeline, live batches, outcomes, mix) — no location or brand breakdowns. */
const DB_MIS = [
  { id:'m30', src:'train', type:'funnel', w:5, title:'Training pipeline' },
  { id:'m31', src:'train', type:'line', measure:'participants', measure2:'handover', dim:'month', w:7, title:'Participants vs handed over, by batch start month' },
  { id:'m32', src:'train', type:'donut', measure:'participants', dim:'group', w:4, title:'Where everyone is now' },
  { id:'m33', src:'train', type:'rank', measure:'participants', dim:'segment', w:4, title:'Training mix' },
  { id:'m34', src:'train', type:'stack', measure:'participants', dim:'traineeType', w:4, title:'New hires vs existing' },
  { id:'m35', src:'train', type:'rank', measure:'participants', dim:'training', w:6, title:'Busiest programmes' },
  { id:'m36', src:'train', type:'rank', measure:'inTraining', dim:'trainer', w:6, title:'Trainer load · people in training now' },
  { id:'m7', src:'train', type:'batches', w:12, title:'Batches in progress', active:true },
];
/* Attrition: its own dashboard. */
const DB_ATTR = [
  { id:'a3', src:'train', type:'kpi', measure:'volShare', w:6 }, { id:'a4', src:'train', type:'kpi', measure:'daysToLeave', w:6 },
  { id:'a5', src:'train', type:'line', measure:'attrited', dim:'attrMonth', w:8, title:'Attrition trend · by month of leaving' },
  { id:'a6', src:'train', type:'donut', measure:'attrited', dim:'attrStage', w:4, title:'When people leave' },
  { id:'a7', src:'train', type:'column', measure:'attritionRate', dim:'month', w:8, title:'Attrition rate by batch start month' },
  { id:'a8', src:'train', type:'donut', measure:'attrited', dim:'attrCat', w:4, title:'Voluntary vs involuntary' },
  { id:'a9', src:'train', type:'rank', measure:'attrited', dim:'reason', w:6, title:'Why people leave' },
  { id:'a10', src:'train', type:'rank', measure:'attrited', dim:'attrResp', w:6, title:'Attributed to' },
  { id:'a11', src:'train', type:'rank', measure:'attritionRate', dim:'segment', w:6, title:'Attrition rate by training segment' },
  { id:'a12', src:'train', type:'stack', measure:'participants', dim:'traineeType', w:6, title:'Outcomes · new hires vs existing' },
];
/* MIS tab (v30): a board like the others, so it can be customised. Starts with the two panels it always had. */
const DB_MISTAB = [
  { id:'mt1', src:'train', type:'pipeline', w:12, title:'Handover pipeline · when trainees reach the floor (classroom end + 1 working day)' },
  { id:'mt2', src:'train', type:'attrend', w:12, title:'Attrition trend · people who left each month' },
];
/* Boards on the Training overview & MIS page: the three built-in tabs and any board created there (area 'train'). */
const TR_BUILTIN = { overview:'mis', mis:'mistab', attrition:'attr' };
const isTrBoard = b => !!b && (Object.values(TR_BUILTIN).includes(b.id) || b.area === 'train');
const DB0 = { boards:[{ id:'mis', name:'Training overview', visuals: DB_MIS }, { id:'mistab', name:'MIS', visuals: DB_MISTAB }, { id:'attr', name:'Attrition', visuals: DB_ATTR }, { id:'b1', name:'Learning overview', visuals: DB_DEFAULT },
  { id:'b2', name:'Compliance watch', visuals:[{ id:'c1', src:'learn', type:'kpi', measure:'overdueRate', w:4 }, { id:'c2', src:'learn', type:'kpi', measure:'overdue', w:4 }, { id:'c3', src:'learn', type:'kpi', measure:'notStarted', w:4 }, { id:'c4', src:'learn', type:'stack', dim:'subDivision', measure:'assignments', w:12, title:'Status by sub division', pick:true }, { id:'c5', src:'learn', type:'rank', measure:'overdue', dim:'site', w:6 }, { id:'c6', src:'learn', type:'rank', measure:'overdue', dim:'course', w:6 }] }],
  cur:'b1', slicers:{ division:'All', sub:'All', course:'All', training:'All', location:'All', from:'', to:'' }, edit:false };
/* Custom KPIs (Analytics › KPI builder). code = the name formulas use; fmt n | pct | dec; dir up (higher is better) or down;
 * green / amber = thresholds for the RAG colour (blank = no colour). Three starters show the attendance and HRMS fields. */
const KPI0 = [
  { id:'kp1', code:'day1_retained', name:'Joined on day 0 (HRMS) minus absent on day 1', src:'train', formula:'hrms_joined_day0 - ABSENT_DAY(1)', fmt:'n', dp:0, dir:'up', green:'', amber:'',
    desc:'Trainees whose HRMS date of joining is on or before the batch start, minus trainees marked absent on training day 1.' },
  { id:'kp2', code:'day1_absence_rate', name:'Day-1 absence rate', src:'train', formula:'PCT(ABSENT_DAY(1), MARKED_DAY(1))', fmt:'pct', dp:1, dir:'down', green:'5', amber:'8',
    desc:'Absent on training day 1 ÷ everyone whose day-1 attendance was marked.' },
  { id:'kp3', code:'day1_show_rate', name:'Day-1 show-up vs HRMS joiners', src:'train', formula:'PCT(PRESENT_DAY(1), hrms_joined_day0)', fmt:'pct', dp:1, dir:'up', green:'95', amber:'90',
    desc:'Present or late on training day 1 ÷ trainees joined as per HRMS by day 0.' },
];
DB0.kpis = KPI0; DB0.schedules = []; DB0.templates = [];
/* Ready-made dashboards (+ New dashboard › Start from). Built only from measures the data really has. */
const DB_TEMPLATES = [
  { id:'t_induction', name:'Induction & day-1 attendance', visuals:[
    { src:'train', type:'kpi', measure:'k:kp1', w:3 }, { src:'train', type:'kpi', measure:'k:kp2', w:3 }, { src:'train', type:'kpi', measure:'k:kp3', w:3 }, { src:'train', type:'kpi', measure:'participants', w:3 },
    { src:'train', type:'column', measure:'k:kp2', dim:'month', w:8, title:'Day-1 absence rate by batch start month' }, { src:'train', type:'gauge', measure:'k:kp3', w:4, title:'Day-1 show-up vs HRMS joiners' },
    { src:'train', type:'heat', hx:true, measure:'k:kp2', dim:'training', dim2:'location', w:12, title:'Day-1 absence rate · training × location' },
    { src:'train', type:'table', measure:'participants', dim:'batch', cols:['participants', 'k:kp1', 'k:kp2', 'k:kp3'], w:12, title:'Batch by batch' }] },
  { id:'t_trainer', name:'Trainer effectiveness', visuals:[
    { src:'train', type:'radar', measure:'participants', dim:'trainer', axes:['throughput', 'k:kp3', 'participants', 'classDone', 'handover'], n:5, w:6, title:'Top 5 trainers by people trained' },
    { src:'train', type:'rank', measure:'throughput', dim:'trainer', w:6, title:'Throughput by trainer' },
    { src:'train', type:'heat', hx:true, measure:'throughput', dim:'trainer', dim2:'month', w:12, title:'Throughput · trainer × batch start month' },
    { src:'train', type:'table', measure:'participants', dim:'trainer', cols:['participants', 'joined', 'handover', 'throughput', 'attritionRate', 'k:kp2'], w:12, title:'Trainer scorecard' }] },
  { id:'t_attendance', name:'Attendance heat map', visuals:[
    { src:'train', type:'heat', hx:true, measure:'k:kp2', dim:'training', dim2:'month', w:12, title:'Day-1 absence rate · training × month' },
    { src:'train', type:'heat', hx:true, measure:'attritionRate', dim:'location', dim2:'segment', w:12, title:'Attrition rate · location × segment' }] },
  { id:'t_people', name:'Workforce (HRMS)', visuals:[
    { src:'hr', type:'kpi', measure:'employees', w:4 }, { src:'hr', type:'kpi', measure:'active', w:4 }, { src:'hr', type:'kpi', measure:'joiners', w:4 },
    { src:'hr', type:'line', measure:'employees', dim:'joinMonth', w:8, title:'Current people by joining month' }, { src:'hr', type:'donut', measure:'accounts', dim:'status', w:4, title:'Account status (all accounts)' },
    { src:'hr', type:'tree', measure:'active', dim:'division', w:6, title:'Active people by division' }, { src:'hr', type:'heat', hx:true, measure:'active', dim:'division', dim2:'site', w:6, title:'Active people · division × location' }] },
  { id:'t_compliance', name:'Compliance watch', visuals: null },   // copies the built-in board b2
];

const Dash = (() => {
  // Results per filter combination. Bounded: the oldest entries go first, so a long session does not keep growing.
  const caches = new Map(), CACHE_MAX = 32, _set = caches.set.bind(caches);
  caches.set = (k, v) => { caches.delete(k); _set(k, v); while (caches.size > CACHE_MAX) caches.delete(caches.keys().next().value); return caches; };
  const blank = () => ({ certs:0, certCourses:0, assignments:0, completed:0, inProgress:0, overdue:0, notStarted:0, modules:0, scoreSum:0, scoreN:0, learners:new Set() });
  /* Learning: walks every assignment once (only the course's assignees when a course is chosen) and hands each one to
   * onRow(u, a, f) with its status and dimension values. Aggregation, two-dimension heat maps and drill-through all use
   * this one pass, so they always agree. */
  const done0 = (n, dn) => !!(n && dn >= n);
  function learnPass(s, sl, course, onRow) {
    const uOk = u => u && u.status !== 'Deactivated' && (sl.division === 'All' || u.division === sl.division) && (sl.sub === 'All' || u.subDivision === sl.sub) && (sl.location === 'All' || u.site === sl.location);
    const visit = (u, cid, due) => { const a = Progress.courseOf(s, cid); if (!a) return; const r = (s.itemDone[u.name] || {})[cid], n = a.items.length; let dn = 0, last = '', sc = 0, scn = 0;
      if (r) for (const i in r) { dn++; const v = r[i], at = typeof v === 'string' ? v : v.at; if (at > last) last = at; if (v && typeof v === 'object' && v.score != null) { sc += v.score; scn++; } }
      // Completions imported from another LMS count as completed everywhere (same rule as the reports and My learning).
      const mig = !done0(n, dn) ? Progress.migrated(s, u.name, cid) : null; if (mig && mig.completedOn > last) last = mig.completedOn;
      const done = done0(n, dn) || !!mig;
      if (sl.from || sl.to) { const on = Progress.assignedOn(s, u.name, cid) || due, inR = d => d && (!sl.from || d >= sl.from) && (!sl.to || d <= sl.to); if (!inR(on) && !(done && inR(last))) return; }
      const st = done ? 'Completed' : due < TODAY_KEY ? 'Overdue' : dn ? 'In progress' : 'Not started', fk = { Completed:'completed', Overdue:'overdue', 'In progress':'inProgress', 'Not started':'notStarted' }[st];
      const dims = { division: u.division || 'Unassigned', subDivision: u.subDivision || 'Unassigned', dept: u.dept || 'Unassigned', category: a.cat || 'Other', site: u.site || '—', status: st, role: u.role, course: a.code + ' · ' + a.title, dueMonth: due ? due.slice(0, 7) : 'No due date' };
      onRow(u, a, { cert: Progress.hasCert(a), cid, due, st, fk, dn, n, sc, scn, done, last, dims }); };
    const ub = Feedback.userIndex(s.users);
    if (course && course !== 'All') Feedback.assignees(s.enroll, course).forEach(n => { const u = ub.get(n); if (uOk(u)) visit(u, course, s.enroll[n][course]); });
    else s.users.forEach(u => { if (!uOk(u)) return; const en = s.enroll[u.name]; if (en) for (const cid in en) visit(u, cid, en[cid]); });
  }
  const lBump = (row, f, u) => { if (f.cert) { row.certCourses++; if (f.done) row.certs++; } row.assignments++; row[f.fk]++; row.modules += f.dn; row.scoreSum += f.sc; row.scoreN += f.scn; row.learners.add(u.name); };
  function learn(s, sl, course) {
    const ck = 'L|' + [sl.division, sl.sub, sl.location, sl.from, sl.to, course].join('|'), deps = [s.enroll, s.itemDone, s.users, s.adminCourses, s.extHistory, s.assignedOn];
    const hit = caches.get(ck); if (hit && hit.deps.every((x, i) => x === deps[i])) return hit.v;
    const T = {}, tot = blank(), heat = new Map();
    const add = (dim, k) => { const d = T[dim] || (T[dim] = new Map()); let r = d.get(k); if (!r) d.set(k, r = blank()); return r; };
    learnPass(s, sl, course, (u, a, f) => {
      for (const d in f.dims) lBump(add(d, f.dims[d]), f, u);
      if (f.done && f.last) { const row = add('month', f.last.slice(0, 7)); row.doneOnly = true; if (f.cert) row.certs++; row.completed++; row.assignments++; row.modules += f.dn; row.learners.add(u.name); }
      lBump(tot, f, u);
      const hk = f.dims.division + '|' + f.dims.category, h = heat.get(hk) || { n:0, c:0 }; h.n++; if (f.done) h.c++; heat.set(hk, h); });
    const v = { T, tot, heat, rows: null }; caches.set(ck, { deps, v }); return v;
  }
  const DAYS = 30;   // attendance is summarised for the first 30 training days of every batch
  const tBlank = () => ({ attrJoined:0, day1Unmarked:0, dlSum:0, dlN:0, joined:0, classDone:0, vol:0, earlyLeft:0, participants:0, unique:new Set(), handover:0, earlyAbsorb:0, inTraining:0, attrited:0, noshow:0, tatSum:0, tatN:0, batches:new Set(),
    hrms0:0, dojMissing:0, dA: new Array(DAYS + 1).fill(0), dP: new Array(DAYS + 1).fill(0), dL: new Array(DAYS + 1).fill(0), dM: new Array(DAYS + 1).fill(0) });
  const weeks = (a, b) => Math.max(0, Math.ceil((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 6048e5));
  /* Everything one MIS row contributes, worked out once. */
  function facts(x, dayMarks) {
    const ho = x.group === 'handover', w = ho && x.doj && x.handover ? weeks(x.doj, x.handover) : null;
    const att = x.group === 'attrited', stageA = !att ? null : x.statusType === 'noshow' ? 'Did not join' : x.dol && x.dol <= x.ce ? 'During classroom' : 'During OJT';
    const dims = { attrMonth: att && x.dol ? x.dol.slice(0, 7) : null, reason: att ? (x.reason || 'Not recorded') : null, attrCat: att ? (x.attrCat || 'Not recorded') : null, attrResp: att ? (x.attrResp || 'Not recorded') : null, attrStage: stageA,
      segment: x.segment, training: x.training, month: x.monthKey, location: x.location || '—', brand: x.brand || '—', traineeType: x.traineeType, status: x.status, group: STATUS_GROUPS[x.group].label, subDivision: x.subDivision || '—', division: x.division || '—', trainer: x.trainer, batch: x.batch };
    const passed = ho || ['ojt', 'failed'].includes(x.statusType) || (x.group !== 'attrited' && !['noshow', 'moved'].includes(x.statusType) && x.ce < TODAY_KEY);
    const early = x.group === 'attrited' && (x.statusType === 'noshow' || (x.dol && x.dol <= x.ce));
    const dl = x.group === 'attrited' && x.dol && x.cs ? Math.max(0, Math.round((new Date(x.dol + 'T12:00:00') - new Date(x.cs + 'T12:00:00')) / 864e5)) : null;
    return { x, ho, w, dims, passed, early, dl, marks: dayMarks || [] };
  }
  function tBump(r, f) { const x = f.x; if (f.dl != null) { r.dlSum += f.dl; r.dlN++; } if (x.statusType !== 'noshow') r.joined++; if (f.passed) r.classDone++; if (f.early) r.earlyLeft++; if (x.group === 'attrited' && x.attrCat === 'Voluntary') r.vol++; r.participants++; r.unique.add(x.empId || x.name); r.batches.add(x.batch); if (f.ho) r.handover++; if (x.statusType === 'absorbed' && x.earlyAbsorb) r.earlyAbsorb++; if (x.group === 'training') r.inTraining++; if (x.group === 'attrited') { r.attrited++; if (x.statusType !== 'noshow') r.attrJoined++; } if (x.statusType === 'noshow') r.noshow++; if (f.w != null) { r.tatSum += f.w; r.tatN++; }
    // HRMS joining and day-wise attendance (custom KPIs)
    // HRMS joined on day 0: new-hire batches only (trainee type set at batch creation), batch already started, date of
    // joining on or before the batch start. Existing employees and future batches are not counted.
    const nh = x.traineeType === 'New Hire' && x.cs <= TODAY_KEY;
    if (nh) { if (!x.doj) r.dojMissing++; else if (x.doj <= x.cs) r.hrms0++; }
    if (x.cs <= TODAY_KEY && x.statusType !== 'noshow' && f.marks.length > 1 && !f.marks[1]) r.day1Unmarked++;
    const m = f.marks; for (let i = 1; i < m.length; i++) { const a = m[i]; if (!a) continue; r.dM[i]++; if (a === 'A') r.dA[i]++; else if (a === 'P') r.dP[i]++; else if (a === 'L') { r.dL[i]++; r.dP[i]++; } } }
  /* Training day 1…30 of each batch (weekends and holidays skipped), for the attendance fields. */
  function batchDays(s) { const out = new Map(), tt = new Map(s.ttypes.map(t => [t.id, t]));
    s.batches.forEach(b => { const t = tt.get(b.type); out.set(b.id, { b, dates: t ? trainDays(b.start, Math.min(DAYS, t.days.length), holSetFor(s.holidays, b)) : [] }); }); return out; }
  /* Training: one pass over the MIS rows. */
  function train(s, sl) {
    const ck = 'T|' + [sl.division, sl.sub, sl.training, sl.location, sl.from, sl.to].join('|'), recs = Mis.records(s), deps = [recs, s.holidays];
    const hit = caches.get(ck); if (hit && hit.deps.every((x, i) => x === deps[i])) return hit.v;
    const T = {}, tot = tBlank(), tat = new Map(), heat = new Map(), list = [], fl = [], BD = batchDays(s);
    const add = (dim, k) => { const d = T[dim] || (T[dim] = new Map()); let r = d.get(k); if (!r) d.set(k, r = tBlank()); return r; };
    recs.forEach(x => { if ((sl.division !== 'All' && x.division !== sl.division) || (sl.sub !== 'All' && x.subDivision !== sl.sub) || (sl.training !== 'All' && x.training !== sl.training) || (sl.location !== 'All' && x.location !== sl.location) || (sl.from && x.cs < sl.from) || (sl.to && x.cs > sl.to)) return;
      list.push(x);
      const bd = BD.get(x.batchId), marks = [null]; if (bd) bd.dates.forEach(d => marks.push(((bd.b.att || {})[d] || {})[x.name] || null));
      const f = facts(x, marks); fl.push(f);
      for (const d in f.dims) if (f.dims[d] != null) tBump(add(d, f.dims[d]), f); tBump(tot, f);
      if (f.w != null) { const bk = TAT_BUCKETS.find(b => f.w >= b[1] && f.w <= b[2])[0], rk = x.subDivision || '—'; const m = tat.get(rk) || {}; m[bk] = (m[bk] || 0) + 1; tat.set(rk, m); }
      const hk = (x.subDivision || '—') + '|' + x.segment, h = heat.get(hk) || { n:0, c:0 }; h.n++; if (f.ho) h.c++; heat.set(hk, h); });
    const v = { T, tot, tat, heat, list, facts: fl }; caches.set(ck, { deps, v }); return v;
  }
  /* People (HRMS employee master, synced from ZingHR): one row per person. */
  const hBlank = () => ({ employees:0, accounts:0, active:0, invited:0, deactivated:0, joiners:0 });
  const hrDims = u => ({ division: u.division || 'Unassigned', subDivision: u.subDivision || 'Unassigned', dept: u.dept || 'Unassigned', site: u.site || '—', role: u.role || '—', gender: u.gender || '—', designation: u.designation || '—', status: u.status || '—', joinMonth: u.joined ? u.joined.slice(0, 7) : 'No date' });
  const hrOk = (u, sl) => (sl.division === 'All' || u.division === sl.division) && (sl.sub === 'All' || u.subDivision === sl.sub) && (sl.location === 'All' || u.site === sl.location);
  // People = current headcount (active + invited), like the learning data that leaves deactivated people out.
  // Joiners: date of joining inside From–To; with no dates set, the last 30 days (never "everyone").
  const hBump = (r, u, sl) => { r.accounts++; if (u.status !== 'Deactivated') r.employees++; if (u.status !== 'Deactivated') r.active++; else if (u.status === 'Deactivated') r.deactivated++;
    const from = sl.from || (sl.to ? '' : Progress.plus(TODAY_KEY, -30)), to = sl.to || (sl.from ? '' : TODAY_KEY);
    if (u.joined && (!from || u.joined >= from) && (!to || u.joined <= to)) r.joiners++; };
  function hr(s, sl) {
    const ck = 'H|' + [sl.division, sl.sub, sl.location, sl.from, sl.to].join('|'), deps = [s.users];
    const hit = caches.get(ck); if (hit && hit.deps.every((x, i) => x === deps[i])) return hit.v;
    const T = {}, tot = hBlank(), add = (dim, k) => { const d = T[dim] || (T[dim] = new Map()); let r = d.get(k); if (!r) d.set(k, r = hBlank()); return r; };
    s.users.forEach(u => { if (!hrOk(u, sl)) return; const d = hrDims(u); for (const k in d) hBump(add(k, d[k]), u, sl); hBump(tot, u, sl); });
    const v = { T, tot, heat: new Map() }; caches.set(ck, { deps, v }); return v;
  }
  /* Two dimensions at once (heat maps): Map('row|col' -> aggregate row). */
  function pair(s, sl, src, a, b, course) {
    const ck = 'P|' + src + '|' + a + '|' + b + '|' + [sl.division, sl.sub, sl.training, sl.location, sl.from, sl.to, course].join('|');
    const deps = src === 'train' ? [Mis.records(s), s.holidays] : src === 'hr' ? [s.users] : [s.enroll, s.itemDone, s.users, s.adminCourses, s.extHistory, s.assignedOn];
    const hit = caches.get(ck); if (hit && hit.deps.every((x, i) => x === deps[i])) return hit.v;
    const out = new Map(), get = (k, mk) => { let r = out.get(k); if (!r) out.set(k, r = mk()); return r; };
    if (src === 'train') train(s, sl).facts.forEach(f => { const x = f.dims[a], y = f.dims[b]; if (x != null && y != null) tBump(get(x + '|' + y, tBlank), f); });
    else if (src === 'hr') s.users.forEach(u => { if (!hrOk(u, sl)) return; const d = hrDims(u); hBump(get(d[a] + '|' + d[b], hBlank), u, sl); });
    else learnPass(s, sl, course, (u, ac, f) => { const d = { ...f.dims, month: f.done && f.last ? f.last.slice(0, 7) : null }; if (d[a] != null && d[b] != null) { const r = get(d[a] + '|' + d[b], blank); if (a === 'month' || b === 'month') r.doneOnly = true; lBump(r, f, u); } });
    caches.set(ck, { deps, v: out }); return out;
  }
  /* Drill-through: the records behind one bar / slice / cell. Returns { head, rows } (all rows; the screen pages them).
   * Only work-identity columns (no e-mail, phone or other HR fields). */
  function drill(s, sl, src, course, sel) {
    const match = d => sel.every(([k, v]) => d[k] === v);
    if (src === 'train') { const head = ['Batch', 'Training', 'Trainer', 'Employee ID', 'Name', 'Current status', 'Status group', 'Location', 'Batch start', 'Date of joining (HRMS)', 'Day 1 attendance'];
      const rows = train(s, sl).facts.filter(f => match(f.dims)).map(f => { const x = f.x, m = f.marks[1]; return [x.batch, x.training, x.trainer, x.empId, x.name, x.status, STATUS_GROUPS[x.group].label, x.location, x.cs, x.doj, m ? ATT_CODES[m][0] : '']; });
      return { head, rows }; }
    if (src === 'hr') { const head = ['Employee ID', 'Name', 'Status', 'Division', 'Sub division', 'Department', 'Location', 'Designation', 'Date of joining'];
      const wantsStatus = sel.some(([k]) => k === 'status');
      return { head, rows: s.users.filter(u => hrOk(u, sl) && (wantsStatus || u.status !== 'Deactivated') && match(hrDims(u))).map(u => [u.empId || '', u.name, u.status, u.division || '', u.subDivision || '', u.dept || '', u.site || '', u.designation || '', u.joined || '']) }; }
    const head = ['Person', 'Employee ID', 'Division', 'Course', 'Status', 'Due date', 'Modules done', 'Last activity'], rows = [];
    learnPass(s, sl, course, (u, a, f) => { const d = { ...f.dims, month: f.done && f.last ? f.last.slice(0, 7) : null }; if (match(d)) rows.push([u.name, u.empId || '', u.division || '', a.code + ' · ' + a.title, f.st, f.due, f.dn + ' / ' + f.n, f.last]); });
    return { head, rows };
  }
  /* Fields a custom KPI formula can use, per dataset: key -> [label, value(row)]. Stable objects (the formula cache keys on them). */
  const F = {
    train: { participants:['Participants (mapped to a batch)', r => r.participants], joined:['Joined training (everyone except “did not join”)', r => r.joined], no_show:['Did not join', r => r.noshow],
      hrms_joined_day0:['New hires joined as per HRMS by day 0 (New Hire batches that have started; date of joining on or before the batch start)', r => r.hrms0], doj_missing:['New hires with no date of joining in HRMS', r => r.dojMissing],
      day1_unmarked:['Joined trainees in started batches with no day-1 attendance marked (data gap)', r => r.day1Unmarked], attrited_after_joining:['Left after joining', r => r.attrJoined],
      class_done:['Completed classroom', r => r.classDone], handover:['Handed over', r => r.handover], early_absorb:['Early absorbed', r => r.earlyAbsorb], in_training:['In training now', r => r.inTraining],
      attrited:['Attrited (includes did not join)', r => r.attrited], early_left:['Left before OJT', r => r.earlyLeft], voluntary_attrition:['Voluntary attrition', r => r.vol],
      unique_trainees:['Unique trainees', r => r.unique.size], batches:['Batches', r => r.batches.size], throughput:['Throughput %', r => measure('train', r, 'throughput')], attrition_rate:['Attrition rate %', r => measure('train', r, 'attritionRate')],
      avg_tat_weeks:['Average handover TAT (weeks)', r => measure('train', r, 'avgTat')], days_to_leave:['Average days before leaving', r => measure('train', r, 'daysToLeave')] },
    learn: { assignments:['Assignments', r => r.assignments], completed:['Completed', r => r.completed], in_progress:['In progress', r => r.inProgress], certificates:['Certificates issued (courses with a certificate only)', r => r.certs], cert_assignments:['Assignments on courses with a certificate', r => r.certCourses], not_started:['Not started', r => r.notStarted], overdue:['Overdue', r => r.overdue],
      learners:['Learners', r => r.learners.size], modules_done:['Modules completed', r => r.modules], scored_attempts:['Scored assessments', r => r.scoreN], avg_score:['Average assessment score %', r => measure('learn', r, 'avgScore')],
      completion_rate:['Completion rate %', r => measure('learn', r, 'completionRate')], overdue_rate:['Overdue rate %', r => measure('learn', r, 'overdueRate')] },
    hr: { employees:['People (active)', r => r.employees], accounts:['All accounts including deactivated', r => r.accounts], active:['Active', r => r.active], deactivated:['Deactivated', r => r.deactivated],
      joiners:['Joiners (date of joining inside From–To; last 30 days when no dates are set)', r => r.joiners] },
  };
  const FIELD_LABELS = Object.fromEntries(Object.keys(F).map(k => [k, Object.fromEntries(Object.entries(F[k]).map(([f, v]) => [f, v[0]]))]));
  const dayValue = (src, row, mk, n) => src !== 'train' ? null : mk === 'M' ? row.dM[n] : !row.dM[n] ? null : mk === 'A' ? row.dA[n] : mk === 'P' ? row.dP[n] : row.dL[n];
  /* Custom KPIs (s.dash.kpis) for the render in progress; measure keys look like 'k:<id>'. */
  let KP = { list: [], bySrc: {} };
  function useKpis(list) { if (KP.list === list) return; const bySrc = {}; (list || []).forEach(k => { (bySrc[k.src] = bySrc[k.src] || {})[k.code] = k; }); KP = { list: list || [], bySrc }; }
  const kpiOf = id => KP.list.find(k => k.id === id);
  function kpiValue(src, row, id) { const k = kpiOf(id); if (!k || k.src !== src || !row) return null;
    const fd = F[src], dayOf = (m, n) => dayValue(src, row, m, n);
    try { return Formula.evalKpi(k.code, KP.bySrc[src] || {}, FIELD_LABELS[src], f => fd[f][1](row), dayOf); } catch (e) { return null; } }
  const measure = (src, row, m) => { if (!row) return 0;
    if (typeof m === 'string' && m.startsWith('k:')) return kpiValue(src, row, m.slice(2));
    if (src === 'hr') return row[m] || 0;
    // completion-month rows hold completed assignments only: status mixes and rates would always read 100%
    if (src === 'learn' && row.doneOnly && !['completed', 'certs', 'learners', 'modules', 'avgScore'].includes(m)) return null;
    if (src === 'train') return m === 'unique' ? row.unique.size : m === 'batches' ? row.batches.size : m === 'throughput' ? (row.participants - row.noshow ? Math.round(row.handover / (row.participants - row.noshow) * 1000) / 10 : 0)
      : m === 'daysToLeave' ? (row.dlN ? Math.round(row.dlSum / row.dlN * 10) / 10 : 0) : m === 'volShare' ? (row.attrited ? Math.round(row.vol / row.attrited * 1000) / 10 : 0) : m === 'attritionRate' ? (row.joined ? Math.round(row.attrJoined / row.joined * 1000) / 10 : 0) : m === 'avgTat' ? (row.tatN ? Math.round(row.tatSum / row.tatN * 10) / 10 : 0) : row[m] || 0;
    return m === 'completionRate' ? (row.assignments ? Math.round(row.completed / row.assignments * 1000) / 10 : 0) : m === 'overdueRate' ? (row.assignments ? Math.round(row.overdue / row.assignments * 1000) / 10 : 0)
      : m === 'learners' ? row.learners.size : m === 'avgScore' ? (row.scoreN ? Math.round(row.scoreSum / row.scoreN * 10) / 10 : 0) : row[m] || 0; };
  const fieldValue = (src, row, k) => F[src][k][1](row);
  const learnRows = (s, sl, course) => { const out = []; learnPass(s, sl, course, (u, a, f) => out.push([u, a, f])); return out; };
  return { _cacheSize: () => caches.size, learnRows, learn, train, hr, pair, drill, measure, weeks, useKpis, kpiOf, kpiValue, fieldValue, dayValue, fields: FIELD_LABELS, DAYS };
})();

SkillforgeApp.prototype.amDashboard = function (c) {
  const { s, INK, W, perms } = c;
  const scr = this._scrV;
  if (scr !== 'dashboard' && scr !== 'training') return { isDash:false };
  // Training overview & MIS uses the two training boards; Analytics dashboards shows everything else.
  // Editors (permission "dashboard") manage every board; viewers (permission "dashView") open only the boards shared with
  // their role and cannot change, schedule or export raw data. What any board shows is still limited to the records the
  // person may read (Row Level Security decides that when connected).
  const canEdit = perms.has('dashboard'), meU = s.users.find(u => u.name === c.role.name) || {}, myRole = meU.roleId || '';
  const isTr = scr === 'training', TRB = Object.values(TR_BUILTIN), trTab = s.trTab || 'overview';
  const D = s.dash, KPIS = D.kpis || [];
  let SL = D.slicers;   // per person and per session (never saved to the shared dashboard rows)
  Dash.useKpis(KPIS);
  const seeBoard = b => !isTrBoard(b) && (canEdit || !(b.audience || []).length || (b.audience || []).includes(myRole));
  // built-in boards missing from older saved data come from the defaults
  const boardById = id => D.boards.find(b => b.id === id) || DB0.boards.find(b => b.id === id) || null;
  const trCustom = D.boards.filter(b => b.area === 'train');
  const myBoards = isTr ? TRB.map(boardById).filter(Boolean).concat(trCustom) : D.boards.filter(seeBoard);
  const trBoardId = TR_BUILTIN[trTab] || (String(trTab).startsWith('b:') && trCustom.some(b => 'b:' + b.id === trTab) ? trTab.slice(2) : null);
  const curId = isTr ? (trBoardId || 'mis') : (myBoards.some(b => b.id === s.dbBoard) ? s.dbBoard : (myBoards[0] || {}).id);
  const B = boardById(curId) || { id:'_none', name:'Dashboards', visuals:[] };
  // Edits go to the board on screen (v30 fix: they used to go to the last analytics board opened, even from the Training page).
  const setDB = (bid, fn) => { if (!canEdit) return this.toastMsg('Your role can view dashboards but not change them');
    this.setState(st => { const d = JSON.parse(JSON.stringify(st.dash)); let b = d.boards.find(x => x.id === bid);
      if (!b) { const def = DB0.boards.find(x => x.id === bid); if (!def) return null; b = JSON.parse(JSON.stringify(def)); d.boards.push(b); }
      fn(d, b); return { dash: d }; }); };
  const setD = fn => setDB(B.id, fn);
  const t0 = performance.now();
  // Measures of a data source: the built-in ones plus the custom KPIs built on that source ('k:<id>').
  const MSof = src => { const o = { ...DB_MEASURES[src] }; KPIS.filter(k => k.src === src).forEach(k => { o['k:' + k.id] = [k.name, k.fmt || 'n', k]; }); return o; };
  const fmtV = (src, m, v) => { if (v == null || !Number.isFinite(v)) return '—'; const M = MSof(src)[m] || ['', 'n'], k = M[1], kp = M[2], dp = kp && kp.dp != null && kp.dp !== '' ? Math.max(0, Math.min(4, +kp.dp)) : null;
    if (k === 'pct') return (dp != null ? v.toFixed(dp) : v.toFixed(1).replace(/\.0$/, '')) + '%'; if (k === 'dec') return v.toFixed(dp != null ? dp : 1);
    return dp ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : Math.round(v).toLocaleString('en-US'); };
  // RAG for custom KPIs with thresholds: up = higher is better.
  const ragOf = (kp, v) => { if (!kp || v == null || kp.green === '' || kp.green == null || kp.amber === '' || kp.amber == null) return null; const g = +kp.green, a = +kp.amber;
    const lvl = kp.dir === 'down' ? (v <= g ? 'g' : v <= a ? 'a' : 'r') : (v >= g ? 'g' : v >= a ? 'a' : 'r');
    return { g:['On target', '#DCFCE7', '#166534', '#007A4D'], a:['Watch', '#FEF3C7', '#92400E', '#0066A1'], r:['Off target', '#FDECEC', '#A63232', '#D64545'] }[lvl]; };
  const monthLabel = k => /^\d{4}-\d{2}$/.test(k) ? new Date(k + '-15T12:00:00').toLocaleDateString('en-US', { month:'short', year:'2-digit' }).replace(' ', " '") : k;
  const statusColor = name => { const st = s.statuses.find(x => x.name === name); return st ? STATUS_TYPES[st.type].bar : { Completed:'#007A4D', 'In progress':'#5B7DB8', 'Not started':'#9CB3C4', Overdue:'#D64545' }[name] || '#0066A1'; };
  const pubCourses = s.adminCourses.filter(a => a.status === 'Published');
  const courseOpts = [{ v:'All', l:'All courses' }].concat(pubCourses.slice().sort((a, b) => a.code.localeCompare(b.code)).map(a => ({ v: a.id, l: a.code + ' · ' + a.title })));
  const courseFor = v => v.course && v.course !== 'All' ? v.course : SL.course;
  const cubeOf = v => v.src === 'train' ? Dash.train(s, SL) : v.src === 'hr' ? Dash.hr(s, SL) : Dash.learn(s, SL, courseFor(v));
  const isMonth = dim => ['month', 'attrMonth', 'joinMonth'].includes(dim);
  const rowsOf = (v, C, dim, m) => { const map = C.T[dim]; if (!map) return []; let r = [...map.entries()].map(([k, row]) => ({ k, v: Dash.measure(v.src, row, m), row }));
    const nv = x => x.v == null ? -Infinity : x.v;
    if (isMonth(dim)) r = r.filter(x => x.k !== 'No date').sort((a, b) => a.k.localeCompare(b.k)).slice(-12); else if (dim === 'status' && v.src === 'learn') { const O = ['Completed', 'In progress', 'Not started', 'Overdue']; r.sort((a, b) => O.indexOf(a.k) - O.indexOf(b.k)); }
    else if (dim === 'status' && v.src === 'train') { const O = s.statuses.map(x => x.name); r.sort((a, b) => O.indexOf(a.k) - O.indexOf(b.k)); } else r.sort((a, b) => nv(b) - nv(a));
    return dim === 'course' ? r.slice(0, 10) : v.type === 'table' ? r.slice(0, 60) : r.slice(0, 16); };
  const lab = (dim, k) => isMonth(dim) ? monthLabel(k) : k;
  // Drill-through: what is behind a bar, slice or cell.
  const drillTo = (v, sel, label) => () => { if (D.edit) return; this.setState({ dbDrill: { src: v.src, course: v.src === 'learn' ? courseFor(v) : 'All', sel, title: (v.title || '') + (label ? ' · ' + label : ''), page: 1 } }); };
  const visual = (v, idx) => {
    v = { src:'learn', ...v };
    if (!DB_SRC[v.src]) v.src = 'learn';
    const T = DB_TYPES[v.type] || DB_TYPES.kpi, MS = MSof(v.src), DS = DB_DIMS[v.src], m = MS[v.measure] ? v.measure : Object.keys(MS)[0], dim = DS[v.dim] ? v.dim : Object.keys(DS)[0];
    const kp = (MS[m] || [])[2] || null;
    const lostKpi = [v.measure, v.measure2].concat(v.axes || [], v.cols || []).some(k => typeof k === 'string' && k.startsWith('k:') && !MS[k]);
    const hx = v.type === 'heat' && (v.hx || v.src === 'hr'), dim2 = DS[v.dim2] && v.dim2 !== dim ? v.dim2 : Object.keys(DS).find(k => k !== dim);
    const autoTitle = v.type === 'kpi' || v.type === 'gauge' ? MS[m][0] : v.type === 'matrix' ? 'Handover TAT by ' + DS[dim].toLowerCase() : v.type === 'batches' ? 'Batch tracker' : v.type === 'radar' ? 'Compared by ' + DS[dim].toLowerCase()
      : v.type === 'heat' ? (hx ? MS[m][0] + ' · ' + DS[dim].toLowerCase() + ' × ' + DS[dim2].toLowerCase() : v.src === 'train' ? 'Throughput % · sub division × segment' : 'Completion % · division × category') : MS[m][0] + ' by ' + DS[dim].toLowerCase();
    const C = cubeOf(v), selCourse = v.course || 'All';
    const mOpts = Object.keys(MS).map(k => ({ v:k, l: (k.startsWith('k:') ? '★ ' : '') + MS[k][0] }));
    const base = { id: v.id, title: v.title || autoTitle, span: 'span ' + v.w, srcLabel: DB_SRC[v.src].split(' (')[0], editing: D.edit, open: s.dbEdit === v.id, hasDim: T[2] || (v.type === 'heat' && hx), isLearn: v.src === 'learn',
      isKpi:false, isFunnel:false, isRank:false, isBar:false, isCol:false, isLine:false, isDonut:false, isStack:false, isHeat:false, isTable:false, isMatrix:false, isBatches:false, isRadar:false, isGauge:false, isTree:false, isMissing:false, isPipe:false, isAttrend:false,
      showPick: v.src === 'learn' && !!v.pick && v.type !== 'heat', courseOpts, courseVal: selCourse, setCourse: e => { const x = e.target.value; setD((d, b) => { b.visuals[idx].course = x; }); },
      courseLabel: selCourse !== 'All' ? ((pubCourses.find(a => a.id === selCourse) || {}).title || '') : '',
      srcOpts: Object.keys(DB_SRC).map(k => ({ v:k, l: DB_SRC[k] })), srcVal: v.src, setSrc: e => { const x = e.target.value; setD((d, b) => { const vv = b.visuals[idx]; vv.src = x; vv.measure = Object.keys(DB_MEASURES[x])[0]; vv.dim = Object.keys(DB_DIMS[x])[0]; delete vv.dim2; delete vv.cols; delete vv.axes; delete vv.title; if (x !== 'train' && DB_TRAIN_ONLY.includes(vv.type)) vv.type = 'bar'; }); },
      mLabel: v.type === 'radar' ? 'Rank groups by' : 'Measure', dLabel: v.type === 'radar' ? 'Groups' : v.type === 'heat' && hx ? 'Rows' : 'Dimension',
      measureOpts: mOpts, dimOpts: Object.keys(DS).map(k => ({ v:k, l: DS[k] })), m, dim, pickTog: UI.toggle(!!v.pick, () => setD((d, b) => { b.visuals[idx].pick = !b.visuals[idx].pick; })),
      setM: e => { const x = e.target.value; setD((d, b) => { b.visuals[idx].measure = x; delete b.visuals[idx].title; }); }, setDim: e => { const x = e.target.value; setD((d, b) => { b.visuals[idx].dim = x; delete b.visuals[idx].title; }); },
      sizes: [[2, '⅙'], [3, '¼'], [4, '⅓'], [6, '½'], [8, '⅔'], [12, 'Full']].map(([w, l]) => UI.chip(v.w, w, l, () => setD((d, b) => { b.visuals[idx].w = w; }))),
      types: Object.keys(DB_TYPES).filter(k => v.src === 'train' || !DB_TRAIN_ONLY.includes(k)).map(k => UI.chip(v.type, k, DB_TYPES[k][0], () => setD((d, b) => { const vv = b.visuals[idx]; vv.type = k; delete vv.title; if (k === 'line') vv.dim = isMonth(vv.dim) ? vv.dim : (Object.keys(DB_DIMS[vv.src]).find(isMonth) || vv.dim); if (k === 'heat' && vv.src !== 'hr') vv.hx = true; }))),
      gear: () => this.setState({ dbEdit: s.dbEdit === v.id ? null : v.id }), remove: () => { setD((d, b) => { b.visuals.splice(idx, 1); }); this.setState({ dbEdit:null }); },
      left: () => setD((d, b) => { if (idx > 0) { const x = b.visuals.splice(idx, 1)[0]; b.visuals.splice(idx - 1, 0, x); } }), right: () => setD((d, b) => { if (idx < b.visuals.length - 1) { const x = b.visuals.splice(idx, 1)[0]; b.visuals.splice(idx + 1, 0, x); } }),
      setTitle: e => { const x = e.target.value; setD((d, b) => { b.visuals[idx].title = x; }); }, titleVal: v.title || '',
      // extra settings for the new visuals
      cfgHeat: v.type === 'heat' && hx, dim2, dim2Opts: Object.keys(DS).filter(k => k !== dim).map(k => ({ v:k, l: DS[k] })), setDim2: e => { const x = e.target.value; setD((d, b) => { b.visuals[idx].dim2 = x; b.visuals[idx].hx = true; delete b.visuals[idx].title; }); },
      cfgRadar: v.type === 'radar', cfgTable: v.type === 'table', cfgGauge: v.type === 'gauge', gaugeMax: v.max == null ? '' : String(v.max),
      setGaugeMax: e => { const x = e.target.value; setD((d, b) => { if (x === '') delete b.visuals[idx].max; else b.visuals[idx].max = Math.max(0, Math.min(1e9, +x || 0)); }); },
      seriesN: [3, 4, 5, 6].map(n => UI.chip(v.n || 5, n, String(n), () => setD((d, b) => { b.visuals[idx].n = n; }))),
      axisChips: Object.keys(MS).map(k => { const on = (v.axes || []).includes(k); return { label: (k.startsWith('k:') ? '★ ' : '') + MS[k][0], bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2',
        pick: () => setD((d, b) => { const vv = b.visuals[idx], a = (vv.axes || []).filter(x => MS[x]); if (on) { if (a.length <= 3) return this.toastMsg('A spider web needs at least 3 measures'); vv.axes = a.filter(x => x !== k); } else { if (a.length >= 8) return this.toastMsg('Up to 8 measures'); vv.axes = a.concat(k); } }) }; }),
      colChips: Object.keys(MS).map(k => { const on = (v.cols || []).includes(k); return { label: (k.startsWith('k:') ? '★ ' : '') + MS[k][0], bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2',
        pick: () => setD((d, b) => { const vv = b.visuals[idx], a = (vv.cols || []).filter(x => MS[x]); vv.cols = on ? a.filter(x => x !== k) : a.length >= 10 ? (this.toastMsg('Up to 10 columns'), a) : a.concat(k); if (!vv.cols.length) delete vv.cols; }) }; }) };
    // A custom KPI this visual uses was deleted or moved to another dataset: say so instead of showing a different measure.
    if (lostKpi) return { ...base, title: v.title || 'Custom KPI missing', isMissing:true, missingT: 'This visual uses a custom KPI that no longer exists in the ' + DB_SRC[v.src].split(' (')[0] + ' dataset. Pick another measure (Customise › ⚙) or remove the visual.' };
    if (v.type === 'kpi') { const val = Dash.measure(v.src, C.tot, m), t = C.tot;
      const sub = kp ? (kp.desc || kp.formula) : v.src === 'hr' ? (m === 'joiners' ? (SL.from || SL.to ? 'joined between the dates in the filter' : 'joined in the last 30 days (set From–To to change)') : m === 'employees' ? t.active.toLocaleString('en-US') + ' active' : '')
        : v.src === 'train' ? (m === 'daysToLeave' ? 'from batch start to last day' : m === 'volShare' ? t.vol + ' of ' + t.attrited + ' chose to leave' : m === 'earlyLeft' ? 'did not join or left during classroom' : m === 'attrited' ? t.attrJoined + ' left after joining · ' + t.noshow + ' did not join' : m === 'attrJoined' ? (t.joined ? (t.attrJoined / t.joined * 100).toFixed(1) + '% of people who joined' : '') : m === 'noshow' ? 'mapped to a batch but never joined' : m === 'throughput' ? t.handover.toLocaleString('en-US') + ' handed over of ' + (t.participants - t.noshow).toLocaleString('en-US') + ' who joined' : m === 'attritionRate' ? t.attrJoined + ' of ' + t.joined.toLocaleString('en-US') + ' who joined left (did not join excluded)' : m === 'participants' ? t.batches.size + ' batches' : m === 'inTraining' ? 'classroom or on-the-job now' : m === 'unique' ? 'people across all trainings' : '')
        : m === 'completionRate' ? t.completed.toLocaleString('en-US') + ' of ' + t.assignments.toLocaleString('en-US') + ' assignments' : m === 'overdue' ? (t.assignments ? (t.overdue / t.assignments * 100).toFixed(1) + '% of assignments' : '') : m === 'learners' ? 'with at least one assignment' : '';
      // Trend vs the previous month (training KPIs: by batch start month; attrition: by leaving month).
      // Change vs the previous month, using the last two complete months.
      let delta = '', dGood = true;
      if (v.src === 'train' && !['inTraining', 'unique'].includes(m)) { const dm = ['attrited', 'daysToLeave'].includes(m) && C.T.attrMonth ? C.T.attrMonth : C.T.month;
        const mk = dm ? [...dm.keys()].filter(k => k < TODAY_KEY.slice(0, 7)).sort() : [], cur = mk[mk.length - 1], prv = mk[mk.length - 2];
        if (cur && prv) { const a = Dash.measure('train', dm.get(cur), m), b0 = Dash.measure('train', dm.get(prv), m);
          if (a != null && b0 != null) { const d = a - b0;
            dGood = kp ? (kp.dir === 'down' ? d <= 0 : d >= 0) : ['attrited', 'attritionRate', 'daysToLeave'].includes(m) ? (m === 'daysToLeave' ? d >= 0 : d <= 0) : d >= 0;
            if (m === 'volShare') dGood = null;
            delta = (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '● ') + fmtV('train', m, Math.abs(d)) + '  ' + monthLabel(cur) + ' vs ' + monthLabel(prv); } } }
      const KI = { participants:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', inTraining:'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5', handover:'M5 12l5 5 9-10', throughput:'M3 17l6-6 4 4 8-8M14 7h7v7', attrited:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 8l5 5M23 8l-5 5', attritionRate:'M3 7l6 6 4-4 8 8M14 17h7v-7', volShare:'M12 2a10 10 0 1 0 10 10H12z', earlyLeft:'M12 8v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' };
      const KC = ['#0066A1', '#007A4D', '#5B7DB8', '#8C5A9E', '#D64545', '#08AE6E'][idx % 6], rag = ragOf(kp, val);
      return { ...base, isKpi:true, kIcon: KI[m] || (kp ? 'M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 17.8 5.7 21.2 7 14.2 2 9.4l7-.9z' : 'M3 3v18h18M7 14l4-4 3 3 5-6'), kTint: KC + '1F', kv: fmtV(v.src, m, val), ksub: sub, kc: KC, kDelta: delta, kHasDelta: !!delta, kDc: dGood === null ? '#526B7A' : dGood ? '#166534' : '#B91C1C',
        kRag: !!rag, kRagT: rag ? rag[0] + ' · target ' + (kp.dir === 'down' ? '≤ ' : '≥ ') + fmtV(v.src, m, +kp.green) : '', kRagBg: rag ? rag[1] : '', kRagFg: rag ? rag[2] : '' }; }
    if (v.type === 'gauge') { const val = Dash.measure(v.src, C.tot, m), isPct = MS[m][1] === 'pct', rag = ragOf(kp, val);
      const max = v.max > 0 ? v.max : isPct ? 100 : kp && kp.green !== '' && +kp.green > 0 ? +kp.green * 1.25 : Math.max(1, (val || 0) * 1.25), f = val == null ? 0 : Math.max(0, Math.min(1, val / max)), L = Math.PI * 80;
      return { ...base, isGauge:true, gv: fmtV(v.src, m, val), gDash: (f * L).toFixed(1) + ' ' + L.toFixed(1), gBg: L.toFixed(1) + ' ' + L.toFixed(1), gC: rag ? rag[3] : '#007A4D', gMin: fmtV(v.src, m, 0), gMax: fmtV(v.src, m, max),
        gSub: rag ? rag[0] + ' · target ' + (kp.dir === 'down' ? '≤ ' : '≥ ') + fmtV(v.src, m, +kp.green) : kp ? (kp.desc || '') : '' }; }
    if (v.type === 'heat' && hx) {
      const P = Dash.pair(s, SL, v.src, dim, dim2, courseFor(v)), ks = [...P.keys()].map(k => k.split('|'));
      const sortK = (d, arr) => isMonth(d) ? arr.sort().slice(-12) : arr.sort((a, b) => String(a).localeCompare(String(b))).slice(0, 24);
      const rowsK = sortK(dim, [...new Set(ks.map(x => x[0]))]), colsK = sortK(dim2, [...new Set(ks.map(x => x[1]))]);
      const vals = new Map(); [...P.entries()].forEach(([k, row]) => vals.set(k, Dash.measure(v.src, row, m)));
      const nums = [...vals.values()].filter(x => x != null && Number.isFinite(x)), lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1, span = hi - lo || 1;
      const lowGood = kp ? kp.dir === 'down' : ['overdue', 'overdueRate', 'notStarted', 'attrited', 'attritionRate', 'earlyLeft', 'avgTat', 'deactivated'].includes(m);
      return { ...base, isHeat:true, hNote: (lowGood ? 'Darker = higher (watch).' : 'Darker = higher.') + ' Click a cell for the records.', hCols: 'minmax(140px,1.2fr) repeat(' + colsK.length + ', minmax(' + (colsK.length > 8 ? 92 : 70) + 'px,1fr))', hHead: colsK.map(x => ({ t: lab(dim2, x) })),
        hRows: rowsK.map(rk => ({ t: lab(dim, rk), cells: colsK.map(ck => { const val = vals.get(rk + '|' + ck); if (val == null) return { t:'—', bg:'#F4F8FC', fg:'#6E8796', tip:'', drill: null };
          const p = (val - lo) / span, col = lowGood ? '232,102,74' : '31,78,121';
          return { t: fmtV(v.src, m, val), bg: 'rgba(' + col + ',' + (0.08 + p * 0.8).toFixed(2) + ')', fg: p > 0.55 ? '#FFFFFF' : '#16324F', tip: lab(dim, rk) + ' · ' + lab(dim2, ck) + ': ' + fmtV(v.src, m, val), drill: drillTo(v, [[dim, rk], [dim2, ck]], lab(dim, rk) + ' × ' + lab(dim2, ck)) }; }) })) }; }
    if (v.type === 'heat') { const rowsK = [...new Set([...C.heat.keys()].map(k => k.split('|')[0]))].sort(), colsK = [...new Set([...C.heat.keys()].map(k => k.split('|')[1]))].sort(), d1 = v.src === 'train' ? 'subDivision' : 'division', d2 = v.src === 'train' ? 'segment' : 'category';
      return { ...base, isHeat:true, hNote:'', hCols: 'minmax(140px,1.2fr) repeat(' + colsK.length + ', minmax(70px,1fr))', hHead: colsK.map(x => ({ t: x })), hRows: rowsK.map(rk => ({ t: rk, cells: colsK.map(ck => { const h = C.heat.get(rk + '|' + ck); if (!h) return { t:'—', bg:'#F4F8FC', fg:'#6E8796', tip:'', drill: null }; const p = h.c / h.n * 100;
        return { t: p.toFixed(0) + '%', bg: 'rgba(0,102,161,' + (0.08 + p / 100 * 0.8).toFixed(2) + ')', fg: p > 55 ? '#FFFFFF' : '#16324F', tip: rk + ' · ' + ck + ': ' + h.c + ' of ' + h.n, drill: drillTo(v, [[d1, rk], [d2, ck]], rk + ' × ' + ck) }; }) })) }; }
    if (v.type === 'pipeline' || v.type === 'attrend') { const P = trMisPanels(C.list);
      return v.type === 'pipeline' ? { ...base, isPipe:true, pPipe: P.trPipe, pNext: P.trPipeNext, pHasLate: P.trHasLate, pLate: P.trLate, pLateList: P.trLateList }
        : { ...base, isAttrend:true, aBars: P.trAttr, aTotal: P.trAttrTotal }; }
    if (v.type === 'matrix') { const rowsK = [...C.tat.keys()].sort(), cols = TAT_BUCKETS.filter(b => rowsK.some(r => (C.tat.get(r) || {})[b[0]])), tot = {};
      const mRows = rowsK.map(r => { const m0 = C.tat.get(r); let t = 0; const cells = cols.map(b => { const n = m0[b[0]] || 0; t += n; tot[b[0]] = (tot[b[0]] || 0) + n; return { t: n || '' }; }); return { t: r, cells, total: t }; });
      return { ...base, isMatrix:true, mxHead: cols.map(b => ({ t: b[0] })), mxRows: mRows, mxTot: cols.map(b => ({ t: tot[b[0]] || '' })), mxGrand: mRows.reduce((a, r) => a + r.total, 0), mxCols: 'minmax(150px,1.6fr) repeat(' + (cols.length + 1) + ', minmax(52px,.6fr))' }; }
    if (v.type === 'batches') {
      const by = new Map(); C.list.forEach(x => { let g = by.get(x.batchId); if (!g) by.set(x.batchId, g = { n:0, tr:0, ho:0, at:0, oth:0, ns:0 }); g.n++; if (x.group === 'training') g.tr++; else if (x.group === 'handover') g.ho++; else if (x.group === 'attrited') g.at++; else g.oth++; if (x.statusType === 'noshow') g.ns++; });
      const stageOf = b => { const st = batchStatus(b); if (st === 'Ongoing') { const tt = s.ttypes.find(t => t.id === b.type), dts = tt ? trainDays(b.start, tt.days.length, holSetFor(s.holidays, b)) : []; return ['Classroom · day ' + Math.max(1, dts.filter(d => d <= TODAY_KEY).length) + ' of ' + dts.length, 1]; }
        if (st === 'Upcoming') return ['Starts ' + Fmt.short(b.start), 4]; if (st === 'Completed') return ['Completed', 5]; return TODAY_KEY < (b.handover || b.end) ? ['On the job training', 2] : ['Awaiting closure', 3]; };
      const STC = { 1:['#DBEAFE', '#1E40AF'], 2:['#EDE9FE', '#5B21B6'], 3:['#FEF3C7', '#92400E'], 4:['#EAF1F6', '#526B7A'], 5:['#DCFCE7', '#166534'] };
      let rows = s.batches.filter(b => by.has(b.id) || (batchStatus(b) === 'Upcoming' && (SL.training === 'All' || b.trainingName === SL.training))).map(b => { const g = by.get(b.id) || { n: b.trainees.length, tr: b.trainees.length, ho:0, at:0, oth:0, ns:0 }, [stage, ord] = stageOf(b), tt = s.ttypes.find(t => t.id === b.type) || {};
        const grad = b.handover || (b.end ? (() => { let d = b.end, k = 0; while (k < (tt.ojtDays || 5) + 1) { d = Progress.plus(d, 1); const w = new Date(d + 'T12:00:00').getDay(); if (w && w !== 6) k++; } return d; })() : '');
        return { ord, code: b.code, training: b.trainingName || tt.name || '', trainer: b.trainer, stage, sBg: STC[ord][0], sFg: STC[ord][1], n: g.n, tr: g.tr, ho: g.ho, at: g.at, oth: g.oth, grad: grad ? Fmt.medium(grad) : '—', gradKey: grad,
          thr: g.n - g.ns ? Math.round(g.ho / (g.n - g.ns) * 100) + '%' : '—', bar: [['#5B7DB8', g.tr], ['#007A4D', g.ho], ['#D64545', g.at], ['#9CB3C4', g.oth]].map(([c2, k]) => ({ c: c2, w: g.n ? (k / g.n * 100).toFixed(1) + '%' : '0%' })), open: () => this.go('batch', { batchId: b.id, bTab:'summary', adminView:true }) }; });
      const act = v.active !== false, allN = rows.length; if (act) rows = rows.filter(r => r.ord <= 4);
      rows.sort((a, b) => a.ord - b.ord || (a.gradKey || '').localeCompare(b.gradKey || ''));
      const sum = k => rows.reduce((t, r) => t + r[k], 0);
      const allOn = (s.dbAll || {})[v.id], lim = allOn ? 60 : 8;
      return { ...base, isBatches:true, btRows: rows.slice(0, lim), btMoreN: rows.length > lim, btMoreL: allOn ? 'Showing the first 60 · narrow with the filters' : 'Show all ' + rows.length + ' batches', btLess: !!allOn, btToggleAll: () => this.setState(st => ({ dbAll: { ...(st.dbAll || {}), [v.id]: !allOn } })), btMore:'', btEmpty: !rows.length,
        btTot: { n: sum('n'), tr: sum('tr'), ho: sum('ho'), at: sum('at') }, btActive: UI.toggle(act, () => setD((d, b) => { b.visuals[idx].active = !act; })), btActLabel: act ? 'Active and upcoming batches (' + rows.length + ')' : 'All batches (' + allN + ')' }; }
    if (v.type === 'radar') {
      const axes = (v.axes || []).filter(k => MS[k]).slice(0, 8), ax = axes.length >= 3 ? axes : Object.keys(MS).slice(0, 5), n = Math.max(3, Math.min(6, v.n || 5));
      const map = C.T[dim]; let ser = map ? [...map.entries()].map(([k, row]) => ({ k, row, v0: Dash.measure(v.src, row, m) })) : [];
      if (isMonth(dim)) ser = ser.sort((a, b) => a.k.localeCompare(b.k)).slice(-n); else ser = ser.sort((a, b) => (b.v0 == null ? -1 : b.v0) - (a.v0 == null ? -1 : a.v0)).slice(0, n);
      const vals = ser.map(x => ax.map(a => Dash.measure(v.src, x.row, a))), mx = ax.map((a, j) => Math.max(...vals.map(r => r[j] == null ? 0 : r[j]), MS[a][1] === 'pct' ? 1 : 1e-9));
      const R = 110, cx = 150, cy = 150, ang = j => -Math.PI / 2 + j * 2 * Math.PI / ax.length, pt = (j, f) => [cx + Math.cos(ang(j)) * R * f, cy + Math.sin(ang(j)) * R * f];
      const ring = f => ax.map((a, j) => pt(j, f).map(z => z.toFixed(1)).join(',')).join(' ');
      return { ...base, isRadar:true, rRings: [0.25, 0.5, 0.75, 1].map(f => ({ p: ring(f) })), rSpokes: ax.map((a, j) => { const [x, y] = pt(j, 1); return { x: x.toFixed(1), y: y.toFixed(1) }; }),
        rLabels: ax.map((a, j) => { const [x, y] = pt(j, 1.18); return { t: MS[a][0], l: (x / 300 * 100).toFixed(1) + '%', tp: (y / 300 * 100).toFixed(1) + '%' }; }),
        rSeries: ser.map((x, i) => { const c2 = DB_COLORS[i % DB_COLORS.length]; return { c: c2, p: ax.map((a, j) => pt(j, vals[i][j] == null ? 0 : Math.max(0, vals[i][j]) / mx[j]).map(z => z.toFixed(1)).join(',')).join(' '),
          l: lab(dim, x.k), tip: lab(dim, x.k) + ' — ' + ax.map((a, j) => MS[a][0] + ': ' + fmtV(v.src, a, vals[i][j])).join(' · '), drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)) }; }),
        rNote: (isMonth(dim) ? 'Latest ' + n + ' months.' : 'Top ' + n + ' by ' + MS[m][0].toLowerCase() + '.') + ' Each spoke is scaled to the highest value shown on it.', rEmpty: !ser.length }; }
    const R = rowsOf(v, C, dim, m), mx = Math.max(1, ...R.map(x => x.v == null ? 0 : x.v));
    const colorOf = (x, i) => dim === 'status' ? statusColor(x.k) : (v.src === 'train' && ['brand', 'traineeType', 'location'].includes(dim)) || v.src === 'hr' ? DB_COLORS[i % DB_COLORS.length] : DB_COLORS[idx % DB_COLORS.length];
    const pctW = x => ((x.v == null ? 0 : Math.max(0, x.v)) / mx * 100).toFixed(1) + '%';
    if (v.type === 'funnel') { const t = C.tot, st = [['Mapped to a batch', t.participants, '#9CB3C4'], ['Joined', t.joined, '#0066A1'], ['Completed classroom', t.classDone, '#5B7DB8'], ['Handed over', t.handover, '#007A4D']];
      return { ...base, isFunnel:true, fun: st.map(([l, n, c2], i) => ({ l, n: n.toLocaleString('en-US'), w: (t.participants ? Math.max(4, n / t.participants * 100) : 0).toFixed(1) + '%', c: c2,
        conv: i ? (st[i - 1][1] ? Math.round(n / st[i - 1][1] * 100) + '% of previous step' : '—') : 'Starting point', drop: i && st[i - 1][1] - n > 0 ? '−' + (st[i - 1][1] - n).toLocaleString('en-US') : '' })) }; }
    if (v.type === 'rank') { const R2 = rowsOf({ ...v, type:'bar' }, C, dim, m).slice(0, 8), tot = R2.reduce((a, x) => a + (x.v || 0), 0) || 1, mx2 = Math.max(1, ...R2.map(x => x.v || 0)), pct = MS[m][1] !== 'n';
      return { ...base, isRank:true, ranks: R2.map((x, i) => ({ n: i + 1, l: lab(dim, x.k), v: fmtV(v.src, m, x.v), w: ((x.v == null ? 0 : Math.max(0, x.v)) / mx2 * 100).toFixed(1) + '%', share: pct || x.v == null ? '' : (x.v / tot * 100).toFixed(0) + '%', c: i === 0 ? '#0066A1' : i < 3 ? '#0072B0' : '#5ED3A0', fg: i < 3 ? '#FFFFFF' : '#16324F', drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)) })) }; }
    if (v.type === 'bar') return { ...base, isBar:true, bars: R.map((x, i) => ({ l: lab(dim, x.k), v: fmtV(v.src, m, x.v), w: pctW(x), c: colorOf(x, i), drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)) })) };
    if (v.type === 'column') return { ...base, isCol:true, cols: R.map((x, i) => ({ l: lab(dim, x.k), v: fmtV(v.src, m, x.v), h: Math.max(2, (x.v == null ? 0 : Math.max(0, x.v)) / mx * 100).toFixed(1) + '%', c: colorOf(x, i), drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)) })) };
    if (v.type === 'tree') { const R2 = R.filter(x => x.v != null && x.v > 0).slice(0, 12), tot = R2.reduce((a, x) => a + x.v, 0) || 1;
      // slice-and-dice layout: split the area in two by value, alternating direction
      const out = [], lay = (items, x, y, w, h, vert) => { if (!items.length) return; if (items.length === 1) { out.push({ it: items[0], x, y, w, h }); return; }
        const sum = items.reduce((a, it) => a + it.v, 0); let acc = 0, cut = 1; for (let i = 0; i < items.length - 1; i++) { acc += items[i].v; cut = i + 1; if (acc >= sum / 2) break; }
        const A = items.slice(0, cut), Bv = items.slice(cut), f = A.reduce((a, it) => a + it.v, 0) / sum;
        if (vert) { lay(A, x, y, w * f, h, !vert); lay(Bv, x + w * f, y, w * (1 - f), h, !vert); } else { lay(A, x, y, w, h * f, !vert); lay(Bv, x, y + h * f, w, h * (1 - f), !vert); } };
      lay(R2, 0, 0, 100, 100, true);
      return { ...base, isTree:true, tEmpty: !R2.length, tiles: out.map((o, i) => ({ l: lab(dim, o.it.k), v: fmtV(v.src, m, o.it.v), p: (o.it.v / tot * 100).toFixed(0) + '%', c: DB_COLORS[i % DB_COLORS.length], small: o.w * o.h < 90,
        x: o.x.toFixed(2) + '%', y: o.y.toFixed(2) + '%', w: o.w.toFixed(2) + '%', h: o.h.toFixed(2) + '%', drill: drillTo(v, [[dim, o.it.k]], lab(dim, o.it.k)) })) }; }
    if (v.type === 'line') { const MS2 = MS, m2 = v.measure2 && MS2[v.measure2] ? v.measure2 : null, R2b = m2 ? R.map(x => ({ k: x.k, v: Dash.measure(v.src, x.row, m2) })) : [], mxL = Math.max(mx, ...R2b.map(x => x.v || 0), 1);
      const W0 = 600, H0 = 180, n = R.length, X = i => n < 2 ? W0 / 2 : 30 + i * (W0 - 60) / (n - 1), Y = val => H0 - 12 - ((val || 0) / mxL) * (H0 - 30), pts = R.map((x, i) => [X(i), Y(x.v)]);
      const pts2 = R2b.map((x, i) => [X(i), Y(x.v)]), path2 = pts2.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      return { ...base, isLine:true, lPath: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), lArea: n ? pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' L' + pts[n - 1][0].toFixed(1) + ' ' + H0 + ' L' + pts[0][0].toFixed(1) + ' ' + H0 + ' Z' : '',
        lPts: pts.map((p, i) => ({ x: p[0].toFixed(1), y: p[1].toFixed(1), pct: (p[0] / 600 * 100).toFixed(2) + '%', l: lab(dim, R[i].k), v: fmtV(v.src, m, R[i].v) + (m2 ? ' / ' + fmtV(v.src, m2, R2b[i].v) : ''), drill: drillTo(v, [[dim, R[i].k]], lab(dim, R[i].k)) })), lc:'#0066A1',
        has2: !!m2, l2Path: path2, l2c:'#007A4D', lLeg: m2 ? [{ c:'#0066A1', t: MS[m][0] }, { c:'#007A4D', t: MS[m2][0] }] : [] }; }
    if (v.type === 'donut') { const total = R.reduce((t, x) => t + (x.v || 0), 0) || 1, Cc = 2 * Math.PI * 54; let acc = 0;
      return { ...base, isDonut:true, dTotal: fmtV(v.src, m, MS[m][1] === 'n' ? total : Dash.measure(v.src, C.tot, m)), slices: R.slice(0, 8).map((x, i) => { const f = (x.v || 0) / total, seg = { c: dim === 'status' && v.src !== 'hr' ? statusColor(x.k) : DB_COLORS[i % DB_COLORS.length], dash: (f * Cc).toFixed(2) + ' ' + Cc.toFixed(2), off: (-acc * Cc).toFixed(2), l: lab(dim, x.k), v: fmtV(v.src, m, x.v), p: (f * 100).toFixed(1) + '%', drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)) }; acc += f; return seg; }) }; }
    if (v.type === 'stack') { const R2 = rowsOf({ ...v, type:'bar' }, C, dim, v.src === 'train' ? 'participants' : v.src === 'hr' ? 'employees' : 'assignments');
      const parts = v.src === 'train' ? [['In training', 'inTraining', '#5B7DB8'], ['Handed over', 'handover', '#007A4D'], ['Attrited', 'attrited', '#D64545']] : v.src === 'hr' ? [['Active', 'active', '#007A4D'], ['Deactivated', 'deactivated', '#9CB3C4']] : [['Completed', 'completed', '#007A4D'], ['In progress', 'inProgress', '#5B7DB8'], ['Not started', 'notStarted', '#9CB3C4'], ['Overdue', 'overdue', '#D64545']];
      return { ...base, isStack:true, stacks: R2.map(x => { const r = x.row, t = (v.src === 'train' ? r.participants : v.src === 'hr' ? r.employees : r.assignments) || 1; return { l: lab(dim, x.k), n: t.toLocaleString('en-US'), drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)), parts: parts.map(([k, f, c2]) => ({ w: (r[f] / t * 100).toFixed(2) + '%', c: c2, t: k + ': ' + r[f].toLocaleString('en-US') })) }; }), legend: parts.map(([k, , c2]) => ({ k, c: c2 })) }; }
    if (v.type === 'table') { const R2 = rowsOf(v, C, dim, m), cols = (v.cols || []).filter(k => MS[k]);
      let head, cell, totRow;
      if (cols.length) { head = [DS[dim]].concat(cols.map(k => MS[k][0])); cell = x => [lab(dim, x.k)].concat(cols.map(k => fmtV(v.src, k, Dash.measure(v.src, x.row, k)))); totRow = ['Total'].concat(cols.map(k => fmtV(v.src, k, Dash.measure(v.src, C.tot, k)))); }
      else if (v.src === 'hr') { head = [DS[dim], 'People', 'Active', 'Deactivated']; cell = x => [lab(dim, x.k), x.row.employees, x.row.active, x.row.deactivated]; const t = C.tot; totRow = ['Total', t.employees, t.active, t.deactivated]; }
      else { head = v.src === 'train' ? (dim === 'month' ? ['Month', 'Total participants', 'Unique trainees'] : [DS[dim], 'Total participants', 'Handed over', 'Throughput']) : [DS[dim], 'Assignments', 'Completed', 'Completion', 'Overdue', 'Learners'];
        cell = x => v.src === 'train' ? (dim === 'month' ? [lab(dim, x.k), x.row.participants, x.row.unique.size] : [x.k, x.row.participants, x.row.handover, fmtV('train', 'throughput', Dash.measure('train', x.row, 'throughput'))])
          : [lab(dim, x.k), x.row.assignments, x.row.completed, fmtV('learn', 'completionRate', Dash.measure('learn', x.row, 'completionRate')), x.row.overdue, x.row.learners.size];
        const t = C.tot; totRow = v.src === 'train' ? (dim === 'month' ? ['Total', t.participants, t.unique.size] : ['Total', t.participants, t.handover, fmtV('train', 'throughput', Dash.measure('train', t, 'throughput'))]) : ['Total', t.assignments, t.completed, fmtV('learn', 'completionRate', Dash.measure('learn', t, 'completionRate')), t.overdue, t.learners.size]; }
      const f = x => typeof x === 'number' ? x.toLocaleString('en-US') : x;
      return { ...base, isTable:true, tHead: head, tCols: 'minmax(140px,2fr) ' + 'minmax(70px,1fr) '.repeat(head.length - 1), tRows: R2.map(x => ({ drill: drillTo(v, [[dim, x.k]], lab(dim, x.k)), c: cell(x).map((y, i) => ({ t: f(y), a: i ? 'right' : 'left' })) })), tTot: totRow.map((y, i) => ({ t: f(y), a: i ? 'right' : 'left' })), tHeadC: head.map((y, i) => ({ t: y, a: i ? 'right' : 'left' })) }; }
    return base;
  };
  const opts = (all, list) => [{ v:'All', l: all }].concat(list.map(x => ({ v:x, l:x })));
  const setSl = k => e => { const x = e.target.value, nx = { ...SL, [k]: x };   // v35: a sub division from another division is cleared
    if (k === 'division' && x !== 'All' && nx.sub !== 'All' && SUBDIV_OF[nx.sub] && SUBDIV_OF[nx.sub] !== x) nx.sub = 'All';
    this.setState({ dash: { ...D, slicers: nx } }); };
  // Viewers (permission dashView only) see the snapshot an editor published: aggregate numbers only, computed with the
  // editor's access and no filters. Their own role cannot read the learner records behind the numbers, so a live
  // calculation would come out empty or partial. Offline (no database) there is nothing to protect: live numbers.
  const SNAP_STRIP = ['courseOpts', 'srcOpts', 'measureOpts', 'dimOpts', 'sizes', 'types', 'axisChips', 'colChips', 'dim2Opts', 'seriesN', 'pickTog', 'btActive'];
  const snapOf = list => list.map(v => { const o = JSON.parse(JSON.stringify(v)); SNAP_STRIP.forEach(k => { delete o[k]; }); o.editing = false; o.open = false; o.showPick = false; o.isSnap = true; return o; });
  const CLEAR = { division:'All', sub:'All', course:'All', training:'All', location:'All', from:'', to:'' };
  const buildSnap = board => { const keep = SL; SL = CLEAR; try { return { at: new Date().toISOString(), by: c.role.name, visuals: snapOf(board.visuals.map((v, i) => visual(v, i))) }; } finally { SL = keep; } };
  const useSnap = !canEdit && !isTrBoard(B) && (!!B.snap || Backend.on);
  const vis = useSnap ? (B.snap ? B.snap.visuals : []) : B.visuals.map(visual), ms = Math.round(performance.now() - t0);
  const hasL = B.visuals.some(v => (v.src || 'learn') === 'learn'), hasT = B.visuals.some(v => v.src === 'train');
  // ---- data behind a chart (drill-through) -------------------------------------------------------------------------------
  const DR = s.dbDrill;
  let drillV = { dbDrillOpen:false };
  if (DR) { const key = JSON.stringify([DR.src, DR.course, DR.sel, SL]), deps = [s.users, s.enroll, s.itemDone, s.adminCourses, s.extHistory, s.batches, s.statuses, s.ttypes, s.holidays];
    if (!this._drill || this._drill.key !== key || this._drill.deps.some((x, i) => x !== deps[i])) this._drill = { key, deps, res: Dash.drill(s, SL, DR.src, DR.course, DR.sel) };
    const res = this._drill.res, size = 50, pages = Math.max(1, Math.ceil(res.rows.length / size)), page = Math.min(DR.page || 1, pages);
    drillV = { dbDrillOpen:true, dbDrillTitle: DR.title || 'Records', dbDrillCount: res.rows.length.toLocaleString('en-US') + (res.rows.length === 1 ? ' record' : ' records') + ' · ' + DB_SRC[DR.src],
      dbDrillGrid: 'repeat(' + res.head.length + ', minmax(110px,1fr))', dbDrillHead: res.head.map(t => ({ t })), dbDrillRows: res.rows.slice((page - 1) * size, page * size).map(r => ({ c: r.map(t => ({ t: t == null ? '' : String(t) })) })),
      dbDrillEmpty: !res.rows.length, dbDrillPager: { show: pages > 1, label: 'Page ' + page + ' of ' + pages, noPrev: page <= 1, noNext: page >= pages, prev: () => this.setState({ dbDrill: { ...DR, page: page - 1 } }), next: () => this.setState({ dbDrill: { ...DR, page: page + 1 } }) },
      dbDrillClose: () => this.setState({ dbDrill:null }), dbDrillCanCsv: canEdit,
      dbDrillCsv: () => { if (!canEdit) return; csvDownload('records-' + TODAY_KEY + '.csv', [res.head].concat(res.rows)); this.toastMsg(res.rows.length.toLocaleString('en-US') + ' records exported'); } }; }
  // ---- schedules (V28) ---------------------------------------------------------------------------------------------------
  const orgDomains = [...new Set(s.users.map(u => String(u.email || '').toLowerCase().split('@')[1]).filter(Boolean))];
  const SCH = D.schedules || [], SD = s.dbSched, WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const nextRun = x => { const [hh, mm] = String(x.time || '09:00').split(':').map(Number), now = new Date(), d = new Date(now); d.setHours(hh, mm, 0, 0);
    for (let i = 0; i < 400; i++) { const ok = x.freq === 'Daily' ? true : x.freq === 'Weekly' ? ((d.getDay() + 6) % 7) === WD.indexOf(x.day) : d.getDate() === +x.day; if (ok && d > now) return d; d.setDate(d.getDate() + 1); d.setHours(hh, mm, 0, 0); } return null; };
  const schV = { dbSchedOpen: !!SD, dbSchedCan: canEdit && !isTr,
    dbSchedOpenFn: () => { if (D.edit) return this.toastMsg('Save or Cancel your changes first'); this.setState({ dbSched: { form: null } }); }, dbSchedClose: () => this.setState({ dbSched:null }),
    dbSchedList: SCH.filter(x => x.board === B.id).map(x => { const nx = nextRun(x); return { what: x.freq + (x.freq === 'Weekly' ? ' on ' + x.day : x.freq === 'Monthly' ? ' on day ' + x.day : '') + ' at ' + x.time, to: x.to.join(', '), last: x.lastRun ? 'Last run ' + Fmt.dt(x.lastRun) : 'Not run yet', next: x.on && nx ? 'Next ' + nx.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'Paused',
      tog: UI.toggle(x.on, () => setD(d => { d.schedules = (d.schedules || []).map(y => y.id === x.id ? { ...y, on: !y.on } : y); })),
      run: () => { this.renderVals().dbExport(); setD(d => { d.schedules = (d.schedules || []).map(y => y.id === x.id ? { ...y, lastRun: new Date().toISOString() } : y); }); },
      del: () => setD(d => { d.schedules = (d.schedules || []).filter(y => y.id !== x.id); }) }; }),
    dbSchedEmpty: !SCH.some(x => x.board === B.id), dbSchedDomains: orgDomains.join(', '),
    dbSchedForm: !!(SD && SD.form), dbSchedNotForm: !(SD && SD.form), dbSF: (SD && SD.form) || {},
    dbSchedNew: () => this.setState({ dbSched: { form: { freq:'Weekly', day:'Monday', time:'09:00', to:'', err:'' } } }),
    dbSFFreq: ['Daily', 'Weekly', 'Monthly'].map(f => UI.chip(((SD && SD.form) || {}).freq, f, f, () => this.setState(st => ({ dbSched: { form: { ...st.dbSched.form, freq: f, day: f === 'Weekly' ? 'Monday' : f === 'Monthly' ? '1' : '', err:'' } } })))),
    dbSFIsWeekly: !!(SD && SD.form && SD.form.freq === 'Weekly'), dbSFIsMonthly: !!(SD && SD.form && SD.form.freq === 'Monthly'),
    dbSFDays: WD.map(d => ({ v: d, l: d })), dbSFMDays: Array.from({ length: 28 }, (_, i) => ({ v: String(i + 1), l: String(i + 1) })),
    setSF: Object.fromEntries(['day', 'time', 'to'].map(k => [k, e => { const x = e.target.value; this.setState(st => ({ dbSched: { form: { ...st.dbSched.form, [k]: x, err:'' } } })); }])),
    dbSFErr: !!(SD && SD.form && SD.form.err),
    dbSFSave: () => { const f = SD.form, to = [...new Set(String(f.to || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
      const err = m => this.setState({ dbSched: { form: { ...f, err: m } } });
      if (!to.length) return err('Add at least one recipient.'); if (to.length > 20) return err('Up to 20 recipients.');
      const bad = to.find(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)); if (bad) return err('“' + bad + '” is not an e-mail address.');
      // Dashboards carry organisation data, so they only go to the organisation's own e-mail domains.
      const ext = to.find(x => !orgDomains.includes(x.split('@')[1])); if (ext) return err('“' + ext + '” is outside your organisation (' + orgDomains.join(', ') + '). Dashboards can only be sent inside it.');
      if (!/^\d{2}:\d{2}$/.test(f.time || '')) return err('Pick a time.');
      setD(d => { d.schedules = (d.schedules || []).concat([{ id: 'sc' + Date.now(), board: B.id, freq: f.freq, day: f.day, time: f.time, to, fmt:'CSV', on:true, by: c.role.name, created: new Date().toISOString() }]); });
      this.setState({ dbSched: { form: null } }); this.toastMsg('Schedule saved'); },
    dbSFCancel: () => this.setState({ dbSched: { form: null } }) };
  // ---- Power BI data (V28): flat tables of the filtered data, for Power BI (Get data › Text/CSV) or Excel -------------------
  const pbi = which => () => { if (!canEdit) return; let rows;
    if (which === 'train') { const H = ['Batch', 'Training', 'Training segment', 'Type of trainee', 'Trainer', 'Employee ID', 'Division', 'Sub division', 'Location', 'Brand', 'Batch start', 'Classroom end', 'Date of joining (HRMS)', 'Joined as per HRMS by day 0', 'Current status', 'Status group', 'Attrition category', 'Date of leaving', 'Handover date', 'Day 1 attendance', 'Day 2 attendance', 'Day 3 attendance'];
      rows = [H].concat(Dash.train(s, SL).facts.map(f => { const x = f.x, mk = i => f.marks[i] ? ATT_CODES[f.marks[i]][0] : ''; return [x.batch, x.training, x.segment, x.traineeType, x.trainer, x.empId, x.division, x.subDivision, x.location, x.brand, x.cs, x.ce, x.doj, x.doj && x.doj <= x.cs ? 'Yes' : 'No', x.status, STATUS_GROUPS[x.group].label, x.attrCat, x.dol, x.group === 'handover' ? x.handover : '', mk(1), mk(2), mk(3)]; })); }
    else if (which === 'learn') { rows = [['Employee ID', 'Division', 'Sub division', 'Department', 'Location', 'User type', 'Course code', 'Course', 'Category', 'Status', 'Due date', 'Modules done', 'Modules', 'Last activity', 'Certificate issued']];
      learnPassAll(rows); }
    else if (which === 'hr') rows = [['Employee ID', 'Status', 'Division', 'Sub division', 'Department', 'Location', 'Designation', 'User type', 'Date of joining']].concat(s.users.filter(u => (SL.division === 'All' || u.division === SL.division) && (SL.sub === 'All' || u.subDivision === SL.sub) && (SL.location === 'All' || u.site === SL.location)).map(u => [u.empId || '', u.status, u.division || '', u.subDivision || '', u.dept || '', u.site || '', u.designation || '', u.role, u.joined || '']));
    else rows = [['Dataset', 'Kind', 'Name', 'Description / formula']].concat(...Object.keys(DB_SRC).map(src => Object.entries(Dash.fields[src]).map(([k, l]) => [DB_SRC[src], 'Field', k, l]).concat(Object.entries(DB_DIMS[src]).map(([k, l]) => [DB_SRC[src], 'Dimension', k, l]))), KPIS.map(k => [DB_SRC[k.src], 'Custom KPI', k.code + ' · ' + k.name, k.formula]));
    csvDownload('skillforge-' + which + '-' + TODAY_KEY + '.csv', rows); this.toastMsg((rows.length - 1).toLocaleString('en-US') + ' rows exported'); };
  // The learning extract uses the same pass as the dashboard, so division, sub division, location, course AND the From–To dates apply.
  const learnPassAll = rows => Dash.learnRows(s, SL, SL.course).forEach(([u, a, f]) => rows.push([u.empId || '', u.division || '', u.subDivision || '', u.dept || '', u.site || '', u.role, a.code, a.title, a.cat || '', f.st, f.due, f.dn, f.n, f.last, f.cert ? (f.done ? 'Yes' : 'Not yet') : 'No certificate']));
  // ---- who can see this dashboard -----------------------------------------------------------------------------------------
  const aud = B.audience || [];
  const audChips = [{ id:'', name:'Everyone with dashboard access' }].concat(s.roles.map(r => ({ id: r.id, name: r.name }))).map(r => { const on = r.id ? aud.includes(r.id) : !aud.length;
    return { label: r.name, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => setD((d, b) => { if (!r.id) b.audience = []; else { const a = (b.audience || []).filter(x => x !== r.id); b.audience = on ? a : a.concat(r.id); } }) }; });
  const TPL = DB_TEMPLATES.concat((D.templates || []).map(t => ({ ...t, saved:true })));
  const tplVisuals = t => t.id === 't_compliance' ? (DB0.boards.find(b => b.id === 'b2') || { visuals: [] }).visuals : t.visuals;
  // ---- Training KPI tiles (v30): show / hide, rename, reorder, add any training measure or ★ custom KPI.
  // Stored on the Training overview board (strip), so dashboard editors change it with Customise › Save / Cancel.
  let trV = isTr ? this.trainingMis(c, Dash.train(s, SL), SL) : { isTraining:false }, stripV = {};
  if (isTr && trV.trKpis) {
    const ST = boardById('mis').strip || {}, MSt = MSof('train'), Ct = Dash.train(s, SL), hide = ST.hide || {}, label = ST.label || {}, order = ST.order || [];
    const extra = (ST.extra || []).filter(x => MSt[x.measure]).map((x, i) => { const kp = (MSt[x.measure] || [])[2];
      return { key: 'x:' + x.id, l: x.label || MSt[x.measure][0], v: fmtV('train', x.measure, Dash.measure('train', Ct.tot, x.measure)), sub: kp ? (kp.desc || '★ custom KPI') : 'Training measure', c: DB_COLORS[(i + 3) % DB_COLORS.length], extra: true }; });
    const all = trV.trKpis.concat(extra), pos = k => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
    const sorted = all.map((x, i) => [x, i]).sort((a, b) => pos(a[0].key) - pos(b[0].key) || a[1] - b[1]).map(([x]) => x);
    trV = { ...trV, trKpis: sorted.filter(x => !hide[x.key]).map(x => label[x.key] ? { ...x, l: label[x.key] } : x) };
    const setS = fn => setDB('mis', (d, b) => { b.strip = b.strip || {}; fn(b.strip); });
    const keys = sorted.map(x => x.key);
    stripV = { trStripCan: canEdit && D.edit, trStripOpen: !!s.trStripEd && canEdit && D.edit, trStripOpenFn: () => this.setState({ trStripEd: { measure: 'participants' } }), trStripClose: () => this.setState({ trStripEd:null }),
      trStripRows: sorted.map((x, i) => ({ key: x.key, name: x.extra ? x.l : x.key, lab: label[x.key] || '', vis: UI.toggle(!hide[x.key], () => setS(st => { st.hide = { ...(st.hide || {}), [x.key]: !hide[x.key] }; })),
        setLab: e => { const v = e.target.value.slice(0, 40); setS(st => { st.label = { ...(st.label || {}) }; if (v.trim()) st.label[x.key] = v; else delete st.label[x.key]; }); },
        up: () => { if (!i) return; const k2 = keys.slice(); [k2[i - 1], k2[i]] = [k2[i], k2[i - 1]]; setS(st => { st.order = k2; }); }, isFirst: i === 0, isExtra: !!x.extra,
        del: () => setS(st => { st.extra = (st.extra || []).filter(y => 'x:' + y.id !== x.key); }) })),
      trStripMOpts: Object.keys(MSt).map(k => ({ v: k, l: (k.startsWith('k:') ? '★ ' : '') + MSt[k][0] })), trStripM: (s.trStripEd || {}).measure || 'participants',
      setTrStripM: e => { const v = e.target.value; this.setState(st => ({ trStripEd: { ...(st.trStripEd || {}), measure: v } })); },
      trStripAdd: () => { const m = (s.trStripEd || {}).measure; if (!MSt[m]) return; if ((ST.extra || []).length >= 8) return this.toastMsg('Up to 8 added tiles');
        setS(st => { st.extra = (st.extra || []).concat([{ id: Date.now().toString(36), measure: m }]); }); this.toastMsg(MSt[m][0] + ' tile added'); } };
  }
  return {
    ...trV, ...stripV, isTr, notTr: !isTr, trShowBoard: !isTr || trTab !== 'trainees',
    trTabs: [['overview', boardById('mis').name === 'Training overview' ? 'Overview' : boardById('mis').name], ['mis', boardById('mistab').name], ['attrition', boardById('attr').name]].concat(trCustom.map(b => ['b:' + b.id, b.name]), [['trainees', 'Batches & trainees']])
      .map(([k, l]) => ({ on: trTab === k, label: l, pick: () => { if (D.edit) return this.toastMsg('Save or Cancel your changes first'); this.setState({ trTab: k, dbEdit:null, trStripEd:null }); } })),
    isDash:true, dbBoards: myBoards.map(b => ({ on: b.id === B.id, ...UI.chip(B.id, b.id, b.name, () => { if (D.edit) return this.toastMsg('Save or Cancel your changes first'); this.setState({ dbBoard: b.id, dbEdit:null }); }) })),
    dbVisuals: vis, dbEmpty: !vis.length && !useSnap, dbEditing: D.edit && canEdit, dbNotEditing: !D.edit, dbCalc: 'Updated in ' + ms + ' ms', dbTitle: isTr ? 'Training overview & MIS' : B.name, dbShowAud: !isTrBoard(B), dbIsTrBoard: isTrBoard(B), dbIsBuiltinTr: false, dbDelOk: !TRB.includes(B.id),
    dbCanEdit: canEdit, dbCanCustomise: canEdit && !D.edit, dbViewOnly: !canEdit, dbNoBoards: !isTr && !myBoards.length,
    // Customise works on a draft: Save keeps it, Cancel restores exactly what was there before (including removing a
    // dashboard that was just created).
    dbToggleEdit: () => { if (!canEdit) return; this.setState({ dash: { ...D, edit: true }, dbEdit:null, dbSnap: { dash: JSON.stringify({ ...D, edit:false }), board: B.id, trTab } }); },
    dbSave: () => { const nm = (B.name || '').trim(); if (!nm) return this.toastMsg('Give the dashboard a name');
      if (D.boards.some(b => b.id !== B.id && b.name.trim().toLowerCase() === nm.toLowerCase())) return this.toastMsg('Another dashboard is already called “' + nm + '”');
      if (!B.visuals.length) return this.toastMsg('Add at least one visual, or Cancel');
      // saving also publishes the viewers' snapshot (Training overview boards are for editors only)
      const snap = isTrBoard(B) ? null : buildSnap(B);
      this.setState({ dash: { ...D, edit:false, boards: D.boards.map(b => b.id === B.id ? { ...b, ...(snap ? { snap } : {}) } : b) }, dbEdit:null, dbSnap:null }); this.toastMsg('“' + nm + '” saved' + (snap ? ' · viewers see these numbers' : '')); },
    dbPublish: () => { if (!canEdit || isTrBoard(B)) return; const snap = buildSnap(B); this.setState({ dash: { ...D, boards: D.boards.map(b => b.id === B.id ? { ...b, snap } : b) } }); this.toastMsg('Viewers now see the numbers as of now'); },
    dbSnapLine: !isTr && B.snap ? 'Shared view published ' + Fmt.dt(B.snap.at) + ' by ' + B.snap.by : '', dbCanPublish: canEdit && !isTr && !D.edit,
    dbIsSnap: useSnap, dbSnapNote: useSnap ? (B.snap ? 'Shared view · numbers as of ' + Fmt.dt(B.snap.at) + ', for the whole organisation. Filters and the records behind the numbers are for dashboard editors.' : 'This dashboard has not been published for viewers yet. Ask a dashboard editor to open it and select Save or “Publish for viewers”.') : '',
    dbShowSl: !useSnap, dbCanExport: canEdit,
    dbCancel: () => { const sn = s.dbSnap; this.setState({ dash: sn ? JSON.parse(sn.dash) : { ...D, edit:false }, dbBoard: sn && !isTr ? sn.board : s.dbBoard, ...(isTr && sn && sn.trTab ? { trTab: sn.trTab } : {}), dbEdit:null, dbSnap:null, trStripEd:null }); this.toastMsg('Changes discarded'); },
    dbDirty: !!s.dbSnap && JSON.stringify({ ...D, edit:false }) !== s.dbSnap.dash,
    dbSl: SL, setDbDiv: setSl('division'), setDbSub: setSl('sub'), setDbCourse: setSl('course'), setDbTraining: setSl('training'), setDbLoc: setSl('location'), setDbFrom: setSl('from'), setDbTo: setSl('to'),
    dbDivOpts: opts('All divisions', s.masters.divisions), dbSubOpts: opts('All sub divisions', SL.division === 'All' ? s.masters.subDivisions : s.masters.subDivisions.filter(x => SUBDIV_OF[x] === SL.division || !SUBDIV_OF[x])),
    dbHasTnotTr: !isTr && hasT, dbCourseOpts: courseOpts, dbTrOpts: opts('All trainings', s.masters.trainingNames), dbLocOpts: opts('All locations', s.masters.locations), dbHasL: hasL, dbHasT: hasT,
    dbPresets: [['This month', TODAY_KEY.slice(0, 8) + '01', TODAY_KEY], ['Last 90 days', Progress.plus(TODAY_KEY, -90), TODAY_KEY], ['This year', TODAY_KEY.slice(0, 4) + '-01-01', TODAY_KEY], ['All time', '', '']].map(([l, f, t]) => ({ l, pick: () => this.setState({ dash: { ...D, slicers: { ...SL, from: f, to: t } } }) })),
    dbBadRange: !!(SL.from && SL.to && SL.from > SL.to),
    dbClearSl: () => this.setState({ dash: { ...D, slicers: { division:'All', sub:'All', course:'All', training:'All', location:'All', from:'', to:'' } } }), dbHasSl: Object.entries(SL).some(([k, x]) => x && x !== 'All'),
    dbGallery: [].concat(...Object.keys(DB_SRC).map(src => Object.keys(DB_TYPES).filter(k => src === 'train' || !DB_TRAIN_ONLY.includes(k)).map(k => ({ k, src, srcL: DB_SRC[src].split(' (')[0], l: DB_TYPES[k][0], d: DB_TYPES[k][1],
      add: () => { const id = 'v' + Date.now(), dims = Object.keys(DB_DIMS[src]), ms0 = Object.keys(DB_MEASURES[src]);
        setD((d, b) => { b.visuals.push({ id, src, type: k, measure: k === 'kpi' || k === 'gauge' ? (src === 'train' ? 'throughput' : src === 'hr' ? 'active' : 'completionRate') : ms0[0], dim: k === 'line' ? (dims.find(isMonth) || dims[0]) : src === 'train' ? 'training' : src === 'hr' ? 'division' : 'subDivision',
          ...(k === 'heat' ? { hx: true, dim2: src === 'train' ? 'month' : src === 'hr' ? 'site' : 'category' } : {}), ...(k === 'radar' ? { axes: ms0.slice(0, 5), n: 5 } : {}),
          w: k === 'kpi' ? 3 : k === 'gauge' ? 4 : ['heat', 'table', 'batches'].includes(k) ? 12 : 6, pick: src === 'learn' && !['heat', 'radar', 'gauge'].includes(k) }); }); this.setState({ dbEdit: id }); this.toastMsg(DB_TYPES[k][0] + ' added'); } })))),
    dbDelSched: (n => n ? ' Its ' + (n === 1 ? 'scheduled e-mail is' : n + ' scheduled e-mails are') + ' removed too.' : '')((D.schedules || []).filter(x => x.board === B.id).length),
    dbDelAsk: !!s.dbDelAsk, dbDelNo: () => this.setState({ dbDelAsk:false }),
    dbName: B.name, setDbName: e => { const x = e.target.value; setD((d, b) => { b.name = x; }); },
    dbAudChips: audChips, dbAudNote: aud.length ? 'Only people with these roles (and dashboard editors) see this dashboard. They still see only the data their role may read.' : 'Everyone whose role can open dashboards sees it. They still see only the data their role may read.',
    dbOpenKpis: () => { if (D.edit) return this.toastMsg('Save or Cancel your changes first'); this.go('kpis', { adminView:true }); },
    dbSaveTpl: () => { const nm = (B.name || '').trim() + ' (template)'; if ((D.templates || []).some(t => t.name === nm)) return this.toastMsg('A template called “' + nm + '” already exists');
      setD(d => { d.templates = (d.templates || []).concat([{ id: 'tp' + Date.now(), name: nm, visuals: JSON.parse(JSON.stringify(B.visuals)).map(({ id, ...x }) => x) }]); }); this.toastMsg('Saved as a template for new dashboards'); },
    // + New opens a small pop-up (name + start from blank / MIS / copy of this one / a template) with Cancel.
    dbNewBoard: () => { if (!canEdit) return; this.setState({ dbNew: { name:'', from:'blank', err:'' } }); },
    dbNewOpen: !!s.dbNew, dbN: s.dbNew || {}, dbNErr: !!(s.dbNew && s.dbNew.err),
    setDbNName: e => { const x = e.target.value; this.setState(st => ({ dbNew: { ...st.dbNew, name: x, err:'' } })); },
    dbNFrom: [['blank', 'Blank'], ['mis', 'Training overview template'], ['attr', 'Attrition template'], ['learn', 'Learning overview template'], ['copy', 'Copy of “' + B.name + '”']].map(([k, l]) => UI.chip((s.dbNew || {}).from, k, l, () => this.setState(st => ({ dbNew: { ...st.dbNew, from: k } })))),
    dbNTpl: TPL.map(t => UI.chip((s.dbNew || {}).from, 'tpl:' + t.id, t.name + (t.saved ? ' ★' : ''), () => this.setState(st => ({ dbNew: { ...st.dbNew, from: 'tpl:' + t.id } })))),
    dbNCancel: () => this.setState({ dbNew:null }),
    dbNCreate: () => { if (!canEdit) return; const N = s.dbNew, nm = (N.name || '').trim();
      if (!nm) return this.setState({ dbNew: { ...N, err:'Give the dashboard a name.' } }); if (nm.length > 40) return this.setState({ dbNew: { ...N, err:'Keep the name under 40 characters.' } });
      if (D.boards.some(b => b.name.trim().toLowerCase() === nm.toLowerCase())) return this.setState({ dbNew: { ...N, err:'A dashboard called “' + nm + '” already exists.' } });
      const id = 'b' + Date.now(), uid = x => x.map((v, i) => ({ ...v, id: id + '_' + i })), tp = String(N.from).startsWith('tpl:') ? TPL.find(t => 'tpl:' + t.id === N.from) : null;
      const vis = tp ? uid(tplVisuals(tp)) : N.from === 'mis' ? uid(DB_MIS) : N.from === 'attr' ? uid(DB_ATTR) : N.from === 'learn' ? uid(DB_DEFAULT) : N.from === 'copy' ? uid(B.visuals) : [{ id: id + '_0', src:'learn', type:'kpi', measure:'completionRate', w:4 }];
      const snap = { dash: JSON.stringify({ ...D, edit:false }), board: B.id, trTab };
      this.setState({ dbNew:null, ...(isTr ? { trTab: 'b:' + id } : { dbBoard: id }), dbSnap: snap, dash: { ...D, boards: D.boards.concat([{ id, name: nm, ...(isTr ? { area:'train' } : {}), visuals: JSON.parse(JSON.stringify(vis)), origin: JSON.parse(JSON.stringify(vis)) }]), edit:true } });
      this.toastMsg('“' + nm + '” created. Add visuals, then Save (or Cancel to discard it).'); },
    dbDupBoard: () => { if (!canEdit) return; const id = 'b' + Date.now(); let nm = B.name + ' (copy)', k = 2; while (D.boards.some(b => b.name === nm)) nm = B.name + ' (copy ' + (k++) + ')';
      const copy = { ...JSON.parse(JSON.stringify(B)), id, name: nm, visuals: B.visuals.map((v, i) => ({ ...v, id: id + '_' + i })) }; delete copy.snap; delete copy.strip; if (isTr) copy.area = 'train';
      const snap = { dash: JSON.stringify({ ...D, edit:false }), board: B.id, trTab };   // v35: same as + New: edit mode, Cancel discards the copy
      this.setState({ ...(isTr ? { trTab: 'b:' + id } : { dbBoard: id }), dbSnap: snap, dash: { ...D, boards: D.boards.concat([copy]), edit:true } }); this.toastMsg('“' + nm + '” created. Save to keep it, or Cancel to discard it.'); },
    dbDelBoard: () => { if (!canEdit) return; if (TRB.includes(B.id)) return this.toastMsg('This tab is built in: use Reset layout instead of deleting it'); if (D.boards.length === 1) return this.toastMsg('Keep at least one dashboard'); if (!s.dbDelAsk) return this.setState({ dbDelAsk: true }); const nx = D.boards.find(b => b.id !== B.id); this.setState({ ...(isTr ? { trTab:'overview' } : { dbBoard: nx.id }), dbDelAsk:false, dbSnap:null, dash: { ...D, edit:false, boards: D.boards.filter(b => b.id !== B.id), schedules: (D.schedules || []).filter(x => x.board !== B.id) } }); this.logAudit('Deleted dashboard', B.name); this.toastMsg('“' + B.name + '” deleted'); },
    dbReset: () => { const orig = DB0.boards.find(x => x.id === B.id), start = orig ? orig.visuals : B.origin || [];
      setD((d, b) => { b.visuals = JSON.parse(JSON.stringify(start)).map((v, i) => ({ ...v, id: (v.id || b.id + '_') + 'r' + Date.now().toString(36) + i })); }); this.toastMsg(orig ? 'Layout reset' : 'Back to the layout it was created with'); },
    dbExport: () => { if (!canEdit) return; const rows = [['Visual', 'Source', 'Dimension', 'Value', 'Measure', 'Result']], skipped = [];
      B.visuals.forEach(v0 => { const v = { src:'learn', ...v0 }, C = cubeOf(v), MS = MSof(v.src), m = MS[v.measure] ? v.measure : Object.keys(MS)[0], dim = DB_DIMS[v.src][v.dim] ? v.dim : Object.keys(DB_DIMS[v.src])[0], t = v.title || MS[m][0];
        if (v.type === 'kpi' || v.type === 'gauge') rows.push([t, DB_SRC[v.src], '', 'Total', MS[m][0], fmtV(v.src, m, Dash.measure(v.src, C.tot, m))]);
        else if (v.type === 'matrix') C.tat.forEach((mm, k) => Object.entries(mm).forEach(([bk, n]) => rows.push([t, DB_SRC[v.src], 'Sub division × TAT weeks', k + ' · ' + bk, 'Handed over', n])));
        else if (v.type === 'heat' && (v.hx || v.src === 'hr')) { const d2 = DB_DIMS[v.src][v.dim2] ? v.dim2 : Object.keys(DB_DIMS[v.src]).find(k => k !== dim); Dash.pair(s, SL, v.src, dim, d2, courseFor(v)).forEach((row, k) => rows.push([t, DB_SRC[v.src], DB_DIMS[v.src][dim] + ' × ' + DB_DIMS[v.src][d2], k.split('|').join(' × '), MS[m][0], fmtV(v.src, m, Dash.measure(v.src, row, m))])); }
        else if (v.type === 'radar') { const all = C.T[dim] ? [...C.T[dim].entries()] : []; if (all.length > 60) skipped.push(t + ' (first 60 of ' + all.length + ' rows)'); all.slice(0, 60).forEach(([k, row]) => (v.axes || []).filter(a => MS[a]).forEach(a => rows.push([t, DB_SRC[v.src], DB_DIMS[v.src][dim], lab(dim, k), MS[a][0], fmtV(v.src, a, Dash.measure(v.src, row, a))]))); }
        else if (['heat', 'batches'].includes(v.type)) { skipped.push(t); rows.push([t, DB_SRC[v.src], '', 'Not included in this export', '', '']); }
        else rowsOf(v, C, dim, m).forEach(x => rows.push([t, DB_SRC[v.src], DB_DIMS[v.src][dim], lab(dim, x.k), MS[m][0], fmtV(v.src, m, x.v)])); });
      csvDownload('dashboard-' + B.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + TODAY_KEY + '.csv', rows); this.toastMsg(skipped.length ? 'Dashboard data exported. Not fully included: ' + skipped.join(', ') : 'Dashboard data exported'); },
    ...drillV, ...schV,
    dbPbiOpen: !!s.dbPbi, dbPbiCan: canEdit, dbPbiOpenFn: () => this.setState({ dbPbi:true }), dbPbiClose: () => this.setState({ dbPbi:false }),
    dbPbiTrain: pbi('train'), dbPbiLearn: pbi('learn'), dbPbiHr: pbi('hr'), dbPbiDict: pbi('dict'),
  };
};
