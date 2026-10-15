/* Skillforge LMS — trainer and admin tools shown inside the main app: course builder, per-person
 * course assignment pop-up, gradebook, written-answer reviews, team view, analytics and report filters. */
SkillforgeApp.prototype.vmStaffTools = function (c) {
  const { all, role, s } = c;
  // builder
  const [bmi, bli] = s.bSel.split('-').map(Number);
  const bl = (s.bMods[bmi] && s.bMods[bmi].lessons[bli]) || s.bMods[0].lessons[0];
  const TG = { Video:['▶', '#E7F0F7', '#7A4A06'], Reading:['≡', '#E3F1EE', '#245E52'], Quiz:['?', '#F1E7F4', '#6E4380'], Activity:['✎', '#FDECEC', '#A63232'] };
  const bModules = s.bMods.map((m, mi) => ({ n: mi + 1, title: m.title, count: m.lessons.length,
    lessons: m.lessons.map((l, li) => { const sel = s.bSel === mi + '-' + li; return { ...l, glyph:TG[l.type][0], typeBg:TG[l.type][1], typeFg:TG[l.type][2], border: sel ? '#0066A1' : 'transparent', bg: sel ? '#EDF5FA' : '#F4F8FC', pick: () => this.setState({ bSel: mi + '-' + li }) }; }),
    add: () => this.setState(st => ({ bMods: st.bMods.map((x, i) => i !== mi ? x : { ...x, lessons:[...x.lessons, { title:'Untitled lesson', type:'Video', dur:5, xp:50, desc:'' }] }), bSel: mi + '-' + st.bMods[mi].lessons.length })) }));
  // course assignments (trainer, admin, super admin)
  const canAssign = ['instructor', 'admin', 'super'].includes(s.role) || role.admin;
  const trainees = s.enrModal ? s.users.filter(u => u.status !== 'Deactivated') : [];
  const enrUser = s.enrModal ? (s.enrModal.user || '') : '';
  const enrMine = s.enroll[enrUser] || {};
  const plus30 = (() => { const d = new Date(TODAY_KEY + 'T12:00:00'); d.setDate(d.getDate() + 30); return dateKey(d); })();
  const setEnr = (cid, due) => this.setState(st => { const cur = { ...(st.enroll[enrUser] || {}) }; if (due === null) delete cur[cid]; else cur[cid] = due; return { enroll: { ...st.enroll, [enrUser]: cur } }; });
  // Person's course list: assigned courses first (with due date + Unassign), then a search to add more.
  // Never lists all 1,000 courses or a 3,500-name dropdown.
  const eq = ((s.enrModal || {}).q || '').trim().toLowerCase(), eu = s.users.find(u => u.name === enrUser) || {};
  const rowOf = (c, on) => { const av = availability(c), d = on ? Progress.detail(s, enrUser, c) : null; return { title: c.title, code: c.code, color: c.color, hasIcon: !!(c.icon && c.icon.src), noIcon: !(c.icon && c.icon.src), iconSrc: c.icon ? c.icon.src : '',
    sub: c.code + ' · ' + (d ? d.status + ' · ' + d.pct + '%' : c.cat) + (av !== 'Active' ? ' · ' + av : ''), on, off: !on, due: enrMine[c.id] || '', rowBg: on ? '#F3FBF8' : '#FFFFFF', rowBd: on ? '#BFE3D8' : '#D7E3EC',
    setDue: e => { if (e.target.value) setEnr(c.id, e.target.value); }, assign: () => { setEnr(c.id, c.due && c.due >= TODAY_KEY ? c.due : plus30); this.setState(st => ({ assignedOn: { ...st.assignedOn, [enrUser + '|' + c.id]: TODAY_KEY } })); this.toastMsg(c.title + ' assigned to ' + enrUser.split(' ')[0]); },
    unassign: () => { setEnr(c.id, null); this.toastMsg(c.title + ' unassigned from ' + enrUser.split(' ')[0] + (d && d.pct ? '. Progress is kept if assigned again.' : '')); } }; };
  const enrAssigned = s.enrModal ? Object.keys(enrMine).map(id => Progress.courseOf(s, id)).filter(Boolean).filter(c => !eq || (c.title + ' ' + c.code).toLowerCase().includes(eq)).sort((a, b) => (enrMine[a.id] || '').localeCompare(enrMine[b.id] || '')) : [];
  const enrFind = s.enrModal && eq ? s.adminCourses.filter(c => c.status === 'Published' && !enrMine[c.id] && (c.title + ' ' + c.code).toLowerCase().includes(eq)).slice(0, 20) : [];
  const EPG = Pager(this, s, 'enr-' + enrUser, enrAssigned, 25);
  const enrRows = EPG.rows.map(c => rowOf(c, true)).concat(enrFind.map(c => rowOf(c, false)));
  const ep = { ...(s.enrModal || {}), param:'empId' }, eUp = s.enrModal ? pickUser(this, { ...s, enrPick: s.enrPick || { param:'empId', q:'', sel:null } }, 'enrPick', trainees) : null;
  const enrVals = { enrModal: !!s.enrModal, enrUser, enrUserSub: eu.empId ? eu.empId + ' · ' + eu.dept : '', enrRows, enrPager: EPG.pager, enrQ: (s.enrModal || {}).q || '',
    setEnrQ: e => { const v = e.target.value; this.setState(st => ({ enrModal: { ...st.enrModal, q: v } })); },
    enrHint: eq ? (enrFind.length ? 'Courses matching “' + eq + '” that aren’t assigned yet are listed after the assigned ones.' : 'No unassigned courses match “' + eq + '”.') : 'Search to filter assigned courses or find new ones to assign.',
    enrPickUp: eUp, enrChangeUser: () => this.setState({ enrPick: { param:'empId', q:'', sel:null }, enrModal: { ...s.enrModal, picking:true } }), enrPicking: !!(s.enrModal || {}).picking || !enrUser,
    enrUsePick: () => { const u = eUp && eUp.chosen; if (!u) return this.toastMsg('Pick a person from the list'); this.setState({ enrModal: { user: u.name, q:'' }, enrPick:null }); },
    enrCount: Object.keys(enrMine).length + (Object.keys(enrMine).length === 1 ? ' course assigned' : ' courses assigned'),
    closeEnr: () => this.setState({ enrModal:null, enrPick:null }), openEnr: () => this.setState({ enrModal: { user:'', picking:true } }), canAssign };
  // gradebook
  // v41.21: who a grader sees: admins and "Gradebook: all learners" (gradeAll) see everyone; others see the trainees of the
  // batches they train (never themselves; a trainee in one batch can be the trainer of another: train-the-trainer).
  const gbAllPeople = !!role.admin || (this._perms || new Set()).has('gradeAll');
  const myTrainees = new Set((s.batches || []).filter(b => b.trainer === role.name).flatMap(b => b.trainees || []).filter(n => n !== role.name));
  const myTraineeEmps = new Set([...myTrainees].map(n => (s.users.find(u => u.name === n) || {}).empId).filter(Boolean));
  const gbSees = (name, emp) => gbAllPeople || myTrainees.has(name) || (!!emp && myTraineeEmps.has(emp));
  const gq = s.gbQuery.trim().toLowerCase();
  const cell = v => v === null ? { v:'—', bg:'#EAF1F6', fg:'#526B7A' } : { v, bg: v >= 85 ? '#E3F1EE' : v >= 70 ? '#E7F0F7' : '#FDECEC', fg: v >= 85 ? '#245E52' : v >= 70 ? '#7A4A06' : '#A63232' };
  // v36: real gradebook (it was a fixed sample table). One row per learner and course with assessments: assessments done,
  // best and lowest best-score, average, status. Trainers see the trainees of their batches; admins see everyone.
  // Built only on the Gradebook screen.
  const gbAll = this._scrV !== 'gradebook' ? [] : (() => { const me = role.name, adm = gbAllPeople;
    const names = adm ? [...new Set(Object.keys(s.itemQuiz || {}).concat(Object.keys(s.attemptsUsed || {})))] : [...new Set((s.batches || []).filter(b => b.trainer === me).flatMap(b => b.trainees || []))];
    const out = []; names.forEach(n => { const u = s.users.find(x => x.name === n); if (!u || u.status === 'Deactivated') return;
      Progress.myCourses(s, n).forEach(({ a, d }) => { const qi = a.items.map((it, i) => it.kind === 'quiz' ? i : -1).filter(i => i >= 0); if (!qi.length) return;
        const sc = qi.map(i => d.mods[i]).filter(m => m && m.best !== '').map(m => +m.best); if (!sc.length && adm) return;
        const avg = sc.length ? Math.round(sc.reduce((x, y) => x + y, 0) / sc.length) : null;
        const st = d.status === 'Completed' ? ['Completed', '#E3F1EE', '#245E52'] : avg !== null && avg < 70 ? ['Needs support', '#FDECEC', '#A63232'] : sc.length ? ['In progress', '#E7F0F7', '#7A4A06'] : ['Not started', '#EAF1F6', '#526B7A'];
        out.push({ name: n, dept: u.dept || '', course: a.title, done: sc.length + ' of ' + qi.length, best: sc.length ? Math.max(...sc) : null, low: sc.length ? Math.min(...sc) : null, avgN: avg, status: st[0], stBg: st[1], stFg: st[2] }); }); });
    return out.sort((x, y) => x.name.localeCompare(y.name) || x.course.localeCompare(y.course)); })();
  const gbFilt = gbAll.filter(r => !gq || (r.name + ' ' + r.course).toLowerCase().includes(gq)), GBP = Pager(this, s, 'gb', gbFilt, 50);
  const gbRows = GBP.rows.map(r => ({ ...r, initials: ini(r.name), av: AV[Math.floor(Progress.hash(r.name) * 5) % 5], cells: [{ v: r.course, bg:'transparent', fg:'#16324F', cls:'gb-txt' }, { v: r.done, bg:'#EAF1F6', fg:'#334E68', cls:'' }, { ...cell(r.best), cls:'' }, { ...cell(r.low), cls:'' }], avg: r.avgN === null ? '—' : r.avgN }));
  // v41.11: assignment submissions — accept (completes the learner's step) or return with a comment
  const asgVals = () => { const INK = '#16324F', W = '#FFFFFF';
    const all = (s.asgSub || []).filter(x => gbSees(x.learner, x.learnerEmp)).slice().sort((x, y) => String(y.at).localeCompare(String(x.at))), tab = s.asgTab || 'pending';
    const list = tab === 'pending' ? all.filter(x => x.status === 'Submitted') : all.filter(x => x.status !== 'Submitted');
    const cTitle = id => ((s.adminCourses || []).find(c => c.id === id) || {}).title || 'a course';
    const decide = (x, accept) => { const comment = ((s.asgRv || {})[x.id] || '').trim();
      if ((x.learner || '') === this.meName()) return this.toastMsg('You cannot review your own assignment. Ask another trainer or an admin.');
      if (!accept && !comment) return this.toastMsg('Write what to change before returning it');
      const done = () => { this.setState(st => ({ asgRv: { ...(st.asgRv || {}), [x.id]: '' } })); this.toastMsg(accept ? 'Accepted. ' + (x.learner || 'The learner') + '’s step is complete.' : 'Returned to ' + (x.learner || 'the learner')); };
      if (Backend.on) return Backend.call('reviewAssignment', { id: x.id, decision: accept ? 'accept' : 'return', comment }).then(done).catch(e => this.toastMsg(e.message));
      this.setState(st => { const out = { asgSub: (st.asgSub || []).map(y => y.id === x.id ? { ...y, status: accept ? 'Accepted' : 'Returned', comment, reviewedBy: this.roleOf(st).name, reviewedAt: new Date().toISOString() } : y) };
        if (accept) { const L = x.learner, me = { ...(st.itemDone[L] || {}) }; me[x.courseId] = { ...(me[x.courseId] || {}), [x.step]: { at: TODAY_KEY, src: 'assignment' } }; out.itemDone = { ...st.itemDone, [L]: me }; }
        return out; }); done(); };
    const n = all.filter(x => x.status === 'Submitted').length;
    return { asgAny: all.length > 0,   // v41.18: the panel appears once there is something to review
      asgSummary: n ? n + (n === 1 ? ' submission is' : ' submissions are') + ' waiting for review' : 'Nothing waiting. Learners’ assignment submissions appear here.',
      asgTabs: [['pending', 'To review (' + n + ')'], ['done', 'Reviewed']].map(([k, l]) => { const on = tab === k; return { label: l, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => this.setState({ asgTab: k }) }; }),
      asgNone: !list.length, asgNoneText: tab === 'pending' ? 'No submissions to review.' : 'Nothing reviewed yet.',
      asgRows: list.slice(0, 100).map(x => ({ learner: x.learner || x.learnerEmp, where: (x.title || 'Assignment') + ' · ' + cTitle(x.courseId) + ' · ' + Fmt.dt(x.at), status: x.status,
        stBg: x.status === 'Accepted' ? '#DCFCE7' : x.status === 'Returned' ? '#FEF3C7' : '#EAF1F6', stFg: x.status === 'Accepted' ? '#166534' : x.status === 'Returned' ? '#92400E' : '#16324F',
        text: x.text || '(no written answer)', link: x.link || '', comment: x.comment || '', hasComment: !!x.comment && x.status !== 'Submitted', open: x.status === 'Submitted',
        draft: (s.asgRv || {})[x.id] || '', setDraft: e => { const v = e.target.value; this.setState(st => ({ asgRv: { ...(st.asgRv || {}), [x.id]: v } })); },
        ok: () => decide(x, true), ret: () => decide(x, false) })) }; };
  // written answers — trainer rates each one from 0 to the question's points
  const setRv = (id, patch) => this.setState(st => ({ rvDraft: { ...st.rvDraft, [id]: { ...(st.rvDraft[id] || {}), ...patch } } }));
  const rvAll = s.reviews.filter(r => gbSees(r.learner, r.learnerEmp)).map((r, i) => {
    // Connected, raters don't read the question bank (answer keys): the review row carries the question and points.
    const q = r.qText ? { text: r.qText, points: r.points || 0, guide: r.guide || '' } : s.qs.find(x => x.id === r.qid) || { text:'(question removed)', points:5, guide:'' };
    const dr = { rating: r.rating, feedback: r.feedback, ...(s.rvDraft[r.id] || {}) };
    const pending = r.rating === null, editing = pending || s.rvEdit === r.id;
    const scale = Array.from({ length: q.points + 1 }, (_, v) => { const on = dr.rating === v; return { label: String(v), bg: on ? '#16324F' : '#FFFFFF', fg: on ? '#F8FBFD' : '#16324F', border: on ? '#16324F' : '#C9D7E2', pick: () => setRv(r.id, { rating:v }) }; });
    const save = () => {
      if (dr.rating === null || dr.rating === undefined) return this.toastMsg('Pick a rating first');
      if (r.learner === this.meName()) return this.toastMsg('You cannot rate your own answer. Ask another trainer or an admin.');
      // Connected: the server records the rating and re-scores the attempt (the step passes if the score is high enough).
      if (Backend.on) { Backend.call('rescore', { reviewId: r.id, rating: dr.rating, feedback: (dr.feedback || '').trim() }).then(() => { this.setState(st => ({ rvEdit:null, rvDraft: { ...st.rvDraft, [r.id]: undefined } })); this.toastMsg('Rating saved · ' + r.learner.split(' ')[0] + ' ' + dr.rating + '/' + q.points); }).catch(e => this.toastMsg(e.message)); return; }
      this.setState(st => ({ reviews: st.reviews.map(x => x.id === r.id ? { ...x, rating: dr.rating, feedback: (dr.feedback || '').trim() } : x), rvEdit:null, rvDraft: { ...st.rvDraft, [r.id]: undefined } }), () => this.syncQuizDone(r.learner, Object.keys((this.state.itemQuiz || {})[r.learner] || {})));
      this.toastMsg('Rating saved · ' + r.learner.split(' ')[0] + ' ' + dr.rating + '/' + q.points);
    };
    const tone = !pending ? (r.rating / q.points >= 0.8 ? ['#E3F1EE', '#245E52'] : r.rating / q.points >= 0.5 ? ['#E7F0F7', '#7A4A06'] : ['#FDECEC', '#A63232']) : ['#E7F0F7', '#7A4A06'];
    return { ...r, initials: ini(r.learner), av: AV[i % 5], question: q.text, guide: q.guide, hasGuide: !!q.guide, maxLabel: 'Rate 0–' + q.points, pending, editing, viewing: !editing, scale, fbValue: dr.feedback || '', setFb: e => setRv(r.id, { feedback: e.target.value }), save, cancel: () => this.setState({ rvEdit:null, rvDraft: { ...s.rvDraft, [r.id]: undefined } }), canCancel: !pending && editing, edit: () => this.setState({ rvEdit: r.id }), statusLabel: pending ? 'To review' : 'Rated ' + r.rating + '/' + q.points, stBg: tone[0], stFg: tone[1], hasFeedback: !pending && !!r.feedback };
  });
  const rvPending = rvAll.filter(r => r.pending).length, rvRated = rvAll.length - rvPending;
  const rvList = rvAll.filter(r => s.rvTab === 'pending' ? r.pending : !r.pending);
  const rvTabs = [['pending', 'To review · ' + rvPending], ['rated', 'Rated · ' + rvRated]].map(([id, label]) => { const on = s.rvTab === id; return { label, bg: on ? '#16324F' : '#FFFFFF', fg: on ? '#F8FBFD' : '#16324F', border: on ? '#16324F' : '#C9D7E2', pick: () => this.setState({ rvTab:id }) }; });
  // team
  const assignPeople = TEAM.map((m, i) => { const on = !!s.assignSel[m.name]; return { first: m.name.split(' ')[0], initials: ini(m.name), av: AV[i % 5], border: on ? '#0066A1' : '#D7E3EC', bg: on ? '#EDF5FA' : '#FFFFFF', toggle: () => this.setState(st => ({ assignSel: { ...st.assignSel, [m.name]: !st.assignSel[m.name] } })) }; });
  const nSel = Object.values(s.assignSel).filter(Boolean).length;
  const teamList = TEAM.map((m, i) => ({ ...m, initials: ini(m.name), av: AV[i % 5], pctStr: m.pct + '%', barColor: m.pct >= 70 ? '#007A4D' : m.pct >= 45 ? '#0066A1' : '#D64545', xpFmt: fmt(m.you ? s.xp : m.xp), overdueLabel: m.overdue ? m.overdue + ' overdue' : 'On track', odBg: m.overdue ? '#FDECEC' : '#E3F1EE', odFg: m.overdue ? '#A63232' : '#245E52', nudge: () => this.sendNudges([m.name]) }));
  const TCS = ['Leading Through Change','Giving Feedback That Lands','Presenting with Confidence','Negotiation Essentials','Running Effective 1:1s','Emotional Intelligence at Work'], TDUE = ['Oct 8','Oct 15','Oct 30','Nov 14'];
  const STT = { overdue:['! Overdue','#FDECEC','#A63232'], soon:['! Due soon','#E7F0F7','#7A4A06'], notstarted:['○ Not started','#EAF1F6','#526B7A'], progress:['● In progress','#DCE5F3','#2F4A7A'], done:['✓ Completed','#D6EBE6','#245E52'] };
  const tmAll = [];
  TEAM.forEach((m, i) => [0, 1].forEach(k => {
    let pct = k === 0 ? m.pct : (m.pct * 7) % 101; if (k === 1 && i === 5) pct = 0; if (k === 1 && i === 2) pct = 100;
    const od = k === 0 ? m.overdue > 0 : m.overdue > 1, due = od ? 'Sep 30' : TDUE[(i + k * 2) % 4];
    const key = pct === 100 ? 'done' : od ? 'overdue' : pct === 0 ? 'notstarted' : due === 'Oct 8' ? 'soon' : 'progress';
    tmAll.push({ key, name:m.name, title:m.title, initials:ini(m.name), av:AV[i % 5], course:TCS[(i + k * 2) % 6], pctStr:pct + '%', barColor: pct === 100 ? '#007A4D' : pct >= 45 ? '#0066A1' : '#D64545', due: pct === 100 ? '–' : due, label:STT[key][0], bg:STT[key][1], fg:STT[key][2], remind: () => this.sendNudges([m.name]) });
  }));
  const tmRows = tmAll.filter(r => s.tf === 'all' || r.key === s.tf);
  const tmChips = [['all','All'],['overdue','Overdue'],['soon','Due soon'],['notstarted','Not started'],['progress','In progress'],['done','Completed']].map(([id, label]) => { const on = s.tf === id; return { label, n: id === 'all' ? tmAll.length : tmAll.filter(r => r.key === id).length, bg: on ? '#16324F' : '#FFFFFF', fg: on ? '#F8FBFD' : '#334E68', bd: on ? '#16324F' : '#C9D7E2', pick: () => this.setState({ tf:id }) }; });
  // v29: real figures (the old screen showed fixed numbers). Built only on the screens that show them.
  const scrNow = this._scrV, needStats = scrNow === 'analytics' || scrNow === 'admin';
  const LS = needStats ? LearnStats.build(s) : null;
  const attn = !needStats ? [] : [[[...LS.people.values()].reduce((t, p) => t + p.overdue, 0), 'Overdue assignments', '#A63232', 'reports', { repType:'progress', repStatus:'Overdue' }],
    [LS.comp.filter(x => x.st === 'Expiring soon').length, 'Certifications expiring in 30 days', '#7A4A06', 'reports', { repType:'compliance' }],
    [(s.syncLog || []).filter(x => /fail|error/i.test(String(x.status || ''))).length, 'Integration errors', '#A63232', 'migReport', {}],
    [s.accessReqs.filter(r => r.status === 'Pending').length, 'Pending access requests', '#334E68', 'assignments', { reqFilter:'Pending' }]]
    .map(([n, l, fg, scr, ex]) => ({ n: n.toLocaleString('en-US'), l, fg, go: () => this.go(scr, { adminView:true, ...ex }) }));
  // analytics: buckets for the chosen range (daily 30 days, weekly 90 days, monthly 12 months), from the learning records
  const RG = s.range === '30d' ? { n:30, step:1, cap:'Daily, last 30 days' } : s.range === '12m' ? { n:12, month:true, cap:'Monthly, last 12 months' } : { n:13, step:7, cap:'Weekly, last 90 days' };
  const buckets = []; if (needStats) { if (RG.month) { for (let i = RG.n - 1; i >= 0; i--) { const d = new Date(TODAY_KEY.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - i); const m = dateKey(d).slice(0, 7);
      buckets.push([m + '-01', m === TODAY_KEY.slice(0, 7) ? TODAY_KEY : dateKey(new Date(+m.slice(0, 4), +m.slice(5, 7), 0)), new Date(m + '-15T12:00:00').toLocaleDateString('en-US', { month:'short' })]); } }
    else for (let i = RG.n - 1; i >= 0; i--) { const to = Progress.plus(TODAY_KEY, -i * RG.step), from = Progress.plus(to, -RG.step + 1); buckets.push([from, to, Fmt.short(to)]); } }
  const per = needStats ? buckets.map(([f, t]) => LearnStats.period(LS, f, t)) : [], first = buckets.length ? buckets[0][0] : TODAY_KEY;
  const span = needStats ? Math.round((new Date(TODAY_KEY + 'T12:00:00') - new Date(first + 'T12:00:00')) / 864e5) + 1 : 0;
  const cur = needStats ? LearnStats.period(LS, first, TODAY_KEY) : {}, prev = needStats ? LearnStats.period(LS, Progress.plus(first, -span), Progress.plus(first, -1)) : {};
  const delta = (a, b, f) => b ? (a >= b ? '+' : '') + f(a, b) : 'no earlier data';
  const R = { cap: RG.cap, labels: buckets.filter((_, i) => i % Math.ceil(buckets.length / 6) === 0 || i === buckets.length - 1).map(b => b[2]) };
  const pts = per.length ? per.map(x => x.active) : [0, 0], mn = 0, mx = Math.max(1, ...pts) * 1.1;
  const xy = pts.map((v, i) => [i / Math.max(1, pts.length - 1) * 640, 210 - (v - mn) / (mx - mn) * 190]);
  const lineD = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const hrs = (c0) => c0.active ? (c0.mins / 60 / c0.active) : 0;
  const k = !needStats ? ['', '', '', '', '', '', '', ''] : [cur.active.toLocaleString('en-US'), delta(cur.active, prev.active, (a, b) => Math.round((a - b) / b * 100) + '%'),
    cur.done.toLocaleString('en-US'), delta(cur.done, prev.done, (a, b) => Math.round((a - b) / b * 100) + '%'),
    hrs(cur).toFixed(1) + 'h', delta(hrs(cur), hrs(prev), (a, b) => (a - b).toFixed(1) + 'h'), cur.certs.toLocaleString('en-US'), delta(cur.certs, prev.certs, (a, b) => Math.round((a - b) / b * 100) + '%')];
  return {
    ...enrVals,
    repMgr: s.repMgr,
    repCourse: s.repCourse,
    repStatus: s.repStatus,
    repUser: s.repUser,
    repMgrOptions: [{ v:'All', l:'All managers' }, { v:'Priya Raman', l:'Priya Raman' }, { v:'None', l:'No manager' }],
    repCourseOptions: [{ v:'All', l:'All courses' }].concat((Backend.on ? s.adminCourses : COURSES).map(c => ({ v:c.title, l:c.title }))),
    repStatusOptions: (s.repType === 'kpfeedback' ? ['All', 'Scheduled', 'Due', 'Sent', 'Responded'] : ['All', 'Completed', 'In progress', 'Not started', 'Overdue']).map(v => ({ v, l: v === 'All' ? 'All statuses' : v })),
    setRepMgr: e => this.setState({ repMgr: e.target.value }),
    setRepCourse: e => this.setState({ repCourse: e.target.value }),
    setRepStatus: e => this.setState({ repStatus: e.target.value }),
    setRepUser: e => this.setState({ repUser: e.target.value }),
    // v29: the report type, columns and filters already stay as you set them; there is no separate “My reports” list
    saveRep: () => this.toastMsg('Your columns are kept for this report. Saved report lists are not part of this build.'),
    bTitle: s.bTitle,
    setBTitle: e => this.setState({ bTitle: e.target.value }),
    bModules,
    bl,
    addModule: () => this.setState(st => ({ bMods: [...st.bMods, { title:'New module', lessons:[{ title:'Untitled lesson', type:'Video', dur:5, xp:50, desc:'' }] }], bSel: st.bMods.length + '-0' })),
    deleteLesson: () => { const m = s.bMods[bmi]; if (m.lessons.length <= 1) { this.toastMsg('A module needs at least one lesson'); return; } this.setState({ bMods: s.bMods.map((x, i) => i !== bmi ? x : { ...x, lessons: x.lessons.filter((_, j) => j !== bli) }), bSel: bmi + '-0' }); },
    setBlTitle: e => this.updBl({ title: e.target.value }),
    setBlDur: e => this.updBl({ dur: Number(e.target.value) || 0 }),
    setBlDesc: e => this.updBl({ desc: e.target.value }),
    typeOpts: ['Video', 'Reading', 'Quiz', 'Activity'].map(t => ({ label:t, border: bl.type === t ? '#0066A1' : '#D7E3EC', bg: bl.type === t ? '#EDF5FA' : '#FFFFFF', pick: () => this.updBl({ type:t }) })),
    xpOpts: [20, 30, 50, 100].map(v => ({ v, border: bl.xp === v ? '#0066A1' : '#D7E3EC', bg: bl.xp === v ? '#EDF5FA' : '#FFFFFF', pick: () => this.updBl({ xp:v }) })),
    mediaLabel: { Video:'Video file', Reading:'Reading material', Quiz:'Question set', Activity:'Activity brief' }[bl.type],
    mediaHint: { Video:'MP4 or MOV, up to 2 GB. Captions generate automatically.', Reading:'PDF, DOCX, or paste text', Quiz:'Import a CSV of questions or build them here', Activity:'PDF or DOCX template for learners to complete' }[bl.type],
    pubLabel: s.published ? 'PUBLISHED' : 'DRAFT',
    pubBg: s.published ? '#E3F1EE' : '#EAF1F6',
    pubFg: s.published ? '#245E52' : '#526B7A',
    publishLabel: s.published ? 'Update course' : 'Publish course',
    publish: () => { this.setState({ published:true }); this.toastMsg(s.published ? 'Changes published' : 'Course published to 760 enrolled learners'); },
    previewCourse: () => { const c = (Backend.on ? s.adminCourses : COURSES).find(x => x.title.trim().toLowerCase() === s.bTitle.trim().toLowerCase()); if (c) this.openCourse(c.id); else this.toastMsg('Publish the course to preview it as a learner'); },
    gbQuery: s.gbQuery,
    setGbQuery: e => this.setState({ gbQuery: e.target.value, pages: { ...(s.pages || {}), gb:1 } }),
    gbRows,
    rvList,
    rvTabs,
    rvEmpty: rvList.length === 0,
    rvEmptyLabel: s.rvTab === 'pending' ? 'All written answers are rated.' : 'No rated answers yet.',
    ...asgVals(),
    rvSummary: rvPending ? rvPending + (rvPending === 1 ? ' answer needs' : ' answers need') + ' your rating' : 'Nothing waiting for a rating',
    exportCsv: () => { if (!gbFilt.length) return this.toastMsg('Nothing to export: no gradebook rows match.');   // v36: writes the file (it only showed a message)
      csvDownload('gradebook-' + TODAY_KEY + '.csv', [['Learner', 'Department', 'Course', 'Assessments done', 'Best %', 'Lowest %', 'Average %', 'Status']].concat(gbFilt.map(r => [r.name, r.dept, r.course, r.done, r.best === null ? '' : r.best, r.low === null ? '' : r.low, r.avgN === null ? '' : r.avgN, r.status])));
      this.toastMsg(gbFilt.length.toLocaleString('en-US') + ' gradebook rows exported'); },
    gbPager: GBP.pager, gbEmpty: !gbFilt.length, gbScope: gbAllPeople ? 'Everyone with assessment results' : 'Trainees in the batches you train',
    gbStats: (() => { const sc = gbAll.filter(r => r.avgN !== null); return [{ l:'Average score', v: sc.length ? Math.round(sc.reduce((a, r) => a + r.avgN, 0) / sc.length) + '%' : '—' }, { l:'Courses completed', v: gbAll.filter(r => r.status === 'Completed').length + ' of ' + gbAll.length }, { l:'Need support (average under 70%)', v: gbAll.filter(r => r.status === 'Needs support').length }]; })(),
    teamStats: [{ l:'Team members', v:TEAM.length, fg:'#16324F' }, { l:'On track', v:TEAM.filter(m => !m.overdue).length, fg:'#245E52' }, { l:'Needs attention', v:TEAM.filter(m => m.overdue === 1).length, fg:'#7A4A06' }, { l:'Overdue', v:TEAM.filter(m => m.overdue > 1).length, fg:'#A63232' }],
    teamRows: teamList,
    tmRows,
    tmChips,
    tmEmpty: tmRows.length === 0,
    tmSummary: TEAM.filter(m => m.overdue > 0).length + ' need attention',
    attn,
    openAssign: () => this.setState({ assignOpen:true }),
    closeAssign: () => this.setState({ assignOpen:false }),
    stop: e => e.stopPropagation(),
    assignOpen: s.assignOpen,
    assignPeople,
    assignDue: s.assignDue,
    setAssignDue: e => this.setState({ assignDue: e.target.value }),
    assignCourses: all.filter(c => c.pct < 100).slice(0, 6).map(c => ({ title:c.title, color:c.color, border: s.assignCourse === c.id ? '#0066A1' : '#D7E3EC', bg: s.assignCourse === c.id ? '#EDF5FA' : '#FFFFFF', pick: () => this.setState({ assignCourse:c.id }) })),
    selectAll: () => this.setState({ assignSel: Object.fromEntries(TEAM.map(m => [m.name, true])) }),
    assignBtnLabel: nSel ? 'Assign to ' + nSel + (nSel === 1 ? ' person' : ' people') : 'Select people',
    assignBtnBg: nSel ? '#16324F' : '#D7E3EC',
    assignBtnFg: nSel ? '#F8FBFD' : '#526B7A',
    confirmAssign: () => { if (!nSel) return; if (!s.assignDue || s.assignDue < TODAY_KEY) return this.toastMsg('The due date is in the past'); const c = all.find(x => x.id === s.assignCourse); const enroll = { ...s.enroll }; Object.keys(s.assignSel).filter(n => s.assignSel[n]).forEach(n => { enroll[n] = { ...(enroll[n] || {}), [c.id]: s.assignDue }; }); this.setState({ assignOpen:false, assignSel:{}, enroll }); this.toastMsg(c.title + ' assigned to ' + nSel + (nSel === 1 ? ' person' : ' people')); },
    rangeTabs: [['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months']].map(([id, label]) => ({ label, bg: s.range === id ? '#FFFFFF' : 'transparent', fg: s.range === id ? '#16324F' : '#526B7A', shadow: s.range === id ? '0 1px 3px rgba(22,50,79,.15)' : 'none', pick: () => this.setState({ range:id }) })),
    kpis: [{ l:'Active learners', v:k[0], d:k[1] }, { l:'Courses completed', v:k[2], d:k[3] }, { l:'Learning time per active person (est.)', v:k[4], d:k[5] }, { l:'Certificates issued', v:k[6], d:k[7] }],
    lineD,
    areaD: lineD + ' L640 220 L0 220 Z',
    chartLabels: R.labels,
    chartCaption: R.cap,
    // v41.21: "Where learners drop off" from real records: for one course (the picker, default the most-assigned course with
    // 2+ steps), the share of active assigned learners who finished each step. It was a fixed sample chart.
    ...(() => { if (scrNow !== 'analytics') return { dropHas:false };
      const active = s.users.filter(u => u.status !== 'Deactivated' && !u._dir);
      const cnt = a => active.filter(u => (s.enroll[u.name] || {})[a.id]).length;
      const cands = (s.adminCourses || []).filter(a => (a.items || []).length >= 2).map(a => ({ a, n: cnt(a) })).filter(x => x.n > 0).sort((x, y) => y.n - x.n);
      if (!cands.length) return { dropHas:false, dropEmpty:true };
      const pick = cands.find(x => x.a.id === s.dropCourse) || cands[0], a = pick.a, people = active.filter(u => (s.enroll[u.name] || {})[a.id]);
      const reach = a.items.map((it, i) => people.filter(u => { const d = Progress.detail(s, u.name, a); return d.mods[i] && d.mods[i].done; }).length);
      const rows = a.items.map((it, i) => { const p = Math.round(reach[i] / people.length * 100), title = it.title || (it.moduleId && ((s.lcms || []).find(m => m.id === it.moduleId) || {}).title) || (it.kind === 'quiz' && ((s.quizzes || []).find(z => z.id === it.quizId) || {}).name) || 'Step ' + (i + 1);
        return { label: (i + 1) + '. ' + title, pct: p + '%', w: Math.max(1, p) + '%', col: p >= 80 ? '#007A4D' : p >= 50 ? '#0066A1' : '#D64545' }; });
      let worst = null; for (let i = 1; i < reach.length; i++) { const dpt = Math.round((reach[i - 1] - reach[i]) / people.length * 100); if (dpt > 0 && (!worst || dpt > worst.d)) worst = { i, d: dpt }; }
      return { dropHas:true, dropEmpty:false, dropRows: rows, dropSub: a.title + ' · ' + people.length + (people.length === 1 ? ' person' : ' people') + ' assigned · share who finished each step',
        dropNote: worst ? 'Biggest drop: step ' + worst.i + ' to step ' + (worst.i + 1) + ' (' + worst.d + ' points). Review the content there first.' : 'No drop between steps yet.',
        dropOpts: cands.map(x => ({ v: x.a.id, l: x.a.title + ' (' + x.n + ')' })), dropSel: a.id, setDropCourse: e => this.setState({ dropCourse: e.target.value }) }; })(),
    // completion rate by department and the most-assigned courses (all time), from the same records
    depts: !needStats ? [] : (() => { const by = new Map(); s.users.forEach(u => { const p = LS.people.get(u.name); if (!p) return; const g = by.get(u.dept || 'Unassigned') || [0, 0]; g[0] += p.done; g[1] += p.asg; by.set(u.dept || 'Unassigned', g); });
      return [...by.entries()].map(([name, [d, a]]) => [name, a ? Math.round(d / a * 100) : 0]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, v], i) => ({ name, pct: v + '%', color: ['#0066A1', '#0066A1', '#007A4D', '#007A4D', '#8C5A9E', '#D64545'][i] })); })(),
    topCourses: !needStats ? [] : [...LS.courses.entries()].sort((a, b) => b[1].asg - a[1].asg).slice(0, 5).map(([cid, c]) => { const a = Progress.courseOf(s, cid) || {};
      return { title: (a.code ? a.code + ' · ' : '') + (a.title || cid), color: a.color || '#0066A1', enrolled: fmt(c.asg), comp: (c.asg ? Math.round(c.done / c.asg * 100) : 0) + '%', rating: c.scoreN ? Math.round(c.scoreSum / c.scoreN) + '%' : '—' }; }),
  };
};
