/* Skillforge LMS — production-scale data set, for checking that every screen stays fast at real volumes.
 *  3,500 employees (as they would arrive from the ZingHR employee master), one 1,000-course catalogue,
 *  25–50 assignments per person (~125,000) and ~600,000 module-level learning records. Loaded by default;
 *  open index.html?small=1 for the small demo data set only.
 *  Deterministic: the same numbers every time.
 */
const ScaleData = (() => {
  const h = Progress.hash;
  const FIRST = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Shaurya','Ananya','Diya','Aadhya','Saanvi','Pari','Anika','Navya','Myra','Kiara','Riya','Rahul','Priya','Neha','Rohit','Pooja','Karan','Sneha','Amit','Kavya','Vikram','Meera','Nikhil','Tanvi','Harsh','Isha','Dev','Nisha','Yash','Aisha','Kabir'];
  const LAST = ['Shah','Patel','Mehta','Desai','Joshi','Trivedi','Iyer','Nair','Rao','Reddy','Kapoor','Malhotra','Gupta','Sharma','Verma','Singh','Chopra','Bose','Das','Pillai','Kulkarni','Shetty','Menon','Bhatt','Parikh','Vyas','Pandya','Chauhan','Saxena','Agarwal'];
  const SITES = ['Ahmedabad', 'Pune', 'Bengaluru', 'Gurugram', 'Hyderabad'];
  const GRADES = ['L1', 'L2', 'L3', 'M1', 'M2'];
  const TOPICS = [['Leadership','c1'],['Communication','c2'],['Self-management','c3'],['Collaboration','c4'],['Compliance','c5']];
  const WORDS = ['Essentials','Foundations','Masterclass','Refresher','Bootcamp','in Practice','for Managers','Deep Dive','Toolkit','Certification'];
  const SUBJ = ['Customer Empathy','Data Privacy','Objection Handling','Time Management','Negotiation','Stakeholder Mapping','Conflict Resolution','Business Writing','Excel for Analysts','Coaching','Remote Collaboration','Information Security','POSH Awareness','Anti-bribery','Quality Audits','Escalation Handling','Product Knowledge','Sales Discovery','Presentation Skills','Feedback'];
  const KINDS = ['pdf', 'video', 'scorm', 'lesson', 'quiz', 'video', 'pdf', 'lesson'];

  function build(base, nUsers, nCourses) {
    nUsers = nUsers || 3500; nCourses = nCourses || 1000;
    const users = base.users.slice(), courses = base.adminCourses.slice(), start = users.length;
    const managers = [];
    for (let i = 0; i < nUsers - start; i++) {
      const fn = FIRST[Math.floor(h('f' + i) * FIRST.length)], ln = LAST[Math.floor(h('l' + i) * LAST.length)], name = fn + ' ' + ln + ' ' + (1000 + i);
      const dept = DEPTS[Math.floor(h('d' + i) * DEPTS.length)], isMgr = i % 25 === 0, isTr = i % 180 === 7;
      const joined = '20' + (18 + Math.floor(h('j' + i) * 9)) + '-' + String(1 + Math.floor(h('jm' + i) * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(h('jd' + i) * 27)).padStart(2, '0');
      const u = { id: 10000 + i, name, email: (fn + '.' + ln + (1000 + i)).toLowerCase() + '@example.com', role: isTr ? 'Trainer' : 'Learner', roleId: isTr ? 'r_trainer' : 'r_learner',
        dept, status: h('s' + i) < 0.04 ? 'Deactivated' : 'Active', lastLogin: h('ll' + i) < 0.5 ? 'Today' : 'This week', manager: managers.length ? managers[i % managers.length] : 'Priya Raman',
        empId: 'ZH' + String(200000 + i), phone: '+91 9' + String(800000000 + Math.floor(h('p' + i) * 199999999)).slice(0, 9), gender: h('g' + i) < 0.5 ? 'Female' : 'Male', terms: true,
        designation: isMgr ? 'Team Manager' : isTr ? 'Trainer' : 'Associate', joined: joined > TODAY_KEY ? TODAY_KEY : joined,
        site: SITES[i % SITES.length], grade: isMgr ? 'M1' : GRADES[Math.floor(h('gr' + i) * 3)], source:'ZingHR' };
      if (isMgr) managers.push(name);
      users.push(u);
    }
    const modIds = base.lcms.map(m => m.id);
    const seenT = new Set(courses.map(c => c.title.toLowerCase()));
    for (let i = courses.length; i < nCourses; i++) {
      const t = TOPICS[i % TOPICS.length], subj = SUBJ[Math.floor(h('sj' + i) * SUBJ.length)], w = WORDS[Math.floor(h('w' + i) * WORDS.length)];
      const n = 3 + Math.floor(h('n' + i) * 5), items = [];
      for (let k = 0; k < n; k++) { const kind = k === n - 1 && h('q' + i) < 0.7 ? 'quiz' : KINDS[Math.floor(h('k' + i + k) * KINDS.length)];
        items.push(kind === 'quiz' ? { kind:'quiz', quizId: 1 + (i % 4) } : { kind, title: subj + ' · part ' + (k + 1), mins: 5 + Math.floor(h('m' + i + k) * 25), moduleId: modIds[(i + k) % modIds.length] }); }
      // v32: titles are unique (959 of 1,000 sample courses used to share a title, so none of them could be edited)
      let ttl = subj + ' ' + w + ' ' + (Math.floor(i / SUBJ.length) + 1), tn = Math.floor(i / SUBJ.length) + 1; while (seenT.has(ttl.toLowerCase())) ttl = subj + ' ' + w + ' ' + (++tn); seenT.add(ttl.toLowerCase());
      courses.push({ id:'sc' + i, code:'CRS-' + (1001 + i), title: ttl, cat: t[0], catId: t[1], subId: '', subsubId: '', color: VIVIDS[i % 7], status: h('st' + i) < 0.06 ? 'Draft' : 'Published',
        enrolled: 0, desc:'', items, features: { ...blankFeatures(), linear: i % 3 !== 0, cert: h('ct' + i) < 0.4 }, reports:{ learning:true, completion:true, progress:true, login:false, coursewise:true }, depts:{}, due:'2026-12-31', enroll:'Manual', recert:'Never', lang:'English',
        active:true, availFrom:'', availUntil:'', icon:null, banner:null, author:'L&D team', director:'', about:'', aud:'Assign later', groups:{}, people:{}, autoNew:false, essential:false, essentialDays:30, essentialFrom:'' });
    }
    // Assignments: 25–50 courses per person at any time (out of the same 1,000-course catalogue) (a stride through the catalogue, so no duplicates),
    // due dates spread over the last 3 months and next 4 months. Dates are precomputed once (no Date maths per row).
    const enroll = { ...base.enroll }, assignedOn = { ...base.assignedOn }, pub = courses.filter(c => c.status === 'Published'), P = pub.length;
    const DUE = [], ON = []; for (let d = -90; d <= 120; d++) { const k = Progress.plus(TODAY_KEY, d); DUE.push(k); const o = Progress.plus(TODAY_KEY, d - 30); ON.push(o > TODAY_KEY ? TODAY_KEY : o); }
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    users.slice(start).forEach((u, ui) => { if (u.status !== 'Active') return; const m = {}, k = 25 + Math.floor(rnd() * 26), off = Math.floor(rnd() * P), step = 1 + 2 * Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) { const c = pub[(off + j * step) % P]; if (m[c.id]) continue; const di = Math.floor(rnd() * DUE.length); m[c.id] = DUE[di]; assignedOn[u.name + '|' + c.id] = ON[di]; }
      enroll[u.name] = m; });
    const recs = Progress.seedRecords(users.slice(start), enroll, courses, assignedOn);
    const itemDone = { ...base.itemDone, ...recs };
    let modules = 0, assignments = 0; Object.values(enroll).forEach(m => { assignments += Object.keys(m).length; });
    Object.values(recs).forEach(cs => Object.values(cs).forEach(r => { modules += Object.keys(r).length; }));
    const byId = new Map(courses.map(c => [c.id, c]));
    const totalModules = Object.values(enroll).reduce((t, m) => t + Object.keys(m).reduce((x, cid) => x + ((byId.get(cid) || { items:[] }).items.length), 0), 0);
    // MIS profile for everyone (division, sub division, brand, location…) and a year of training batches.
    const profiled = users.map((u, i) => TrainingGen.profile(u, i));
    const TG = TrainingGen.build(base, profiled);
    const usersOut = TG.users;
    const batches = base.batches.concat(TG.batches), ttypes = base.ttypes.concat(TG.ttypes.filter(t => !base.ttypes.some(x => x.id === t.id)));
    return { users: usersOut, batches, ttypes, adminCourses: courses, enroll, assignedOn, itemDone, stats: { batches: batches.length, participants: TG.batches.reduce((t, b) => t + b.trainees.length, 0), users: users.length, active: users.filter(u => u.status === 'Active').length, courses: courses.length, assignments, moduleRecords: totalModules, completedModules: modules } };
  }
  return { build };
})();
