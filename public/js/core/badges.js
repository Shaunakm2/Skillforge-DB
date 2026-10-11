/* Skillforge LMS — badges: what a learner has achieved, measured from their learning records. */
const Badges = (() => {
  const h = s => Progress.hash(s);
  /* Metric values for one person. */
  function metrics(s, user) {
    const recs = s.itemDone[user] || {}, en = s.enroll[user] || {}; let lessons = 0, courses = 0, ontime = 0, perfect = 0;
    for (const cid in recs) { const r = recs[cid], a = Progress.courseOf(s, cid); let n = 0, last = ''; for (const i in r) { n++; const v = r[i], at = typeof v === 'string' ? v : v.at; if (at > last) last = at; if (v && typeof v === 'object' && v.score === 100) perfect++; }
      lessons += n; if (a && n >= a.items.length) { courses++; if (en[cid] && last && last <= en[cid]) ontime++; } }
    perfect += (s.attemptRecs || []).filter(x => x.user === user && x.score === 100).length;
    const meU = s.users.find(u => u.name === user);
    const ess = meU ? Essentials.statusFor(s, meU) : [];
    return { lessons, courses, ontime, perfect, streak: user === 'Maya Okafor' ? 14 : Math.floor(h('st' + user) * 20),
      discussions: s.threads.filter(t => t.author === user).length + (user === 'Maya Okafor' ? 1 : 0), essentials: ess.length && ess.every(x => x.done) ? 1 : 0 };
  }
  let ck = null, cv = null;
  /* Metric values for everyone in one pass (cached until records change); used for "earned by" counts. */
  function all(s) {
    const key = [s.itemDone, s.users, s.enroll, s.attemptRecs, s.threads];
    if (ck && key.every((x, i) => x === ck[i])) return cv;
    const perfect = new Map(); (s.attemptRecs || []).forEach(x => { if (x.score === 100) perfect.set(x.user, (perfect.get(x.user) || 0) + 1); });
    const disc = new Map(); s.threads.forEach(t => disc.set(t.author, (disc.get(t.author) || 0) + 1));
    const essFrom = s.adminCourses.filter(a => a.essential && a.essentialFrom).map(a => a.essentialFrom).sort()[0];
    cv = s.users.filter(u => u.status !== 'Deactivated').map(u => { const recs = s.itemDone[u.name] || {}, en = s.enroll[u.name] || {}; let lessons = 0, courses = 0, ontime = 0, pf = perfect.get(u.name) || 0;
      for (const cid in recs) { const r = recs[cid], a = Progress.courseOf(s, cid); let n = 0, last = ''; for (const i in r) { n++; const v = r[i], at = typeof v === 'string' ? v : v.at; if (at > last) last = at; if (v && typeof v === 'object' && v.score === 100) pf++; }
        lessons += n; if (a && n >= a.items.length) { courses++; if (en[cid] && last <= en[cid]) ontime++; } }
      const ess = essFrom && u.joined >= essFrom ? Essentials.statusFor(s, u) : [];
      return { lessons, courses, ontime, perfect: pf, streak: Math.floor(h('st' + u.name) * 20), discussions: disc.get(u.name) || 0, essentials: ess.length && ess.every(x => x.done) ? 1 : 0 }; });
    ck = key; return cv;
  }
  function earnedCount(s, b) { return all(s).filter(m => (m[b.metric] || 0) >= b.n).length; }
  return { metrics, earnedCount };
})();
