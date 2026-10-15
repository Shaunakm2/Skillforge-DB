/* Skillforge LMS — badges and streaks: what a learner has achieved, measured ONLY from their real learning records.
 *
 * Source of every number (nothing is sampled, hashed or hard-coded):
 *   s.itemDone[user][courseId][stepIndex]   a completed step: 'YYYY-MM-DD' or { at, score }   (the database "itemDone" records)
 *   s.enroll[user][courseId]                 the person's due date for each assigned course
 *   s.extHistory                             completions imported from another LMS (count as completed courses)
 *   s.attemptRecs                            assessment attempts (a score of 100 counts as a perfect assessment)
 *   s.threads                                discussion threads (author = the person)
 *   Essentials.statusFor                     essential-training status
 *
 * Connected, a learner can read their own records from the database, so their own badges and streak are always real.
 * Streak = number of consecutive calendar days, ending today (or yesterday), on which the person completed at least one step.
 * (Set STREAK_SKIP_WEEKENDS to true if Saturday and Sunday should not break a streak.)
 */
const Badges = (() => {
  const STREAK_SKIP_WEEKENDS = false;

  const dayOf = v => { const at = typeof v === 'string' ? v : v && v.at; return at ? String(at).slice(0, 10) : ''; };
  const isWeekend = k => { const w = new Date(k + 'T12:00:00').getDay(); return w === 0 || w === 6; };

  /* Calendar days (YYYY-MM-DD) on which the person completed at least one step. */
  function activeDays(s, user) {
    const out = new Set(), recs = (s.itemDone && s.itemDone[user]) || {};
    for (const cid in recs) { const r = recs[cid] || {}; for (const i in r) { if (!r[i]) continue; const d = dayOf(r[i]); if (d) out.add(d); } }
    return out;
  }

  /* Consecutive active days ending today (or yesterday, so the streak is not lost before today's first step). */
  function streakFrom(days) {
    let k = TODAY_KEY, n = 0;
    if (!days.has(k)) k = Progress.plus(k, -1);
    for (let guard = 0; guard < 5000; guard++) {
      if (STREAK_SKIP_WEEKENDS && isWeekend(k)) { k = Progress.plus(k, -1); continue; }
      if (!days.has(k)) break;
      n++; k = Progress.plus(k, -1);
    }
    return n;
  }
  const streakOf = (s, user) => streakFrom(activeDays(s, user));

  /* Monday to Sunday of the current week: which days had learning activity (for the "This week" ticks on Home). */
  function weekStrip(s, user) {
    const days = activeDays(s, user), dow = (new Date(TODAY_KEY + 'T12:00:00').getDay() + 6) % 7, start = Progress.plus(TODAY_KEY, -dow);
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => { const key = Progress.plus(start, i);
      return { label, key, done: days.has(key), today: key === TODAY_KEY, future: key > TODAY_KEY }; });
  }

  /* One person's metric values, worked out once from their records. perfectAttempts and discussions are passed in so the
     "everyone" pass can count them in one sweep; ess is the essential-training status list (or [] when it does not apply). */
  function compute(s, user, perfectAttempts, discussions, ess) {
    const recs = (s.itemDone && s.itemDone[user]) || {}, en = (s.enroll && s.enroll[user]) || {}, days = new Set(), seen = new Set();
    let lessons = 0, courses = 0, ontime = 0, perfect = perfectAttempts || 0;
    for (const cid in recs) {
      const r = recs[cid] || {}, a = Progress.courseOf(s, cid); let n = 0, last = '';
      for (const i in r) {
        const v = r[i]; if (!v) continue; n++;
        const d = dayOf(v); if (d) { days.add(d); if (d > last) last = d; }
        if (typeof v === 'object' && v.score != null && +v.score === 100) perfect++;
      }
      lessons += n;
      if (a && a.items.length > 0 && n >= a.items.length) { courses++; seen.add(cid); if (en[cid] && last && last <= String(en[cid]).slice(0, 10)) ontime++; }
    }
    // completions imported from another LMS count as completed courses, the same rule as XP and the dashboards
    (s.extHistory || []).forEach(x => { const cid = x.courseId || x.extCourse;
      if (x.user !== user || x.status !== 'Completed' || !cid || seen.has(cid)) return;
      seen.add(cid); courses++; if (en[cid] && x.completedOn && String(x.completedOn).slice(0, 10) <= String(en[cid]).slice(0, 10)) ontime++; });
    return { lessons, courses, ontime, perfect, streak: streakFrom(days), discussions: discussions || 0, essentials: ess && ess.length && ess.every(x => x.done) ? 1 : 0 };
  }

  const perfectCount = (s, user) => (s.attemptRecs || []).filter(x => x.user === user && x.score === 100).length;
  const discussionCount = (s, user) => (s.threads || []).filter(t => t.author === user).length;

  /* Metric values for one person (used for "my badges" and the streak). */
  function metrics(s, user) {
    const meU = s.users.find(u => u.name === user), ess = meU ? Essentials.statusFor(s, meU) : [];
    return compute(s, user, perfectCount(s, user), discussionCount(s, user), ess);
  }

  let ck = null, cv = null;
  /* Metric values for everyone in one pass (cached until the records change); used for the "earned by" counts. */
  function all(s) {
    const key = [s.itemDone, s.users, s.enroll, s.attemptRecs, s.threads, s.extHistory, s.adminCourses, TODAY_KEY];
    if (ck && key.every((x, i) => x === ck[i])) return cv;
    const perfect = new Map(); (s.attemptRecs || []).forEach(x => { if (x.score === 100) perfect.set(x.user, (perfect.get(x.user) || 0) + 1); });
    const disc = new Map(); (s.threads || []).forEach(t => disc.set(t.author, (disc.get(t.author) || 0) + 1));
    const essFrom = s.adminCourses.filter(a => a.essential && a.essentialFrom).map(a => a.essentialFrom).sort()[0];
    cv = s.users.filter(u => u.status !== 'Deactivated').map(u => {
      const ess = essFrom && u.joined >= essFrom ? Essentials.statusFor(s, u) : [];
      return compute(s, u.name, perfect.get(u.name) || 0, disc.get(u.name) || 0, ess); });
    ck = key; return cv;
  }

  function earnedCount(s, b) { return all(s).filter(m => (m[b.metric] || 0) >= b.n).length; }

  return { metrics, all, earnedCount, streakOf, activeDays, weekStrip };
})();
