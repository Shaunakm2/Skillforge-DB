/* Skillforge LMS — learning statistics from the real records (v29).
 * Replaces the generated numbers the older reports and Engagement trends used to show. One pass over every assignment of
 * every non-deactivated person, cached until the records change. Same completion rule as everywhere else: all modules
 * done, or a completion imported from another LMS (Progress.migrated).
 *
 *   person   assigned, completed, in progress, not started, overdue, scored modules, last activity
 *   course   the same per course, plus average days from assignment to completion and certificates issued
 *   days     per calendar day (last 400 days): people active (any module completed), courses completed, certificates,
 *            minutes of modules completed (estimated from each module's length)
 *   comp     compliance rows: mandatory, essential or re-certified courses with completion and expiry
 */
/* XP (v33): earned from the learning records, so it is the same for a person on every screen and every device, can't be
 * farmed by retaking a quiz, and survives a refresh. 50 per completed module, 100 per completed course, plus the score of
 * each scored assessment (once). Imported completions count as a completed course. */
const LearnXP = (() => {
  let key = null, val = null;
  function build(s) {
    const deps = [s.users, s.itemDone, s.extHistory, s.adminCourses];
    if (key && deps.every((x, i) => x === key[i])) return val;
    const out = new Map();
    s.users.forEach(u => { if (u.status === 'Deactivated') return; let xp = 0; const recs = s.itemDone[u.name] || {}, seen = new Set();
      for (const cid in recs) { const a = Progress.courseOf(s, cid), r = recs[cid] || {}; let n = 0;
        for (const i in r) { const v = r[i]; if (!v) continue; n++; xp += 50; if (v && typeof v === 'object' && v.score != null) xp += Math.max(0, Math.min(100, Math.round(+v.score) || 0)); }
        if (a && a.items.length && n >= a.items.length) { xp += 100; seen.add(cid); } }
      (s.extHistory || []).forEach(x => { if (x.user === u.name && x.status === 'Completed' && !seen.has(x.courseId || x.extCourse)) xp += 100; });
      out.set(u.name, xp); });
    key = deps; val = out; return out;
  }
  const of = (s, name) => build(s).get(name) || 0;
  return { build, of };
})();
const LearnStats = (() => {
  let key = null, val = null;
  const RECERT = { '12 months': 12, '24 months': 24 };
  const addMonths = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setMonth(d.getMonth() + n); return dateKey(d); };
  function build(s) {
    const deps = [s.users, s.enroll, s.itemDone, s.adminCourses, s.extHistory, s.assignedOn];
    if (key && deps.every((x, i) => x === key[i])) return val;
    const people = new Map(), courses = new Map(), days = new Map(), comp = [], since = Progress.plus(TODAY_KEY, -400);
    const P0 = () => ({ asg:0, done:0, inprog:0, notst:0, overdue:0, scoreSum:0, scoreN:0, last:'' });
    const day = k => { let d = days.get(k); if (!d) days.set(k, d = { active: new Set(), done:0, certs:0, mins:0 }); return d; };
    s.users.forEach(u => { if (u.status === 'Deactivated') return; const en = s.enroll[u.name]; if (!en) return; const recs = s.itemDone[u.name] || {};
      for (const cid in en) { const a = Progress.courseOf(s, cid); if (!a) continue;
        const r = recs[cid], n = a.items.length; let dn = 0, last = '', sc = 0, scn = 0;
        if (r) for (const i in r) { dn++; const v = r[i], at = typeof v === 'string' ? v : v && v.at; if (at > last) last = at;
          if (v && typeof v === 'object' && v.score != null) { sc += v.score; scn++; }
          if (at && at >= since) { const d = day(at); d.active.add(u.name); const it = a.items[i]; if (it && it.kind !== 'quiz') d.mins += +it.mins || 0; } }
        const mig = !(n && dn >= n) ? Progress.migrated(s, u.name, cid) : null, done = !!(n && dn >= n) || !!mig, doneOn = mig ? mig.completedOn : done ? last : '';
        const due = en[cid], st = done ? 'Completed' : due && due < TODAY_KEY ? 'Overdue' : dn ? 'In progress' : 'Not started';
        let p = people.get(u.name); if (!p) people.set(u.name, p = P0());
        let c = courses.get(cid); if (!c) courses.set(cid, c = { ...P0(), daysSum:0, daysN:0, certs:0 });
        for (const x of [p, c]) { x.asg++; x.scoreSum += sc; x.scoreN += scn; if (last > x.last) x.last = last;
          if (st === 'Completed') x.done++; else if (st === 'In progress') x.inprog++; else if (st === 'Not started') x.notst++; else { x.overdue++; if (dn) x.inprog++; else x.notst++; } }
        if (done) { const on = Progress.assignedOn(s, u.name, cid); if (on && doneOn && doneOn >= on) { c.daysSum += Math.round((new Date(doneOn + 'T12:00:00') - new Date(on + 'T12:00:00')) / 864e5); c.daysN++; }
          const cert = Progress.hasCert(a); if (cert) c.certs++;
          if (doneOn && doneOn >= since) { const d = day(doneOn); d.done++; if (cert) d.certs++; } }
        // compliance: mandatory, essential for new joiners, or re-certified courses
        const rc = RECERT[a.recert] || 0;
        if ((a.features && a.features.mandatory) || a.essential || rc) {
          const exp = done && doneOn && rc ? addMonths(doneOn, rc) : '';
          const cst = !done ? (due && due < TODAY_KEY ? 'Overdue' : 'Not completed') : exp && exp < TODAY_KEY ? 'Expired' : exp && exp <= Progress.plus(TODAY_KEY, 30) ? 'Expiring soon' : 'Valid';
          comp.push({ user: u.name, empId: u.empId || '', dept: u.dept || '', course: a.code + ' · ' + a.title, cid, done: doneOn, due, exp, st: cst }); } } });
    key = deps; val = { people, courses, days, comp }; return val;
  }
  /* Totals over [from, to] (inclusive dates): distinct active people, completions, certificates, minutes. */
  function period(st, from, to) { const act = new Set(); let done = 0, certs = 0, mins = 0;
    st.days.forEach((d, k) => { if (k < from || k > to) return; d.active.forEach(n => act.add(n)); done += d.done; certs += d.certs; mins += d.mins; });
    return { active: act.size, done, certs, mins }; }
  return { build, period };
})();
