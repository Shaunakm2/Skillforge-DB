/* Skillforge LMS — Settings › Reports › Training overview & MIS.
 * One page for everything about training batches: Overview and Attrition (customisable boards), MIS and
 * Batches & trainees. All four share the page filters (division, sub division, training, location, dates).
 *
 *  MIS          (a) trainees trained and unique trainees · (b) handed over · (c) attrition
 *               (d) throughput = handed over ÷ trainees who joined · (e) early and direct absorb
 *               (f) handover pipeline: when people currently in training reach the floor
 *                   (classroom end date + 1 working day), by week · attrition trend by month
 *  Trainees     every trainee in every batch with the columns the admin chooses (add, remove, reorder),
 *               search, paging and CSV of the chosen columns.
 */
const TRAIN_KPIS = [
  ['Trainees trained', T => T.n, T => T.unique.toLocaleString('en-US') + ' unique trainees', '#16324F'],
  ['Unique trainees', T => T.unique, T => 'People counted once across trainings', '#5B7DB8'],
  ['Handed over', T => T.handover, T => 'Handover to operations', '#007A4D'],
  // Attrition counts people who left after joining (as on the batch page); "did not join" is shown beside it, not inside it.
  ['Attrition', T => T.attr, T => (T.joined ? (T.attr / T.joined * 100).toFixed(1) + '% of those who joined' : '—') + ' · ' + T.noshow + ' did not join', '#D64545'],
  ['Throughput', T => T.joined ? (T.handover / T.joined * 100).toFixed(1) + '%' : '—', T => T.handover.toLocaleString('en-US') + ' handed over ÷ ' + T.joined.toLocaleString('en-US') + ' joined', '#0F766E'],
  ['Early absorb', T => T.early, T => 'Absorbed before training ended', '#8C5A9E'],
  ['Direct absorb', T => T.direct, T => 'Absorbed without training', '#CA8A04'],
  ['In training now', T => T.inTr, T => 'Classroom or on the job', '#2F4A7A'],
];
/* Every field available for the trainee table (MIS columns). Key, label, value. */
const MIS_COLS = [
  ['batch', 'Batch ID', x => x.batch], ['training', 'Training name', x => x.training], ['segment', 'Training segment', x => x.segment], ['traineeType', 'Type of trainee', x => x.traineeType],
  ['trainer', 'Trainer', x => x.trainer], ['empId', 'Employee ID', x => x.empId], ['name', 'Name', x => x.name], ['division', 'Division', x => x.division], ['subDivision', 'Sub division', x => x.subDivision],
  ['hiringManager', 'Hiring manager', x => x.hiringManager], ['divisionHead', 'Division head', x => x.divisionHead], ['gender', 'Gender', x => x.gender], ['designation', 'Designation', x => x.designation],
  ['location', 'Location', x => x.location], ['wfo', 'WFO / WFH', x => x.wfo], ['brand', 'Brand', x => x.brand], ['doj', 'Date of joining', x => x.doj], ['cs', 'Classroom start', x => x.cs], ['ce', 'Classroom end', x => x.ce],
  ['oe', 'OJT end', x => x.days > 1 ? x.oe : ''], ['handover', 'Handover date', x => x.group === 'handover' ? x.handover : ''], ['expected', 'Expected on floor', x => x.group === 'training' ? x.floor : ''], ['earlyAbsorb', 'Early absorb date', x => x.earlyAbsorb],
  ['status', 'Current status', x => x.status], ['group', 'Status group', x => STATUS_GROUPS[x.group].label], ['attrCat', 'Attrition category', x => x.attrCat], ['attrResp', 'Attrition responsibility', x => x.attrResp],
  ['dol', 'Date of leaving', x => x.dol], ['reason', 'Attrition reason', x => x.reason], ['m1', 'M1 1st attempt', x => x.m1], ['m1b', 'M1 2nd attempt', x => x.m1b], ['m2', 'M2 result', x => x.m2], ['m3', 'M3 result', x => x.m3], ['m4', 'M4 result', x => x.m4],
  ['email', 'Email', x => x.email], ['phone', 'Contact number', x => x.phone], ['education', 'Education', x => x.education], ['exp', 'Experience', x => x.exp], ['account', 'Account', x => x.account],
];
const MIS_COLS_DEFAULT = ['batch', 'training', 'empId', 'name', 'subDivision', 'cs', 'ce', 'expected', 'handover', 'status', 'm1'];
const nextWorkday = k => { let d = Progress.plus(k, 1); while (isWeekend(d)) d = Progress.plus(d, 1); return d; };
const weekStart = k => { const d = new Date(k + 'T12:00:00'), w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return dateKey(d); };

