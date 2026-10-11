/* Skillforge LMS — Training feedback (Kirkpatrick L1–L4).
 *  Per course, each level has: on/off, audience (learner, manager or both), timing (on completion, or 30/60/90 days
 *  after it) and its questions (1–5 rating or free text). Every completion creates one send per level and recipient.
 *  Sends go out automatically on the due date, or an admin sends them from the schedule. Learners and managers answer
 *  from their Home page. Status: Scheduled → Due → Sent → Responded.
 */
const Feedback = {
  userIndex: (() => { let k = null, v = null; return users => { if (users !== k) { k = users; v = new Map(users.map(u => [u.name, u])); } return v; }; })(),
  /* People assigned to a course: an index built once per change of s.enroll. */
  assignees: (() => { let k = null, v = null; return (enroll, cid) => { if (enroll !== k) { k = enroll; v = new Map(); Object.keys(enroll).forEach(u => Object.keys(enroll[u] || {}).forEach(id => { if (!v.has(id)) v.set(id, []); v.get(id).push(u); })); } return v.get(cid) || []; }; })(),
  key: (cid, user, lv, to) => cid + '|' + user + '|' + lv + '|' + to,
  /* Forms are LCMS modules of type "Feedback form": each has a level, audience, timing and the courses and/or
     trainings it is sent for. A course or training gets at most one form per level. */
  forms: s => s.lcms.filter(m => m.type === 'Feedback form'),
  formFor(s, cid, lv) { const f = Feedback.forms(s).filter(m => m.level === lv); return f.find(m => (m.courses || []).includes(cid)) || f.find(m => m.applyAll) || null; },
  list(s) {
    const key = [s.lcms, s.fbLog, s.users, s.enroll, s.itemDone, s.itemQuiz, s.extHistory, s.adminCourses, s.batches];
    if (Feedback._k && key.every((x, i) => x === Feedback._k[i])) return Feedback._v;
    const out = [], userBy = Feedback.userIndex(s.users), forms = Feedback.forms(s);
    const push = (cid, label, u, f, doneOn) => { const due = Progress.plus(doneOn, f.days || 0), to = [];
      if (f.audience !== 'Manager') to.push([u.name, 'Learner']);
      if (f.audience !== 'Learner' && u.manager && u.manager !== 'None') to.push([u.manager, 'Manager']);
      to.forEach(([who, as]) => { const k = Feedback.key(cid, u.name, f.level, who), log = (s.fbLog || {})[k] || {};
        const status = log.response ? 'Responded' : log.sentAt ? 'Sent' : due > TODAY_KEY ? 'Scheduled' : f.manual ? 'Due' : 'Sent';
        out.push({ k, cid, course: label, form: f, learner: u.name, to: who, as, lv: f.level, completedOn: doneOn, due, status, sentAt: log.sentAt || (status === 'Sent' ? due + 'T09:00' : ''), response: log.response || null }); }); };
    // courses: completion date from the learning records (cheap pass over the raw records)
    const courseIds = new Set(); let all = false;
    forms.forEach(f => { if (f.applyAll) all = true; (f.courses || []).forEach(c => courseIds.add(c)); });
    const doneOn = (u, a) => { const r = (s.itemDone[u.name] || {})[a.id]; const mig = Progress.migrated(s, u.name, a.id); if (mig) return mig.completedOn;
      if (!r) return ''; let n = 0, last = ''; for (const i in r) { n++; const v = r[i], at = typeof v === 'string' ? v : v.at; if (at > last) last = at; } return n >= a.items.length ? last : ''; };
    const visit = (u, a) => { const d = doneOn(u, a); if (!d) return; KP_LEVELS.forEach(([lv]) => { const f = Feedback.formFor(s, a.id, lv); if (f) push(a.id, { title: a.title, code: a.code }, u, f, d); }); };
    if (all) s.users.forEach(u => { if (u.status === 'Deactivated') return; const en = s.enroll[u.name]; if (en) for (const cid in en) { const a = Progress.courseOf(s, cid); if (a) visit(u, a); } });
    else courseIds.forEach(cid => { const a = Progress.courseOf(s, cid); if (!a) return; const names = new Set(Feedback.assignees(s.enroll, cid)); (s.extHistory || []).forEach(r => { if (r.courseId === cid && r.status === 'Completed') names.add(r.user); });
      names.forEach(n => { const u = userBy.get(n); if (u && u.status !== 'Deactivated') visit(u, a); }); });
    // trainings: everyone still in the programme or handed over, once the classroom ends
    const tf = forms.filter(f => (f.trainings || []).length);
    if (tf.length) s.batches.forEach(b => { if (!b.trainingName || b.end >= TODAY_KEY) return; const fs = tf.filter(f => f.trainings.includes(b.trainingName)); if (!fs.length) return;
      b.trainees.forEach(n => { const l = (b.st || {})[n] || [], e = l[l.length - 1], st = e ? (s.statuses.find(x => x.id === e.status) || {}).type : 'active';
        if (['attrition', 'noshow', 'moved'].includes(st)) return; const u = userBy.get(n); if (!u) return;
        fs.forEach(f => push('tr:' + b.id, { title: b.trainingName + ' · ' + b.code, code: b.code }, u, f, b.end)); }); });
    Feedback._k = key; Feedback._v = out.sort((x, y) => y.due.localeCompare(x.due)); return Feedback._v;
  },
};

