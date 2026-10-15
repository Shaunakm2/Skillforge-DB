/* Skillforge LMS — Batch management.
 *
 *  Training type   Code + level (for batch IDs), duration (day-wise plan), passing %, certification weights
 *                  (LMS vs external split, and a weight per assessment), external assessments.
 *  Batch ID        <code><level><YY><NNN>, e.g. CommsL126001 — NNN increments per code+level+year.
 *  Holidays        Organisation-wide and per batch. Training days skip weekends and holidays; end date is calculated.
 *  Trainee status  A dated timeline per trainee using admin-managed statuses (In-Training, Attried, Early Absorb…).
 *                  Each status has a type that drives attendance, KPIs and certification.
 *  Audit history   Every change in a batch: who, role, when, what, before → after. Admin edits to someone
 *                  else's entry are marked as corrections.
 *
 *  Adds SkillforgeApp.prototype.batchVals(), merged into renderVals() by app.js.
 */
const DIVISIONS = ['Customer Success', 'Sales', 'Operations', 'Technology', 'Finance & Risk', 'HR & Shared Services'];
const ATT_CODES = { P:['Present', '#DCFCE7', '#166534'], L:['Late', '#FEF3C7', '#92400E'], A:['Absent', '#FDECEC', '#A63232'], E:['Excused', '#E5ECF7', '#2F4A7A'] };
const RAG_C = { Red:['#FDECEC', '#A63232', '#D64545'], Amber:['#FEF3C7', '#92400E', '#0066A1'], Green:['#DCFCE7', '#166534', '#007A4D'], 'Not started':['#EAF1F6', '#526B7A', '#BFCFDB'], Exited:['#EAF1F6', '#526B7A', '#6E8796'] };
const CERT_C = { Certified:['#DCFCE7', '#166534'], 'Not certified':['#FDECEC', '#A63232'], 'In progress':['#FEF3C7', '#92400E'], 'No rule':['#EAF1F6', '#526B7A'], 'Not evaluated':['#EAF1F6', '#526B7A'] };

const STATUS_TYPES = {
  active:   { label:'In training',   desc:'In the classroom. Expected in attendance and tracked for EWS and RAG.', bg:'#E5ECF7', fg:'#2F4A7A', bar:'#5B7DB8' },
  ojt:      { label:'On the job',    desc:'Classroom finished, training on the floor. Still in the programme.', bg:'#EDE9FE', fg:'#5B21B6', bar:'#8B6FD6' },
  graduated:{ label:'Graduated',     desc:'Completed training and handed over to operations. Counts toward throughput.', bg:'#DCFCE7', fg:'#166534', bar:'#007A4D' },
  absorbed: { label:'Absorbed',      desc:'Moved into a business role before or without completing training. Counts toward throughput.', bg:'#CCFBF1', fg:'#115E59', bar:'#08AE6E' },
  attrition:{ label:'Attrition',     desc:'Left during training. Needs voluntary or involuntary, a reason and details.', bg:'#FDECEC', fg:'#A63232', bar:'#D64545' },
  noshow:   { label:'Did not join',  desc:'Mapped to the batch but never joined. Not counted as joined.', bg:'#EAF1F6', fg:'#526B7A', bar:'#9CB3C4' },
  moved:    { label:'Moved',         desc:'Transferred to another batch. Needs the batch it moved to.', bg:'#FEF3C7', fg:'#92400E', bar:'#0066A1' },
  failed:   { label:'Not certified', desc:'Did not meet certification and left the programme.', bg:'#FDE2E2', fg:'#991B1B', bar:'#B91C1C' },
  hold:     { label:'On hold',       desc:'Paused, for example referred to HR. Not expected in attendance.', bg:'#FCE7F3', fg:'#9D174D', bar:'#DB2777' },
};
const STATUSES0 = [['st_attr', 'Attried', 'attrition'], ['st_decert', 'Decertified', 'failed'], ['st_dabs', 'Direct Absorb', 'absorbed'], ['st_eabs', 'Early Absorb', 'absorbed'], ['st_ops', 'Handover to OPS', 'graduated'],
  ['st_drop', 'Induction dropout', 'attrition'], ['st_intr', 'In-Training', 'active'], ['st_move', 'Moved to next batch', 'moved'], ['st_ojt', 'On the job training', 'ojt'], ['st_hr', 'Referred to HR', 'hold'],
  ['st_retr', 'Re-Training', 'active'], ['st_nj', 'Did not join training', 'noshow']].map(([id, name, type]) => ({ id, name, type, builtin:true, ...(id === 'st_retr' ? { group:'other' } : {}) }));
const DEFAULT_STATUS = 'st_intr';
const VOL_REASONS = ['Better opportunity', 'Higher studies', 'Health', 'Relocation', 'Personal or family reasons', 'Role or shift mismatch', 'Compensation', 'Other'];
const INVOL_REASONS = ['Attendance', 'Performance', 'Misconduct', 'Background verification', 'Policy violation', 'Other'];

const isWeekend = k => { const w = new Date(k + 'T12:00:00').getDay(); return w === 0 || w === 6; };
const addDays = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dateKey(d); };
const offDay = (k, sat) => { const w = new Date(k + 'T12:00:00').getDay(); return w === 0 || (w === 6 && !sat); };
const trainDays = (start, n, hol, sat) => { const out = []; if (!start || !n) return out; let k = start, guard = 0; while (out.length < n && guard++ < 900) { if (!offDay(k, sat) && !(hol && hol.has(k))) out.push(k); k = addDays(k, 1); } return out; };
/* v41.21: per-batch schedule. b.sched: 'standard' (the training type's days) · 'fast' (fewer days: the plan is compressed) ·
 * 'extended' (more days: extra days at the end) · 'end' (custom end date: the days between start and that date).
 * b.sat: Saturdays are training days. Plan day di of a T-day type falls on batch day planDayOf(T, N, di). */
const batchDates = (b, tt, hol) => { if (!b || !b.start) return []; const sat = !!b.sat, T = tt ? tt.days.length : 0;
  if (b.sched === 'end' && b.endWant && b.endWant >= b.start) { const out = []; let k = b.start, g = 0; while (k <= b.endWant && g++ < 900) { if (!offDay(k, sat) && !(hol && hol.has(k))) out.push(k); k = addDays(k, 1); } return out; }
  const N = (b.sched === 'fast' || b.sched === 'extended') && +b.daysN > 0 ? +b.daysN : T;
  return trainDays(b.start, N, hol, sat); };
const planDayOf = (T, N, di) => !T || !N || N >= T ? di : Math.min(N - 1, Math.floor(di * N / T));
const dayPlan = (tt, N) => { const T = tt ? tt.days.length : 0, out = Array.from({ length: N }, () => []); for (let di = 0; di < T; di++) { const bi = planDayOf(T, N, di); if (out[bi]) out[bi].push(di); } return out; };
const schedLabel = (b, tt) => { const T = tt ? tt.days.length : 0; return b.sched === 'fast' ? 'Fast track' : b.sched === 'extended' ? 'Extended' : b.sched === 'end' ? 'Custom end date' : 'Standard (' + T + (T === 1 ? ' day' : ' days') + ')'; };
const holSetFor = (glob, b) => new Set((glob || []).map(h => h.date).concat(((b && b.holidays) || []).map(h => h.date)));
/* A batch is Completed only when someone marks the training complete. After the last training day it waits in
   "Awaiting closure" until every trainer update is in (no one still in training, attendance logged for every day). */
const batchStatus = b => b.closed ? 'Completed' : TODAY_KEY < b.start ? 'Upcoming' : TODAY_KEY > b.end ? 'Awaiting closure' : 'Ongoing';
/* The three primary trainee groups used for headcount: In training, Attrited, Handed over (plus Other). */
const STATUS_GROUPS = {
  training: { label:'In training', desc:'In the batch right now (in training or on the job).', c:'#2F4A7A', bar:'#5B7DB8' },
  attrited: { label:'Attrited', desc:'Left or never joined (attried, induction dropout, did not join).', c:'#A63232', bar:'#D64545' },
  handover: { label:'Handed over', desc:'Completed training (handover to OPS, early or direct absorb).', c:'#166534', bar:'#007A4D' },
  other:    { label:'Other', desc:'Moved to next batch, referred to HR, decertified, re-training and other statuses.', c:'#526B7A', bar:'#9CB3C4' },
};
const TYPE_GROUP = { active:'training', ojt:'training', attrition:'attrited', noshow:'attrited', graduated:'handover', absorbed:'handover', moved:'other', failed:'other', hold:'other' };
const groupOf = st => st.group || TYPE_GROUP[st.type] || 'other';
const lastLogged = b => Object.keys((b && b.att) || {}).sort().pop() || null;
const longD = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '';
const hashN = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const nowStamp = () => { const d = new Date(); return dateKey(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const fmtStamp = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); };

/* Status in effect for a trainee on a date: last entry dated on/before it (entries kept in date order). */
const statusEntryOn = (b, u, d) => { const list = ((b.st || {})[u]) || []; let cur = null; list.forEach(e => { if (e.date <= d) cur = e; }); return cur; };
const statusIdOn = (b, u, d) => { const e = statusEntryOn(b, u, d); return e ? e.status : DEFAULT_STATUS; };
const currentEntry = (b, u) => { const l = ((b.st || {})[u]) || []; return l[l.length - 1] || null; };

/* Batch ID: <code><level><YY><NNN> */
const codePrefix = (tt, start) => (tt.code || 'BAT') + (tt.level || '') + (start || TODAY_KEY).slice(2, 4);
const nextBatchCode = (tt, start, batches, exceptId) => { const p = codePrefix(tt, start); let n = 0; batches.forEach(b => { if (b.id !== exceptId && b.code.startsWith(p) && /^\d{3}$/.test(b.code.slice(p.length))) n = Math.max(n, parseInt(b.code.slice(p.length), 10)); }); return p + String(n + 1).padStart(3, '0'); };

const HOLIDAYS0 = [
  { id:'h1', date:'2026-10-14', name:'Northwind Foundation Day' },
  { id:'h2', date:'2026-11-09', name:'Diwali (observed)' },
  { id:'h3', date:'2026-12-25', name:'Christmas Day' },
];

/* Certification rule copied from a training type: LMS assessment modules in the plan count with weight 1. */
/* v41.21: passing % and LMS weight are optional on a training type (null = not set yet). No pass mark: nobody is marked
 * certified / not certified. No LMS weight: LMS and external count equally (50 / 50). */
const nz = v => v === '' || v == null || Number.isNaN(v) ? null : v;
const pctL = v => nz(v) == null ? 'Not set' : v + '%';
const lmsWOf = C => nz(C.lmsW) == null ? 50 : C.lmsW;
const certFrom = (tt, lcms) => { const lms = {}; tt.days.forEach((d, di) => d.items.forEach((it, ii) => { if (it.kind === 'module') { const m = lcms.find(x => x.id === it.ref); if (m && m.type === 'Assessment') lms[di + ':' + ii] = 1; } })); return { pass: tt.passPct, lmsW: tt.lmsW, lms, ext: tt.ext.map(e => ({ ...e })) }; };

const TTYPES0 = [
  { id:'tt1', name:'New Hire Induction', code:'NHI', level:'L1', desc:'First-week programme for every new joiner.', passPct:70, lmsW:50, ext:[{ id:'x1', name:'Role-play evaluation', max:20, w:1 }, { id:'x2', name:'Trainer viva', max:10, w:1 }], days:[
    { title:'Welcome & safety', items:[{ kind:'course', ref:'safety', essential:true }, { kind:'module', ref:'m11', essential:true }] },
    { title:'Feedback basics', items:[{ kind:'course', ref:'feedback', essential:true }, { kind:'module', ref:'m6', essential:true }] },
    { title:'Working with your manager', items:[{ kind:'course', ref:'oneonones', essential:false }, { kind:'module', ref:'m10', essential:false }] },
    { title:'Change & resilience', items:[{ kind:'course', ref:'change', essential:true }, { kind:'module', ref:'m5', essential:true }] },
    { title:'Wrap-up', items:[{ kind:'course', ref:'eq', essential:false }] } ] },
  { id:'tt2', name:'Customer Success Bootcamp', code:'CSB', level:'L1', desc:'Core customer skills for new CS hires.', passPct:75, lmsW:50, ext:[{ id:'x3', name:'Mock customer call', max:50, w:1 }], days:[
    { title:'Customer conversations', items:[{ kind:'course', ref:'feedback', essential:true }, { kind:'module', ref:'m7', essential:false }] },
    { title:'Negotiation', items:[{ kind:'course', ref:'negotiation', essential:true }] },
    { title:'Presenting', items:[{ kind:'course', ref:'present', essential:true }, { kind:'module', ref:'m9', essential:false }] },
    { title:'Assessment day', items:[{ kind:'module', ref:'m6', essential:true }, { kind:'module', ref:'m5', essential:true }] } ] },
  { id:'tt3', name:'Leadership Accelerator', code:'Lead', level:'L2', desc:'Three days for new people leaders.', passPct:70, lmsW:30, ext:[{ id:'x4', name:'Leadership case presentation', max:100, w:1 }], days:[
    { title:'Leading change', items:[{ kind:'course', ref:'change', essential:true }, { kind:'module', ref:'m8', essential:false }] },
    { title:'Coaching', items:[{ kind:'course', ref:'coaching', essential:true }, { kind:'course', ref:'oneonones', essential:false }] },
    { title:'Inclusion', items:[{ kind:'course', ref:'inclusive', essential:true }, { kind:'module', ref:'m5', essential:true }] } ] },
  { id:'tt4', name:'Communication Skills', code:'Comms', level:'L1', desc:'Written and spoken communication for customer-facing roles.', passPct:70, lmsW:40, ext:[{ id:'x5', name:'Written test', max:50, w:1 }, { id:'x6', name:'Voice & accent assessment', max:20, w:2 }], days:[
    { title:'Business writing', items:[{ kind:'course', ref:'feedback', essential:true }, { kind:'module', ref:'m11', essential:true }] },
    { title:'Presenting', items:[{ kind:'course', ref:'present', essential:true }, { kind:'module', ref:'m9', essential:false }] },
    { title:'Voice & accent', items:[{ kind:'module', ref:'m7', essential:false }, { kind:'course', ref:'oneonones', essential:false }] },
    { title:'Assessment prep', items:[{ kind:'module', ref:'m6', essential:true }] },
    { title:'Final evaluation', items:[{ kind:'module', ref:'m5', essential:true }] } ] },
];