/* MIS panels (handover pipeline, attrition trend) from the filtered MIS rows. Used by the MIS board's visuals (v30). */
const trMisPanels = list => {
  list.forEach(x => { if (!x.floor) x.floor = nextWorkday(x.ce); });
  const vals = {};
    const thisWk = weekStart(TODAY_KEY), weeks = [];
    for (let i = -4; i < 8; i++) weeks.push(weekStart(Progress.plus(thisWk, i * 7)));
    const wk = new Map(weeks.map(w => [w, { done:0, plan:0, batches:new Map() }]));
    let overdue = 0; const late = new Map();
    list.forEach(x => {
      if (x.group === 'handover' && x.handover) { const w = wk.get(weekStart(x.handover)); if (w && x.handover <= TODAY_KEY) w.done++; }
      if (x.group === 'training') { if (x.floor < TODAY_KEY) { overdue++; late.set(x.batch, (late.get(x.batch) || 0) + 1); return; }
        const w = wk.get(weekStart(x.floor)); if (w) { w.plan++; w.batches.set(x.batch, (w.batches.get(x.batch) || 0) + 1); } } });
    const mx = Math.max(1, ...[...wk.values()].map(w => w.done + w.plan));
    const fmtW = w => Fmt.short(w) + ' – ' + Fmt.short(Progress.plus(w, 4));
    vals.trPipe = weeks.map(w => { const v = wk.get(w), past = w < thisWk, cur = w === thisWk;
      return { label: fmtW(w), tag: cur ? 'This week' : past ? 'Done' : 'Planned', n: (v.done + v.plan).toLocaleString('en-US'), hDone: (v.done / mx * 100).toFixed(1) + '%', hPlan: (v.plan / mx * 100).toFixed(1) + '%',
        sub: v.plan ? [...v.batches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, n]) => b + ' · ' + n).join('  ') : v.done ? v.done + ' handed over' : '—', cur, past }; });
    vals.trPipeNext = [...wk.entries()].filter(([w]) => w >= thisWk).reduce((t, [, v]) => t + v.plan, 0).toLocaleString('en-US');
    vals.trLate = overdue; vals.trHasLate = overdue > 0; vals.trLateList = [...late.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, n]) => b + ' (' + n + ')').join(', ');
    // attrition trend: people who left each month (by date of leaving) and the rate against batch starts that month
    const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(TODAY_KEY.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - i); months.push(dateKey(d).slice(0, 7)); }
    const left = new Map(), started = new Map(); list.forEach(x => { if (x.group === 'attrited' && x.statusType !== 'noshow' && x.dol) left.set(x.dol.slice(0, 7), (left.get(x.dol.slice(0, 7)) || 0) + 1); if (x.statusType !== 'noshow') started.set(x.monthKey, (started.get(x.monthKey) || 0) + 1); });
    const amx = Math.max(1, ...months.map(m => left.get(m) || 0));
    vals.trAttr = months.map(m => { const n = left.get(m) || 0, st = started.get(m) || 0; return { l: new Date(m + '-15T12:00:00').toLocaleDateString('en-US', { month:'short' }), n, h: Math.max(2, n / amx * 100).toFixed(1) + '%', rate: st ? (n / st * 100).toFixed(1) + '% of ' + st + ' who started' : 'No batch starts' }; });
    vals.trAttrTotal = [...left.values()].reduce((t, n) => t + n, 0);
  return vals;
};

