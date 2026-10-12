/* Skillforge LMS — learning records and progress. One source of truth for the dashboard, course pages,
 * essential-training rule, reports and exports.
 *
 *  Learning records are per person, per course, per module (step):
 *    s.itemDone[user][courseId][stepIndex] = 'YYYY-MM-DD'            step completed on that date
 *                                          = { at, score }           assessment passed (seeded or imported)
 *    s.itemQuiz[user][courseId][stepIndex] = [attempts]              live assessment attempts in this session
 *  Every course (including the original lesson-based ones) is a list of steps, so there is one record shape.
 *  Records imported from another LMS (Settings › Migration) count as completed.
 *
 *  Scale: at 3,500 people × ~30 assignments the store holds 100,000+ module records. Lookups go through
 *  indexes that are rebuilt only when the underlying data changes (memoised on object identity), so a screen
 *  render never scans every person × every course.
 */
const Progress = (() => {
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const plus = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return key(d); };
  const weekend = k => { const w = new Date(k + 'T12:00:00').getDay(); return w === 0 || w === 6; };
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
  const isStepCourse = () => true;

  /* ---------- memoisation: recompute only when the inputs change ---------- */
  const memo = (fn) => { let lastArgs = null, last; return (...args) => { if (lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs[i])) return last; lastArgs = args; last = fn(...args); return last; }; };
  const cache = new Map(); // detail cache, cleared when records change
  let cacheKey = [];
  const sameKey = k => k.length === cacheKey.length && k.every((x, i) => x === cacheKey[i]);
  const touch = s => { const k = [s.itemDone, s.itemQuiz, s.extHistory, s.enroll, s.assignedOn, s.adminCourses, s.quizzes, s.reviews, s.attemptsUsed]; if (!sameKey(k)) { cache.clear(); cacheKey = k; } };

  /* Index: imported completions by "user|courseId". */
  const migIndex = memo(ext => { const m = new Map(); (ext || []).forEach(r => { if (r.courseId && r.status === 'Completed') m.set(r.user + '|' + r.courseId, r); }); return m; });
  const migrated = (s, user, cid) => migIndex(s.extHistory).get(user + '|' + cid) || null;
  /* Index: courses by id. */
  const courseIndex = memo(list => new Map(list.map(a => [a.id, a])));
  const courseOf = (s, id) => courseIndex(s.adminCourses).get(id);

  const quizPassed = (s, z, r) => { const sc = Assessment.score(r.attempt, r.answers, s.qs, s.reviews); return sc.final && sc.pct >= z.pass; };
  /* Per-step state for one person: { done, at, locked, best, pendingQ }. */
  function itemStates(s, a, user) {
    const dn = (s.itemDone[user] || {})[a.id] || {}, qr = (s.itemQuiz[user] || {})[a.id] || {}; let prevOk = true;
    return a.items.map((it, i) => { let done = false, at = '', best = null, pendingQ = false; const v = dn[i];
      if (v) { done = true; at = typeof v === 'string' ? v : v.at || TODAY_KEY; if (v && typeof v === 'object' && v.score != null) best = { pct: v.score }; }
      if (it.kind === 'quiz') { const z = s.quizzes.find(x => x.id === it.quizId); (qr[i] || []).forEach(r => { const sc = Assessment.score(r.attempt, r.answers, s.qs, s.reviews); if (!sc.final) pendingQ = true; else if (!best || sc.pct > best.pct) best = sc; if (z && quizPassed(s, z, r)) { done = true; at = at || TODAY_KEY; } }); }
      const locked = !!a.features.linear && !prevOk; prevOk = prevOk && done; return { done, at, locked, best, pendingQ }; });
  }
  function courseDone(s, user, a) {
    if (migrated(s, user, a.id)) return true;
    return a.items.length > 0 && itemStates(s, a, user).every(x => x.done);
  }
  /* The Nth working day counting the start day (weekends and holidays skipped). */
  function workingDeadline(start, days, holidays) {
    const hol = new Set((holidays || []).map(h => h.date)); let k = start, n = 0, guard = 0;
    while (guard++ < 800) { if (!weekend(k) && !hol.has(k)) { n++; if (n >= days) return k; } k = plus(k, 1); }
    return k;
  }
  const workingDaysBetween = (from, to, holidays) => { const hol = new Set((holidays || []).map(h => h.date)); let n = 0, k = plus(from, 1), guard = 0; while (k <= to && guard++ < 800) { if (!weekend(k) && !hol.has(k)) n++; k = plus(k, 1); } return n; };

  const assignedOn = (s, user, cid) => { const rec = (s.assignedOn || {})[user + '|' + cid]; if (rec) return rec; const due = (s.enroll[user] || {})[cid];
    if (!due) return ''; const d = plus(due, -21); return d > TODAY_KEY ? TODAY_KEY : d; };

  /* Course status for one person, from the learning records. Cached until records change. */
  function detail(s, user, a) {
    touch(s); const ck = user + '|' + a.id; if (cache.has(ck)) return cache.get(ck);
    const due = (s.enroll[user] || {})[a.id] || '', mig = migrated(s, user, a.id);
    const from = assignedOn(s, user, a.id) || (mig ? mig.startedOn || mig.completedOn : '');
    const quizOf = it => it.kind === 'quiz' ? s.quizzes.find(z => z.id === it.quizId) : null;
    const used = it => { const z = quizOf(it); return z ? ((s.attemptsUsed[user] || {})[z.id] || 0) : ''; };
    let mods, source = 'Skillforge';
    if (mig) {
      source = 'Migrated from ' + mig.source;
      mods = a.items.map(it => ({ pct:100, done:true, startedOn: mig.startedOn || mig.completedOn, completedOn: mig.completedOn, attempts: quizOf(it) ? 1 : '', best: quizOf(it) && mig.score !== '' ? mig.score : '' }));
    } else {
      const st = itemStates(s, a, user), firstAt = st.map(x => x.at).filter(Boolean).sort()[0] || '';
      mods = a.items.map((it, i) => { const x = st[i], tries = used(it);
        return { pct: x.done ? 100 : 0, done: x.done, startedOn: x.done ? x.at : tries ? (firstAt || TODAY_KEY) : '', completedOn: x.done ? x.at : '', attempts: tries === '' ? '' : (tries || (x.done && quizOf(it) ? 1 : 0)), best: x.best ? x.best.pct : '' }; });
    }
    const doneN = mods.filter(m => m.done).length, n = a.items.length, pct = n ? Math.round(doneN / n * 100) : 0;
    const started = mods.map(m => m.startedOn).filter(Boolean).sort()[0] || '';
    const completed = n && doneN === n ? mods.map(m => m.completedOn).filter(Boolean).sort().pop() || TODAY_KEY : '';
    const overdue = !completed && !!due && due < TODAY_KEY;
    const status = completed ? 'Completed' : overdue ? 'Overdue' : doneN || started ? 'In progress' : 'Not started';
    const out = { assignedOn: from, due, startedOn: started, completedOn: completed, pct, doneN, total: n, status, overdue, source, mods };
    cache.set(ck, out); return out;
  }

  /* A person's assigned (or migrated) courses with their status: the one list every learner screen uses. */
  function myCourses(s, user) {
    const ids = new Set(Object.keys(s.enroll[user] || {}));
    (s.extHistory || []).forEach(r => { if (r.user === user && r.courseId && r.status === 'Completed') ids.add(r.courseId); });
    return [...ids].map(id => courseOf(s, id)).filter(Boolean).map(a => ({ a, d: detail(s, user, a) }));
  }
  /* Dashboard numbers for one person. "Due soon" = not completed and due within 14 days or already overdue. */
  function summary(s, user) {
    const list = myCourses(s, user).filter(x => (s.enroll[user] || {})[x.a.id]);
    const open = list.filter(x => x.d.status !== 'Completed');
    const days = x => x.d.due ? daysUntil(x.d.due) : 9999;
    return { list, total: list.length, done: list.filter(x => x.d.status === 'Completed').length,
      inProgress: list.filter(x => x.d.status === 'In progress').length, notStarted: list.filter(x => x.d.status === 'Not started').length,
      overdue: open.filter(x => x.d.overdue).length, dueWeek: open.filter(x => !x.d.overdue && days(x) <= 7).length,
      dueSoon: open.filter(x => days(x) <= 14).sort((x, y) => days(x) - days(y)),
      continueWith: open.filter(x => x.d.status === 'In progress' || x.d.overdue).sort((x, y) => (y.d.status === 'In progress') - (x.d.status === 'In progress') || days(x) - days(y))[0] || open.sort((x, y) => days(x) - days(y))[0] || null };
  }

  /* Index of everyone's assignments, built from s.enroll (only the people who have assignments are visited). */
  const assignmentList = memo((enroll) => { const out = []; Object.keys(enroll).forEach(u => Object.keys(enroll[u] || {}).forEach(cid => out.push([u, cid]))); return out; });

  const MODULE_TYPE = { pdf:'Document', doc:'Document', video:'Video', audio:'Podcast / audio', scorm:'SCORM', image:'Image', link:'External content', quiz:'Assessment', ack:'Acknowledgment', lesson:'Lesson',
    html:'Non-SCORM (HTML5)', xapi:'xAPI / cmi5', embed:'H5P', youtube:'YouTube / Vimeo', checklist:'Checklist', assignment:'Assignment', survey:'Survey' };
  /* Module-level rows for every assignment (all-course completion report and "move out" export). */
  function completionRows(s, keep) {
    const head = ['Employee ID', 'Name', 'Department', 'User type', 'Course ID', 'Course', 'Essential', 'Assigned on', 'Due date', 'Course started', 'Course completed', 'Course completion %', 'Course status',
      'Step', 'Module ID', 'Module', 'Module type', 'Module started', 'Module completed', 'Module completion %', 'Assessment attempts', 'Best score %', 'Source'];
    const rows = [], userBy = new Map(s.users.map(u => [u.name, u]));
    const pairs = assignmentList(s.enroll).slice();
    migIndex(s.extHistory).forEach((r, k) => { if (!(s.enroll[r.user] || {})[r.courseId]) pairs.push([r.user, r.courseId]); });
    pairs.forEach(([name, cid]) => { const u = userBy.get(name), a = courseOf(s, cid); if (!u || !a || u.status === 'Deactivated') return;
      const d = detail(s, name, a); if (keep && !keep(u, a, d)) return;
      a.items.forEach((it, i) => { const m = d.mods[i], mod = it.moduleId ? s.lcms.find(x => x.id === it.moduleId) : null, z = it.kind === 'quiz' ? s.quizzes.find(q => q.id === it.quizId) : null;
        rows.push([u.empId, u.name, u.dept, u.role, a.code, a.title, a.essential ? 'Yes' : 'No', d.assignedOn, d.due, d.startedOn, d.completedOn, d.pct, d.status,
          i + 1, mod ? mod.code : '', mod ? mod.title : z ? z.name : it.title, MODULE_TYPE[it.kind] || it.kind, m.startedOn, m.completedOn, m.pct, m.attempts, m.best, d.source]); }); });
    return [head].concat(rows);
  }

  /* Deterministic sample learning records for the demo (replace with the API in production).
     Progress depends on how far into the assignment window the person is, so overdue courses are rarer
     than in-progress ones and dates stay between the assigned date and today. */
  function seedRecords(users, enroll, courses, assignedOnMap, fixed) {
    // Fast deterministic generator (handles 250k+ assignments): progress follows how far into the assignment
    // window the person is; completion dates stay between the assigned date and today.
    const out = {}, byId = new Map(courses.map(a => [a.id, a])), dayIdx = new Map(), keyAt = [];
    const dIndex = k => { let v = dayIdx.get(k); if (v === undefined) { v = Math.round((new Date(k + 'T12:00:00') - new Date(TODAY_KEY + 'T12:00:00')) / 86400000); dayIdx.set(k, v); } return v; };
    const dayKey = n => { const i = n + 400; if (keyAt[i] === undefined) keyAt[i] = plus(TODAY_KEY, n); return keyAt[i]; };
    let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    users.forEach(u => { const en = enroll[u.name]; if (!en) return; const pf = fixed && fixed[u.name];
      for (const cid in en) { const a = byId.get(cid); if (!a) continue;
        const n = a.items.length, dueN = dIndex(en[cid]), fromK = assignedOnMap[u.name + '|' + cid], fromN = Math.min(0, fromK ? dIndex(fromK) : dueN - 21), r = rnd();
        let k;
        if (pf && pf[cid] != null) k = Math.round(pf[cid] / 100 * n);
        else { const elapsed = -fromN, window = Math.max(1, dueN - fromN), expected = Math.min(1, elapsed / window);
          k = r < 0.18 ? 0 : Math.min(n, Math.round(n * Math.min(1, expected * (0.6 + r * 0.9)))); if (dueN < 0 && r > 0.35) k = n; }
        if (!k) continue;
        const rec = {}; let d = fromN;
        for (let i = 0; i < k; i++) { if (rnd() > 0.5) d++; if (d > 0) d = 0; const at = dayKey(d); rec[i] = a.items[i].kind === 'quiz' ? { at, score: 72 + Math.floor(rnd() * 27) } : at; }
        (out[u.name] = out[u.name] || {})[cid] = rec; } });
    return out;
  }
  /* A certificate is issued on completion only when the course has “Certificate” switched on (Course catalog › Availability & rules). */
  const hasCert = a => !!(a && a.features && a.features.cert === true);
  /* Steps of a course are stored by position. Each step also carries a stable id (uid) so that when an editor reorders,
   * removes or inserts steps, every learner's records can follow their step instead of staying at the old position. */
  const stepUid = (it, i) => (it && it.uid) || 'o' + i;
  /* old position -> new position (null = step removed). identity = nothing moved (steps only appended or edited). */
  function stepMap(oldItems, newItems) {
    const pos = new Map((newItems || []).map((it, j) => [stepUid(it, j), j]));
    const map = (oldItems || []).map((it, i) => { const j = pos.get(stepUid(it, i)); return j == null ? null : j; });
    return { map, identity: map.every((j, i) => j === i) };
  }
  /* Learner records of one course re-keyed to the new positions. Returns { patch, people, dropped }. */
  function remapCourse(s, cid, map) {
    const mv = obj => { if (!obj) return obj; const o = {}; let lost = 0; for (const k in obj) { const j = map[+k]; if (j == null) { lost++; continue; } o[j] = obj[k]; } return { o, lost }; };
    const patch = {}; let people = 0, dropped = 0;
    ['itemDone', 'itemQuiz'].forEach(coll => { const all = s[coll] || {}; let ch = null;
      for (const u in all) { const r = (all[u] || {})[cid]; if (!r || !Object.keys(r).length) continue;
        const m = mv(r); ch = ch || { ...all }; ch[u] = { ...all[u], [cid]: m.o }; if (coll === 'itemDone') { people++; dropped += m.lost; } }
      if (ch) patch[coll] = ch; });
    return { patch, people, dropped };
  }
  return { stepUid, stepMap, remapCourse, hasCert, isStepCourse, itemStates, courseDone, migrated, workingDeadline, workingDaysBetween, detail, assignedOn, plus, completionRows, myCourses, summary, seedRecords, hash, courseOf };
})();