/* Demo batches with attendance, progress, statuses, external scores and history for the days already past. */
const BATCHES0 = (() => {
  const out = [];
  const SID = name => STATUSES0.find(x => x.name === name).id;
  const mk = o => {
    const tt = TTYPES0.find(t => t.id === o.type), dates = trainDays(o.start, tt.days.length, holSetFor(HOLIDAYS0, o));
    const b = { att:{}, attLog:{}, prog:{}, manual:{}, ack:{}, rag:{}, ext:{}, extBy:{}, st:{}, audit:[], holidays:[], createdBy:'Lena Fischer', ...o, cert: certFrom(tt, LCMS0), start: dates[0], end: dates[dates.length - 1] };
    ['profiles', 'statuses', 'extSeed', 'fix'].forEach(k => delete b[k]);
    if (o.closed) b.audit.push({ id:'acl' + o.id, at: o.closedAt, by: o.closedBy, role:'Trainer', kind:'Setup', area:'Batch', text:'Training marked complete', before:'Awaiting closure', after:'Completed' });
    b.code = nextBatchCode(tt, b.start, out);
    let seq = 0;
    Object.entries(o.statuses || {}).forEach(([u, list]) => { b.st[u] = list.map(([name, date, x]) => ({ id:'se' + (++seq) + o.id, status: SID(name), date, by: o.trainer, at: date + 'T16:10', ...(x || {}) })); });
    const act = (u, d) => STATUS_TYPES[STATUSES0.find(x => x.id === statusIdOn(b, u, d)).type] === STATUS_TYPES.active;
    const prof = o.profiles || {};
    dates.forEach((d, di) => {
      if (d > TODAY_KEY) return;
      b.att[d] = {}; b.attLog[d] = { by: o.trainer, at: d, time:'5:30 PM' };
      o.trainees.forEach(u => { if (!act(u, d)) return; const p = prof[u] || 'ok', r = hashN(o.id + u + d);
        b.att[d][u] = p === 'high' ? (di === 1 || di === 2 ? 'A' : 'P') : p === 'mid' ? (di === 0 ? 'L' : di === 3 ? 'A' : 'P') : (r < 0.08 ? 'L' : 'P'); });
    });
    o.trainees.forEach(u => { const p = prof[u] || 'ok'; b.prog[u] = {};
      tt.days.forEach((day, di) => day.items.forEach((it, ii) => { const key = di + ':' + ii, r = hashN(o.id + u + key);
        if (!dates[di] || dates[di] > TODAY_KEY || !act(u, dates[di])) { b.prog[u][key] = { pct:0, score:null }; return; }
        const pct = p === 'high' ? (di === 0 ? 100 : 0) : p === 'mid' ? (r < 0.5 || !it.essential ? 100 : 50) : (r < 0.9 || it.essential ? 100 : 60);
        const score = p === 'high' ? 45 + Math.round(r * 12) : p === 'mid' ? 60 + Math.round(r * 9) : 76 + Math.round(r * 20);
        b.prog[u][key] = { pct, score: pct ? score : null }; })); });
    Object.entries(o.extSeed || {}).forEach(([u, v]) => { b.ext[u] = v; b.extBy[u] = Object.fromEntries(Object.keys(v).map(k => [k, o.trainer])); });
    // history
    const A = (at, by, role, kind, area, text, before, after) => b.audit.push({ id:'a' + b.audit.length + o.id, at, by, role, kind, area, text, before: before || '', after: after || '' });
    A(addDays(b.start, -5) + 'T10:15', 'Lena Fischer', 'Admin', 'Setup', 'Batch', 'Batch created with ' + o.trainees.length + ' trainees, trainer ' + o.trainer);
    Object.keys(b.att).sort().forEach(d => A(d + 'T17:30', o.trainer, 'Trainer', 'Change', 'Attendance', 'Attendance saved for Day ' + (dates.indexOf(d) + 1) + ' (' + longD(d) + ')'));
    Object.entries(b.st).forEach(([u, list]) => list.forEach(e => { const S = STATUSES0.find(x => x.id === e.status); A(e.at, e.by, 'Trainer', 'Change', 'Status', u + ': status set to ' + S.name + ' from ' + longD(e.date) + (e.reason ? ' (' + e.attType + ' · ' + e.reason + ')' : ''), 'In-Training', S.name); }));
    (o.fix || []).forEach(f => A(...f));
    b.audit.sort((x, y) => x.at.localeCompare(y.at));
    out.push(b); return b;
  };
  mk({ id:'b4', name:'Communication Skills · Aug cohort', type:'tt4', trainer:'Kofi Mensah', division:'Operations', start:'2026-08-17',
    trainees:['Rohan Desai', 'Ananya Rao', 'Sana Iqbal', 'Karan Malhotra', 'Grace Liu', 'Meera Nair', 'Marco Bianchi', 'Ishaan Kapoor', 'Nia Brooks'], profiles:{ 'Karan Malhotra':'mid', 'Marco Bianchi':'high' },
    statuses:{ 'Nia Brooks':[['Did not join training', '2026-08-17', { note:'Did not report on day 1. Phone switched off.' }]],
      'Marco Bianchi':[['Induction dropout', '2026-08-19', { attType:'Involuntary', reason:'Attendance', details:'Absent on day 2 and 3 without informing. Released as per induction policy.' }]],
      'Meera Nair':[['Attried', '2026-08-19', { attType:'Voluntary', reason:'Higher studies', details:'Got admission to a full-time MBA starting in September.' }]],
      'Grace Liu':[['Early Absorb', '2026-08-20', { target:'Operations · Escalations desk', note:'Strong writing scores; escalations team had an urgent opening.' }]],
      'Ishaan Kapoor':[['Moved to next batch', '2026-08-20', { target:'CommsL126002', note:'Missed two days for a family emergency.' }]],
      'Rohan Desai':[['Handover to OPS', '2026-08-24']], 'Ananya Rao':[['Handover to OPS', '2026-08-24']], 'Sana Iqbal':[['Handover to OPS', '2026-08-24']],
      'Karan Malhotra':[['Decertified', '2026-08-24', { note:'Final score below the 70% pass mark.' }]] },
    extSeed:{ 'Rohan Desai':{ x5:42, x6:17 }, 'Ananya Rao':{ x5:45, x6:18 }, 'Sana Iqbal':{ x5:40, x6:16 }, 'Karan Malhotra':{ x5:30, x6:11 } },
    closed:true, closedBy:'Kofi Mensah', closedAt:'2026-08-25T17:40',
    fix:[['2026-08-25T11:05', 'Lena Fischer', 'Admin', 'Correction', 'Status', 'Meera Nair: attrition date corrected', 'Aug 20', 'Aug 19'], ['2026-08-25T11:07', 'Lena Fischer', 'Admin', 'Correction', 'Certification', 'Karan Malhotra · Voice & accent assessment score corrected', '13 / 20', '11 / 20']] });
  mk({ id:'b3', name:'Leadership Accelerator · Sep', type:'tt3', trainer:'Daniel Reyes', division:'Sales', start:'2026-09-14', trainees:['Rohan Desai', 'Karan Malhotra', 'Fatima Sheikh', 'Ananya Rao', 'Sana Iqbal'], profiles:{ 'Karan Malhotra':'mid' },
    statuses:{ 'Fatima Sheikh':[['Attried', '2026-09-15', { attType:'Voluntary', reason:'Better opportunity', details:'Accepted an external offer with a higher salary.' }]],
      'Rohan Desai':[['Handover to OPS', '2026-09-18']], 'Ananya Rao':[['Handover to OPS', '2026-09-18']], 'Sana Iqbal':[['Handover to OPS', '2026-09-18']],
      'Karan Malhotra':[['On the job training', '2026-09-18', { note:'Two weeks of floor coaching before handover.' }]] },
    extSeed:{ 'Rohan Desai':{ x4:84 }, 'Karan Malhotra':{ x4:58 }, 'Ananya Rao':{ x4:91 }, 'Sana Iqbal':{ x4:77 } },
    fix:[['2026-09-16T12:40', 'Lena Fischer', 'Admin', 'Correction', 'Status', 'Fatima Sheikh: attrition date corrected', 'Sep 14', 'Sep 15']] });
  mk({ id:'b1', name:'New Hire Induction · Sep cohort', type:'tt1', trainer:'Daniel Reyes', division:'Customer Success', start:'2026-09-29', trainees:['Maya Okafor', 'Jonas Berg', 'Aisha Khan', 'Ishaan Kapoor', 'Meera Nair'], profiles:{ 'Ishaan Kapoor':'high', 'Meera Nair':'mid' },
    statuses:{ 'Aisha Khan':[['Early Absorb', '2026-10-02', { target:'Customer Success · Tier 2 support', note:'Strong role-plays. Her manager asked for an early start.' }]] },
    extSeed:{ 'Maya Okafor':{ x1:17 }, 'Jonas Berg':{ x1:15 }, 'Ishaan Kapoor':{ x1:9 }, 'Meera Nair':{ x1:13 } } });
  mk({ id:'b2', name:'CS Bootcamp · Oct cohort', type:'tt2', trainer:'Kofi Mensah', division:'Customer Success', start:'2026-10-12', trainees:['Jonas Berg', 'Sana Iqbal', 'Ishaan Kapoor', 'Meera Nair'] });
  mk({ id:'b5', name:'Communication Skills · Oct cohort', type:'tt4', trainer:'Daniel Reyes', division:'Operations', start:'2026-10-26', trainees:['Ishaan Kapoor', 'Nia Brooks', 'Jonas Berg'] });
  return out;
})();