SkillforgeApp.prototype.trainingMis = function (c, C, SL) {
  const { s } = c, list = C.list, tab = s.trTab || 'overview';
  const T = { n: list.length, unique: new Set(list.map(x => x.empId || x.name)).size, handover: 0, attr: 0, noshow: 0, early: 0, direct: 0, inTr: 0, joined: 0 };
  list.forEach(x => { if (x.statusType !== 'noshow') T.joined++; else T.noshow++; if (x.group === 'handover') T.handover++; if (x.group === 'attrited' && x.statusType !== 'noshow') T.attr++; if (x.group === 'training') T.inTr++;
    if (x.statusType === 'absorbed') { if (x.earlyAbsorb) T.early++; else T.direct++; } });
  const kpis = Tiles.apply(s, 'training', TRAIN_KPIS.map(([k, v, sub, col]) => ({ key: k, l: k, v: typeof v(T) === 'number' ? v(T).toLocaleString('en-US') : v(T), sub: sub(T), c: col })), x => x.key, (x, l) => ({ ...x, l }));
  if (tab !== 'trainees') return { isTraining:true, trKpis: kpis, trMis:false, trTrainees:false };
  // expected floor date for people still in training: classroom end + 1 working day
  list.forEach(x => { if (!x.floor) x.floor = nextWorkday(x.ce); });
  const vals = { isTraining:true, trKpis: kpis, trMis:false, trTrainees: tab === 'trainees' };
  // v30: the MIS tab is a customisable board (visuals 'pipeline' and 'attrend' use trMisPanels below)
  if (tab === 'trainees') {
    const chosen = (s.repCols || {}).mis || MIS_COLS_DEFAULT, colBy = Object.fromEntries(MIS_COLS.map(x => [x[0], x])), cols = chosen.map(k => colBy[k]).filter(Boolean);
    const q = (s.trQ || '').trim().toLowerCase(), sg = s.trGroup || 'All';
    const rows = list.filter(x => (sg === 'All' || x.group === sg) && (!q || (x.name + ' ' + x.empId + ' ' + x.batch + ' ' + x.training + ' ' + x.trainer).toLowerCase().includes(q)));
    const fmtCell = (k, v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Fmt.medium(v) : (v === '' || v == null ? '—' : v);
    const PG = Pager(this, s, 'tr-rows', rows, 50);
    const setCols = fn => this.setState(st => { const cur = ((st.repCols || {}).mis || MIS_COLS_DEFAULT).slice(); return { repCols: { ...(st.repCols || {}), mis: fn(cur) } }; });
    Object.assign(vals, {
      trCols: cols.map(x => ({ t: x[1] })), trGrid: 'repeat(' + cols.length + ', minmax(120px, 1fr))',
      trRows: PG.rows.map(x => ({ cells: cols.map(cc => ({ t: fmtCell(cc[0], cc[2](x)) })) })), trPager: PG.pager, trEmpty: !rows.length, trCount: rows.length.toLocaleString('en-US') + ' rows',
      trQ: s.trQ || '', setTrQ: e => this.setState({ trQ: e.target.value, pages: { ...s.pages, 'tr-rows':1 } }),
      trGroups: ['All'].concat(Object.keys(STATUS_GROUPS)).map(g => UI.chip(sg, g, g === 'All' ? 'Everyone' : STATUS_GROUPS[g].label, () => this.setState({ trGroup: g, pages: { ...s.pages, 'tr-rows':1 } }))),
      trColOpen: !!s.trColOpen, trColToggle: () => this.setState({ trColOpen: !s.trColOpen }),
      trColRows: chosen.map((k, i) => ({ k, l: (colBy[k] || [])[1], up: () => setCols(a => { if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; }), down: () => setCols(a => { if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; }), isFirst: i === 0, isLast: i === chosen.length - 1,
        remove: () => { if (chosen.length === 1) return this.toastMsg('Keep at least one column'); setCols(a => a.filter(x => x !== k)); } })),
      trColAdd: MIS_COLS.filter(x => !chosen.includes(x[0])).map(x => ({ l: x[1], add: () => setCols(a => a.concat([x[0]])) })),
      trColReset: () => this.setState(st => { const r = { ...(st.repCols || {}) }; delete r.mis; return { repCols: r }; }),
      trCsv: () => { csvDownload('training-mis-' + TODAY_KEY + '.csv', [cols.map(x => x[1])].concat(rows.map(x => cols.map(cc => { const v = cc[2](x); return v == null ? '' : v; })))); this.toastMsg(rows.length.toLocaleString('en-US') + ' rows exported with ' + cols.length + ' columns'); },
    });
  }
  return vals;
};
