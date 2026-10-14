/* Skillforge LMS — the course list every screen uses: progress per learner, assignments, availability,
 * step-based course state (done / locked per step) and the course currently open. */
SkillforgeApp.prototype.vmCourses = function (c) {
  const { role, s, scrV } = c;
  // Courses built from steps (PDF, video, SCORM, assessment…). A step is done when finished;
  // an assessment step is done only when the learner passes it, so the course completes on a pass.
  const itemStates = (a, user) => Progress.itemStates(s, a, user);
  // Progress for every course comes from the person's learning records (Progress.detail).
  const prog = c => { const a = Progress.courseOf(s, c.id); if (!a) return { doneCount:0, pct:0 }; const d = Progress.detail(s, role.name, a); return { doneCount: d.doneN, pct: d.pct, d }; };
  const decorate = c => { const p = prog(c); return { ...c, ...p, pctStr: p.pct + '%', open: () => this.openCourse(c.id), status: p.pct === 100 ? '✓ Completed' : p.d && p.d.overdue ? '! Overdue · ' + p.pct + '%' : p.pct > 0 ? '● ' + p.pct + '%' : '○ Not started', statusFg: p.pct === 100 ? '#245E52' : p.d && p.d.overdue ? '#A63232' : p.pct > 0 ? '#2F4A7A' : '#526B7A', learnersFmt: fmt(c.learners), instructorInitials: ini(c.instructor), cta: p.pct === 100 ? 'Review course' : p.pct > 0 ? 'Resume course' : 'Start course' }; };
  const myEnroll = s.enroll[role.name] || {};
  const acOf = id => Progress.courseOf(s, id);
  const isLive = c => { const a = acOf(c.id); return !a || ((!c.adminOnly || a.status === 'Published') && availability(a) === 'Active'); };
  // Courses created in the admin console join the learner catalog once published (drafts stay admin-only).
  const tintOf = hex => { const n = parseInt((hex || '#0066A1').slice(1), 16), mix = v => Math.round(v + (255 - v) * 0.85); return 'rgb(' + mix(n >> 16 & 255) + ',' + mix(n >> 8 & 255) + ',' + mix(n & 255) + ')'; };
  const fromAdmin = a => { const mins = a.items.reduce((t, it) => t + (it.mins || 15), 0) || 15; return { id:a.id, title:a.title, cat:a.cat, instructor:a.author || 'L&D team', hours: (mins >= 60 ? Math.floor(mins / 60) + 'h ' : '') + (mins % 60 ? (mins % 60) + 'm' : '').trim(), progress:0, color:a.color, tint:tintOf(a.color), rating:'New', learners:a.enrolled || 0, xp: Math.max(1, a.items.length) * 100, level:'Foundational', desc:a.desc || '', adminOnly:true }; };
  // v41.20: connected, the catalog is ONLY the courses in the database (the built-in demo courses were always added on top)
  const DEMO = Backend.on ? [] : COURSES, legacyIds = new Set(DEMO.map(c => c.id)), baseCourses = DEMO.concat(s.adminCourses.filter(a => !legacyIds.has(a.id)).map(fromAdmin));
  const all = baseCourses.map(c => { const a = acOf(c.id) || {}; const d = decorate(c); const banner = a.banner && a.banner.src; const p = a.catId ? catPath(s.cats, a) : null;
    return { ...d, cat: p && p.cat ? p.cat : d.cat, required: !!myEnroll[c.id], iconSrc: a.icon && a.icon.src ? a.icon.src : '', hasIcon: !!(a.icon && a.icon.src), noIcon: !(a.icon && a.icon.src),
      artBg: banner ? 'url("' + banner + '") center/cover no-repeat, ' + c.tint : c.tint,
      heroBg: banner ? 'linear-gradient(90deg, rgba(255,255,255,.96) 0%, rgba(255,255,255,.86) 50%, rgba(255,255,255,.35) 100%), url("' + banner + '") center/cover no-repeat' : c.tint }; });
  const liveAll = all.filter(isLive);
  const course = all.find(c => c.id === s.courseId) || all[0] || { ...decorate(fromAdmin({ id:'', title:'No courses yet', cat:'', items:[], color:'#0066A1' })), required:false, iconSrc:'', hasIcon:false, noIcon:true, artBg:'#EDF5FA', heroBg:'#EDF5FA', none:true };
  const icA = course.adminOnly ? acOf(course.id) : null, icIsItem = !!icA;
  const icSt = icIsItem ? itemStates(icA, role.name) : [];
  const markItem = (cid, i, msg) => {
    const a = acOf(cid), st = itemStates(a, role.name), last = st.filter(x => !x.done).length === 1 && !st[i].done;
    // Connected, SCORM: the package's reported status goes to the server, which checks the launch session and the
    // minimum time. There is no "complete" call for SCORM steps.
    if (Backend.on && ((a.items || [])[i] || {}).kind === 'scorm') {
      Backend.scormReport(true).then(r => { if (r.done) this.toastMsg(last ? a.title + ' complete' : (msg || 'Step complete'));
        else if (r.wait) this.toastMsg('Package finished. It counts as complete in ' + r.wait + ' s (minimum time for this step).');
        else this.toastMsg('The package has not reported completion yet.'); }).catch(e => this.toastMsg(e.message));
      return; }
    // Connected: the server checks enrolment, order and viewing time, then records completion (re-read afterwards).
    if (Backend.on) { Backend.call('completeStep', { courseId: cid, step: i }).then(() => this.toastMsg(last ? a.title + ' complete' : (msg || 'Step complete'))).catch(e => this.toastMsg(e.message)); return; }
    this.setState(s2 => { const u = role.name, ud = { ...(s2.itemDone[u] || {}) }; ud[cid] = { ...(ud[cid] || {}), [i]: TODAY_KEY }; return { itemDone: { ...s2.itemDone, [u]: ud }, xp: s2.xp + 50 }; });
    this.toastMsg(last ? a.title + ' complete' : (msg || 'Step complete') + ' · +50 XP');
  };
  const IK = { survey:['☰', '#E0F2FE', '#0369A1', 'Survey'], pdf:['▤', '#FDECEC', '#A63232', 'PDF document'], video:['▶', '#CCFBF1', '#115E59', 'Video'], scorm:['▦', '#DBEAFE', '#1E40AF', 'SCORM / xAPI'], quiz:['?', '#FEF3C7', '#92400E', 'Assessment'], lesson:['≡', '#E3F1EE', '#245E52', 'Lesson'], ack:['✓', '#FCE7F3', '#9D174D', 'Acknowledgment'], doc:['▤', '#FDECEC', '#A63232', 'Document'], audio:['♪', '#EDE9FE', '#5B21B6', 'Audio'], image:['▣', '#FEF3C7', '#92400E', 'Image'], link:['↗', '#E0F2FE', '#075985', 'Web link'], ...KIND_EXTRA };
  const firstOpenItem = () => { const k = icSt.findIndex(x => !x.done && !x.locked); return k < 0 ? 0 : k; };
  const itemRows = icIsItem ? icA.items.map((it, i) => { const z = it.kind === 'quiz' ? s.quizzes.find(x => x.id === it.quizId) : null, st = icSt[i], k = IK[it.kind] || IK.lesson;
    return { n:i + 1, title: z ? z.name : it.title, kindLabel:k[3], glyph:k[0], gBg:k[1], gFg:k[2], done:st.done, locked:st.locked, todo: !st.done && !st.locked,
      status: st.done ? (z ? 'Passed' + (st.best ? ' · ' + st.best.pct + '%' : '') : 'Done') : st.locked ? 'Locked' : st.pendingQ ? 'Awaiting rating' : st.best ? 'Not passed · best ' + st.best.pct + '%' : z ? 'Pass mark ' + z.pass + '%' : 'To do',
      dotBg: st.done ? '#007A4D' : '#FFFFFF', dotBorder: st.done ? '#007A4D' : st.locked ? '#C9D7E2' : '#0066A1', rowBg: s.screen === 'item' && s.itemIdx === i ? '#EDF5FA' : 'transparent', op: st.locked ? 0.55 : 1,
      open: () => { if (st.locked) return this.toastMsg('Finish the previous step first. This course is linear.'); this.go('item', { itemIdx:i, scormOn:false }); } }; }) : [];
  Object.assign(c, { IK, all, course, firstOpenItem, icA, icIsItem, icSt, itemRows, liveAll, markItem, myEnroll });
  return {
    isItem: scrV === 'item' && icIsItem,
    itProgressAll: icIsItem ? icSt.filter(x => x.done).length + ' of ' + icA.items.length + ' done' : '',
  };
};