/* Settings › Reports › Feedback responses: who was asked, who answered and the results, per course or training.
   The forms themselves are built in LCMS (+ Feedback form). */
SkillforgeApp.prototype.amFeedback = function (c) {
  const { s, INK, W } = c;
  // v36: shown inside Reports (Kirkpatrick L1–L4 analysis), for people with the Training feedback or Reports permission.
  const P = this._perms || new Set();
  if (!(this._scrV === 'reports' && s.repType === 'kirkpatrick' && (P.has('feedback') || P.has('reports')))) return { isFeedback:false };
  const fmtD = k => k ? Fmt.medium(k) : '—';
  const all = Feedback.list(s), srcs = new Map(); all.forEach(x => { if (!srcs.has(x.cid)) srcs.set(x.cid, x.course); });
  const srcList = [...srcs.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  const cid = srcs.has(s.fbCourse) ? s.fbCourse : (srcList[0] || [''])[0], src = srcs.get(cid) || { title:'—' };
  const mine = all.filter(x => x.cid === cid), shown = mine.filter(x => s.fbFilter === 'All' || x.status === s.fbFilter);
  const ST = { Scheduled:['#EAF1F6', '#526B7A'], Due:['#FEF3C7', '#92400E'], Sent:['#DBEAFE', '#1E40AF'], Responded:['#DCFCE7', '#166534'] };
  const send = list => { if (!list.length) return this.toastMsg('Nothing due to send'); const now = nowStamp();
    this.setState(st => { const log = { ...st.fbLog }; list.forEach(x => { log[x.k] = { ...(log[x.k] || {}), sentAt: now }; }); return { fbLog: log }; });
    this.toastMsg(list.length + (list.length === 1 ? ' feedback request sent' : ' feedback requests sent')); };
  const formsHere = [...new Set(mine.map(x => x.form))].sort((a, b) => a.level.localeCompare(b.level));
  const results = formsHere.map(f => { const got = mine.filter(x => x.form === f && x.response), sent = mine.filter(x => x.form === f && ['Sent', 'Responded'].includes(x.status));
    return { lv: f.level, name: f.title, line: got.length + ' of ' + sent.length + ' responded',
      qs: f.qs.map((q, qi) => { if (q.kind !== 'rating') return { t: q.t, v: got.filter(x => x.response.answers[qi]).length + ' comments', isRating:false };
        const vals = got.map(x => +x.response.answers[qi]).filter(v => v > 0), avg = vals.length ? (vals.reduce((t, v) => t + v, 0) / vals.length).toFixed(1) : '—';
        return { t: q.t, v: avg === '—' ? '—' : avg + ' / 5', w: avg === '—' ? '0%' : (avg / 5 * 100) + '%', isRating:true }; }) }; });
  return {
    isFeedback: true, fbHas: srcList.length > 0, fbNone: !srcList.length,
    fbCourseOpts: srcList.map(([k, v]) => ({ v: k, l: (k.startsWith('tr:') ? 'Training · ' : 'Course · ') + (k.startsWith('tr:') ? v.title : v.code + ' · ' + v.title) })), fbCourseVal: cid, setFbCourse: e => this.setState({ fbCourse: e.target.value }),
    fbForms: formsHere.map(f => ({ lv: f.level, title: f.title, sub: f.audience + ' · ' + (f.days ? f.days + ' days after' : 'on completion') + ' · ' + f.qs.length + ' questions', edit: () => this.go('lcms', { adminView:true, lcmsQuery: f.code, lcmsType:'All' }) })),
    goForms: () => this.go('lcms', { adminView:true, lcmsType:'Feedback form', lcmsQuery:'' }),
    fbChips: ['Due', 'Sent', 'Responded', 'Scheduled', 'All'].map(v => UI.chip(s.fbFilter, v, v + ' · ' + (v === 'All' ? mine.length : mine.filter(x => x.status === v).length), () => this.setState({ fbFilter: v }))),
    fbRows: shown.slice(0, 80).map(x => ({ learner: x.learner, to: x.to, as: x.as, lv: x.lv, done: fmtD(x.completedOn), due: fmtD(x.due), status: x.status, sBg: ST[x.status][0], sFg: ST[x.status][1],
      canSend: x.status === 'Due', canRemind: x.status === 'Sent', send: () => send([x]), remind: () => this.sendNudges([x.to], null, 'feedback is waiting for ' + x.learner + ' · ' + x.course) })),
    fbEmpty: !shown.length, fbSendAll: () => send(mine.filter(x => x.status === 'Due')), fbDueN: mine.filter(x => x.status === 'Due').length,
    fbResults: results, fbNoResults: !results.length, fbSrcTitle: src.title,
    fbExport: () => { const rows = [['Course / training', 'Form', 'Level', 'Learner', 'Recipient', 'As', 'Completed on', 'Due', 'Status', 'Responded at'].concat(['Q1', 'Q2', 'Q3', 'Q4', 'Q5'])];
      all.forEach(x => rows.push([x.course.title, x.form.title, x.lv, x.learner, x.to, x.as, x.completedOn, x.due, x.status, x.response ? x.response.at.replace('T', ' ') : ''].concat(x.response ? x.response.answers : [])));
      csvDownload('feedback-responses-' + TODAY_KEY + '.csv', rows); this.toastMsg(all.length + ' feedback rows exported'); },
  };
};

/* Learners and managers: feedback waiting for me (Home) and the answer form. */
SkillforgeApp.prototype.vmFeedback = function (c) {
  const { s, role } = c;
  if (!s.authed) return { fbMine:[], fbHasMine:false, fbFormOpen:false };
  const mine = Feedback.list(s).filter(x => x.to === role.name && x.status === 'Sent');
  const F = s.fbForm, cur = F && mine.find(x => x.k === F.k);
  const lvName = lv => (KP_LEVELS.find(x => x[0] === lv) || [])[1];
  let form = { fbFormOpen:false };
  if (cur) { const cfg = cur.form;
    form = { fbFormOpen:true, fbF: { title: cur.course.title, sub: lvName(cur.lv) + ' feedback' + (cur.as === 'Manager' ? ' about ' + cur.learner : ''), err: F.err || '' }, fbFErr: !!F.err,
      fbFQs: cfg.qs.map((q, i) => ({ t: q.t, n: i + 1, isRating: q.kind === 'rating', isText: q.kind !== 'rating', val: F.ans[i] || '',
        opts: [1, 2, 3, 4, 5].map(v => UI.chip(F.ans[i], v, String(v), () => this.setState(st => ({ fbForm: { ...st.fbForm, err:'', ans: { ...st.fbForm.ans, [i]: v } } })))),
        set: e => { const v = e.target.value; this.setState(st => ({ fbForm: { ...st.fbForm, err:'', ans: { ...st.fbForm.ans, [i]: v } } })); } })),
      fbFClose: () => this.setState({ fbForm:null }),
      fbFSubmit: () => { const miss = cfg.qs.findIndex((q, i) => q.kind === 'rating' && !F.ans[i]); if (miss >= 0) return this.setState({ fbForm: { ...F, err:'Rate question ' + (miss + 1) + '.' } });
        if (Backend.on) { Backend.call('answerFeedback', { key: Backend.fbKey(cur.k), formId: cur.form.id, answers: cfg.qs.map((q, i) => F.ans[i] || '') }).then(() => { this.setState({ fbForm:null }); this.toastMsg('Thanks — feedback submitted'); }).catch(e => this.setState({ fbForm: { ...F, err: e.message } })); return; }
        this.setState(st => ({ fbForm:null, fbLog: { ...st.fbLog, [cur.k]: { ...(st.fbLog[cur.k] || { sentAt: cur.sentAt }), response:{ at: nowStamp(), answers: cfg.qs.map((q, i) => F.ans[i] || '') } } } }));
        this.toastMsg('Thanks — feedback submitted'); } };
  }
  return { ...form, fbHasMine: mine.length > 0,
    fbMine: mine.map(x => ({ title: x.course.title, sub: x.form.title + (x.as === 'Manager' ? ' · about ' + x.learner : '') + ' · requested ' + new Date(x.due + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }),
      open: () => this.setState({ fbForm: { k: x.k, ans:{}, err:'' } }) })) };
};