SkillforgeApp.prototype.batchVals = function (s, role) {
  const W = '#FFFFFF', INK = '#16324F', scrV = this._scrV, me = role.name, isAdmin = !!role.admin;
  const myRole = role.admin ? 'Admin' : 'Trainer';
  const chip = (cur, v, label, pick) => { const on = cur === v; return { label, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick }; };
  const tg = (on, fn) => ({ on: !!on, track: on ? '#08AE6E' : '#C9D7E2', knob: on ? '21px' : '3px', toggle: fn });
  const pctLbl = v => v == null ? '—' : v + '%';
  const fmtD = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
  const mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const one = n => Math.round(n * 10) / 10;
  const smap = Object.fromEntries(s.statuses.map(x => [x.id, x]));
  const stOf = id => smap[id] || smap[DEFAULT_STATUS];
  const typeOn = (b, u, d) => stOf(statusIdOn(b, u, d)).type;
  const curStatus = b => u => stOf(statusIdOn(b, u, '9999-12-31'));
  const chipOf = st => ({ name: st.name, bg: STATUS_TYPES[st.type].bg, fg: STATUS_TYPES[st.type].fg });

  /* Mutate a batch and append an audit entry in the same update. Entries with the same key by the same
     person within 3 minutes are merged (e.g. typing a score), keeping the first "before". */
  const change = (id, fn, a) => this.setState(st => ({ batches: st.batches.map(x => {
    if (x.id !== id) return x;
    const nx = fn(x); if (!a) return nx;
    const audit = (nx.audit || x.audit || []).slice(), last = audit[audit.length - 1], now = Date.now();
    const kind = a.kind || (isAdmin && a.owner && a.owner !== me ? 'Correction' : 'Change');
    if (a.key && last && last.key === a.key && last.by === me && now - (last.ts || 0) < 180000) audit[audit.length - 1] = { ...last, text: a.text, after: a.after || '', at: nowStamp(), ts: now };
    else audit.push({ id:'a' + now + Math.random().toString(36).slice(2, 6), at: nowStamp(), ts: now, by: me, role: myRole, kind, area: a.area, text: a.text, before: a.before || '', after: a.after || '', key: a.key || null });
    return { ...nx, audit };
  }) }));

  // ---- plan items ----
  const courseHasQuiz = id => { const c = s.adminCourses.find(x => x.id === id); return !!c && c.items.some(i => i.kind === 'quiz'); };
  const itemInfo = it => {
    if (it.kind === 'course') { const c = s.adminCourses.find(x => x.id === it.ref); return { title: c ? c.title : '(course removed)', code: c ? c.code : '', type:'Course', glyph:'▤', bg:'#E3F1EE', fg:'#245E52' }; }
    const m = s.lcms.find(x => x.id === it.ref), T = m ? MOD_TYPES[m.type] : null;
    return { title: m ? m.title : '(module removed)', code: m ? m.code : '', type: m ? m.type : 'Module', glyph: T ? T.glyph : '?', bg: T ? T.bg : '#EAF1F6', fg: T ? T.fg : '#526B7A' };
  };
  const ttOf = b => s.ttypes.find(t => t.id === b.type) || { days:[], name:'(removed)', passPct:70, lmsW:50, ext:[] };
  const schedOf = b => batchDates(b, ttOf(b), holSetFor(s.holidays, b));
  const lmsCandidates = tt => { const out = []; tt.days.forEach((d, di) => d.items.forEach((it, ii) => {
    if (it.kind === 'module') { const m = s.lcms.find(x => x.id === it.ref); if (m && m.type === 'Assessment') out.push({ key: di + ':' + ii, di, it, label:'LMS assessment' }); }
    else if (courseHasQuiz(it.ref)) out.push({ key: di + ':' + ii, di, it, label:'Course quiz' }); })); return out; };

  /* Weighted certification: final = LMS share × weighted LMS average + external share × weighted external average.
     A group with no counted assessments gives its share to the other group. */
  const certCalc = (b, u, items, C) => {
    const pg = b.prog[u] || {}, keys = new Set(items.map(i => i.key));
    const L = Object.entries(C.lms || {}).filter(([k, w]) => w > 0 && keys.has(k)).map(([k, w]) => { const x = pg[k] || {}; return { w, score: (x.pct || 0) > 0 && x.score != null ? x.score : null }; });
    const E = (C.ext || []).filter(e => e.w > 0).map(e => { const v = ((b.ext || {})[u] || {})[e.id]; return { w: e.w, score: v == null ? null : v / e.max * 100 }; });
    const grp = a => { const h = a.filter(p => p.score != null), tw = h.reduce((t, p) => t + p.w, 0); return { n: a.length, have: h.length, avg: tw ? h.reduce((t, p) => t + p.w * p.score, 0) / tw : null }; };
    const gl = grp(L), ge = grp(E), wl = gl.n ? lmsWOf(C) : 0, we = ge.n ? 100 - lmsWOf(C) : 0;
    const parts = []; if (gl.avg != null && wl) parts.push([wl, gl.avg]); if (ge.avg != null && we) parts.push([we, ge.avg]);
    const tw = parts.reduce((t, p) => t + p[0], 0), final = tw ? one(parts.reduce((t, p) => t + p[0] * p[1], 0) / tw) : null;
    return { lAvg: gl.avg == null ? null : one(gl.avg), eAvg: ge.avg == null ? null : one(ge.avg), final, complete: gl.have === gl.n && ge.have === ge.n && gl.n + ge.n > 0, missing: (gl.n - gl.have) + (ge.n - ge.have), none: !gl.n && !ge.n, appeared: gl.have + ge.have > 0 };
  };

  // ---- metrics and KPIs ----
  // Batch metrics are cached per batch object (a batch changes identity whenever it is edited).
  const MC = SkillforgeApp._bm || (SkillforgeApp._bm = { deps: null, map: new WeakMap() });
  const mdeps = [s.statuses, s.ttypes, s.holidays, s.lcms, TODAY_KEY];
  if (!MC.deps || mdeps.some((x, i) => x !== MC.deps[i])) { MC.deps = mdeps; MC.map = new WeakMap(); }
  const metrics = b => { let m = MC.map.get(b); if (!m) { m = metrics0(b); MC.map.set(b, m); } return m; };
  const metrics0 = b => {
    const tt = ttOf(b), dates = schedOf(b), cur = curStatus(b);
    const items = []; tt.days.forEach((d, di) => d.items.forEach((it, ii) => { const bi = planDayOf(tt.days.length, dates.length, di); items.push({ ...it, di, ii, key: di + ':' + ii, date: dates[bi], due: !!dates[bi] && dates[bi] <= TODAY_KEY }); }));
    const daysDue = dates.filter(d => d <= TODAY_KEY).length, C = b.cert, per = {};
    b.trainees.forEach(u => {
      const S = cur(u), T = S.type, act = d => typeOn(b, u, d) === 'active';
      const marks = dates.filter(d => d <= TODAY_KEY && act(d)).map(d => (b.att[d] || {})[u]).filter(Boolean);
      const counted = marks.filter(a => a !== 'E'), present = counted.filter(a => a === 'P' || a === 'L').length;
      const attPct = counted.length ? Math.round(present / counted.length * 100) : null;
      let run = 0, maxRun = 0; dates.filter(act).forEach(d => { const a = (b.att[d] || {})[u]; if (a === 'A') { run++; maxRun = Math.max(maxRun, run); } else if (a) run = 0; });
      const pg = b.prog[u] || {}, done = i => ((pg[i.key] || {}).pct || 0) >= 100;
      const myDue = items.filter(i => i.due && act(i.date)), ess = myDue.filter(i => i.essential), oth = myDue.filter(i => !i.essential);
      const essPct = ess.length ? Math.round(ess.filter(done).length / ess.length * 100) : null;
      const othPct = oth.length ? Math.round(oth.filter(done).length / oth.length * 100) : null;
      const avg = mean(myDue.map(i => (pg[i.key] || {}).score).filter(v => v != null));
      const overdue = ess.filter(i => !done(i) && i.date < TODAY_KEY).length;
      const flags = [];
      if (T === 'active') {
        if (attPct != null && marks.length >= 2 && attPct < 75) flags.push({ id:'att', sev:'High', text:'Attendance ' + attPct + '% (below 75%)' });
        else if (attPct != null && marks.length >= 2 && attPct < 85) flags.push({ id:'att', sev:'Medium', text:'Attendance ' + attPct + '% (below 85%)' });
        if (maxRun >= 2) flags.push({ id:'abs', sev:'High', text: maxRun + ' consecutive absences' });
        if (overdue >= 2) flags.push({ id:'ess', sev:'High', text: overdue + ' essential items overdue' });
        else if (overdue === 1) flags.push({ id:'ess', sev:'Medium', text:'1 essential item overdue' });
        if (avg != null && avg < 60) flags.push({ id:'score', sev:'High', text:'Average score ' + avg + '% (below 60%)' });
        else if (avg != null && avg < 70) flags.push({ id:'score', sev:'Medium', text:'Average score ' + avg + '% (below 70%)' });
      }
      flags.forEach(f => { f.auto = true; f.ack = b.ack[u + '|' + f.id] || null; });
      const manual = T === 'active' ? (b.manual[u] || []).map(m => ({ ...m, auto:false, text: m.note, ack: m.closed ? { note: m.closeNote || 'Closed', by: m.closedBy } : null })) : [];
      const all = flags.concat(manual);
      const computed = T !== 'active' ? 'Exited' : !daysDue ? 'Not started' : flags.some(f => f.sev === 'High') ? 'Red' : flags.length || manual.some(m => !m.ack) ? 'Amber' : 'Green';
      const ov = T === 'active' ? b.rag[u] || null : null;
      const c = certCalc(b, u, items, C);
      const evaluable = !['noshow', 'moved', 'attrition', 'absorbed'].includes(T);
      const cert = !evaluable ? 'Not evaluated' : c.none || nz(C.pass) == null ? 'No rule' : c.complete ? (c.final >= C.pass ? 'Certified' : 'Not certified') : 'In progress';
      per[u] = { S, T, entry: currentEntry(b, u), attPct, maxRun, essPct, othPct, avg, overdue, flags: all, open: all.filter(f => !f.ack).length, computed, override: ov, rag: ov ? ov.v : computed, c, cert };
    });
    const by = t => b.trainees.filter(u => per[u].T === t), joined = b.trainees.filter(u => per[u].T !== 'noshow');
    const A = k => joined.map(u => per[u][k]).filter(v => v != null), actv = by('active');
    const attr = by('attrition'), abs = by('absorbed'), grad = by('graduated');
    const vol = attr.filter(u => (per[u].entry || {}).attType === 'Voluntary').length;
    const statusCounts = s.statuses.map(st => ({ st, n: b.trainees.filter(u => per[u].S.id === st.id).length })).filter(x => x.n);
    const grp = {}; Object.keys(STATUS_GROUPS).forEach(g => { grp[g] = b.trainees.filter(u => groupOf(per[u].S) === g).length; });
    const grpSub = g => statusCounts.filter(x => groupOf(x.st) === g).map(x => x.st.name + ' ' + x.n).join(' · ') || 'None';
    // Updates still owed by the trainer before the training can be marked complete.
    const pendingUpd = b.trainees.filter(u => ['active', 'ojt'].includes(per[u].T)).map(u => u + ' is still ' + per[u].S.name)
      .concat(dates.filter(d => d <= TODAY_KEY && !b.att[d]).map(d => 'Attendance not logged for Day ' + (dates.indexOf(d) + 1) + ' (' + longD(d) + ')'));
    return { tt, dates, items, daysDue, per, joined, active: actv, avgAtt: mean(A('attPct')), avgEss: mean(A('essPct')), avgOth: mean(A('othPct')),
      red: actv.filter(u => per[u].rag === 'Red').length, amber: actv.filter(u => per[u].rag === 'Amber').length, green: actv.filter(u => per[u].rag === 'Green').length,
      openFlags: actv.reduce((t, u) => t + per[u].open, 0), statusCounts, grp, grpSub, pendingUpd,
      k: { mapped: b.trainees.length, noshow: by('noshow').length, joined: joined.length, inTraining: actv.length, ojt: by('ojt').length, absorbed: abs.length,
        early: abs.filter(u => /early/i.test(per[u].S.name)).length, direct: abs.filter(u => !/early/i.test(per[u].S.name)).length,
        appeared: joined.filter(u => per[u].c.appeared).length, certified: joined.filter(u => per[u].cert === 'Certified').length, graduated: grad.length,
        attrition: attr.length, vol, invol: attr.length - vol, moved: by('moved').length, hold: by('hold').length, failed: by('failed').length,
        retraining: b.trainees.filter(u => /re-?training/i.test(per[u].S.name)).length,
        throughput: joined.length ? Math.round((grad.length + abs.length) / joined.length * 100) : null, attrPct: joined.length ? Math.round(attr.length / joined.length * 100) : null } };
  };
  const groupTiles = (m, mapped) => Object.keys(STATUS_GROUPS).map(g => ({ l: STATUS_GROUPS[g].label, v: m.grp[g], sub: m.grpSub ? m.grpSub(g) : STATUS_GROUPS[g].desc, c: STATUS_GROUPS[g].c, big:true }));
  const kpiTiles = k => [
    { l:'Total joined', v: k.joined, sub: k.mapped + ' mapped · ' + k.noshow + ' did not join', c:'#16324F' },
    { l:'In training', v: k.inTraining, sub: k.ojt + ' on the job · ' + k.retraining + ' re-training', c:'#2F4A7A' },
    { l:'Early / direct absorbed', v: k.absorbed, sub: 'Early ' + k.early + ' · Direct ' + k.direct, c:'#115E59' },
    { l:'Appeared for evaluation', v: k.appeared, sub: k.certified + ' certified', c:'#7A4A06' },
    { l:'Graduated', v: k.graduated, sub:'Handed over to operations', c:'#166534' },
    { l:'Throughput', v: pctLbl(k.throughput), sub:'(graduated + absorbed) ÷ joined', c:'#007A4D' },
    { l:'Attrition', v: k.attrition, sub: (k.attrPct == null ? '—' : k.attrPct + '% of joined') + ' · Vol ' + k.vol + ' · Invol ' + k.invol, c:'#A63232' },
    { l:'Other outcomes', v: k.moved + k.hold + k.failed, sub:'Moved ' + k.moved + ' · HR ' + k.hold + ' · Decertified ' + k.failed, c:'#526B7A' },
  ];
  const sumK = list => { const z = { mapped:0, noshow:0, joined:0, inTraining:0, ojt:0, absorbed:0, early:0, direct:0, appeared:0, certified:0, graduated:0, attrition:0, vol:0, invol:0, moved:0, hold:0, failed:0, retraining:0 };
    list.forEach(k => Object.keys(z).forEach(x => { z[x] += k[x]; }));
    z.throughput = z.joined ? Math.round((z.graduated + z.absorbed) / z.joined * 100) : null; z.attrPct = z.joined ? Math.round(z.attrition / z.joined * 100) : null; return z; };

  // ---- batch list (all roles see all batches) ----
  const bq = (s.bQuery || '').trim().toLowerCase();
  const STC = { Ongoing:['#DCFCE7', '#166534'], 'Awaiting closure':['#FEF3C7', '#92400E'], Upcoming:['#DBEAFE', '#1E40AF'], Completed:['#EAF1F6', '#334E68'] };
  const ORD = { Ongoing:0, 'Awaiting closure':1, Upcoming:2, Completed:3 };
  const scope = s.bScope || (isAdmin ? 'all' : 'mine');
  const inScope = b => scope !== 'mine' || b.trainer === me;
  const shownB = s.batches.filter(b => inScope(b) && (s.bFilter === 'All' || batchStatus(b) === s.bFilter) && (s.bType === 'All' || b.type === s.bType) && (!bq || (b.name + ' ' + b.code + ' ' + b.trainer + ' ' + b.division + ' ' + ttOf(b).name).toLowerCase().includes(bq)))
    .sort((a, b) => ORD[batchStatus(a)] - ORD[batchStatus(b)] || b.start.localeCompare(a.start));
  const MS = shownB.map(b => ({ b, m: metrics(b) }));
  const BPG = Pager(this, s, 'batches', MS, 24);
  const listRows = BPG.rows.map(({ b, m }) => { const st = batchStatus(b), mine = isAdmin || (b.trainer === me && st !== 'Completed');
    return { ...b, typeName: m.tt.name, st, stBg: STC[st][0], stFg: STC[st][1], dates: fmtD(b.start) + ' – ' + fmtD(b.end) + ', ' + b.end.slice(0, 4),
      dayLabel: st === 'Upcoming' ? 'Starts ' + fmtD(b.start) : st === 'Completed' ? m.dates.length + ' days · closed' : st === 'Awaiting closure' ? m.pendingUpd.length + (m.pendingUpd.length === 1 ? ' update' : ' updates') + ' pending' : 'Day ' + m.daysDue + ' of ' + m.dates.length,
      viewOnly: !mine, mini: Tiles.apply(s, 'batchcard', [['In training', m.grp.training], ['Attrited', m.grp.attrited], ['Handed over', m.grp.handover], ['Other', m.grp.other], ['Throughput', pctLbl(m.k.throughput)], ['Joined', m.k.joined], ['Attendance', pctLbl(m.avgAtt)], ['Open EWS', m.openFlags]].map(([l, v]) => ({ l, v, key: l })), x => x.key, (x, l2) => ({ ...x, l: l2 })).slice(0, 5),
      bar: m.statusCounts.map(x => ({ w: (x.n / b.trainees.length * 100).toFixed(2) + '%', c: STATUS_TYPES[x.st.type].bar, t: x.st.name + ' · ' + x.n })),
      access: isAdmin ? 'Edit' : b.trainer !== me ? 'View only' : st === 'Completed' ? 'Locked · closed' : 'You run this', accBg: mine ? '#DCFCE7' : '#EAF1F6', accFg: mine ? '#166534' : '#526B7A',
      tMode: b.mode || 'In person', tModeIcon: { 'In person':'🏫', Virtual:'💻', Hybrid:'🏫+💻' }[b.mode || 'In person'],       tMapped: m.k.mapped, tTrain: m.grp.training, tAttrd: m.grp.attrited, tHand: m.grp.handover, tOther: m.grp.other, tActive: m.k.inTraining + ' / ' + m.k.joined, tAtt: pctLbl(m.avgAtt), tEss: pctLbl(m.avgEss), tGrad: m.k.graduated, tAbs: m.k.absorbed, tAttr: m.k.attrition, tThr: pctLbl(m.k.throughput), tEws: m.openFlags, tEwsFg: m.openFlags ? '#A63232' : '#16324F',
      open: () => this.go('batch', { batchId: b.id, bTab:'summary', attDate:null, attDraft:null, sm:null }) }; });
  const exportBatches = () => {
    const rows = [['Batch ID', 'Batch name', 'Training type', 'Trainer', 'Business division', 'Start', 'End', 'Status', 'Mapped', 'Did not join', 'Joined', 'In training', 'On the job', 'Early absorbed', 'Direct absorbed', 'Appeared for evaluation', 'Certified', 'Graduated', 'Throughput %', 'Attrition', 'Voluntary', 'Involuntary', 'Attrition %', 'Moved', 'Referred / on hold', 'Decertified', 'Avg attendance %', 'Pass mark %']];
    MS.forEach(({ b, m }) => { const k = m.k; rows.push([b.code, b.name, m.tt.name, b.trainer, b.division, b.start, b.end, batchStatus(b), k.mapped, k.noshow, k.joined, k.inTraining, k.ojt, k.early, k.direct, k.appeared, k.certified, k.graduated, k.throughput, k.attrition, k.vol, k.invol, k.attrPct, k.moved, k.hold, k.failed, m.avgAtt, b.cert.pass]); });
    csvDownload('skillforge-batches-' + TODAY_KEY + '.csv', rows); this.toastMsg(MS.length + (MS.length === 1 ? ' batch' : ' batches') + ' exported');
  };

  // ---- holidays ----
  const recalc = (batches, hols) => batches.map(b => { const d = batchDates(b, ttOf(b), holSetFor(hols, b)); return { ...b, start: d[0] || b.start, end: d[d.length - 1] || b.end }; });
  const holBlock = (date, batches) => batches.filter(b => date >= b.start && lastLogged(b) && date <= lastLogged(b)).map(b => b.code);
  const hn = s.hNew || { date:'', name:'' };
  const endChanges = (before, after) => after.filter((b, i) => b.end !== before[i].end).map(b => b.code + ' now ends ' + fmtD(b.end));
  const withAudit = (bs, before, text) => bs.map((b, i) => b.end === before[i].end ? b : { ...b, audit: (b.audit || []).concat([{ id:'a' + Date.now() + i, at: nowStamp(), ts: Date.now(), by: me, role: myRole, kind:'Setup', area:'Schedule', text, before: fmtD(before[i].end), after: fmtD(b.end) }]) });
  const holVals = {
    hRows: s.holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map(h => { const aff = s.batches.filter(b => h.date >= b.start && h.date <= b.end).map(b => b.code);
      return { ...h, label: longD(h.date) + ', ' + h.date.slice(0, 4), affects: aff.length ? 'Within ' + aff.join(', ') : 'No batch on this date',
        del: () => { const bl = holBlock(h.date, s.batches); if (bl.length) return this.toastMsg(bl.join(', ') + ' already logged attendance after this date, so it can’t be removed.');
          const hols = s.holidays.filter(x => x.id !== h.id), nb = withAudit(recalc(s.batches, hols), s.batches, 'End date moved: holiday “' + h.name + '” removed'), ch = endChanges(s.batches, nb);
          this.setState({ holidays: hols, batches: nb }); this.toastMsg(h.name + ' removed' + (ch.length ? ' · ' + ch.join(', ') : '')); } }; }),
    hEmpty: s.holidays.length === 0, hNew: hn, setHDate: e => this.setState({ hNew: { ...hn, date: e.target.value } }), setHName: e => this.setState({ hNew: { ...hn, name: e.target.value } }),
    addHoliday: () => {
      if (!hn.date) return this.toastMsg('Pick a date'); if (!hn.name.trim()) return this.toastMsg('Give the holiday a name');
      if (isWeekend(hn.date)) return this.toastMsg(longD(hn.date) + ' is already a weekend');
      if (s.holidays.some(h => h.date === hn.date)) return this.toastMsg('There is already a holiday on ' + longD(hn.date));
      const bl = holBlock(hn.date, s.batches); if (bl.length) return this.toastMsg(bl.join(', ') + ' already logged attendance on or after this date. Add holidays after the last logged day.');
      const hols = s.holidays.concat([{ id:'h' + Date.now(), date: hn.date, name: hn.name.trim() }]), nb = withAudit(recalc(s.batches, hols), s.batches, 'End date moved: holiday “' + hn.name.trim() + '” added'), ch = endChanges(s.batches, nb);
      this.setState({ holidays: hols, batches: nb, hNew: { date:'', name:'' } }); this.toastMsg(hn.name.trim() + ' added' + (ch.length ? ' · ' + ch.join(', ') : ''));
    },
  };

  // ---- trainee statuses (admin-managed list) ----
  const usedCount = id => s.batches.reduce((n, b) => n + Object.values(b.st || {}).reduce((t, l) => t + l.filter(e => e.status === id).length, 0), 0);
  const sn = s.stNew || { name:'', type:'active' };
  const statusVals = {
    stRows: s.statuses.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => { const T = STATUS_TYPES[x.type], n = usedCount(x.id) + (x.id === DEFAULT_STATUS ? s.batches.reduce((t, b) => t + b.trainees.filter(u => !(b.st || {})[u] || !(b.st || {})[u].length).length, 0) : 0);
      return { ...x, groupLabel: STATUS_GROUPS[groupOf(x)].label, typeLabel: T.label, typeDesc: T.desc, bg: T.bg, fg: T.fg, used: n ? 'In use · ' + n : 'Not used', tagLabel: x.builtin ? 'Default' : 'Custom', canDel: !x.builtin,
        del: () => { if (usedCount(x.id)) return this.toastMsg('“' + x.name + '” is in use, so it can’t be deleted'); this.setState({ statuses: s.statuses.filter(y => y.id !== x.id) }); this.toastMsg('“' + x.name + '” deleted'); } }; }),
    stNew: sn, setStName: e => this.setState({ stNew: { ...sn, name: e.target.value } }),
    stTypeOpts: Object.keys(STATUS_TYPES).map(k => ({ v:k, l: STATUS_TYPES[k].label })), setStType: e => this.setState({ stNew: { ...sn, type: e.target.value } }),
    stTypeDesc: STATUS_TYPES[sn.type].desc, stGroupOpts: Object.keys(STATUS_GROUPS).map(g => ({ v:g, l: STATUS_GROUPS[g].label })), stGroupVal: sn.group || TYPE_GROUP[sn.type], setStGroup: e => this.setState({ stNew: { ...sn, group: e.target.value } }),
    addStatus: () => { const nm = sn.name.trim(); if (!nm) return this.toastMsg('Name the status');
      if (s.statuses.some(x => x.name.toLowerCase() === nm.toLowerCase())) return this.toastMsg('“' + nm + '” already exists');
      this.setState({ statuses: s.statuses.concat([{ id:'st' + Date.now(), name: nm, type: sn.type, group: sn.group || TYPE_GROUP[sn.type], builtin:false }]), stNew: { name:'', type: sn.type } }); this.toastMsg('Status “' + nm + '” added'); },
  };

  // ---- batch create / edit modal ----
  const bd = s.bDraft;
  const trainers = s.users.filter(u => u.role === 'Trainer' && u.status !== 'Deactivated');
  const setBd = patch => this.setState(st => ({ bDraft: { ...st.bDraft, err:'', ...patch } }));
  let modalVals = { bModal:false };
  if (bd) {
    const tt = s.ttypes.find(t => t.id === bd.type), prev = s.batches.find(b => b.id === bd.id), logged = prev ? lastLogged(prev) : null;
    const hol = holSetFor(s.holidays, bd), dates = tt && bd.start ? batchDates(bd, tt, hol) : [], end = dates[dates.length - 1] || '';
    const code = prev ? prev.code : tt && dates[0] ? nextBatchCode(tt, dates[0], s.batches) : '—';
    const inRange = d => dates.length && d >= dates[0] && d <= end;
    const holList = s.holidays.filter(h => inRange(h.date)).map(h => ({ ...h, scope:'Organisation', canRemove:false }))
      .concat((bd.holidays || []).map(h => ({ ...h, scope:'This batch', canRemove: !logged || h.date > logged }))).sort((a, b) => a.date.localeCompare(b.date))
      .map(h => ({ ...h, label: longD(h.date), remove: () => setBd({ holidays: bd.holidays.filter(x => x.id !== h.id) }) }));
    const tq = (s.btQuery || '').trim().toLowerCase();
    const pool = s.users.filter(u => u.role === 'Learner' && u.status !== 'Deactivated');
    const overlaps = u => s.batches.filter(b => b.id !== bd.id && b.trainees.includes(u) && batchStatus(b) !== 'Completed' && end && !(b.end < dates[0] || b.start > end)).map(b => b.code);
    const shown = pool.filter(u => (s.btDept === 'All' || u.dept === s.btDept) && (!tq || (u.name + ' ' + u.empId + ' ' + u.dept + ' ' + u.email).toLowerCase().includes(tq)));
    const allOn = shown.length > 0 && shown.every(u => bd.trainees.includes(u.name));
    const TABS = [['details', 'Details'], ['plan', 'Day plan'], ['trainees', 'Trainees · ' + bd.trainees.length]];
    const ti = TABS.findIndex(t => t[0] === s.bdTab);
    const nLms = tt ? lmsCandidates(tt).filter(c => c.label === 'LMS assessment').length : 0;
    const planRows = [];
    const DP = dayPlan(tt, dates.length);
    if (tt) dates.forEach((d, di) => {
      if (di > 0) { let k = addDays(dates[di - 1], 1); while (k < d) { if (!offDay(k, bd.sat) && hol.has(k)) { const h = s.holidays.find(x => x.date === k) || (bd.holidays || []).find(x => x.date === k); planRows.push({ isHol:true, isDay:false, label: longD(k), name: h ? h.name : 'Holiday' }); } k = addDays(k, 1); } }
      const pd = DP[di] || [], title = pd.length ? pd.map(i => tt.days[i].title || 'Day ' + (i + 1)).join(' + ') : 'Extra day (not in the plan)';   // v41.21: fast track joins plan days; extended adds extra days
      planRows.push({ isHol:false, isDay:true, n: di + 1, title, date: longD(d), items: pd.flatMap(i => tt.days[i].items).map(it => { const x = itemInfo(it); return { ...x, essential: it.essential, other: !it.essential }; }) });
    });
    const hd = bd.hDate || '', hName = bd.hName || '';
    modalVals = {
      bModal: scrV === 'batches' && s.bView === 'list', bd, bdCode: code, bdTitle: bd.id ? 'Edit batch' : 'Create batch', bdErr: !!bd.err, bdLocked: !!logged,
      bdCodeNote: prev ? 'Batch IDs never change once created.' : tt ? 'Generated from ' + (tt.code || '') + (tt.level || '') + ' + year ' + (dates[0] || '').slice(0, 4) + ' + next number' : 'Choose a training type to generate the ID',
      bdLockNote: logged ? 'Attendance is logged up to ' + longD(logged) + ', so the training type and start date are locked.' : '',
      bdTabs: TABS.map(([id, label], i) => { const on = s.bdTab === id; return { n: i + 1, label, bg: on ? INK : 'transparent', fg: on ? '#F8FBFD' : '#334E68', pick: () => this.setState({ bdTab:id }) }; }),
      bdDetails: s.bdTab === 'details', bdPlan: s.bdTab === 'plan', bdTrainees: s.bdTab === 'trainees',
      bdHasPrev: ti > 0, bdHasNext: ti < TABS.length - 1, bdPrev: () => this.setState({ bdTab: TABS[Math.max(0, ti - 1)][0] }), bdNext: () => this.setState({ bdTab: TABS[Math.min(TABS.length - 1, ti + 1)][0] }),
      bdTypeOpts: [{ v:'', l:'Choose a training type…' }].concat(s.ttypes.map(t => ({ v:t.id, l: t.name + ' · ' + (t.code || '') + (t.level || '') }))),
      bdTrainerOpts: [{ v:'', l:'Choose a trainer…' }].concat(trainers.map(u => ({ v:u.name, l:u.name + ' · ' + u.empId }))),
      bdDivOpts: [{ v:'', l:'Choose a division…' }].concat(DIVISIONS.map(d => ({ v:d, l:d }))),
      // How participants join: In person (room), Virtual (meeting link) or Hybrid (both).
      // MIS fields: picked from Settings › Master data so the MIS stays consistent.
      bdSegOpts: [{ v:'', l:'Choose a segment…' }].concat(s.masters.segments.map(v => ({ v, l:v }))), setBdSeg: e => setBd({ segment: e.target.value }),
      bdTnOpts: [{ v:'', l:'Choose a training…' }].concat(s.masters.trainingNames.map(v => ({ v, l:v }))), setBdTn: e => setBd({ trainingName: e.target.value }),
      bdTypeOpts2: s.masters.traineeTypes.map(v => chip(bd.traineeType || 'New Hire', v, v, () => setBd({ traineeType: v }))),
      bdModes: ['In person', 'Virtual', 'Hybrid'].map(v => chip(bd.mode || 'In person', v, v, () => setBd({ mode: v }))),
      bdNeedsRoom: (bd.mode || 'In person') !== 'Virtual', bdNeedsLink: (bd.mode || 'In person') !== 'In person',
      setBdLink: e => setBd({ meetLink: e.target.value }),
      bdLinkHost: bd.meetLink && meetOk(bd.meetLink) ? meetHost(bd.meetLink) : '', bdLinkBad: !!bd.meetLink && !meetOk(bd.meetLink),
      bdPasteLink: () => { if (!navigator.clipboard || !navigator.clipboard.readText) return this.toastMsg('Paste the link into the box (Ctrl+V)'); navigator.clipboard.readText().then(t => setBd({ meetLink: (t || '').trim() })).catch(() => this.toastMsg('Paste the link into the box (Ctrl+V)')); },
      bdPlaceOpts: [{ v:'', l:'Choose a training room…' }].concat(s.places.map(p => ({ v:p.id, l: p.name + ' · ' + p.site + ' · ' + p.capacity + ' seats' + (p.status !== 'Available' ? ' · ' + p.status.toLowerCase() : '') }))),
      setBdPlace: e => setBd({ placeId: e.target.value }),
      bdPlaceWarn: (() => { const p = s.places.find(x => x.id === bd.placeId); if (!p) return ''; const w = [];
        if (bd.trainees.length > p.capacity) w.push(p.name + ' seats ' + p.capacity + ' but the batch has ' + bd.trainees.length + ' trainees');
        if (p.status !== 'Available') w.push(p.name + ' is ' + p.status.toLowerCase());
        const clash = s.batches.filter(b => b.id !== bd.id && b.placeId === p.id && batchStatus(b) !== 'Completed' && end && !(b.end < dates[0] || b.start > end)).map(b => b.code);
        if (clash.length) w.push('Also booked by ' + clash.join(', ') + ' on overlapping dates');
        return w.join(' · '); })(),
      // the trainer may already be running another batch on these days (shown, not blocked: co-training and split days exist)
      bdTrainerWarn: (() => { if (!bd.trainer || !end) return ''; const o2 = s.batches.filter(b => b.id !== bd.id && b.trainer === bd.trainer && batchStatus(b) !== 'Completed' && !(b.end < dates[0] || b.start > end)).map(b => b.code);
        return o2.length ? bd.trainer + ' is also training ' + o2.join(', ') + ' on overlapping days' : ''; })(),
      bdHasType: !!tt, bdTypeFacts: tt ? [['Duration', tt.days.length + (tt.days.length === 1 ? ' training day' : ' training days')], ['Passing %', pctL(tt.passPct)], ['Weights', nz(tt.lmsW) == null ? 'Not set (50 / 50)' : 'LMS ' + tt.lmsW + '% · External ' + (100 - tt.lmsW) + '%'], ['Assessments', nLms + ' LMS + ' + tt.ext.length + ' external']].map(([l, v]) => ({ l, v })) : [],
      setBdName: e => setBd({ name: e.target.value, nameAuto:false }),
      setBdType: e => { if (logged) return; const t = s.ttypes.find(x => x.id === e.target.value); setBd({ type: e.target.value, ...(bd.nameAuto ? { name: t ? t.name + ' · ' + new Date(bd.start + 'T12:00:00').toLocaleDateString('en-US', { month:'short' }) + ' cohort' : '' } : {}) }); },
      bdTrainerLock: !isAdmin,
      setBdTrainer: e => { if (isAdmin) setBd({ trainer: e.target.value }); }, setBdDiv: e => setBd({ division: e.target.value }),
      setBdStart: e => { if (logged) return; const v = e.target.value, t = s.ttypes.find(x => x.id === bd.type); setBd({ start: v, ...(bd.nameAuto && t && v ? { name: t.name + ' · ' + new Date(v + 'T12:00:00').toLocaleDateString('en-US', { month:'short' }) + ' cohort' } : {}) }); },
      bdEndLabel: end ? longD(end) + ', ' + end.slice(0, 4) : '—',
      // v41.21: per-batch schedule (fast track, extended, custom end date, Saturdays)
      bdSchedChips: [['standard', 'Standard'], ['fast', 'Fast track'], ['extended', 'Extended'], ['end', 'Custom end date']].map(([v, l]) => UI.chip(bd.sched || 'standard', v, l, () => setBd({ sched: v, daysN: v === 'fast' ? Math.max(1, (tt ? tt.days.length : 2) - 1) : v === 'extended' ? (tt ? tt.days.length : 0) + 1 : bd.daysN, endWant: v === 'end' ? (bd.endWant || end) : bd.endWant }))),
      bdSchedDays: bd.sched === 'fast' || bd.sched === 'extended', bdSchedEnd: bd.sched === 'end',
      bdSchedDaysLabel: bd.sched === 'fast' ? 'Training days (fewer than ' + (tt ? tt.days.length : '…') + ')' : 'Training days (more than ' + (tt ? tt.days.length : '…') + ')',
      setBdDaysN: e => setBd({ daysN: e.target.value === '' ? '' : parseInt(e.target.value, 10) }), setBdEndWant: e => setBd({ endWant: e.target.value }),
      bdSatOn: !!bd.sat, toggleBdSat: () => setBd({ sat: !bd.sat }),
      bdSchedNote: !tt ? '' : bd.sched === 'fast' ? 'The ' + tt.days.length + '-day plan is spread over ' + dates.length + ' days: some days cover two plan days.' : bd.sched === 'extended' ? 'The plan runs as usual; the ' + Math.max(0, dates.length - tt.days.length) + ' extra days at the end are for revision, assessments or catch-up.' : bd.sched === 'end' ? dates.length + ' training days up to the end date' + (dates.length < tt.days.length ? ': the plan is compressed.' : dates.length > tt.days.length ? ': extra days at the end.' : '.') : 'The training type’s ' + tt.days.length + '-day plan.',
      bdEndNote: !tt ? 'Choose a training type to calculate the end date.' : !bd.start ? 'Pick a start date.' : dates.length + ' training days, skipping ' + (bd.sat ? 'Sundays' : 'weekends') + (holList.length ? ' and ' + holList.length + (holList.length === 1 ? ' holiday' : ' holidays') : '') + '.',
      bdStartShift: tt && bd.start && dates[0] && dates[0] !== bd.start ? longD(bd.start) + ' is a ' + (isWeekend(bd.start) ? 'weekend' : 'holiday') + ', so Day 1 is ' + longD(dates[0]) + '.' : '',
      bdHolRows: holList, bdHolEmpty: !holList.length, bdHDate: hd, bdHName: hName,
      setBdHDate: e => setBd({ hDate: e.target.value }), setBdHName: e => setBd({ hName: e.target.value }),
      addBdHol: () => {
        if (!tt || !dates.length) return setBd({ err:'Choose a training type and start date first.' });
        if (!hd || !hName.trim()) return setBd({ err:'Pick a date and name for the holiday.' });
        if (isWeekend(hd)) return setBd({ err: longD(hd) + ' is already a weekend.' });
        if (hol.has(hd)) return setBd({ err:'There is already a holiday on ' + longD(hd) + '.' });
        if (!inRange(hd)) return setBd({ err:'Pick a date between ' + longD(dates[0]) + ' and ' + longD(end) + '.' });
        if (logged && hd <= logged) return setBd({ err:'Attendance is logged up to ' + longD(logged) + '. Add holidays after that.' });
        setBd({ holidays: (bd.holidays || []).concat([{ id:'bh' + Date.now(), date: hd, name: hName.trim() }]), hDate:'', hName:'' });
      },
      bdAssign: tg(bd.assign, () => setBd({ assign: !bd.assign })),
      bdPlanRows: planRows, bdNoPlan: !tt, bdPlanName: tt ? tt.name : '',
      editTtype: () => { this.setState({ bView:'types' }); this.toastMsg('Your batch draft is kept. Go back to the Batches tab to continue.'); },
      btQuery: s.btQuery || '', setBtQuery: e => this.setState({ btQuery: e.target.value }),
      btDeptChips: ['All'].concat(Array.from(new Set(pool.map(u => u.dept)))).map(d => chip(s.btDept, d, d === 'All' ? 'All departments' : d, () => this.setState({ btDept:d }))),
      btRows: shown.map((u, i) => { const on = bd.trainees.includes(u.name), ov = overlaps(u.name);
        return { name:u.name, sub: u.empId + ' · ' + u.dept, initials: ini(u.name), av: AV[i % 5], sel: !!on, tick: on ? '✓' : '', bg: on ? INK : W, bd: on ? INK : '#BFCFDB', rowBg: on ? '#EDF5FA' : W, overlap: ov.length ? 'Also in ' + ov.join(', ') : '', hasOverlap: !!ov.length,
          toggle: () => setBd({ trainees: on ? bd.trainees.filter(x => x !== u.name) : bd.trainees.concat([u.name]) }) }; }),
      btEmpty: shown.length === 0, btAll: { on: allOn, sel: !!allOn, tick: allOn ? '✓' : '', bg: allOn ? INK : W, bd: allOn ? INK : '#BFCFDB' },
      btToggleAll: () => setBd({ trainees: allOn ? bd.trainees.filter(n => !shown.some(u => u.name === n)) : Array.from(new Set(bd.trainees.concat(shown.map(u => u.name)))) }),
      btCount: bd.trainees.length + (bd.trainees.length === 1 ? ' trainee selected' : ' trainees selected'),
      closeBatch: () => this.setState({ bDraft:null }),
      saveBatch: () => {
        const err = (m, tab) => this.setState(st => ({ bDraft: { ...st.bDraft, err:m }, bdTab: tab }));
        if (!tt) return err('Choose a training type.', 'details');
        if (!bd.name.trim()) return err('Give the batch a name.', 'details');
        if (!bd.trainer) return err('Assign a trainer.', 'details');
        if (!isAdmin && (!prev || prev.trainer !== me || batchStatus(prev) === 'Completed' || bd.trainer !== prev.trainer)) return err('You can only change batches you run, before their end date.', 'details');
        if (!bd.division) return err('Choose a business division.', 'details');
        // Who is in a batch, and who trains it, is decided by admins (the database enforces the same rule).
        if (!isAdmin && prev && (prev.trainer !== bd.trainer || prev.trainees.length !== bd.trainees.length || prev.trainees.some(x => !bd.trainees.includes(x)))) return err('Only an admin can change who is in this batch or who trains it.', 'trainees');
        if (!isAdmin && !prev) return err('Only an admin can create batches.', 'details');
        if (bd.trainees.includes(bd.trainer)) return err('The trainer can’t also be a trainee in the same batch.', 'trainees');
        if (!bd.segment) return err('Choose the training segment.', 'details');
        if (!bd.trainingName) return err('Choose the training name.', 'details');
        if (!bd.start || !dates.length) return err(bd.sched === 'end' && bd.start && bd.endWant && bd.endWant < bd.start ? 'The end date is before the start date.' : 'Pick a start date.', 'details');
        // v41.21: per-batch schedule checks
        { const T = tt.days.length, N = +bd.daysN || 0;
          if (bd.sched === 'fast' && !(N >= 1 && N < T)) return err('Fast track: choose 1 to ' + Math.max(1, T - 1) + ' training days (the training type has ' + T + ').', 'details');
          if (bd.sched === 'extended' && !(N > T && N <= 120)) return err('Extended: choose ' + (T + 1) + ' to 120 training days (the training type has ' + T + ').', 'details');
          if (bd.sched === 'end' && !bd.endWant) return err('Pick the custom end date.', 'details');
          if (dates.length > 120) return err('A batch can have at most 120 training days.', 'details');
          if (logged && prev) { const was = schedOf(prev).filter(d => d <= logged), now = dates.filter(d => d <= logged);
            if (was.join() !== now.join()) return err('Attendance is logged up to ' + longD(logged) + ', so the days up to then can’t move. Change only later days (e.g. extend or set a later end date).', 'details'); } }
        const md = bd.mode || 'In person', link = (bd.meetLink || '').trim();
        if (md !== 'Virtual' && !bd.placeId) return err(md === 'Hybrid' ? 'Choose the training room for people joining in person.' : 'Choose the training room.', 'details');
        if (md !== 'In person' && !link) return err('Paste the meeting link for people joining virtually.', 'details');
        if (link && !meetOk(link)) return err('The meeting link must be a full https:// address (Teams, Zoom, Google Meet…).', 'details');
        // v33: a room can't hold two batches on the same days, and a room that isn't available can't be booked (both used to be
        // warnings only). Checked when the room or dates are new or changed, so existing data never blocks other edits.
        if (md !== 'Virtual' && bd.placeId) { const P = s.places.find(x => x.id === bd.placeId), chg = !prev || prev.placeId !== bd.placeId || prev.start !== dates[0] || prev.end !== end;
          if (chg && P && P.status !== 'Available') return err(P.name + ' is ' + P.status.toLowerCase() + '. Choose another room.', 'details');
          const clash = s.batches.filter(b => b.id !== bd.id && b.placeId === bd.placeId && (b.mode || 'In person') !== 'Virtual' && batchStatus(b) !== 'Completed' && !(b.end < dates[0] || b.start > end)).map(b => b.code);
          if (chg && clash.length) return err((P ? P.name : 'This room') + ' is already booked by ' + clash.join(', ') + ' on overlapping days. Choose another room or other dates.', 'details'); }
        if (s.batches.some(b => b.id !== bd.id && b.name.trim().toLowerCase() === bd.name.trim().toLowerCase())) return err('Another batch already uses this name.', 'details');
        if (prev) { const gone = prev.trainees.filter(u => !bd.trainees.includes(u) && ((prev.st || {})[u] || []).length); if (gone.length) return err(gone.join(', ') + ' already have a status in this batch. Change their status instead of removing them.', 'trainees'); }
        const id = bd.id || 'b' + Date.now();
        const rec = { att:{}, attLog:{}, prog:{}, manual:{}, ack:{}, rag:{}, ext:{}, extBy:{}, st:{}, audit:[], createdBy: me, ...(prev || {}), id, code, name: bd.name.trim(), type: bd.type, trainer: bd.trainer, division: bd.division, segment: bd.segment, trainingName: bd.trainingName, traineeType: bd.traineeType || 'New Hire',
          start: dates[0], end, mode: bd.mode || 'In person', meetLink: (bd.mode || 'In person') === 'In person' ? '' : (bd.meetLink || '').trim(), placeId: (bd.mode || 'In person') === 'Virtual' ? '' : (bd.placeId || ''), holidays: (bd.holidays || []).slice(), trainees: bd.trainees.slice(), sched: bd.sched || 'standard', daysN: ['fast', 'extended'].includes(bd.sched) ? +bd.daysN : null, endWant: bd.sched === 'end' ? bd.endWant : '', sat: !!bd.sat, cert: prev && prev.type === bd.type && prev.cert ? prev.cert : certFrom(tt, s.lcms) };
        rec.trainees.forEach(u => { if (!rec.prog[u]) rec.prog[u] = {}; });
        // history: what changed in setup
        const notes = [], A = (text, before, after) => notes.push({ id:'a' + Date.now() + notes.length, at: nowStamp(), ts: Date.now(), by: me, role: myRole, kind:'Setup', area:'Batch', text, before: before || '', after: after || '' });
        if (!prev) A('Batch created with ' + rec.trainees.length + ' trainees, trainer ' + rec.trainer);
        else {
          if (prev.trainer !== rec.trainer) A('Trainer changed', prev.trainer, rec.trainer);
          if (prev.name !== rec.name) A('Batch renamed', prev.name, rec.name);
          if (prev.division !== rec.division) A('Business division changed', prev.division, rec.division);
          if ((prev.mode || 'In person') !== rec.mode) A('Delivery mode changed', prev.mode || 'In person', rec.mode);
          if ((prev.meetLink || '') !== rec.meetLink) A('Meeting link ' + (prev.meetLink ? (rec.meetLink ? 'changed' : 'removed') : 'added'), prev.meetLink || '', rec.meetLink);
          if ((prev.placeId || '') !== rec.placeId) A('Training room changed', (s.places.find(p => p.id === prev.placeId) || {}).name || 'None', (s.places.find(p => p.id === rec.placeId) || {}).name || 'None');
          if (prev.start !== rec.start) A('Start date changed', fmtD(prev.start), fmtD(rec.start));
          if (prev.end !== rec.end) A('End date recalculated', fmtD(prev.end), fmtD(rec.end));
          if ((prev.sched || 'standard') !== rec.sched || (prev.daysN || null) !== rec.daysN || (prev.endWant || '') !== rec.endWant) A('Schedule changed', schedLabel(prev, tt), schedLabel(rec, tt) + ' · ' + dates.length + ' days');
          if (!!prev.sat !== rec.sat) A(rec.sat ? 'Saturdays are now training days' : 'Saturdays are no longer training days');
          const add = rec.trainees.filter(u => !prev.trainees.includes(u)), rem = prev.trainees.filter(u => !rec.trainees.includes(u));
          if (add.length) A('Trainees added: ' + add.join(', ')); if (rem.length) A('Trainees removed: ' + rem.join(', '));
          const ph = (prev.holidays || []).map(h => h.date), nh = rec.holidays.map(h => h.date);
          rec.holidays.filter(h => !ph.includes(h.date)).forEach(h => A('Batch holiday added: ' + h.name + ' (' + longD(h.date) + ')'));
          (prev.holidays || []).filter(h => !nh.includes(h.date)).forEach(h => A('Batch holiday removed: ' + h.name + ' (' + longD(h.date) + ')'));
        }
        rec.audit = (rec.audit || []).concat(notes);
        let enroll = s.enroll, n = 0;
        if (bd.assign) { enroll = { ...s.enroll };
          rec.trainees.forEach(u => { const mine = { ...(enroll[u] || {}) }; tt.days.forEach((d, di) => d.items.forEach(it => { if (it.kind === 'course' && s.adminCourses.some(c => c.id === it.ref) && !mine[it.ref]) { mine[it.ref] = dates[planDayOf(tt.days.length, dates.length, di)]; n++; } })); enroll[u] = mine; }); }
        this.setState({ batches: prev ? s.batches.map(b => b.id === id ? rec : b) : [rec].concat(s.batches), bDraft:null, enroll, bFilter:'All', bQuery:'' });
        this.toastMsg(rec.code + ' ' + (prev ? 'updated' : 'created') + ' · ends ' + longD(end) + ' · ' + rec.trainees.length + (rec.trainees.length === 1 ? ' trainee' : ' trainees') + (n ? ' · ' + n + ' course assignments' : ''));
      },
    };
  }
  const openNew = () => this.setState({ bdTab:'details', btQuery:'', btDept:'All', bDraft: { id:null, segment:'', trainingName:'', traineeType:'New Hire', mode:'In person', meetLink:'', placeId:'', name:'', nameAuto:true, type:'', trainer:'', division:'', start: TODAY_KEY, holidays:[], trainees:[], assign:true, err:'', hDate:'', hName:'' } });

  // ---- batch detail ----
  const b = s.batches.find(x => x.id === s.batchId);
  let detail = { btDetail:false, smModal:false };
  if (scrV === 'batch' && b) {
    const m = metrics(b), st = batchStatus(b), per = m.per, total = m.dates.length, k = m.k;
    // Trainers can change everything in a batch they run until it ends; after the end date only admins can.
    const ownLocked = !isAdmin && b.trainer === me && st === 'Completed';
    const canEdit = isAdmin || (b.trainer === me && !ownLocked);
    const guard = () => { if (!canEdit) { this.toastMsg(ownLocked ? 'This batch ended on ' + fmtD(b.end) + '. Only an admin can change it now.' : 'View only. ' + b.trainer + ' runs this batch.'); return false; } return true; };
    const hol = holSetFor(s.holidays, b);
    const dueDates = m.dates.filter(d => d <= TODAY_KEY);
    const attDate = s.attDate && m.dates.includes(s.attDate) ? s.attDate : (dueDates[dueDates.length - 1] || m.dates[0]);
    const attFuture = attDate > TODAY_KEY;
    const activeOn = (u, d) => typeOn(b, u, d) === 'active';
    const expected = b.trainees.filter(u => activeOn(u, attDate));
    const saved = b.att[attDate] || {}, draft = s.attDraft && s.attDraft.date === attDate ? s.attDraft.marks : null, cur = draft || saved;
    const unmarked = expected.filter(u => !cur[u]).length;
    const setMark = (u, c) => { if (!guard()) return; if (attFuture) return this.toastMsg('You can only log attendance for today or earlier'); this.setState({ attDraft: { date: attDate, marks: { ...cur, [u]: c } } }); };
    let curLabel, curSub;
    if (st === 'Upcoming') { curLabel = 'Starts ' + longD(m.dates[0]); curSub = 'In ' + daysUntil(m.dates[0]) + (daysUntil(m.dates[0]) === 1 ? ' day' : ' days'); }
    else if (st === 'Completed') { curLabel = 'Completed'; curSub = 'Closed by ' + (b.closedBy || '—') + (b.closedAt ? ' · ' + fmtStamp(b.closedAt) : ''); }
    else if (st === 'Awaiting closure') { curLabel = 'Awaiting closure'; curSub = 'Ended ' + longD(b.end) + ' · ' + (m.pendingUpd.length ? m.pendingUpd.length + (m.pendingUpd.length === 1 ? ' update pending' : ' updates pending') : 'ready to mark complete'); }
    else { const idx = m.dates.indexOf(TODAY_KEY);
      if (idx >= 0) { curLabel = 'Day ' + (idx + 1) + ' of ' + total; curSub = 'Today · ' + (m.tt.days[idx].title || ''); }
      else { const nx = m.dates[m.daysDue]; curLabel = 'Day ' + m.daysDue + ' of ' + total + ' done'; curSub = nx ? 'Next: Day ' + (m.daysDue + 1) + ' on ' + longD(nx) + (isWeekend(TODAY_KEY) ? ' · today is a weekend' : hol.has(TODAY_KEY) ? ' · today is a holiday' : '') : ''; } }
    const schedPct = total ? Math.round(m.daysDue / total * 100) : 0;
    const ragChip = v => ({ v, bg: RAG_C[v][0], fg: RAG_C[v][1], dot: RAG_C[v][2] });
    const C = b.cert, setCert = (patch, a) => change(b.id, x => ({ ...x, cert: { ...x.cert, ...patch } }), a);
    const cands = lmsCandidates(m.tt), counted = cands.filter(c => (C.lms[c.key] || 0) > 0);
    const extOn = C.ext.filter(e => e.w > 0);
    const nL = counted.length, nE = extOn.length;
    const effL = nL ? (nE ? lmsWOf(C) : 100) : 0, effE = nE ? (nL ? 100 - lmsWOf(C) : 100) : 0;
    const sumWL = counted.reduce((t, c) => t + C.lms[c.key], 0), sumWE = extOn.reduce((t, e) => t + e.w, 0);
    const share = (w, sw, g) => sw ? one(g * w / sw) : 0;
    const sayExit = u => { const p = per[u]; return p.T === 'active' ? '' : p.S.name + (p.entry ? ' · ' + fmtD(p.entry.date) : ''); };

    // status change modal
    let smVals = { smModal:false };
    if (s.sm) {
      const d0 = s.sm, setSm = patch => this.setState(st2 => ({ sm: { ...st2.sm, err:'', ...patch } }));
      const S = stOf(d0.status), T = S.type, isEdit = !!d0.id;
      const list = ((b.st || {})[d0.u]) || [], prevE = isEdit ? null : list[list.length - 1];
      const others = s.batches.filter(x => x.id !== b.id && batchStatus(x) !== 'Completed');
      const reasons = s.masters.attritionReasons;
      smVals = {
        smModal: true, sm: d0, smTitle: isEdit ? 'Correct status entry' : 'Update trainee status', smIsEdit: isEdit, smErr: !!d0.err,
        smTraineeOpts: b.trainees.map(u => ({ v:u, l: u + ' · ' + per[u].S.name })), setSmU: e => setSm({ u: e.target.value }), smLockU: isEdit,
        smStatusOpts: s.statuses.slice().sort((a, z) => a.name.localeCompare(z.name)).map(x => ({ v:x.id, l: x.name + ' · ' + STATUS_TYPES[x.type].label })), setSmStatus: e => setSm({ status: e.target.value }),
        smTypeDesc: STATUS_TYPES[T].desc, smTypeBg: STATUS_TYPES[T].bg, smTypeFg: STATUS_TYPES[T].fg,
        smIsAttr: T === 'attrition', smNeedsTarget: T === 'absorbed', smIsMoved: T === 'moved', smIsNoshow: T === 'noshow',
        smAttTypes: ['Voluntary', 'Involuntary'].map(v => chip(d0.attType, v, v, () => setSm({ attType:v, reason:'' }))),
        smAttHint: d0.attType === 'Involuntary' ? 'Why was the trainee asked to leave?' : d0.attType === 'Voluntary' ? 'Why did the trainee choose to resign?' : 'Choose voluntary or involuntary first.',
        smReasonOpts: [{ v:'', l:'Choose a reason…' }].concat(reasons.map(r => ({ v:r, l:r }))), setSmReason: e => setSm({ reason: e.target.value }), smRespOpts: [{ v:'', l:'Choose who it’s attributed to…' }].concat(s.masters.attritionResp.map(r => ({ v:r, l:r }))), setSmResp: e => setSm({ resp: e.target.value }), smHasAttType: !!d0.attType,
        setSmDetails: e => setSm({ details: e.target.value }), setSmTarget: e => setSm({ target: e.target.value }), setSmNote: e => setSm({ note: e.target.value }), setSmDate: e => setSm({ date: e.target.value }),
        smMoveOpts: [{ v:'', l:'Choose the batch…' }].concat(others.map(x => ({ v:x.code, l: x.code + ' · ' + x.name }))),
        smMin: b.start, smMax: TODAY_KEY,
        smPrevNote: prevE ? 'Current status: ' + stOf(prevE.status).name + ' since ' + longD(prevE.date) : 'Current status: In-Training (default)',
        closeSm: () => this.setState({ sm:null }),
        saveSm: () => {
          if (!d0.u) return setSm({ err:'Choose a trainee.' });
          const date = T === 'noshow' ? b.start : d0.date;
          if (!date) return setSm({ err:'Pick the effective date.' });
          if (date < b.start || date > TODAY_KEY) return setSm({ err:'Pick a date between ' + longD(b.start) + ' and today.' });
          const curId = isEdit ? null : (prevE ? prevE.status : DEFAULT_STATUS);
          if (!isEdit && curId === d0.status) return setSm({ err: d0.u + ' is already ' + S.name + '.' });
          if (!isEdit && prevE && date < prevE.date) return setSm({ err:'The date can’t be before the current status (' + longD(prevE.date) + '). An admin can correct earlier entries.' });
          if (T === 'noshow') { const marked = Object.values(b.att).some(a => a[d0.u] === 'P' || a[d0.u] === 'L'); if (marked) return setSm({ err: d0.u + ' has attendance marked present, so they did join.' }); }
          if (T === 'attrition') { if (!d0.attType) return setSm({ err:'Choose voluntary or involuntary.' }); if (!d0.reason) return setSm({ err:'Choose a reason.' }); if (!d0.resp) return setSm({ err:'Choose the attrition responsibility.' }); if (!(d0.details || '').trim()) return setSm({ err: d0.attType === 'Voluntary' ? 'Describe why the trainee chose to resign.' : 'Describe why the trainee was asked to leave.' }); }
          if (T === 'absorbed' && !(d0.target || '').trim()) return setSm({ err:'Say where the trainee was absorbed (team or role).' });
          if (T === 'moved' && !d0.target) return setSm({ err:'Choose the batch the trainee moved to.' });
          const entry = { status: d0.status, date, attType: T === 'attrition' ? d0.attType : '', reason: T === 'attrition' ? d0.reason : '', resp: T === 'attrition' ? d0.resp : '', details: T === 'attrition' ? d0.details.trim() : '', target: ['absorbed', 'moved'].includes(T) ? d0.target.trim() : '', note: (d0.note || '').trim() };
          const desc = e => stOf(e.status).name + ' from ' + fmtD(e.date) + (e.attType ? ' (' + e.attType + ' · ' + e.reason + ')' : '') + (e.target ? ' → ' + e.target : '');
          if (isEdit) {
            const old = list.find(e => e.id === d0.id);
            change(b.id, x => ({ ...x, st: { ...x.st, [d0.u]: x.st[d0.u].map(e => e.id === d0.id ? { ...e, ...entry, editedBy: me, editedAt: nowStamp() } : e).sort((p, q) => p.date.localeCompare(q.date)) } }),
              { area:'Status', owner: old.by, text: d0.u + ': status entry corrected', before: desc(old), after: desc(entry) });
            this.toastMsg('Status entry corrected for ' + d0.u);
          } else {
            change(b.id, x => ({ ...x, st: { ...(x.st || {}), [d0.u]: (((x.st || {})[d0.u]) || []).concat([{ id:'se' + Date.now(), ...entry, by: me, at: nowStamp() }]) } }),
              { area:'Status', text: d0.u + ': status changed', before: curId ? stOf(curId).name : '', after: desc(entry) });
            this.toastMsg(d0.u + ' is now ' + S.name + ' from ' + fmtD(date));
          }
          this.setState({ sm:null });
        },
        removeSm: () => { if (!isAdmin) return; const old = list.find(e => e.id === d0.id);
          change(b.id, x => ({ ...x, st: { ...x.st, [d0.u]: x.st[d0.u].filter(e => e.id !== d0.id) } }), { area:'Status', owner: old.by, text: d0.u + ': status entry removed', before: desc(old), after:'' });
          this.setState({ sm:null }); this.toastMsg('Status entry removed'); },
      };
      function desc(e) { return stOf(e.status).name + ' from ' + fmtD(e.date) + (e.attType ? ' (' + e.attType + ' · ' + e.reason + ')' : '') + (e.target ? ' → ' + e.target : ''); }
    }
    const openSm = u => () => { if (!guard()) return; if (st === 'Upcoming' && !isAdmin) return this.toastMsg('Statuses can be updated once the batch starts on ' + longD(b.start)); this.setState({ sm: { id:null, u: u || b.trainees[0], status:'st_attr', date: TODAY_KEY > b.end ? b.end : TODAY_KEY, attType:'', reason:'', details:'', target:'', note:'', err:'' } }); };

    // reports
    const reports = {
      summary: () => { const rows = [['Batch', b.code + ' · ' + b.name], ['Training type', m.tt.name], ['Trainer', b.trainer], ['Business division', b.division], ['Dates', b.start + ' to ' + b.end], ['Schedule', schedLabel(b, m.tt) + ' · ' + m.dates.length + ' training days' + (b.sat ? ' · Saturdays included' : '')], ['Status', st], ['Pass mark', pctL(C.pass)], ['Weights', 'LMS ' + effL + '% · External ' + effE + '%'], []];
        kpiTiles(k).forEach(t => rows.push([t.l, t.v, t.sub])); rows.push([]);
        rows.push(['Trainee', 'Employee ID', 'Department', 'Current status', 'Since', 'Attrition type', 'Reason', 'Details / destination', 'Attendance %', 'Essential completion %', 'Other completion %', 'LMS avg %', 'External avg %', 'Final weighted %', 'Certification', 'RAG']);
        b.trainees.forEach(u => { const p = per[u], usr = s.users.find(x => x.name === u) || {}, e = p.entry || {};
          rows.push([u, usr.empId || '', usr.dept || '', p.S.name, e.date || b.start, e.attType || '', e.reason || '', e.details || e.target || e.note || '', p.attPct, p.essPct, p.othPct, p.c.lAvg, p.c.eAvg, p.c.final, p.cert, p.rag]); });
        csvDownload(b.code + '-summary-' + TODAY_KEY + '.csv', rows); },
      attendance: () => { const rows = [['Trainee'].concat(m.dates.map((d, i) => 'Day ' + (i + 1) + ' (' + d + ')')).concat(['Present', 'Late', 'Absent', 'Excused', 'Attendance %'])];
        b.trainees.forEach(u => { const marks = m.dates.map(d => !activeOn(u, d) ? stOf(statusIdOn(b, u, d)).name : ((b.att[d] || {})[u] ? ATT_CODES[(b.att[d] || {})[u]][0] : '')), c = x => marks.filter(y => y === ATT_CODES[x][0]).length; rows.push([u].concat(marks).concat([c('P'), c('L'), c('A'), c('E'), per[u].attPct])); });
        csvDownload(b.code + '-attendance-' + TODAY_KEY + '.csv', rows); },
      completion: () => { const rows = [['Trainee'].concat(m.items.map(i => 'D' + (i.di + 1) + ' ' + itemInfo(i).title + (i.essential ? ' [Essential]' : ' [Other]'))).concat(['Essential %', 'Other %', 'Avg score %'])];
        b.trainees.forEach(u => { const pg = b.prog[u] || {}; rows.push([u].concat(m.items.map(i => { const x = pg[i.key] || {}; return !activeOn(u, i.date || '9999') && i.due ? 'Not in training' : !i.due ? 'Not yet due' : (x.pct || 0) + '%' + (x.score != null ? ' (score ' + x.score + '%)' : ''); })).concat([per[u].essPct, per[u].othPct, per[u].avg])); });
        csvDownload(b.code + '-completion-' + TODAY_KEY + '.csv', rows); },
      certification: () => { const rows = [['Rule', 'Final = ' + effL + '% × weighted LMS average + ' + effE + '% × weighted external average; certified at ' + pctL(C.pass) + ' or higher'], [],
          ['Trainee'].concat(counted.map(c => itemInfo(c.it).title + ' (LMS, weight ' + C.lms[c.key] + ')')).concat(extOn.map(e => e.name + ' (out of ' + e.max + ', weight ' + e.w + ')')).concat(['LMS avg %', 'External avg %', 'Final weighted %', 'Result'])];
        b.trainees.forEach(u => { const pg = b.prog[u] || {}; rows.push([u].concat(counted.map(c => { const x = pg[c.key] || {}; return (x.pct || 0) > 0 && x.score != null ? x.score : ''; })).concat(extOn.map(e => ((b.ext || {})[u] || {})[e.id] ?? '')).concat([per[u].c.lAvg, per[u].c.eAvg, per[u].c.final, per[u].cert])); });
        csvDownload(b.code + '-certification-' + TODAY_KEY + '.csv', rows); },
      ews: () => { const rows = [['Trainee', 'Signal', 'Severity', 'Source', 'Status', 'Action / note', 'By']];
        b.trainees.forEach(u => per[u].flags.forEach(f => rows.push([u, f.text, f.sev, f.auto ? 'Automatic' : 'Raised by ' + f.by, f.ack ? 'Actioned' : 'Open', f.ack ? f.ack.note : '', f.ack ? f.ack.by || '' : ''])));
        csvDownload(b.code + '-ews-' + TODAY_KEY + '.csv', rows); },
      history: () => { const rows = [['When', 'Who', 'Role', 'Type', 'Area', 'What happened', 'Before', 'After']];
        (b.audit || []).slice().reverse().forEach(a => rows.push([a.at.replace('T', ' '), a.by, a.role, a.kind, a.area, a.text, a.before, a.after]));
        csvDownload(b.code + '-history-' + TODAY_KEY + '.csv', rows); },
    };
    const dl = x => () => { reports[x](); this.toastMsg(b.code + ' ' + x + ' report downloaded'); };
    const ewsList = []; b.trainees.forEach((u, i) => per[u].flags.forEach(f => ewsList.push({ u, f, i })));
    const ewsShown = ewsList.filter(x => s.ewsFilter === 'All' || (s.ewsFilter === 'Open' ? !x.f.ack : !!x.f.ack)).sort((a, z) => (a.f.ack ? 1 : 0) - (z.f.ack ? 1 : 0) || (a.f.sev === 'High' ? 0 : 1) - (z.f.sev === 'High' ? 0 : 1));
    const rf = s.ewsNew && m.active.includes(s.ewsNew.u) ? s.ewsNew : { u: m.active[0] || '', sev:'Medium', note:'' };
    const TABS = [['summary', 'Summary'], ['trainees', 'Trainees'], ['plan', 'Day plan'], ['attendance', 'Attendance'], ['completion', 'Completion'], ['cert', 'Certification'], ['ews', 'EWS · ' + m.openFlags], ['rag', 'RAG'], ['history', 'History · ' + (b.audit || []).length], ['reports', 'Reports']];
    // history
    const H = (b.audit || []).slice().reverse();
    const HK = { Change:['#E5ECF7', '#2F4A7A'], Correction:['#FDECEC', '#A63232'], Setup:['#EAF1F6', '#334E68'] };
    const areas = ['All'].concat(Array.from(new Set(H.map(a => a.area))));
    const hShown = H.filter(a => (s.histKind === 'All' || (s.histKind === 'Trainer' ? a.role === 'Trainer' : a.kind === s.histKind)) && (s.histArea === 'All' || a.area === s.histArea));
    const hRow = a => ({ ...a, when: fmtStamp(a.at), kBg: HK[a.kind][0], kFg: HK[a.kind][1], hasDiff: !!(a.before || a.after), initials: ini(a.by), kindLabel: a.kind === 'Correction' ? 'Admin correction' : a.kind });
    detail = {
      btDetail: true, btNotFound:false, bt: b, btTypeName: m.tt.name, btSt: st, btStBg: STC[st][0], btStFg: STC[st][1], btDates: fmtD(b.start) + ' – ' + fmtD(b.end) + ', ' + b.end.slice(0, 4),
      btDayLabel: st === 'Completed' ? total + ' training days' : st === 'Awaiting closure' ? 'Ended ' + fmtD(b.end) : curLabel, btPlace: (p => p ? p.name + ' · ' + p.site : '')(s.places.find(p => p.id === b.placeId)), btMode: b.mode || 'In person',
      btModeBg: { 'In person':'#E3F1EE', Virtual:'#E5ECF7', Hybrid:'#F1E7F4' }[b.mode || 'In person'], btModeFg: { 'In person':'#245E52', Virtual:'#2F4A7A', Hybrid:'#6B3F7A' }[b.mode || 'In person'],
      btHasRoom: (b.mode || 'In person') !== 'Virtual' && !!b.placeId, btHasLink: !!b.meetLink, btLink: b.meetLink || '', btLinkHost: b.meetLink ? meetHost(b.meetLink) : '',
      btCopyLink: () => { const t = b.meetLink; const done = () => this.toastMsg('Meeting link copied'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => this.toastMsg(t)); else this.toastMsg(t); },
      btEditLink: () => { if (!guard()) return; this.setState({ linkEdit: { v: b.meetLink || '', err:'' } }); }, btLinkEditing: !!s.linkEdit, btLinkDraft: (s.linkEdit || {}).v || '', btLinkErr: (s.linkEdit || {}).err || '',
      setBtLinkDraft: e => this.setState({ linkEdit: { v: e.target.value, err:'' } }), cancelLinkEdit: () => this.setState({ linkEdit:null }),
      saveLinkEdit: () => { const v = ((s.linkEdit || {}).v || '').trim(); if (v && !meetOk(v)) return this.setState({ linkEdit: { v, err:'Use a full https:// meeting link.' } });
        if (!v && (b.mode || 'In person') !== 'In person') return this.setState({ linkEdit: { v, err:'Virtual and hybrid batches need a meeting link.' } });
        change(b.id, x => ({ ...x, meetLink: v }), { area:'Batch', text:'Meeting link ' + (b.meetLink ? 'changed' : 'added'), before: b.meetLink || '', after: v }); this.setState({ linkEdit:null }); this.toastMsg('Meeting link saved'); }, btIsAdmin: isAdmin, btCanEditBatch: canEdit, btCanEdit: canEdit, btViewOnly: !canEdit, btViewNote: ownLocked ? 'This batch ended on ' + fmtD(b.end) + ', ' + b.end.slice(0, 4) + '. It is locked for trainers; only an admin can change it now.' : 'View only. ' + b.trainer + ' runs this batch, so changes are made by them or an admin.',
      bsCur: curLabel, bsCurSub: curSub, bsSchedPct: schedPct + '%', bsSchedLabel: m.daysDue + ' of ' + total + ' training days', bsEssPct: pctLbl(m.avgEss),
      bsHead: [['Mapped', k.mapped, '#F8FBFD'], ['In training', m.grp.training, '#A9C3F2'], ['Attrited', m.grp.attrited, m.grp.attrited ? '#F5A38F' : '#F8FBFD'], ['Handed over', m.grp.handover, m.grp.handover ? '#8FD9C6' : '#F8FBFD']].map(([l, v, c]) => ({ l, v, c })),
      bsAttrRate: k.attrPct == null ? '' : k.attrPct + '% attrition', openStatus: openSm(null),
      btTabs: TABS.map(([id, label]) => { const on = s.bTab === id; return { label, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => this.setState({ bTab:id }) }; }),
      tSummary: s.bTab === 'summary', tTrainees: s.bTab === 'trainees', tPlan: s.bTab === 'plan', tAttendance: s.bTab === 'attendance', tCompletion: s.bTab === 'completion', tCert: s.bTab === 'cert', tEws: s.bTab === 'ews', tRag: s.bTab === 'rag', tHistory: s.bTab === 'history', tReports: s.bTab === 'reports',
      // Mark training complete: only when nothing is pending from the trainer.
      bcCanClose: canEdit && st === 'Awaiting closure', bcPending: m.pendingUpd.map(t => ({ t })), bcHasPending: m.pendingUpd.length > 0, bcReady: !m.pendingUpd.length,
      bcBlocked: !!m.pendingUpd.length, bcIsClosed: st === 'Completed', bcCanReopen: isAdmin && st === 'Completed',
      bcPendingTitle: m.pendingUpd.length + (m.pendingUpd.length === 1 ? ' update is' : ' updates are') + ' pending before this training can be marked complete',
      closeBatch: () => { if (!guard()) return; if (m.pendingUpd.length) return this.toastMsg('Finish the pending updates first: ' + m.pendingUpd[0]);
        change(b.id, x => ({ ...x, closed:true, closedBy: me, closedAt: nowStamp() }), { kind:'Setup', area:'Batch', text:'Training marked complete', before:'Awaiting closure', after:'Completed' });
        this.toastMsg(b.code + ' marked complete' + (isAdmin ? '' : '. It is now locked for trainers.')); },
      reopenBatch: () => { if (!isAdmin) return; change(b.id, x => ({ ...x, closed:false }), { kind:'Setup', area:'Batch', text:'Batch reopened', before:'Completed', after: TODAY_KEY > b.end ? 'Awaiting closure' : 'Ongoing' }); this.toastMsg(b.code + ' reopened'); },
      // Day-wise attendance register (read-only, every day of the batch).
      regHead: m.dates.map((d, i) => ({ d: 'D' + (i + 1), date: fmtD(d) })), regCols: '200px repeat(' + m.dates.length + ', minmax(64px, 1fr)) 70px',
      regRows: b.trainees.map((u, i) => { const p = per[u]; return { name: u, initials: ini(u), av: AV[i % 5], att: pctLbl(p.attPct),
        cells: m.dates.map(d => { if (d > TODAY_KEY) return { v:'·', bg:'#F4F8FC', fg:'#9CB3C4', t:'Upcoming' }; if (!activeOn(u, d)) { const nm = stOf(statusIdOn(b, u, d)).name; return { v:'—', bg:'#F4F8FC', fg:'#6E8796', t: nm }; }
          const a = (b.att[d] || {})[u]; return a ? { v: a, bg: ATT_CODES[a][1], fg: ATT_CODES[a][2], t: ATT_CODES[a][0] } : { v:'?', bg:'#FDECEC', fg:'#A63232', t:'Not logged' }; }) }; }),
      dlRegister: () => { reports.attendance(); this.toastMsg('Day-wise attendance downloaded'); },
      // EWS: + Add opens a pop-up
      ewsAddOpen: !!s.ewsPop, ewsOpenAdd: () => { if (!guard()) return; if (!m.active.length) return this.toastMsg('No one is in training in this batch'); this.setState({ ewsPop: { u: m.active[0], sev:'Medium', note:'', err:'' } }); },
      ewsPop: s.ewsPop || {}, ewsPopErr: !!(s.ewsPop && s.ewsPop.err), ewsClosePop: () => this.setState({ ewsPop:null }),
      ewsPopSevs: ['Medium', 'High'].map(v => chip((s.ewsPop || {}).sev, v, v, () => this.setState(st2 => ({ ewsPop: { ...st2.ewsPop, sev:v } })))),
      setEwsPopU: e => { const v = e.target.value; this.setState(st2 => ({ ewsPop: { ...st2.ewsPop, u:v, err:'' } })); }, setEwsPopNote: e => { const v = e.target.value; this.setState(st2 => ({ ewsPop: { ...st2.ewsPop, note:v, err:'' } })); },
      ewsLog: () => { const P = s.ewsPop; if (!guard()) return; const note = (P.note || '').trim();
        if (!P.u) return this.setState({ ewsPop: { ...P, err:'Choose a trainee.' } }); if (!note) return this.setState({ ewsPop: { ...P, err:'Add your comments.' } });
        change(b.id, y => ({ ...y, manual: { ...y.manual, [P.u]: (y.manual[P.u] || []).concat([{ id:'m' + Date.now(), note, sev: P.sev, by: me, at: TODAY_KEY, closed:false }]) } }), { area:'EWS', text: P.u + ': ' + P.sev.toLowerCase() + ' EWS logged', after: note });
        this.setState({ ewsPop:null, ewsFilter:'Open' }); this.toastMsg('EWS logged for ' + P.u); },
      btEdit: () => { if (!guard()) return; this.go('batches', { bView:'list' }); this.setState({ bdTab:'details', btQuery:'', btDept:'All', bDraft: { ...b, trainees: b.trainees.slice(), holidays: (b.holidays || []).slice(), nameAuto:false, assign:false, err:'', hDate:'', hName:'' } }); },
      backToBatches: () => this.go('batches'),
      // summary
      sumGroups: groupTiles(m), sumTiles: kpiTiles(k), sumBar: m.statusCounts.map(x => ({ w: (x.n / b.trainees.length * 100).toFixed(2) + '%', c: STATUS_TYPES[x.st.type].bar, label: x.st.name + ' · ' + x.n })),
      sumLegend: m.statusCounts.map(x => ({ c: STATUS_TYPES[x.st.type].bar, label: x.st.name, n: x.n })),
      sumFunnel: [['Mapped', k.mapped], ['Joined', k.joined], ['Appeared for evaluation', k.appeared], ['Certified', k.certified], ['Graduated + absorbed', k.graduated + k.absorbed]].map(([l, v]) => ({ l, v, w: k.mapped ? Math.max(4, Math.round(v / k.mapped * 100)) + '%' : '0%' })),
      sumAttr: b.trainees.filter(u => per[u].T === 'attrition').map((u, i) => { const e = per[u].entry || {}; return { name:u, initials: ini(u), av: AV[i % 5], st: per[u].S.name, type: e.attType, tBg: e.attType === 'Voluntary' ? '#FEF3C7' : '#FDECEC', tFg: e.attType === 'Voluntary' ? '#92400E' : '#A63232', reason: e.reason, details: e.details, date: longD(e.date) }; }),
      sumHasAttr: k.attrition > 0, sumRecent: H.slice(0, 6).map(hRow), sumHasRecent: H.length > 0, goHistory: () => this.setState({ bTab:'history' }),
      dlSummary: dl('summary'),
      // trainees
      trRows: b.trainees.map((u, i) => { const p = per[u], usr = s.users.find(x => x.name === u) || {}, e = p.entry, open = s.trExp === u, list = ((b.st || {})[u]) || [];
        return { name:u, initials: ini(u), av: AV[i % 5], sub: (usr.empId || '') + ' · ' + (usr.dept || ''), chip: chipOf(p.S), since: e ? 'since ' + fmtD(e.date) : 'since start',
          detail: e ? (e.attType ? e.attType + ' · ' + e.reason + (e.details ? ' — ' + e.details : '') : e.target ? '→ ' + e.target + (e.note ? ' — ' + e.note : '') : e.note || '') : '',
          att: pctLbl(p.attPct), ess: pctLbl(p.essPct), fin: p.c.final == null ? '—' : p.c.final + '%', cert: p.cert, certBg: CERT_C[p.cert][0], certFg: CERT_C[p.cert][1],
          canEdit, change: openSm(u), open, toggle: () => this.setState({ trExp: open ? null : u }), histLabel: open ? 'Hide timeline' : 'Timeline · ' + (list.length + 1),
          timeline: [{ name:'In-Training', bg: STATUS_TYPES.active.bg, fg: STATUS_TYPES.active.fg, date: longD(b.start), by:'Batch start', info:'', canFix:false }].concat(list.map(x => { const S = stOf(x.status);
            return { name: S.name, bg: STATUS_TYPES[S.type].bg, fg: STATUS_TYPES[S.type].fg, date: longD(x.date), by: 'by ' + x.by + (x.editedBy ? ' · corrected by ' + x.editedBy : ''),
              info: [x.attType && x.attType + ' · ' + x.reason, x.details, x.target && '→ ' + x.target, x.note].filter(Boolean).join(' — '), canFix: isAdmin, fix: () => this.setState({ sm: { ...x, u, err:'' } }) }; })) }; }),
      // plan
      btPlan: dayPlan(m.tt, m.dates.length).map((pd, di) => { const date = m.dates[di], isToday = date === TODAY_KEY, past = date < TODAY_KEY, logged = b.att[date], d = { title: pd.length ? pd.map(i => m.tt.days[i].title || 'Day ' + (i + 1)).join(' + ') : 'Extra day (not in the plan)', items: pd.flatMap(i => m.tt.days[i].items) };
        return { n: di + 1, title: d.title, date: longD(date), state: isToday ? 'Today' : past ? 'Done' : 'Upcoming', stBg: isToday ? '#E7F0F7' : past ? '#E3F1EE' : '#EAF1F6', stFg: isToday ? '#7A4A06' : past ? '#245E52' : '#526B7A',
          attMissing: (past || isToday) && !logged, items: d.items.map(it => { const x = itemInfo(it); return { ...x, essential: it.essential, other: !it.essential }; }) }; }),
      // attendance
      attDays: m.dates.map((d, i) => { const on = d === attDate, fut = d > TODAY_KEY, logged = !!b.att[d]; return { label: 'D' + (i + 1) + ' · ' + fmtD(d), sub: fut ? 'Upcoming' : logged ? 'Logged' : 'Not logged', bg: on ? INK : W, fg: on ? '#F8FBFD' : fut ? '#6E8796' : INK, border: on ? INK : logged || fut ? '#C9D7E2' : '#D64545', pick: () => this.setState({ attDate:d, attDraft:null }) }; }),
      attTitle: new Date(attDate + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }) + ' · Day ' + (m.dates.indexOf(attDate) + 1),
      attFuture, attLock: attFuture || !canEdit, attCanEdit: !attFuture && canEdit, attDirty: !!draft, attLogInfo: b.attLog[attDate] ? 'Saved by ' + b.attLog[attDate].by + (b.attLog[attDate].time ? ' at ' + b.attLog[attDate].time : '') : 'Not saved yet',
      attRows: b.trainees.map((u, i) => { const c = cur[u], act = activeOn(u, attDate);
        return { name:u, initials: ini(u), av: AV[i % 5], cur: !act ? stOf(statusIdOn(b, u, attDate)).name : c ? ATT_CODES[c][0] : 'Not marked', act, gone: !act, op: act ? 1 : 0.55,
          opts: Object.keys(ATT_CODES).map(x => { const on = c === x; return { label: ATT_CODES[x][0], bg: on ? ATT_CODES[x][2] : W, fg: on ? '#FFFFFF' : INK, border: on ? ATT_CODES[x][2] : '#C9D7E2', pick: () => setMark(u, x) }; }) }; }),
      attCounts: Object.keys(ATT_CODES).map(x => ATT_CODES[x][0] + ' ' + expected.filter(u => cur[u] === x).length).join(' · ') + (unmarked ? ' · Not marked ' + unmarked : ''),
      attAllPresent: () => { if (!guard() || attFuture) return; const marks = { ...cur }; expected.forEach(u => { if (!marks[u]) marks[u] = 'P'; }); this.setState({ attDraft: { date: attDate, marks } }); },
      attDiscard: () => this.setState({ attDraft:null }),
      attSave: () => { if (!guard()) return; if (unmarked) return this.toastMsg('Mark all ' + expected.length + ' trainees in training before saving (' + unmarked + ' left)');
        const t = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }), marks = {}; expected.forEach(u => { marks[u] = cur[u]; });
        const prevLog = b.attLog[attDate], diffs = expected.filter(u => saved[u] && saved[u] !== marks[u]).map(u => u + ': ' + ATT_CODES[saved[u]][0] + ' → ' + ATT_CODES[marks[u]][0]);
        const sumTxt = mk => Object.keys(ATT_CODES).map(x => ATT_CODES[x][0][0] + ' ' + expected.filter(u => mk[u] === x).length).join(' · ');
        change(b.id, x => ({ ...x, att: { ...x.att, [attDate]: marks }, attLog: { ...x.attLog, [attDate]: { by: me, at: TODAY_KEY, time: t } } }),
          { area:'Attendance', owner: prevLog ? prevLog.by : null, text: (prevLog ? 'Attendance updated' : 'Attendance saved') + ' for Day ' + (m.dates.indexOf(attDate) + 1) + ' (' + longD(attDate) + ')' + (diffs.length ? ': ' + diffs.join(', ') : ''), before: prevLog ? sumTxt(saved) : '', after: sumTxt(marks) });
        this.setState({ attDraft:null }); this.toastMsg('Attendance saved for ' + fmtD(attDate)); },
      // completion
      cmpHead: m.items.map(i => { const x = itemInfo(i); return { day: 'D' + (i.di + 1), title: x.title, code: x.code, short: x.title.length > 18 ? x.title.slice(0, 17) + '…' : x.title, tag: i.essential ? 'Essential' : 'Other', tagBg: i.essential ? '#FDECEC' : '#EAF1F6', tagFg: i.essential ? '#A63232' : '#526B7A' }; }),
      cmpRows: b.trainees.map((u, ui) => { const pg = b.prog[u] || {}, p = per[u];
        return { name:u, initials: ini(u), av: AV[ui % 5], exit: sayExit(u), hasExit: p.T !== 'active', ess: pctLbl(p.essPct), oth: pctLbl(p.othPct), avg: pctLbl(p.avg),
          cells: m.items.map(i => { const x = pg[i.key] || {}, pct = x.pct || 0, done = pct >= 100, act = i.date && activeOn(u, i.date);
            if (i.due && !act) return { label:'—', sub:'', title: itemInfo(i).title + ' · not in training that day', bg:'#F4F8FC', fg:'#9CB3C4', toggle: () => this.toastMsg(u.split(' ')[0] + ' was ' + stOf(statusIdOn(b, u, i.date)).name + ' on ' + fmtD(i.date)) };
            return { label: !i.due ? '·' : done ? '✓' : pct + '%', sub: i.due && x.score != null ? 'score ' + x.score + '%' : '', title: itemInfo(i).title + (i.due ? ' · ' + pct + '% complete' + (x.score != null ? ' · score ' + x.score + '%' : '') : ' · not due yet'),
              bg: !i.due ? '#F4F8FC' : done ? '#DCFCE7' : pct ? '#FEF3C7' : '#FDECEC', fg: !i.due ? '#9CB3C4' : done ? '#166534' : pct ? '#92400E' : '#A63232',
              toggle: () => { if (!i.due) return this.toastMsg('This item is scheduled for ' + fmtD(i.date)); if (!guard()) return;
                change(b.id, y => ({ ...y, prog: { ...y.prog, [u]: { ...(y.prog[u] || {}), [i.key]: { ...x, pct: done ? 0 : 100, by: me } } } }), { area:'Completion', owner: x.by || null, text: u + ': ' + itemInfo(i).title + ' marked ' + (done ? 'incomplete' : 'complete'), before: pct + '%', after: done ? '0%' : '100%' });
                this.toastMsg(u.split(' ')[0] + ': ' + itemInfo(i).title + (done ? ' marked incomplete' : ' marked complete')); } }; }) }; }),
      cmpCols: '210px repeat(' + m.items.length + ', minmax(96px, 1fr)) 90px 80px 90px',
      // certification (weighted)
      cLock: !canEdit, cPass: C.pass, cLmsW: effL, cExtW: effE, cDefaultNote: 'Training type default: pass ' + pctL(m.tt.passPct) + ' · ' + (nz(m.tt.lmsW) == null ? 'weights not set (50 / 50)' : 'LMS ' + m.tt.lmsW + '% / External ' + (100 - m.tt.lmsW) + '%'),
      setCPass: e => { if (!guard()) return; const v = parseInt(e.target.value, 10); if (isNaN(v)) return; if (v < 1 || v > 100) return this.toastMsg('Passing % must be 1–100'); setCert({ pass: v }, { area:'Certification', key:'pass', text:'Passing % changed', before: C.pass + '%', after: v + '%' }); },
      setCLmsW: e => { if (!guard()) return; const v = parseInt(e.target.value, 10); if (isNaN(v)) return; if (v < 0 || v > 100) return this.toastMsg('LMS weight must be 0–100'); setCert({ lmsW: v }, { area:'Certification', key:'lmsW', text:'Weights changed', before: 'LMS ' + C.lmsW + '% / External ' + (100 - C.lmsW) + '%', after: 'LMS ' + v + '% / External ' + (100 - v) + '%' }); },
      cSplitNote: !nL && !nE ? '' : !nL ? 'No LMS assessments count, so external assessments carry 100%.' : !nE ? 'No external assessments count, so LMS assessments carry 100%.' : '',
      cHasSplitNote: (!nL || !nE) && (nL + nE > 0),
      cLms: cands.map(c => { const w = C.lms[c.key] || 0, on = w > 0;
        return { title: itemInfo(c.it).title, sub: 'Day ' + (c.di + 1) + ' · ' + c.label, w: on ? w : '', on, shareLabel: on ? share(w, sumWL, effL) + '% of final' : 'Not counted',
          ...tg(on, () => { if (!guard()) return; setCert({ lms: { ...C.lms, [c.key]: on ? 0 : 1 } }, { area:'Certification', text: itemInfo(c.it).title + (on ? ' removed from' : ' added to') + ' certification' }); }),
          setW: e => { if (!guard()) return; const v = parseFloat(e.target.value); if (isNaN(v)) return; if (v <= 0 || v > 10) return this.toastMsg('Weight must be more than 0 and at most 10'); setCert({ lms: { ...C.lms, [c.key]: v } }, { area:'Certification', key:'lw' + c.key, text: itemInfo(c.it).title + ' weight changed', before: String(w), after: String(v) }); } }; }),
      cLmsEmpty: !cands.length,
      cExt: C.ext.map(e => { const on = e.w > 0;
        return { ...e, on, shareLabel: on ? share(e.w, sumWE, effE) + '% of final' : 'Not counted',
          setName: ev => { if (!guard()) return; setCert({ ext: C.ext.map(x => x.id === e.id ? { ...x, name: ev.target.value } : x) }, { area:'Certification', key:'en' + e.id, text:'External assessment renamed', before: e.name, after: ev.target.value }); },
          setMax: ev => { if (!guard()) return; const v = parseInt(ev.target.value, 10); if (isNaN(v)) return; if (v < 1) return this.toastMsg('Maximum marks must be at least 1'); const top = Math.max(0, ...b.trainees.map(u => ((b.ext || {})[u] || {})[e.id] ?? 0)); if (v < top) return this.toastMsg('A trainee already scored ' + top + '. Maximum can’t be lower.');
            setCert({ ext: C.ext.map(x => x.id === e.id ? { ...x, max: v } : x) }, { area:'Certification', key:'em' + e.id, text: e.name + ' maximum marks changed', before: String(e.max), after: String(v) }); },
          setW: ev => { if (!guard()) return; const v = parseFloat(ev.target.value); if (isNaN(v)) return; if (v < 0 || v > 10) return this.toastMsg('Weight must be 0 to 10 (0 = not counted)');
            setCert({ ext: C.ext.map(x => x.id === e.id ? { ...x, w: v } : x) }, { area:'Certification', key:'ew' + e.id, text: e.name + ' weight changed', before: String(e.w), after: String(v) }); },
          remove: () => { if (!guard()) return; setCert({ ext: C.ext.filter(x => x.id !== e.id) }, { area:'Certification', text:'External assessment removed: ' + e.name }); this.toastMsg(e.name + ' removed from certification'); } }; }),
      cAddExt: () => { if (!guard()) return; const nm = 'External assessment ' + (C.ext.length + 1); setCert({ ext: C.ext.concat([{ id:'x' + Date.now(), name: nm, max:100, w:1 }]) }, { area:'Certification', text:'External assessment added: ' + nm }); },
      cFormula: nL + nE === 0 ? 'No assessments count yet.' : 'Final score = ' + (nL ? effL + '% × weighted LMS average' : '') + (nL && nE ? ' + ' : '') + (nE ? effE + '% × weighted external average' : '') + '. Certified at ' + pctL(C.pass) + ' or higher, once every counted assessment has a score.',
      cNoRule: nL + nE === 0,
      cHead: counted.map(c => ({ title: itemInfo(c.it).title, sub: 'LMS · w ' + C.lms[c.key] + ' · ' + share(C.lms[c.key], sumWL, effL) + '%' })).concat(extOn.map(e => ({ title: e.name, sub: 'External · /' + e.max + ' · w ' + e.w + ' · ' + share(e.w, sumWE, effE) + '%' }))),
      cCols: '210px repeat(' + (nL + nE) + ', minmax(120px, 1fr)) 84px 84px 90px 170px',
      cRows: b.trainees.map((u, i) => { const p = per[u], pg = b.prog[u] || {}, lockRow = !canEdit || ['noshow', 'moved', 'attrition', 'absorbed'].includes(p.T);
        return { name:u, initials: ini(u), av: AV[i % 5], exit: sayExit(u), hasExit: p.T !== 'active',
          cells: counted.map(c => { const x = pg[c.key] || {}, date = m.dates[planDayOf(m.tt.days.length, m.dates.length, c.di)];
            if (!date || date > TODAY_KEY) return { isLms:true, isExt:false, label:'Not due', bg:'#F4F8FC', fg:'#6E8796' };
            if (!activeOn(u, date)) return { isLms:true, isExt:false, label:'—', bg:'#F4F8FC', fg:'#6E8796' };
            return (x.pct || 0) > 0 && x.score != null ? { isLms:true, isExt:false, label: x.score + '%', bg: nz(C.pass) == null || x.score >= C.pass ? '#DCFCE7' : '#FDECEC', fg: nz(C.pass) == null || x.score >= C.pass ? '#166534' : '#A63232' } : { isLms:true, isExt:false, label:'Not taken', bg:'#FEF3C7', fg:'#92400E' }; })
            .concat(extOn.map(e => { const v = ((b.ext || {})[u] || {})[e.id];
              return { isLms:false, isExt:true, val: v == null ? '' : String(v), max: e.max, dis: lockRow, pctLabel: v == null ? '' : Math.round(v / e.max * 100) + '%',
                set: ev => { if (!guard()) return; const raw = ev.target.value, owner = ((b.extBy || {})[u] || {})[e.id] || null;
                  if (raw === '') { change(b.id, y => { const ue = { ...((y.ext || {})[u] || {}) }; delete ue[e.id]; return { ...y, ext: { ...(y.ext || {}), [u]: ue } }; }, { area:'Certification', owner, key:'sc' + u + e.id, text: u + ' · ' + e.name + ' score cleared', before: v == null ? '' : v + ' / ' + e.max, after:'' }); return; }
                  const n = Number(raw); if (isNaN(n) || n < 0 || n > e.max) return this.toastMsg('Enter a score from 0 to ' + e.max);
                  change(b.id, y => ({ ...y, ext: { ...(y.ext || {}), [u]: { ...((y.ext || {})[u] || {}), [e.id]: n } }, extBy: { ...(y.extBy || {}), [u]: { ...((y.extBy || {})[u] || {}), [e.id]: me } } }),
                    { area:'Certification', owner, key:'sc' + u + e.id, text: u + ' · ' + e.name + ' score ' + (v == null ? 'entered' : owner && owner !== me && isAdmin ? 'corrected' : 'changed'), before: v == null ? '' : v + ' / ' + e.max, after: n + ' / ' + e.max }); } }; })),
          lAvg: pctLbl(p.c.lAvg), eAvg: pctLbl(p.c.eAvg), fin: p.c.final == null ? '—' : p.c.final + '%',
          res: p.cert + (p.cert === 'In progress' && p.c.missing ? ' · ' + p.c.missing + ' to go' : ''), resBg: CERT_C[p.cert][0], resFg: CERT_C[p.cert][1] }; }),
      cCounts: ['Certified', 'Not certified', 'In progress', 'Not evaluated'].map(x => ({ k: x, n: b.trainees.filter(u => per[u].cert === x).length, bg: CERT_C[x][0], fg: CERT_C[x][1] })),
      // EWS
      ewsChips: ['Open', 'Actioned', 'All'].map(x => chip(s.ewsFilter, x, x + ' · ' + (x === 'All' ? ewsList.length : ewsList.filter(y => x === 'Open' ? !y.f.ack : !!y.f.ack).length), () => this.setState({ ewsFilter:x }))),
      ewsRows: ewsShown.map(({ u, f, i }) => { const key = u + '|' + f.id, editing = s.ewsAct === key;
        return { name:u, initials: ini(u), av: AV[i % 5], text: f.text, sev: f.sev, sevBg: f.sev === 'High' ? '#FDECEC' : '#FEF3C7', sevFg: f.sev === 'High' ? '#A63232' : '#92400E', src: f.auto ? 'Automatic' : 'Raised by ' + f.by,
          done: !!f.ack, ackText: f.ack ? f.ack.note + (f.ack.by ? ' · ' + f.ack.by : '') : '', editing, notEditing: !editing && !f.ack && canEdit,
          startAct: () => this.setState({ ewsAct:key, ewsNote:'' }), note: s.ewsNote || '', setNote: e => this.setState({ ewsNote: e.target.value }), cancel: () => this.setState({ ewsAct:null }),
          save: () => { if (!guard()) return; const note = (s.ewsNote || '').trim(); if (!note) return this.toastMsg('Write the action you took');
            if (f.auto) change(b.id, y => ({ ...y, ack: { ...y.ack, [key]: { note, by: me } } }), { area:'EWS', text: u + ': action logged on “' + f.text + '”', after: note });
            else change(b.id, y => ({ ...y, manual: { ...y.manual, [u]: (y.manual[u] || []).map(x => x.id === f.id ? { ...x, closed:true, closeNote: note, closedBy: me } : x) } }), { area:'EWS', text: u + ': flag closed “' + f.text + '”', after: note });
            this.setState({ ewsAct:null }); this.toastMsg('Action logged for ' + u.split(' ')[0]); } }; }),
      ewsEmpty: ewsShown.length === 0, ewsCanRaise: canEdit && m.active.length > 0,
      ewsNew: rf, ewsTraineeOpts: m.active.map(u => ({ v:u, l:u })), setEwsU: e => this.setState({ ewsNew: { ...rf, u: e.target.value } }), setEwsNote: e => this.setState({ ewsNew: { ...rf, note: e.target.value } }),
      ewsSevs: ['Medium', 'High'].map(v => chip(rf.sev, v, v, () => this.setState({ ewsNew: { ...rf, sev:v } }))),
      raiseEws: () => { if (!guard()) return; const note = (rf.note || '').trim(); if (!rf.u) return this.toastMsg('Choose a trainee'); if (!note) return this.toastMsg('Describe the concern');
        change(b.id, y => ({ ...y, manual: { ...y.manual, [rf.u]: (y.manual[rf.u] || []).concat([{ id:'m' + Date.now(), note, sev: rf.sev, by: me, at: TODAY_KEY, closed:false }]) } }), { area:'EWS', text: rf.u + ': ' + rf.sev.toLowerCase() + ' flag raised', after: note });
        this.setState({ ewsNew: { u: rf.u, sev:'Medium', note:'' } }); this.toastMsg('Early-warning flag raised for ' + rf.u.split(' ')[0]); },
      // RAG
      ragRows: b.trainees.map((u, i) => { const p = per[u], editing = s.ragEdit === u, d = s.ragDraft || {};
        return { name:u, initials: ini(u), av: AV[i % 5], att: pctLbl(p.attPct), ess: pctLbl(p.essPct), avg: pctLbl(p.avg), flags: p.T !== 'active' ? '—' : p.open, computed: ragChip(p.computed), final: ragChip(p.rag), stName: p.T !== 'active' ? p.S.name : '', hasSt: p.T !== 'active',
          overridden: !!p.override, ovNote: p.override ? p.override.note + ' · ' + p.override.by : '', editing, notEditing: !editing && canEdit && p.T === 'active',
          startEdit: () => this.setState({ ragEdit:u, ragDraft: { v: p.override ? p.override.v : p.computed === 'Not started' ? 'Green' : p.computed, note: p.override ? p.override.note : '' } }),
          opts: ['Red', 'Amber', 'Green'].map(v => { const on = d.v === v; return { label:v, bg: on ? RAG_C[v][2] : W, fg: on ? '#FFFFFF' : INK, border: on ? RAG_C[v][2] : '#C9D7E2', pick: () => this.setState({ ragDraft: { ...d, v } }) }; }),
          note: d.note || '', setNote: e => this.setState({ ragDraft: { ...d, note: e.target.value } }), cancel: () => this.setState({ ragEdit:null }),
          save: () => { if (!guard()) return; if (!(d.note || '').trim()) return this.toastMsg('Add a reason for the override');
            change(b.id, y => ({ ...y, rag: { ...y.rag, [u]: { v: d.v, note: d.note.trim(), by: me } } }), { area:'RAG', owner: p.override ? p.override.by : null, text: u + ': RAG overridden · ' + d.note.trim(), before: p.rag, after: d.v });
            this.setState({ ragEdit:null }); this.toastMsg(u.split(' ')[0] + ' set to ' + d.v); },
          clear: () => { if (!guard()) return; change(b.id, y => { const r = { ...y.rag }; delete r[u]; return { ...y, rag: r }; }, { area:'RAG', owner: p.override ? p.override.by : null, text: u + ': RAG override removed', before: p.rag, after: p.computed }); this.setState({ ragEdit:null }); this.toastMsg('Override removed'); } }; }),
      ragSummary: [['Red', m.red], ['Amber', m.amber], ['Green', m.green]].map(([v, n]) => ({ v, n, bg: RAG_C[v][0], fg: RAG_C[v][1] })),
      // history
      histChips: [['All', 'All · ' + H.length], ['Trainer', 'Trainer changes · ' + H.filter(a => a.role === 'Trainer').length], ['Correction', 'Admin corrections · ' + H.filter(a => a.kind === 'Correction').length], ['Setup', 'Setup · ' + H.filter(a => a.kind === 'Setup').length]].map(([v, l]) => chip(s.histKind, v, l, () => this.setState({ histKind:v }))),
      histAreaOpts: areas.map(a => ({ v:a, l: a === 'All' ? 'All areas' : a })), histArea: s.histArea, setHistArea: e => this.setState({ histArea: e.target.value }),
      histRows: hShown.map(hRow), histEmpty: !hShown.length, dlHistory: dl('history'),
      // reports
      repCards: [['summary', 'Batch summary', 'Infographic KPIs, then every trainee with status, attrition details, completion and certification.'], ['attendance', 'Attendance register', 'Day-by-day attendance with totals. Shows status on days a trainee was out of training.'], ['completion', 'Course completion', 'Every essential and other item, with scores.'], ['certification', 'Certification results', 'Weighted rule, counted scores, group averages, final score and result.'], ['ews', 'EWS log', 'Every early-warning signal and the action taken.'], ['history', 'Audit history', 'Every change: who, role, when, before and after, including admin corrections.']]
        .map(([x, t, d]) => ({ t, d, dl: dl(x) })),
      dlAll: () => { Object.keys(reports).forEach((x, i) => setTimeout(reports[x], i * 300)); this.toastMsg('6 reports downloading for ' + b.code); },
      ...smVals,
    };
  } else if (scrV === 'batch') detail = { btDetail:false, btNotFound:true, smModal:false, backToBatches: () => this.go('batches') };

  // ---- training types ----
  const tdr = s.ttDraft;
  let ttVals = { ttModal:false };
  if (tdr) {
    const setT = patch => this.setState(st => ({ ttDraft: { ...st.ttDraft, err:'', ...patch } }));
    const setDays = days => setT({ days });
    const opts = [{ v:'', l:'Add a course or module…' }].concat(s.adminCourses.map(c => ({ v:'course:' + c.id, l:'Course · ' + c.code + ' · ' + c.title }))).concat(s.lcms.map(m => ({ v:'module:' + m.id, l:'Module · ' + m.code + ' · ' + m.title + ' (' + m.type + ')' })));
    const nLms = lmsCandidates(tdr).filter(c => c.label === 'LMS assessment').length;
    const preview = (tdr.code || 'Code') + (tdr.level || 'L1') + TODAY_KEY.slice(2, 4) + '001';
    ttVals = {
      ttModal: scrV === 'batches' && s.bView === 'types', td: tdr, tdTitle: tdr.id ? 'Edit training type' : 'New training type', tdErr: !!tdr.err, tdIdPreview: preview,
      setTdName: e => setT({ name: e.target.value }), setTdDesc: e => setT({ desc: e.target.value }), setTdCode: e => setT({ code: e.target.value.replace(/[^A-Za-z0-9]/g, '') }), setTdLevel: e => setT({ level: e.target.value.toUpperCase().replace(/[^L0-9]/g, '') }),
      setTdPass: e => setT({ passPct: e.target.value === '' ? '' : parseInt(e.target.value, 10) }), setTdLmsW: e => setT({ lmsW: e.target.value === '' ? '' : parseInt(e.target.value, 10) }), tdExtW: nz(tdr.lmsW) == null ? '—' : 100 - tdr.lmsW,
      tdDuration: tdr.days.length + (tdr.days.length === 1 ? ' training day' : ' training days'),
      tdExt: tdr.ext.map((e, i) => ({ ...e, setName: ev => setT({ ext: tdr.ext.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) }), setMax: ev => setT({ ext: tdr.ext.map((x, j) => j === i ? { ...x, max: ev.target.value === '' ? '' : parseInt(ev.target.value, 10) } : x) }), setW: ev => setT({ ext: tdr.ext.map((x, j) => j === i ? { ...x, w: ev.target.value === '' ? '' : parseFloat(ev.target.value) } : x) }), remove: () => setT({ ext: tdr.ext.filter((_, j) => j !== i) }) })),
      tdExtEmpty: !tdr.ext.length, addTdExt: () => setT({ ext: tdr.ext.concat([{ id:'x' + Date.now(), name:'', max:100, w:1 }]) }),
      tdCertNote: 'Optional for now (v41.21). Final score = ' + (nz(tdr.lmsW) == null ? '50 (not set)' : tdr.lmsW) + '% × LMS average (' + nLms + ' LMS ' + (nLms === 1 ? 'assessment' : 'assessments') + ' in the plan) + ' + (nz(tdr.lmsW) == null ? '50 (not set)' : 100 - tdr.lmsW) + '% × weighted external average (' + tdr.ext.length + ' external). ' + (nz(tdr.passPct) == null ? 'No passing % yet: trainees show “No rule” instead of certified / not certified.' : 'Certified at ' + tdr.passPct + '%.') + ' Trainers can fine-tune per batch.',
      tdDays: tdr.days.map((d, di) => ({ n: di + 1, title: d.title, setTitle: e => setDays(tdr.days.map((x, j) => j === di ? { ...x, title: e.target.value } : x)),
        items: d.items.map((it, ii) => { const x = itemInfo(it); return { ...x, essLabel: it.essential ? 'Essential' : 'Other', essBg: it.essential ? '#FDECEC' : '#EAF1F6', essFg: it.essential ? '#A63232' : '#526B7A',
          toggleEss: () => setDays(tdr.days.map((y, j) => j === di ? { ...y, items: y.items.map((z, q) => q === ii ? { ...z, essential: !z.essential } : z) } : y)),
          remove: () => setDays(tdr.days.map((y, j) => j === di ? { ...y, items: y.items.filter((_, q) => q !== ii) } : y)) }; }),
        empty: !d.items.length, pick: (s.ttPick || {})[di] || '', opts, setPick: e => { const v = e.target.value; this.setState(st => ({ ttPick: { ...(st.ttPick || {}), [di]: v } })); },
        add: () => { const v = (s.ttPick || {})[di]; if (!v) return this.toastMsg('Choose a course or module first'); const [kind, ref] = v.split(':'); if (d.items.some(x => x.kind === kind && x.ref === ref)) return this.toastMsg('Already on Day ' + (di + 1));
          setDays(tdr.days.map((y, j) => j === di ? { ...y, items: y.items.concat([{ kind, ref, essential:true }]) } : y)); this.setState(st => ({ ttPick: { ...(st.ttPick || {}), [di]: '' } })); },
        up: () => { if (!di) return; const a = tdr.days.slice(); [a[di - 1], a[di]] = [a[di], a[di - 1]]; setDays(a); }, isFirst: di === 0,
        removeDay: () => { if (tdr.days.length === 1) return this.toastMsg('A training type needs at least one day'); setDays(tdr.days.filter((_, j) => j !== di)); } })),
      addDay: () => setDays(tdr.days.concat([{ title:'', items:[] }])),
      tdSummary: tdr.days.length + (tdr.days.length === 1 ? ' day · ' : ' days · ') + tdr.days.reduce((t, d) => t + d.items.length, 0) + ' items · pass ' + pctL(nz(tdr.passPct)),
      closeTt: () => this.setState({ ttDraft:null }),
      saveTt: () => { const nm = tdr.name.trim();
        if (!nm) return setT({ err:'Give the training type a name.' });
        if (s.ttypes.some(t => t.id !== tdr.id && t.name.trim().toLowerCase() === nm.toLowerCase())) return setT({ err:'A training type with this name already exists.' });
        if (!/^[A-Za-z][A-Za-z0-9]{1,7}$/.test(tdr.code || '')) return setT({ err:'Batch ID code must be 2–8 letters or digits, starting with a letter (e.g. Comms).' });
        if (!/^L\d{1,2}$/.test(tdr.level || '')) return setT({ err:'Level must look like L1, L2 or L10.' });
        if (s.ttypes.some(t => t.id !== tdr.id && (t.code || '').toLowerCase() === tdr.code.toLowerCase() && t.level === tdr.level)) return setT({ err:'Another training type already uses ' + tdr.code + tdr.level + '. Batch IDs would clash.' });
        // v41.21: passing %, LMS weight, external assessments and the courses of each day are optional for now; if filled, they must be valid
        const pass = nz(tdr.passPct), lmsW = nz(tdr.lmsW);
        if (pass != null && !(pass >= 1 && pass <= 100)) return setT({ err:'Passing % must be from 1 to 100, or leave it empty.' });
        if (lmsW != null && !(lmsW >= 0 && lmsW <= 100)) return setT({ err:'LMS weight must be from 0 to 100 (external gets the rest), or leave it empty.' });
        const ext = tdr.ext.filter(e => (e.name || '').trim() || e.max !== 100 || e.w !== 1).map(e => ({ ...e, max: nz(e.max) == null ? 100 : e.max, w: nz(e.w) == null ? 1 : e.w }));
        const badExt = ext.findIndex(e => !(e.name || '').trim() || !(e.max >= 1) || !(e.w > 0 && e.w <= 10)); if (badExt >= 0) return setT({ err:'External assessment ' + (badExt + 1) + ' needs a name; maximum marks at least 1 and a weight from 0.1 to 10 (or remove the row).' });
        const used = s.batches.filter(b => b.type === tdr.id && lastLogged(b));
        if (tdr.id && used.length && s.ttypes.find(t => t.id === tdr.id).days.length !== tdr.days.length) return setT({ err:'Running batches (' + used.length + ', e.g. ' + used.slice(0, 3).map(b => b.code).join(', ') + ') use this type, so its number of days can’t change. Create a new training type instead.' });
        const rec = { id: tdr.id || 'tt' + Date.now(), name: nm, code: tdr.code, level: tdr.level, desc: (tdr.desc || '').trim(), passPct: pass, lmsW, ext: ext.map(e => ({ ...e, name: e.name.trim() })), days: tdr.days.map(d => ({ title: d.title.trim(), items: d.items })) };
        this.setState({ ttypes: tdr.id ? s.ttypes.map(t => t.id === rec.id ? rec : t) : s.ttypes.concat([rec]), ttDraft:null, batches: tdr.id ? s.batches.map(b => { if (b.type !== rec.id || lastLogged(b)) return b; const d = batchDates(b, rec, holSetFor(s.holidays, b)); return { ...b, end: d[d.length - 1] || b.end }; }) : s.batches });
        this.toastMsg('“' + nm + '” saved' + (tdr.id ? ' · existing batches keep their IDs and certification rules' : '')); },
    };
  }
  const ttRows = s.ttypes.map(t => { const used = s.batches.filter(b => b.type === t.id), nLms = lmsCandidates(t).filter(c => c.label === 'LMS assessment').length;
    return { ...t, idLabel: (t.code || '') + (t.level || '') + 'YY###', dayCount: t.days.length + (t.days.length === 1 ? ' day' : ' days'), passLabel: 'Pass ' + pctL(t.passPct), wLabel: nz(t.lmsW) == null ? 'Weights not set' : 'LMS ' + t.lmsW + '% · Ext ' + (100 - t.lmsW) + '%', asmLabel: nLms + ' LMS + ' + t.ext.length + ' external assessments', itemCount: t.days.reduce((n, d) => n + d.items.length, 0) + ' items', usedLabel: used.length ? 'Used by ' + used.length + (used.length === 1 ? ' batch' : ' batches') + ' · latest ' + used.slice().sort((x, y) => y.start.localeCompare(x.start)).slice(0, 3).map(b => b.code).join(', ') : 'Not used yet',
      preview: t.days.map((d, i) => ({ n: i + 1, title: d.title || 'Day ' + (i + 1), count: d.items.length })),
      edit: () => this.setState({ ttPick:{}, ttDraft: JSON.parse(JSON.stringify({ ...t, passPct: nz(t.passPct) == null ? '' : t.passPct, lmsW: nz(t.lmsW) == null ? '' : t.lmsW, err:'' })) }),
      del: () => { if (used.length) return this.toastMsg('Used by ' + used.length + ' batches, so it can’t be deleted.'); this.setState({ ttypes: s.ttypes.filter(x => x.id !== t.id) }); this.toastMsg('“' + t.name + '” deleted'); } }; });

  const bv = isAdmin ? s.bView : 'list', aggK = sumK(MS.map(x => x.m.k));
  return {
    isBatches: scrV === 'batches', isBatch: scrV === 'batch',
    bListTitle:'Batch management', bListSub: isAdmin ? 'Every batch, its outcomes and its history. Set up training types, trainee statuses and holidays here.' : 'Every batch and what happened in it. You can update the batches you run.',
    bCanManage: isAdmin, bvList: bv === 'list', bvTypes: bv === 'types', bvHols: bv === 'holidays', bvStatuses: bv === 'statuses',
    bViewTabs: isAdmin ? [['list', 'Batches · ' + s.batches.length], ['types', 'Training types · ' + s.ttypes.length], ['statuses', 'Trainee statuses · ' + s.statuses.length], ['holidays', 'Holidays · ' + s.holidays.length]].map(([x, l]) => chip(s.bView, x, l, () => this.setState({ bView:x }))) : [],
    bRows: listRows, bPager: BPG.pager, bEmpty: listRows.length === 0, bQuery: s.bQuery || '', setBQuery: e => this.setState({ bQuery: e.target.value }),
    bChips: ['All', 'Ongoing', 'Awaiting closure', 'Upcoming', 'Completed'].map(x => chip(s.bFilter, x, x + ' · ' + s.batches.filter(b => inScope(b) && (x === 'All' || batchStatus(b) === x)).length, () => this.setState({ bFilter:x }))),
    bScopeChips: isAdmin ? [] : [['mine', 'My batches · ' + s.batches.filter(b => b.trainer === me).length], ['all', 'All batches · ' + s.batches.length]].map(([v, l]) => chip(scope, v, l, () => this.setState({ bScope:v }))), bShowScope: !isAdmin, bTable: !isAdmin, bCards: isAdmin,
    bTypeOpts: [{ v:'All', l:'All training types' }].concat(s.ttypes.map(t => ({ v:t.id, l:t.name }))), bTypeVal: s.bType, setBType: e => this.setState({ bType: e.target.value }),
    aggTiles: [{ l:'Batches', v: MS.length, sub: MS.filter(x => batchStatus(x.b) === 'Ongoing').length + ' ongoing · ' + MS.filter(x => batchStatus(x.b) === 'Awaiting closure').length + ' awaiting closure', c:'#16324F' }]
      .concat(Object.keys(STATUS_GROUPS).map(g => ({ l: STATUS_GROUPS[g].label, v: MS.reduce((t, x) => t + x.m.grp[g], 0), sub: STATUS_GROUPS[g].desc, c: STATUS_GROUPS[g].c })))
      .concat([{ l:'Throughput', v: pctLbl(aggK.throughput), sub:'(graduated + absorbed) ÷ joined', c:'#007A4D' }]),
    newBatch: openNew, exportBatches,
    ...holVals, ...statusVals, ...modalVals, ...detail, ...ttVals,
    ttRows, newTtype: () => this.setState({ ttPick:{}, ttDraft: { id:null, name:'', code:'', level:'L1', desc:'', passPct:'', lmsW:'', ext:[], days:[{ title:'', items:[] }], err:'' } }),
  };
};
