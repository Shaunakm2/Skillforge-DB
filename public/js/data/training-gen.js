/* Skillforge LMS — a year of training batches for the full organisation (the data the old MIS workbook held).
 * ~150 batches Jan–Oct, ~3,600 participations (new hires once, existing employees in refresher / communication /
 * leadership / core trainings), with the real batch model: trainer, room, attendance, status timeline
 * (In-Training → On the job training → Handover to OPS, Early Absorb, Attried …), so batch pages, the MIS report
 * and the MIS dashboard all read the same records. Deterministic.
 */
const TrainingGen = (() => {
  let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (a, w) => { if (!w) return a[Math.floor(rnd() * a.length)]; const t = w.reduce((x, y) => x + y, 0); let r = rnd() * t; for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; } return a[a.length - 1]; };
  const SEG_OF = n => /^Communication/.test(n) ? 'Communication Training' : /Leader|Managers/.test(n) ? 'Leadership Training' : /^Core Elements/.test(n) ? 'Core Elements' : /Essentials|Fire Safety/.test(n) ? 'Essential Training' : /Special Request|Client/.test(n) ? 'Special Request Training' : 'Functional Training';
  const DIV_OF_TRAINING = n => /Customer Support|Induction/.test(n) ? ['Customer Ops – North', 'Customer Ops – South', 'Customer Ops – Digital'] : /Sales/.test(n) ? ['Sales – Inside', 'Sales – Field'] : /Finance|Payables/.test(n) ? ['Finance – Payables'] : /Service Desk/.test(n) ? ['Tech – Service Desk'] : null;
  /* MIS profile fields for a person (filled once; kept if already set). */
  function profile(u, i) {
    const sub = u.subDivision || pick(MASTERS0.subDivisions, [24, 20, 14, 14, 10, 8, 7, 3]);
    const div = u.division || SUBDIV_OF[sub];
    return { ...u, subDivision: sub, division: div, divisionHead: u.divisionHead || HEAD_OF[div], site: MASTERS0.locations.includes(u.site) ? u.site : pick(MASTERS0.locations, [70, 20, 10]),
      brand: u.brand || (div === 'Finance Services' ? 'Brand B' : pick(MASTERS0.brands, [40, 12, 18, 12, 8, 10])),
      wfo: u.wfo || pick(['WFO', 'WFH', 'Hybrid'], [86, 6, 8]), education: u.education || pick(MASTERS0.education, [3, 10, 12, 10, 14, 10, 8, 3, 4, 3, 18, 3, 2]),
      expMonths: u.expMonths != null ? u.expMonths : (rnd() < 0.42 ? 0 : 3 + Math.floor(rnd() * 120)), account: u.account || '' };
  }
  /* Extra training types used by the generated batches (classroom days; OJT is 5 working days after). */
  const extraTypes = (base) => {
    const ids = base.adminCourses.filter(a => COURSES.some(c => c.id === a.id) || /^(safety|feedback|change|coaching|present|negotiation|inclusive|oneonones|eq)$/.test(a.id)).map(a => a.id);
    const mk = (id, name, code, level, days, pass) => ({ id, name, code, level, desc:'', passPct: pass, lmsW: 60, ojtDays: 5, ext:[{ id:'xm' + id, name:'Mock call evaluation', max:20, w:1 }],
      days: Array.from({ length: days }, (_, d) => ({ title:'Day ' + (d + 1), items:[{ kind:'course', ref: ids[d % ids.length], essential: d % 3 !== 2 }] })) });
    return [mk('ttF', 'Functional Training · 15 days', 'FUNC', 'L1', 15, 75), mk('ttC', 'Core Elements · 5 days', 'CORE', 'L1', 5, 70), mk('ttS', 'Short / special request · 2 days', 'SPRQ', 'L1', 2, 70)];
  };
  const abbr = n => (n.replace(/\(.*?\)/g, '').split(/[\s\-–·]+/).filter(w => /^[A-Za-z]/.test(w)).map(w => /^[A-Z]{2,}$/.test(w) ? w : w[0].toUpperCase()).join('') || 'TRN').slice(0, 6);
  function build(state, users) {
    seed = 4242;
    const types = extraTypes(state), trainers = users.filter(u => u.role === 'Trainer' && u.status !== 'Deactivated').map(u => u.name);
    const ST = id => id;
    const names = MASTERS0.trainingNames, batches = [], seq = {};
    const pool = users.filter(u => u.source === 'ZingHR'), newHires = pool.slice(), existing = pool.filter(u => u.status === 'Active');
    // shuffle new hires
    for (let i = newHires.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [newHires[i], newHires[j]] = [newHires[j], newHires[i]]; }
    let nh = 0;
    const plusW = (k, n) => { let d = k, c = 0; while (c < n) { d = Progress.plus(d, 1); const w = new Date(d + 'T12:00:00').getDay(); if (w && w !== 6) c++; } return d; };
    const joinedOverride = {};
    const months = []; for (let m = 1; m <= 10; m++) months.push(m);
    months.forEach(m => {
      const nb = 12 + Math.floor(rnd() * 6);
      for (let k = 0; k < nb; k++) {
        const nm = pick(names, names.map(n => /Customer Support|Sales Programme|Service Desk|Finance Services/.test(n) ? 9 : /^Core Elements|New Hire Induction/.test(n) ? 7 : /^Communication Skills L/.test(n) ? 3 : /Aspiring|First-time/.test(n) ? 2 : 1));
        const seg = SEG_OF(nm), isNew = seg === 'Functional Training' && rnd() < 0.92 || seg === 'Core Elements' && rnd() < 0.85;
        const tt = seg === 'Functional Training' ? types[0] : seg === 'Core Elements' || seg === 'Essential Training' ? types[1] : seg === 'Leadership Training' ? TTYPES0.find(t => t.id === 'tt3') : seg === 'Communication Training' ? TTYPES0.find(t => t.id === 'tt4') : types[2];
        let day = '2026-' + String(m).padStart(2, '0') + '-' + String(2 + Math.floor(rnd() * 24)).padStart(2, '0'); while ([0, 6].includes(new Date(day + 'T12:00:00').getDay())) day = Progress.plus(day, 1);
        if (day > Progress.plus(TODAY_KEY, 21)) continue;
        const dates = trainDays(day, tt.days.length, holSetFor(HOLIDAYS0, null)), end = dates[dates.length - 1];
        const size = isNew ? 12 + Math.floor(rnd() * 22) : 8 + Math.floor(rnd() * 18), subs = DIV_OF_TRAINING(nm);
        const trainees = [];
        for (let t = 0; t < size; t++) {
          let u;
          if (isNew) { u = newHires[nh++ % newHires.length]; joinedOverride[u.id] = Progress.plus(day, -1); }
          else u = existing[Math.floor(rnd() * existing.length)];
          if (!trainees.includes(u.name)) trainees.push(u.name);
        }
        const pre = abbr(nm), yy = day.slice(2, 4), key = pre + yy; seq[key] = (seq[key] || 0) + 1;
        const id = 'mb' + batches.length, code = key + String(seq[key]).padStart(3, '0');
        const ojtEnd = plusW(end, tt.ojtDays || 5), handover = plusW(ojtEnd, 1);
        const b = { id, code, name: nm + ' · ' + new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month:'short' }) + ' ' + seq[key], type: tt.id, trainer: pick(trainers.length ? trainers : ['Daniel Reyes']), division: subs ? SUBDIV_OF[subs[0]] : 'Learning and Development',
          start: dates[0], end, trainees, st:{}, att:{}, attLog:{}, prog:{}, manual:{}, ack:{}, rag:{}, ext:{}, extBy:{}, audit:[], holidays:[], createdBy:'Lena Fischer',
          segment: seg, traineeType: isNew ? 'New Hire' : 'Existing', trainingName: nm, ojtEnd, handover, mode: rnd() < 0.85 ? 'In person' : 'Virtual', meetLink:'', placeId:'', cert: certFrom(tt, LCMS0), gen:true };
        if (b.mode === 'Virtual') b.meetLink = 'https://teams.microsoft.com/l/meetup-join/' + code;
        // statuses
        const phase = TODAY_KEY < b.start ? 'upcoming' : TODAY_KEY <= end ? 'class' : TODAY_KEY < handover ? 'ojt' : 'done';
        let eid = 0; const E = (u, status, date, x) => { (b.st[u] = b.st[u] || []).push({ id: id + 'e' + (eid++), status, date: date > TODAY_KEY ? TODAY_KEY : date, by: b.trainer, at: (date > TODAY_KEY ? TODAY_KEY : date) + 'T17:00', ...(x || {}) }); };
        const att = (u, lastDay) => dates.forEach(d => { if (d > TODAY_KEY || (lastDay && d >= lastDay)) return; (b.att[d] = b.att[d] || {})[u] = rnd() < 0.94 ? 'P' : rnd() < 0.6 ? 'L' : 'A'; b.attLog[d] = { by: b.trainer, at: d, time:'5:30 PM' }; });
        trainees.forEach(u => {
          if (phase === 'upcoming') return;
          const r = rnd(), midDay = dates[Math.min(dates.length - 1, 1 + Math.floor(rnd() * (dates.length - 1)))];
          const vol = rnd() < 0.62, reason = vol ? pick(['No call no show', 'Personal', 'Better opportunity', 'Higher studies', 'Health', 'Relocation']) : pick(['Attendance', 'Performance', 'Conduct in classroom', 'Policy violation', 'Background verification']);
          const attX = { attType: vol ? 'Voluntary' : 'Involuntary', reason, details: reason, resp: vol ? pick(['HR', 'Operations'], [3, 1]) : pick(['Recruitment', 'Training', 'HR'], [3, 2, 1]) };
          if (r < 0.003) { E(u, 'st_nj', b.start, { note:'Did not report on day 1.' }); return; }
          if (r < 0.011) { E(u, 'st_drop', dates[Math.min(1, dates.length - 1)], attX); att(u, dates[Math.min(1, dates.length - 1)]); return; }
          if (r < 0.025 && midDay <= TODAY_KEY) { E(u, 'st_attr', midDay, attX); att(u, midDay); return; }
          if (r < 0.049 && midDay <= TODAY_KEY) { E(u, 'st_move', midDay, { target:'Next ' + nm + ' batch', note:'Missed days; moved to the next batch.' }); att(u, midDay); return; }
          if (phase === 'class') { att(u); if (r < 0.07 && midDay <= TODAY_KEY) E(u, 'st_eabs', midDay, { target: pick(subs || ['Operations']), note:'Strong performer; early handover requested.' }); return; }
          att(u);
          if (r < 0.12) { E(u, 'st_eabs', Progress.plus(end, -Math.floor(rnd() * 4)), { target: pick(subs || ['Operations']), note:'Early handover email sent.' }); return; }
          if (r < 0.145) { E(u, 'st_dabs', b.start, { target: pick(subs || ['Operations']), note:'Experienced hire, absorbed directly.' }); return; }
          E(u, 'st_ojt', plusW(end, 1));
          if (phase === 'ojt') return;
          if (r < 0.15) { E(u, 'st_retr', Progress.plus(handover, -1), { note:'Below pass mark; re-training.' }); return; }
          if (r < 0.152) { E(u, 'st_decert', handover, { note:'Did not clear certification.' }); return; }
          if (r < 0.1525) { E(u, 'st_hr', handover, { note:'Referred to HR.' }); return; }
          if (TODAY_KEY < Progress.plus(handover, 4) && r > 0.97) return; // still on OJT, update pending
          E(u, 'st_ops', handover);
        });
        b.closed = phase === 'done' && trainees.every(u => { const l = b.st[u] || []; const lst = l[l.length - 1]; return lst && !['st_ojt', 'st_intr'].includes(lst.status); }) && TODAY_KEY > Progress.plus(handover, 3);
        if (b.closed) { b.closedBy = b.trainer; b.closedAt = Progress.plus(handover, 2) + 'T18:00'; }
        b.audit.push({ id: id + 'a0', at: Progress.plus(day, -5) + 'T10:00', by:'Lena Fischer', role:'Admin', kind:'Setup', area:'Batch', text:'Batch created with ' + trainees.length + ' trainees, trainer ' + b.trainer, before:'', after:'' });
        batches.push(b);
      }
    });
    const outUsers = users.map(u => joinedOverride[u.id] ? { ...u, joined: joinedOverride[u.id] } : u);
    return { batches, ttypes: types, users: outUsers };
  }
  return { build, profile };
})();
