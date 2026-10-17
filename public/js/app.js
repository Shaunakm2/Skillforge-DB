const LEARNER_SCREENS = ['home', 'catalog', 'progress', 'calendar', 'discussions', 'docs', 'search'];
/* v41.25: the saved branding (name, colour, message, logo) is kept in this browser after each sign-in, so the sign-in page
 * can show it. Before sign-in the app cannot read the database, so without this the sign-in page always showed the defaults. */
const BRAND0 = (() => {
  const d = { brandName: 'Skillforge', brandAccent: '#0066A1', brandMsg: 'Welcome to Skillforge. Sign in with your work account.', brandLogo: '' };
  if (typeof Backend === 'undefined' || !Backend.on) return d;
  try { const j = JSON.parse(localStorage.getItem('sf-brand') || 'null'); if (!j || typeof j !== 'object') return d;
    if (typeof j.brandName === 'string' && j.brandName.trim()) d.brandName = j.brandName.slice(0, 120);
    if (typeof j.brandAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(j.brandAccent)) d.brandAccent = j.brandAccent;
    if (typeof j.brandMsg === 'string' && !/Northwind/i.test(j.brandMsg)) d.brandMsg = j.brandMsg.slice(0, 2000);
    if (typeof j.brandLogo === 'string' && j.brandLogo.length <= 300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(j.brandLogo)) d.brandLogo = j.brandLogo; } catch (e) {}
  return d;
})();
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
      reviews:REVIEWS0, rvTab:'pending', rvDraft:{}, rvEdit:null, asgSub:[], asgDraft:{}, ckDraft:{}, asgRv:{},
      lb:'team', catQuery:'', searchOpen:false, gq:'', tf:'all', uSel:{}, catRel:'all', catLvl:'All', catSt:'All', repMgr:'All', repCourse:'All', repStatus:'All', repUser:'', catCat:'All', calY:TODAY.getFullYear(), calM:TODAY.getMonth(), calSel: Object.keys(EVENTS).sort().find(k => k >= TODAY_KEY) || TODAY_KEY,
      threads:THREADS, threadId:null, dNew:null, dBusy:false, voted:{}, reply:'',
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
      autos:AUTOS0, integ:INTEG0, auditQuery:'', audit: AUDIT.map(a => ({ ...a })), perms:PERMS0, brandName:BRAND0.brandName, brandAccent:BRAND0.brandAccent, brandMsg:BRAND0.brandMsg, brandLogo:BRAND0.brandLogo,
      gbQuery:'', assignOpen:false, assignCourse:'negotiation', assignSel:{}, assignDue: Progress.plus(TODAY_KEY, 30), range:'90d', toast:null,
    };
    // The full organisation (3,500 people, 1,000 courses) is loaded by default; ?small=1 keeps only the demo people.
    // With Supabase configured, nothing is generated: the data comes from the database after sign-in.
    try { if (!Backend.configured && !/[?&]small=1\b/.test(location.search)) { const d = ScaleData.build(this.state); Object.assign(this.state, d, { zh: { ...this.state.zh, scale: d.stats } }); } } catch (e) { console.error(e); }
    if (!Backend.configured) this.state.docAck = docAckSeed(this.state.users);
    // v41.19: remember what the sample organisation looks like, so Settings › Database & storage can remove it from the database
    if (Backend.on) { try { this._sample = Backend.sampleIndex(this.state); } catch (e) { console.error(e); } }
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
    // v41.27: compared with today's date in the organisation's time zone (the server does the same), not the browser's
    if (u.expires && u.expires < ((typeof Progress !== 'undefined' && Progress.orgToday) ? Progress.orgToday() : TODAY_KEY)) { Backend.signOut(); this.setState(s2 => ({ login: { ...s2.login, busy:false, err:'This account expired on ' + Fmt.medium(u.expires) + '. Contact your L&D administrator.' } })); return; }
    if (u.status === 'Deactivated') { Backend.signOut(); this.setState(s2 => ({ login: { ...s2.login, busy:false, err:'This account is deactivated. Contact your L&D administrator.' } })); return; }
    this.setState(s2 => ({ login: { ...s2.login, busy:false } }));
    if (this._signInAs) this._signInAs({ ...u, role: me.role }, opts);
  }
  // The signed-in user's name replaces the demo persona, so their own assignments and attempts are used.
  roleOf(s) { const r = ROLES.find(x => x.id === s.role); return s.meName && s.meRole === s.role ? { ...r, name: s.meName, who: s.meName + ' · ' + (s.meTitle || r.label) } : r; }
  componentDidMount() {
    window.addEventListener('popstate', e => this.onBrowserBack(e));
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, () => { if (!(document.fullscreenElement || document.webkitFullscreenElement) && this.state.scormFull) this.scormFullSet(false); }));
    // closing or reloading the tab with an editor open asks first (the browser shows its own message)
    window.addEventListener('beforeunload', e => { if (this.state.authed && this.dirtyEditor()) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('sf-toast', e => this.toastMsg(String(e.detail || '').slice(0, 200)));
    // v39: Escape closes the small toolbar menus (Users: Export, Create account)
    window.addEventListener('keydown', e => { if (e.key !== 'Escape') return;
      if (this.state.scormFull) return this.scormFullSet(false);
      if (this.state.docView) return this.setState({ docView: null }); if (this.state.uMenu) return this.setState({ uMenu: null });
      if (this.openEditor()) return;   // v41.18: an editor (account, course, module, document, KPI, role) is never closed by one key press
      // v41.18: Escape closes the top-most pop-up exactly like clicking outside it (it only worked for two pop-ups)
      const ov = [...document.querySelectorAll('.ovl-1')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height; }).pop();
      if (ov) ov.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true })); });
    try { const im = sessionStorage.getItem('sf-idle'); if (im) { sessionStorage.removeItem('sf-idle'); this.setState(s2 => ({ login: { ...s2.login, info: 'You were signed out after ' + (+im || 45) + ' minutes without activity.' } })); } } catch (e) {}
    // Idle sign-out (App settings › Sign out after inactivity, default 30 minutes): shared PCs are common in training rooms.
    // Activity in any tab counts (localStorage), so a second open tab doesn't sign someone out while they work in the first.
    // v41.22: the sign-in lasts as long as the person keeps working. It ends after 45 minutes WITHOUT activity (tab open or closed).
    // Mouse movement, scrolling, switching back to the tab and typing all count, so reading a long page is not "idle".
    this._lastAct = Date.now(); this._actWrite = 0; this._frameSince = 0;
    const mark = () => { const now = Date.now(); this._lastAct = now; this._frameSince = 0;
      if (!this.state.authed || now - this._actWrite < 1000) return; this._actWrite = now;   // (nothing is stored while the sign-in page is showing)   // storage is written at most once a second, however often the mouse moves
      try { localStorage.setItem('sf-act', String(now)); } catch (e) {} if (Backend.on && this.state.authed) Backend.rememberTouch(); };
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(t => window.addEventListener(t, mark, { passive: true, capture: true }));
    window.addEventListener('focus', mark); document.addEventListener('visibilitychange', () => { if (!document.hidden) mark(); });
    this._idleCheck = () => { const st = this.state; if (!st.authed) return;
      // Watching a video, listening to audio or working in a SCORM package is activity even without clicks or keys.
      const media = [...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended);
      // v41.21: an assessment in progress (on screen, not handed in) also counts, even without clicks or keys for a long time
      const inQuiz = st.screen === 'quiz' && !st.qDone && (st.attempt && st.attempt.length || st.rAttemptId);
      // v41.22: clicks and scrolling inside a document, PDF or embedded video are not seen by this page. While such a frame has focus in a
      // visible, focused window the person is reading or watching, so that counts as activity (for at most 90 minutes at a time).
      const ae = document.activeElement, inFrame = !!(ae && ae.tagName === 'IFRAME' && !document.hidden && document.hasFocus());
      if (inFrame) { if (!this._frameSince) this._frameSince = Date.now(); } else this._frameSince = 0;
      const reading = inFrame && Date.now() - this._frameSince < 90 * 60000;
      if (inQuiz || reading || (!document.hidden && (media || st.playing || (st.screen === 'item' && st.scormOn)))) { this._lastAct = Date.now(); if (Backend.on) Backend.rememberTouch(); try { localStorage.setItem('sf-act', String(this._lastAct)); } catch (e) {} return; }
      let mins = +(((st.platform || PLATFORM0).defaults || {}).idleMins ?? 30); if (!mins) return;
      if (Backend.on) mins = Math.max(mins, Backend.KEEP_MIN);   // v41.22: connected, nobody is signed out before 45 minutes without activity (App settings can only make it longer)
      let other = 0; try { other = +localStorage.getItem('sf-act') || 0; } catch (e) {}
      if (Date.now() - Math.max(this._lastAct, other) < mins * 60000) return;
      // Connected: sign out and reload, so nothing the previous person could read stays in this tab's memory (shared PCs).
      if (Backend.on) { try { sessionStorage.setItem('sf-idle', String(mins)); } catch (e) {} Backend.signOut().catch(() => {}).finally(() => location.reload()); return; }
      this.setState(s2 => ({ authed:false, loginView:'signin', adminView:false, screen:'home', roleMenu:false, notifOpen:false, dbDrill:null, docEd:null, kpiEd:null,
        login: { ...s2.login, pw:'', busy:false, err:'', info:'You were signed out after ' + mins + ' minutes without activity.' } })); };
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
    // v41.18: assessment time limit. Ticks once a second; at zero the attempt is handed in (the server also refuses late answers).
    this.quizTimer = setInterval(() => { const st = this.state; if (!st.qEndsMs || st.qDone || st.screen !== 'quiz' || !st.authed) return;
      if (Date.now() >= st.qEndsMs) { const v = this.renderVals(); if (v.quizTimeUp) v.quizTimeUp(); } else this.setState({ qTick: Date.now() }); }, 1000);
  }
  componentWillUnmount() { clearInterval(this.timer); clearInterval(this.viewTimer); clearInterval(this.idleTimer); clearInterval(this.quizTimer); clearTimeout(this.tt); }
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
  go(screen, extra) { if (this.state.scormFull) { document.body.style.overflow = ''; try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {} extra = { ...(extra || {}), scormFull:false }; }
    if (screen === 'feedback') { screen = 'reports'; extra = { ...(extra || {}), repType:'kirkpatrick' }; }
    // v41.6: the learner pages (top menu) always leave Settings, so "← Settings" and the dark gear no longer stay on Home.
    if (LEARNER_SCREENS.includes(screen)) extra = { ...(extra || {}), adminView:false };
    clearInterval(this.timer); window.scrollTo(0, 0); const cur = this.state.screen, LEARN = ['item', 'course', 'lesson', 'quiz'];
    const navFrom = LEARN.includes(screen) ? (LEARN.includes(cur) ? this.state.navFrom : cur) : null;
    const before = this.state.authed ? JSON.stringify(NavMemory.snap(this.state)) : '';
    this.setState({ screen, navFrom, roleMenu:false, uMenu:null, playing:false, ...(['qbank', 'quizBuild'].includes(screen) ? {} : { qFromLcms:false }), ...(extra || {}) });
    // v41.8: every page change is a browser history entry, so the browser Back / Forward buttons move between LMS pages.
    if (this.state.authed && !this._fromPop) { const nav = NavMemory.snap(this.state), t = JSON.stringify(nav);
      try { if (!before || !history.state || !history.state.sf) history.replaceState({ sf: nav }, ''); else if (t !== before) history.pushState({ sf: nav }, ''); } catch (e) {} } }
  /* v41.8: open editors that may hold unsaved work, and pop-ups that Back closes first. */
  /* Which editor is open ('' = none). v41.21: the account editor counts only while its window is open (closing it left
   * the draft behind, so Back asked about "unsaved changes" forever and never went back). */
  openEditor(s) { s = s || this.state; return s.mod ? 'module' : s.cDraft && s.screen === 'courseAdmin' ? 'course' : s.ud && s.userModal ? 'account' : s.docEd ? 'document' : s.kpiEd ? 'KPI' : s.roleDraft ? 'role' : ''; }
  /* v41.21: an open editor whose content changed since it was opened (a snapshot is taken on the first render after opening). */
  edKey(s) { s = s || this.state; return { module:'mod', course:'cDraft', account:'ud', document:'docEd', KPI:'kpiEd', role:'roleDraft' }[this.openEditor(s)] || ''; }
  edSnap(s) { const k = this.edKey(s); if (!k) { this._edSnap = null; return; } if (!this._edSnap || this._edSnap.k !== k) { try { this._edSnap = { k, j: JSON.stringify(s[k]) }; } catch (e) { this._edSnap = { k, j: '' }; } } }
  dirtyEditor(s) { s = s || this.state; const k = this.edKey(s); if (!k) return ''; if (!this._edSnap || this._edSnap.k !== k) return '';
    try { return JSON.stringify(s[k]) !== this._edSnap.j ? this.openEditor(s) : ''; } catch (e) { return this.openEditor(s); } }
  /* v41.20: SCORM full-screen view (see player.js). */
  scormFullSet(on) {
    const el = document.getElementById('sf-scorm-wrap'), fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (on) { this.setState({ scormFull:true }); try { const r = el && (el.requestFullscreen || el.webkitRequestFullscreen); if (r) { const p = r.call(el); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
      document.body.style.overflow = 'hidden'; return; }
    this.setState({ scormFull:false }); document.body.style.overflow = '';
    try { if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  /* v41.20: Skillforge logo -> the LMS home page (also from Settings). Unsaved editor changes are confirmed first. */
  goHomePage() { const ed = this.dirtyEditor();
    if (ed && !window.confirm('You have unsaved changes in this ' + ed + '. Leave without saving?')) return;
    if (this.state.screen === 'item' && Backend.on) try { Backend.scormLeave(); } catch (e) {}
    this.go('home', { ...this.closeOverlays(), adminView:false, roleMenu:false, notifOpen:false, searchOpen:false, scormOn:false, scormFull:false }); window.scrollTo(0, 0); }
  closeOverlays() { return { mod:null, cDraft:null, ud:null, userModal:false, docEd:null, kpiEd:null, roleDraft:null, docView:null, modPreview:null, modDelete:null, uMenu:null, roleMenu:false, notifOpen:false }; }
  onBrowserBack(e) {
    const s = this.state;
    // v41.19: on the sign-in screens the browser Back button returns to Sign in (Reset password, Check your email, Set your password)
    if (!s.authed) { if (s.loginView && s.loginView !== 'signin') { if (s.loginView === 'newpw' && Backend.on) Backend.signOut().catch(() => {}); this.setState(st => ({ loginView:'signin', login: { ...st.login, busy:false, err:'', npw:'', npw2:'', recovery:false } })); } return; }
    const target = e.state && e.state.sf, here = NavMemory.snap(s);
    const ed = this.dirtyEditor(), open = this.openEditor(), popup = !!(s.docView || s.modPreview || s.modDelete || s.userModal);
    const stay = () => { try { history.pushState({ sf: here }, ''); } catch (x) {} };
    // v41.21: unsaved changes: Cancel = stay on the page with the editor open; OK = discard them AND go back (it used to stay put).
    if (ed && !window.confirm('You have unsaved changes in this ' + ed + '. Leave without saving?\n\nSelect Cancel to stay and save first.')) return stay();
    // No changes: Back just closes the open editor or pop-up; you stay on the page.
    if (!ed && (open || popup)) { this.setState({ ...this.closeOverlays(), userModal:false }); return stay(); }
    if (ed) this.setState({ ...this.closeOverlays(), userModal:false });
    if (!target || !target.screen) return;
    this._fromPop = true; try { const { screen, ...rest } = target; this.go(screen, { ...rest, ...this.closeOverlays() }); } finally { this._fromPop = false; }
  }
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
    this.edSnap(s);   // v41.21
    Backend.observe(s);
    if (Backend.on && s.authed && s.beReady) {   // v41.25
      const bj = JSON.stringify({ brandName: s.brandName, brandAccent: s.brandAccent, brandMsg: s.brandMsg, brandLogo: s.brandLogo || '' });
      if (bj !== this._brandJ) { this._brandJ = bj; try { localStorage.setItem('sf-brand', bj); } catch (e) {} }
    }
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
      goHomeRole: () => this.goHomePage(),   // v41.20: the logo always opens the LMS home page
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
      brLogoSrc: s.brandLogo || '', brLogoOn: !!s.brandLogo, brLogoOff: !s.brandLogo,   // v41.25: logo on sign-in, header and Branding preview
      brLogoPick: e => this.brLogoRead(e), brLogoClear: () => this.brLogoSet('', 'Logo removed. The “S” badge is shown again.'),
    };
    RENDER_PIPELINE.forEach(fn => Object.assign(vals, this[fn](c)));
    return { ...vals, ...this.adminVals(s, c.all), ...this.batchVals(s, role), ...this.assignVals(s, role), ...this.attemptVals(s, role), ...this.qbankVals(s, role), ...this.accountVals(s, role) };
  }
  /* v41.25: Branding › Logo. The picture is shrunk in the browser (PNG / JPG / WebP, at most 400 × 120 px) and saved inside the
   * branding setting as a small embedded image, so it also shows on the sign-in page (no storage link that needs a sign-in). */
  brLogoSet(v, msg) { this.setState({ brandLogo: v }); this.toastMsg(msg || 'Logo updated.'); }
  brLogoRead(e) {
    const inp = e && e.target, f = inp && inp.files && inp.files[0]; if (!f) return;
    const LIMIT = 120000;   // characters of the embedded image: keeps the saved row small and under the live-update message size
    if (!/^image\/(png|jpeg|webp)$/.test(f.type) || /\.svgz?$/i.test(f.name)) { try { inp.value = ''; } catch (x) {} return this.toastMsg('Use a PNG, JPG or WebP image. SVG isn’t accepted because it can carry scripts.'); }
    if (f.size > 5 * 1048576) { try { inp.value = ''; } catch (x) {} return this.toastMsg('That image is over 5 MB. Choose a smaller file.'); }
    Promise.resolve(Backend.on && Backend._sniff ? Backend._sniff(f) : true)
      .then(ok => { if (!ok) throw new Error('The file content does not match its type.');
        return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); }); })
      .then(url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That file could not be opened as an image.')); im.src = url; }))
      .then(im => {
        const k = Math.min(1, 400 / im.naturalWidth, 120 / im.naturalHeight), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const photo = f.type === 'image/jpeg'; let out = c.toDataURL(photo ? 'image/jpeg' : 'image/png', 0.92);
        if (out.length > LIMIT && !photo) out = c.toDataURL('image/webp', 0.9);
        if (out.length > LIMIT || !/^data:image\/(png|jpeg|webp);base64,/.test(out)) throw new Error('That image is too detailed to store as a logo. Use a simpler or smaller image.');
        this.brLogoSet(out, Backend.on ? 'Logo updated. It is saved with the branding and shows on the sign-in page, the header and the preview.' : 'Logo updated for this session (offline demo).'); })
      .catch(err => this.toastMsg(String((err && err.message) || err)))
      .finally(() => { try { inp.value = ''; } catch (x) {} });
  }
  moveQ(i, dir) { this.setState(st => { const ids = [...st.quizDraft.ids]; const j = i + dir; if (j < 0 || j >= ids.length) return null; const t = ids[i]; ids[i] = ids[j]; ids[j] = t; return { quizDraft: { ...st.quizDraft, ids } }; }); }

}
