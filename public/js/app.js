/* Skillforge LMS — the app: initial state, navigation and the view-model pipeline.
 * renderVals() builds the shared context, then each feature module (js/learner, js/staff, js/admin)
 * adds the values its screens bind to. */
const RENDER_PIPELINE = ["vmAuth", "vmCourses", "vmEssentials", "vmFeedback", "vmSearch", "vmCatalog", "vmPlayer", "vmDashboard", "vmCommunity", "vmStaffTools"];
class SkillforgeApp extends Skillforge.Store {
  constructor(p) {
    super(p);
    // Essential trainings are assigned to every new joiner the rule covers.
    const ESS0 = Essentials.apply(ENROLL0, ADMIN_COURSES0, USERS0, HOLIDAYS0, {});
    // Learning records per person, course and step. Demo persona progress is pinned so the walkthrough matches.
    const PINNED = { 'Maya Okafor': { present:17, negotiation:0, safety:0 }, 'Daniel Reyes': { change:50, inclusive:0, safety:25 }, 'Lena Fischer': { feedback:42, present:17, negotiation:0 } };
    const itemDone0 = Progress.seedRecords(USERS0, ESS0.enroll, ADMIN_COURSES0, ESS0.assignedOn, PINNED);
    this.state = {
      authed:false, booting: !!Backend.on, login:{ email: (() => { try { return localStorage.getItem('sf-remember') || ''; } catch (e) { return ''; } })(), pw:'', remember:true, show:false, err:'' }, loginView:'signin', meName:null, meRole:null, meTitle:'',
      role:'learner', screen:'home', roleMenu:false, courseId:'change', lessonKey:'2-0', xp:8420, lessonsToday:0, quests:{ discuss:false },
      playing:false, t:0, tab:'overview', notes:'', from:'home',
      qi:0, qSel:null, qChecked:false, qCorrect:0, qDone:false, attempt:[], answers:{}, qText:'', qMulti:{}, qMatch:{}, qOrder:null, attemptQuiz:null,
      ttypes:TTYPES0, batches:BATCHES0.map(b => ({ ...b, segment: { tt3:'Leadership Training', tt4:'Communication Training' }[b.type] || 'Functional Training', trainingName: { tt1:'New Hire Induction', tt2:'Customer Support Basics', tt3:'Aspiring Leaders', tt4:'Communication Skills L1' }[b.type] || 'Core Elements', traineeType: ['tt1', 'tt2'].includes(b.type) ? 'New Hire' : 'Existing', placeId: BATCH_PLACE0[b.id] || '', mode: BATCH_MODE0[b.id] || 'In person', meetLink: BATCH_LINK0[b.id] || '' })), holidays:HOLIDAYS0, hNew:null, bView:'list', statuses:STATUSES0, stNew:null, sm:null, trExp:null, histKind:'All', histArea:'All', bScope:null, bType:'All', caCourse:null, caDue: Progress.plus(TODAY_KEY, 30), caM:null, am:null, attemptLog:ATTEMPT_LOG0, caQuery:'', caDept:'All', caRole:'All', caShow:'All', caSel:{}, caConfirm:false, bFilter:'All', bQuery:'', bDraft:null, bdTab:'details', btQuery:'', btDept:'All', batchId:null, bTab:'overview', attDate:null, attDraft:null, ewsFilter:'Open', ewsAct:null, ewsNote:'', ewsNew:null, ragEdit:null, ragDraft:null, ttDraft:null, ttPick:{}, lgDemo:false,
      places:PLACES0, plDraft:null, plQuery:'', bookmarks:BOOKMARKS0, bmLog:BOOKMARK_LOG0, bm:null, certTpl:CERT_TPL0, certDraft:null, certSel:'name', certDrag:null,
      kp:KP0, fbLog:FB_LOG0, fbCourse:'safety', fbLevel:'L1', fbFilter:'All', fbForm:null, ewsPop:null,
      attemptRecs: attemptSeed(USERS0, QUIZZES0, QBANK0, ESS0.enroll, ADMIN_COURSES0), ar:{ quiz:'', user:'', from:'', to:'' }, qmeta:null, qbBulk:null,
      zh:ZH0, pages:{}, uImp:null, linkEdit:null,
      viewSec:{}, setTab:null, pwReset:null, essPopup:false, syncLog:SYNC_LOG0, extHistory:EXT_HISTORY0, mr:{ from:'2026-09-03', to:TODAY_KEY, source:'All', type:'All', status:'All' }, mgIn:{}, mgOut:{},
      passwords:{}, prefs:{}, acctTab:'profile', acctDraft:null, pwForm:{ cur:'', next:'', conf:'', err:'', ok:'' }, qf:{ type:'All', diff:'All', cat:'All', course:'All', module:'All', status:'Active', author:'All', usage:'All', skill:'All', bloom:'All', tag:'All', sort:'new' }, qPrev:null,
      lcms:LCMS0.concat(FORM_MODULES0), surveyResp:{}, lcmsQuery:'', lcmsType:'All', mod:null, modPreview:null, modDelete:null, qFromLcms:false, cTab:'basics', ccQuery:'', ccFilter:'All', cModQuery:'', cModType:'All',
      itemDone:itemDone0, itemQuiz:{}, itemIdx:0, scormOn:false, groups:GROUPS0, audQuery:'',
      attemptsUsed:ATTEMPTS_USED0, extraAttempts:EXTRA_ATTEMPTS0, attModal:null, enroll: ESS0.enroll, assignedOn: ESS0.assignedOn, enrModal:null, cats:CATS0, catSel:{ c:'c1', s:'c1a' }, catEdit:null, catNew:{ c:'', s:'', ss:'' }, anns:ANNS0, annModal:false, an:null, annHidden:{}, userDelete:null,
      reviews:REVIEWS0, rvTab:'pending', rvDraft:{}, rvEdit:null,
      lb:'team', catQuery:'', searchOpen:false, gq:'', tf:'all', uSel:{}, catRel:'all', catLvl:'All', catSt:'All', repMgr:'All', repCourse:'All', repStatus:'All', repUser:'', catCat:'All', calY:TODAY.getFullYear(), calM:TODAY.getMonth(), calSel: Object.keys(EVENTS).sort().find(k => k >= TODAY_KEY) || TODAY_KEY,
      threads:THREADS, threadId:1, voted:{}, reply:'',
      bTitle:'Coaching Conversations', published:false, bSel:'0-0',
      bMods:[
        { title:'Foundations of coaching', lessons:[{ title:'What coaching is (and isn\'t)', type:'Video', dur:8, xp:50, desc:'' },{ title:'The GROW model', type:'Reading', dur:6, xp:30, desc:'' },{ title:'Check your understanding', type:'Quiz', dur:5, xp:100, desc:'' }] },
        { title:'Asking powerful questions', lessons:[{ title:'Open vs. closed questions', type:'Video', dur:10, xp:50, desc:'' },{ title:'A question bank to start from', type:'Reading', dur:4, xp:30, desc:'' }] },
        { title:'Coaching in the flow of work', lessons:[{ title:'Five-minute coaching', type:'Video', dur:9, xp:50, desc:'' }] },
      ],
      adminView:false, notifOpen:false, notifRead:false, registered:{},
      qs:QBANK0, bankSel:{}, bankTopic:'All', bankQuery:'', bankReturn:false, qModal:false, qm:null, qEditId:null,
      quizzes:QUIZZES0, quizDraft:{ name:'', ids:[], pass:80, time:15, attempts:'2', shuffle:true, shuffleOpts:true, dynamic:false, drawCount:10, editId:null },
      adminCourses:ADMIN_COURSES0, cDraft:null, cQuizPick:1, paths:PATHS0, pathSel:1,
      repType:'learning', repUStatus:'All', repRange:'30d', repDept:'All', repScheduled:{},
      userStatus:'Active', uMenu:null, misF:{ month:'All', segment:'All', training:'All', status:'All', sub:'All', q:'' }, masters:MASTERS0, tiles:{}, platform:PLATFORM0, tileGroup:'home', trTab:'overview', repCols:{}, kpLib:KP_LIB0, kqEdit:null, badges:BADGES0, mdTab:'lists', mdList:'trainingNames', mdEdit:null, bdEdit:null, accessReqs:ACCESS_REQS0, dash:DB0, docs:DOCS0, docCfg:DOC_CFG0, docAck:{}, loginLog:{}, dbEdit:null, reqModal:null, reqFilter:'Pending', users:USERS0.map(u => ({ ...u, roleId: u.name === 'Priya Raman' ? 'r_qa' : ({ Learner:'r_learner', Trainer:'r_trainer', Admin:'r_admin' })[u.role] })), roles:ROLES0, roleSel:'r_trainer', roleDraft:null, userQuery:'', userRole:'All', userModal:false, ud:null,
      autos:AUTOS0, integ:INTEG0, auditQuery:'', audit: AUDIT.map(a => ({ ...a })), perms:PERMS0, brandName:'Skillforge', brandAccent:'#0066A1', brandMsg:'Welcome to Northwind Learning. Sign in with your work account.',
      gbQuery:'', assignOpen:false, assignCourse:'negotiation', assignSel:{}, assignDue: Progress.plus(TODAY_KEY, 30), range:'90d', toast:null,
    };
    // The full organisation (3,500 people, 1,000 courses) is loaded by default; ?small=1 keeps only the demo people.
    // With Supabase configured, nothing is generated: the data comes from the database after sign-in.
    try { if (!Backend.configured && !/[?&]small=1\b/.test(location.search)) { const d = ScaleData.build(this.state); Object.assign(this.state, d, { zh: { ...this.state.zh, scale: d.stats } }); } } catch (e) { console.error(e); }
    if (!Backend.configured) this.state.docAck = docAckSeed(this.state.users);
  }
  /* After Supabase sign-in: person and role come from the server membership (sf_member), not from the user record. */
  onBackendSignedIn(r, opts) {
    if (!r) return;
    if (r.mustChange) { this.setState(st => ({ authed:false, loginView:'newpw', login: { ...st.login, busy:false, pw:'', err:'' } })); return; }
    const me = r.me, st = this.state;
    let u = r.user || st.users.find(x => x.empId === me.emp);
    if (!u && r.empty) { u = { id:'me-' + me.emp, name: me.name, empId: me.emp, email: me.email, role: me.role, roleId: ({ Admin:'r_admin', Trainer:'r_trainer' })[me.role] || 'r_learner', dept:'Learning and Development', designation:'', status:'Active', manager:'None', joined: TODAY_KEY };
      this.setState({ users: st.users.filter(x => x.empId !== me.emp).concat([u]) }); }
    if (!u) { Backend.signOut(); this.setState(s2 => ({ login: { ...s2.login, busy:false, err:'Your login is linked to employee ID ' + me.emp + ', but no person with that ID exists in Skillforge. Ask your L&D administrator.' } })); return; }
    if (u.expires && u.expires < TODAY_KEY) { Backend.signOut(); this.setState(s2 => ({ login: { ...s2.login, busy:false, err:'This account expired on ' + Fmt.medium(u.expires) + '. Contact your L&D administrator.' } })); return; }
    if (u.status === 'Deactivated') { Backend.signOut(); this.setState(s2 => ({ login: { ...s2.login, busy:false, err:'This account is deactivated. Contact your L&D administrator.' } })); return; }
    this.setState(s2 => ({ login: { ...s2.login, busy:false } }));
    if (this._signInAs) this._signInAs({ ...u, role: me.role }, opts);
  }
  // The signed-in user's name replaces the demo persona, so their own assignments and attempts are used.
  roleOf(s) { const r = ROLES.find(x => x.id === s.role); return s.meName && s.meRole === s.role ? { ...r, name: s.meName, who: s.meName + ' · ' + (s.meTitle || r.label) } : r; }
  componentDidMount() {
    window.addEventListener('sf-toast', e => this.toastMsg(String(e.detail || '').slice(0, 200)));
    // v39: Escape closes the small toolbar menus (Users: Export, Create account)
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && this.state.uMenu) this.setState({ uMenu: null }); });
    try { const im = sessionStorage.getItem('sf-idle'); if (im) { sessionStorage.removeItem('sf-idle'); this.setState(s2 => ({ login: { ...s2.login, err: 'You were signed out after ' + (+im || 30) + ' minutes without activity.' } })); } } catch (e) {}
    // Idle sign-out (App settings › Sign out after inactivity, default 30 minutes): shared PCs are common in training rooms.
    // Activity in any tab counts (localStorage), so a second open tab doesn't sign someone out while they work in the first.
    this._lastAct = Date.now(); const mark = () => { this._lastAct = Date.now(); try { localStorage.setItem('sf-act', String(this._lastAct)); } catch (e) {} };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => window.addEventListener(t, mark, { passive: true, capture: true }));
    this._idleCheck = () => { const st = this.state; if (!st.authed) return;
      // Watching a video, listening to audio or working in a SCORM package is activity even without clicks or keys.
      const media = [...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended);
      if (!document.hidden && (media || st.playing || (st.screen === 'item' && st.scormOn))) { this._lastAct = Date.now(); try { localStorage.setItem('sf-act', String(this._lastAct)); } catch (e) {} return; }
      const mins = +(((st.platform || PLATFORM0).defaults || {}).idleMins ?? 30); if (!mins) return;
      let other = 0; try { other = +localStorage.getItem('sf-act') || 0; } catch (e) {}
      if (Date.now() - Math.max(this._lastAct, other) < mins * 60000) return;
      // Connected: sign out and reload, so nothing the previous person could read stays in this tab's memory (shared PCs).
      if (Backend.on) { try { sessionStorage.setItem('sf-idle', String(mins)); } catch (e) {} Backend.signOut().catch(() => {}).finally(() => location.reload()); return; }
      this.setState(s2 => ({ authed:false, loginView:'signin', adminView:false, screen:'home', roleMenu:false, notifOpen:false, dbDrill:null, docEd:null, kpiEd:null,
        login: { ...s2.login, pw:'', busy:false, err:'You were signed out after ' + mins + ' minutes without activity.' } })); };
    this.idleTimer = setInterval(this._idleCheck, 20000);
    // Supabase (when configured in js/config.js): restore the session and load data from the database.
    Backend.start(this).catch(e => { console.error(e); this.setState({ beStatus: { text: 'Could not reach the database: ' + e.message, ok:false } }); });
    // Offline demo only: a same-origin demo package in the player frame may report completion with
    // postMessage({ type:'scorm', status:'completed' }). Connected, completion goes through the server (Backend).
    // Accepted only from this origin AND from the SCORM frame on screen, never from other windows or frames.
    window.addEventListener('message', e => { const d = e.data; if (Backend.on || !d || d.type !== 'scorm' || d.status !== 'completed') return;
      if (e.origin !== location.origin) return; const fr = document.querySelector('iframe.sf-scorm'); if (!fr || e.source !== fr.contentWindow) return;
      if (this.state.screen === 'item' && this._scormDone) this._scormDone(); });
    // Viewing time: when a course doesn't let learners mark steps complete, documents, images, links and
    // lessons complete after the learner has spent the minimum time on them (counted only while the tab is visible).
    this.viewTimer = setInterval(() => { const t = this._viewTarget; if (!t || document.hidden || !this.state.authed) return;
      const v = (this.state.viewSec[t.key] || 0) + 1; this.setState({ viewSec: { ...this.state.viewSec, [t.key]: v } });
      if (v >= t.need) { this._viewTarget = null; t.done(); } }, 1000);
  }
  componentWillUnmount() { clearInterval(this.timer); clearInterval(this.viewTimer); clearInterval(this.idleTimer); clearTimeout(this.tt); }
  // v36: longer messages stay up longer (2.6 s to 7 s, by length) and can be closed early.
  toastMsg(m) { clearTimeout(this.tt); this.setState({ toast:m }); this.tt = setTimeout(() => this.setState({ toast:null }), Math.min(7000, Math.max(2600, String(m || '').length * 55))); }
  /* v36: reminders. Without the server they reach the person's bell in this app (demo). Connected, nothing can be delivered
     until the e-mail / notification job exists, so the app says so instead of claiming “Reminder sent”. */
  sendNudges(names, onDone, about) { names = [...new Set((names || []).filter(Boolean))]; if (!names.length) return this.toastMsg('Choose who to remind first.');
    if (Backend.on) return this.toastMsg('Reminders aren’t connected yet (they need the e-mail delivery job on the server). Nothing was sent.');
    const from = (this.roleOf(this.state) || {}).name || 'Your admin', at = new Date().toISOString();
    this.setState(st => { const n = { ...(st.nudges || {}) }; names.forEach(x => { n[x] = [{ from, at, about: about || '' }].concat(n[x] || []).slice(0, 20); }); return { nudges: n }; });
    this.logAudit('Sent reminder', names.length === 1 ? names[0] : names.length + ' people');
    this.toastMsg((names.length === 1 ? 'Reminder sent to ' + names[0] : 'Reminder sent to ' + names.length + ' people') + ' in Skillforge (their bell). E-mail reminders aren’t connected in this demo.');
    if (onDone) onDone(); }
  /* v36: admin actions in this session are added to the Audit log screen (when connected, the screen reads the database log). */
  logAudit(action, target) { const who = (this.roleOf(this.state) || {}).name || 'Unknown';
    this.setState(st => ({ audit: [{ at: Fmt.dt(new Date().toISOString()), who, action, target: String(target || '') }].concat(st.audit || []).slice(0, 2000) })); }
  // v36: remember the top-level page a course was opened from, so the menu highlights Home / My learning / Catalog correctly.
  // The old Training feedback screen now lives in Reports (Kirkpatrick L1–L4 analysis).
  go(screen, extra) { if (screen === 'feedback') { screen = 'reports'; extra = { ...(extra || {}), repType:'kirkpatrick' }; }
    clearInterval(this.timer); window.scrollTo(0, 0); const cur = this.state.screen, LEARN = ['item', 'course', 'lesson', 'quiz'];
    const navFrom = LEARN.includes(screen) ? (LEARN.includes(cur) ? this.state.navFrom : cur) : null;
    this.setState({ screen, navFrom, roleMenu:false, uMenu:null, playing:false, ...(['qbank', 'quizBuild'].includes(screen) ? {} : { qFromLcms:false }), ...(extra || {}) }); }
  /* Older lesson-based courses store lesson completion in the same per-person records (step index = lesson order). */
  meName() { return this.roleOf(this.state).name; }
  lessonDone(cid, key, s) { s = s || this.state; const i = FLAT.findIndex(l => l.key === key); return !!(((s.itemDone[this.meName()] || {})[cid] || {})[i]); }
  markLesson(cid, key, val) { const u = this.meName(), i = FLAT.findIndex(l => l.key === key);
    if (Backend.on) { if (!(val && val.score != null)) Backend.call('completeStep', { courseId: cid, step: i }).catch(e => this.toastMsg(e.message)); return; }
    this.setState(s => { const ud = { ...(s.itemDone[u] || {}) }; ud[cid] = { ...(ud[cid] || {}), [i]: val || TODAY_KEY }; return { itemDone: { ...s.itemDone, [u]: ud } }; }); }
  /* Offline only (connected, the server writes these): assessment steps that are now passed (direct pass, or after a trainer
   * rated written answers) get a dated record with the score, so dashboards, reports and exports count them like My learning. */
  syncQuizDone(user, cids) { if (Backend.on) return; this.setState(st => { let ud = null;
    (cids || []).forEach(cid => { const a = Progress.courseOf(st, cid); if (!a) return; const have = ((st.itemDone[user] || {})[cid]) || {};
      Progress.itemStates(st, a, user).forEach((x, i) => { if (a.items[i].kind !== 'quiz' || !x.done || have[i]) return;
        ud = ud || { ...(st.itemDone[user] || {}) }; ud[cid] = { ...(ud[cid] || have), [i]: { at: TODAY_KEY, score: x.best && x.best.pct != null ? x.best.pct : null } }; }); });
    return ud ? { itemDone: { ...st.itemDone, [user]: ud } } : null; }); }
  firstOpen(cid) { const l = FLAT.find(x => !this.lessonDone(cid, x.key)); return (l || FLAT[0]).key; }
  openCourse(cid) { this.go('course', { courseId:cid, from:this.state.screen }); }
  openLesson(key) { this.go('lesson', { lessonKey:key, t:0, tab:'overview' }); }
  togglePlay() {
    if (this.state.playing) { clearInterval(this.timer); this.setState({ playing:false }); return; }
    const total = FLAT.find(l => l.key === this.state.lessonKey).min * 60;
    this.setState({ playing:true, t: this.state.t >= total ? 0 : this.state.t });
    this.timer = setInterval(() => { const t = this.state.t + 3;
      if (t >= total) { clearInterval(this.timer); this.setState({ t:total, playing:false }); if (this._lessonVideoEnd) this._lessonVideoEnd(); }
      else this.setState({ t }); }, 100);
  }
  complete() {
    const s = this.state;
    if (this.lessonDone(s.courseId, s.lessonKey)) return;
    this.markLesson(s.courseId, s.lessonKey); this.setState({ xp:s.xp + 50, lessonsToday:s.lessonsToday + 1 });
    this.toastMsg('Lesson complete · +50 XP');
  }
  next() { const i = FLAT.findIndex(l => l.key === this.state.lessonKey); if (i < FLAT.length - 1) this.openLesson(FLAT[i + 1].key); else this.go('course'); }
  updBl(patch) {
    const [mi, li] = this.state.bSel.split('-').map(Number);
    this.setState(s => ({ bMods: s.bMods.map((m, i) => i !== mi ? m : { ...m, lessons: m.lessons.map((l, j) => j !== li ? l : { ...l, ...patch }) }) }));
  }


  renderVals() {
    const s = this.state;
    Backend.observe(s);
    const role = this.roleOf(s);
    const activeNav = (['item', 'course', 'lesson', 'quiz'].includes(s.screen) && s.navFrom && !PARENT[s.navFrom] ? s.navFrom : PARENT[s.screen]) || s.screen;
    // Access comes from the person's role (Settings › Roles & permissions). Admins have every permission.
    const meU = s.users.find(u => u.name === role.name);
    const perms = Access.permsFor(s, meU, role);
    this._perms = perms;
    const need = Access.screenPerms[s.screen];
    const scrV = (need && !need.some(p => perms.has(p))) || (s.screen === 'admin' && !perms.size) ? 'denied' : s.screen;
    this._scrV = scrV;
    if (s.authed) NavMemory.save(s);
    // App settings: feature switches, menu labels/order/visibility (Tile management › Learner menu) and defaults.
    const PF = s.platform || PLATFORM0, feat = PF.feat || {};
    DEFAULT_PASSWORD = (PF.defaults && PF.defaults.password) || 'Pass@123';
    const navList = Tiles.apply(s, 'nav', role.nav.filter(([id]) => !(id === 'discussions' && feat.discussions === false) && !(id === 'calendar' && feat.calendar === false)), x => x[1], (x, l) => [x[0], l]);
    const navItems0 = navList.map(([id, label]) => { const a = activeNav === id; return { label, group: GRP[id] || 'Learn', bg: a ? '#16324F' : 'transparent', fg: a ? '#F8FBFD' : '#334E68', go: () => this.go(id) }; });
    const _gs = new Set(navItems0.map(n => n.group));
    const navItems = navItems0.map((n, i) => ({ ...n, hasGroup: _gs.size > 1 && (i === 0 || navItems0[i - 1].group !== n.group) }));
    const c = { navItems, role, s, scrV, perms };
    // Each feature module adds its values to the view and shares what later modules need through c.
    const vals = {
      isDenied: scrV === 'denied',
      deniedBack: () => this.go(role.home, { adminView:false }),
      retryInteg: () => this.toastMsg('Sync retries run in the server sync job, which isn’t connected in this build. Nothing was retried.'),
      toggleRoleMenu: () => this.setState({ roleMenu: !s.roleMenu }),
      goHomeRole: () => this.go(role.home),
      isHome: scrV === 'home',
      isCatalog: scrV === 'catalog',
      isCourse: scrV === 'course',
      isLesson: scrV === 'lesson',
      isQuiz: scrV === 'quiz',
      isProgress: scrV === 'progress',
      isCalendar: scrV === 'calendar',
      isDiscussions: scrV === 'discussions',
      isBuilder: scrV === 'builder',
      isGradebook: scrV === 'gradebook',
      isTeam: scrV === 'team',
      isAnalytics: scrV === 'analytics',
      featCls: ['game', 'badges', 'paths'].filter(k => feat[k] === false).map(k => 'no-' + k).join(' '),
      hasToast: !!s.toast, toastClose: () => { clearTimeout(this.tt); this.setState({ toast:null }); },
      toastCls: ['item', 'lesson', 'quiz'].includes(s.screen) ? 'ovl-33-up' : '',   // v36: above the player's bottom bar and timer
      toast: s.toast,
    };
    RENDER_PIPELINE.forEach(fn => Object.assign(vals, this[fn](c)));
    return { ...vals, ...this.adminVals(s, c.all), ...this.batchVals(s, role), ...this.assignVals(s, role), ...this.attemptVals(s, role), ...this.qbankVals(s, role), ...this.accountVals(s, role) };
  }
  moveQ(i, dir) { this.setState(st => { const ids = [...st.quizDraft.ids]; const j = i + dir; if (j < 0 || j >= ids.length) return null; const t = ids[i]; ids[i] = ids[j]; ids[j] = t; return { quizDraft: { ...st.quizDraft, ids } }; }); }

}
