const SUB_OF = { quizBuild:'quizzes', batch:'batches', courseForm:'courseAdmin', feedback:'reports' };
/* Skillforge LMS — Settings (admin and trainer) view-model. Runs the admin feature modules in order;
 * each adds its values and shares what later modules need through c. */
const ADMIN_SCREENS = {
  amSettings: ['admin'], amMigration: ['migReport', 'migrate'], amQuestions: ['qbank', 'quizBuild', 'quizzes'], amCategories: ['categories'], amAnnouncements: ['announcements'],
  amLcms: ['lcms'], amQuizzes: ['quizzes', 'quizBuild'], amCourses: ['courseAdmin'], amPaths: ['paths'], amReports: ['reports'], amUsers: ['users'], amUserImport: ['users'],
  amRoles: ['perms'], amFeedback: ['feedback', 'reports'], amPlaces: ['places'], amBookmarks: ['bookmarks'], amCerts: ['certs'], amQuestionMeta: ['qbank'],
  amLearnerExtras: ['progress', 'home', 'calendar'], amZingHR: ['zinghr'], amDashboard: ['dashboard', 'training'], amKpis: ['kpis'], amDocs: ['docs', 'docAdmin'], amMasters: ['masters'], amDatabase: ['database'], amContentCheck: ['contentCheck'],
};
const ADMIN_PIPELINE = ["amSettings", "amMigration", "amQuestions", "amCategories", "amAnnouncements", "amLcms", "amQuizzes", "amCourses", "amPaths", "amReports", "amUsers", "amUserImport", "amPlatform", "amRoles", "amFeedback", "amPlaces", "amBookmarks", "amCerts", "amZingHR", "amDashboard", "amKpis", "amDocs", "amMasters", "amDatabase", "amQuestionMeta", "amLearnerExtras", "amContentCheck"];
SkillforgeApp.prototype.adminVals = function (s, all) {
  const scrV = this._scrV;
  const role = this.roleOf(s);
  const isAdm = !!role.admin, isSuper = isAdm, perms = this._perms || new Set(), canAdmin = perms.size > 0;
  const W = '#FFFFFF', INK = '#16324F';
  const ago = id => () => this.go(id, { adminView:true });
  const tg = (on, fn) => ({ on: !!on, track: on ? '#08AE6E' : '#C9D7E2', knob: on ? '21px' : '3px', toggle: fn });
  const segs = (cur, opts, pick, lab) => opts.map(v => { const on = cur === v; return { label: lab ? lab(v) : v, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => pick(v) }; });
  const chipsOf = (cur, opts, pick) => opts.map(v => { const on = cur === v; return { label:v, border: on ? INK : '#C9D7E2', bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, pick: () => pick(v) }; });
  const I = { bookmark:'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', award:'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.2 13.9 7 23l5-3 5 3-1.2-9.1', room:'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-4h4v4', chat:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5', sync:'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5', move:'M5 12h14M13 6l6 6-6 6M5 5v14', retry:'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v4l3 2', batch:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', plan:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h3M8 18h6', layers:'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', tree:'M4 5h6v4H4zM14 15h6v4h-6zM14 5h6v4h-6zM7 9v8h7M10 7h4', megaphone:'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12', bank:'M4 6h16M4 12h16M4 18h10', quiz:'M4 7l2 2 4-4M4 17l2 2 4-4M13 7h7M13 17h7', course:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5', path:'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7', report:'M5 20V10M12 20V4M19 20v-7', users:'M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6', bell:'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', plug:'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4', chart:'M3 17l6-6 4 4 8-8M15 7h6v6', log:'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5', shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', brush:'M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22zM7.5 11.5h.01M12 7.5h.01M16.5 11.5h.01' };
  const activeUsers = s.users.filter(u => u.status === 'Active').length;
  const c = { I, INK, W, activeUsers, ago, all, chipsOf, isAdm, isSuper, perms, role, s, segs, tg };
  const vals = {
    canAdmin,
    firstName: ((s.users.find(u => u.name === role.name) || {}).preferred || '').trim() || role.name.split(' ')[0],
    consoleLabel: isAdm ? 'ADMIN CONSOLE' : 'SETTINGS',
    // v41.12: the gear always opens Settings (it used to go Home when you were already inside Settings).
    // From a Settings page it returns to the tab that page is on; Home is in the top menu.
    toggleAdmin: () => this.go('admin', { adminView:true, setTab: s.screen === 'admin' ? s.setTab : (SUB_OF[s.screen] && (this._secOf || {})[SUB_OF[s.screen]]) || (this._secOf || {})[s.screen] || s.setTab || null }),
    gearTitle: 'Settings',
    gearBg: s.adminView ? INK : W,
    gearFg: s.adminView ? '#F8FBFD' : INK,
    gearBorder: s.adminView ? INK : '#D7E3EC',
    goHomeRole: () => s.adminView ? this.go('admin') : this.go(role.home),
    showAdminBack: s.adminView && s.screen !== 'admin' && s.screen !== 'batch',
    goAdminHome: () => this.go('admin'),
    backToLearning: () => this.go('home', { adminView:false }),
    isAdminHome: scrV === 'admin',
    isAccount: scrV === 'account',
    isAttempts: scrV === 'attempts',
    isLcms: scrV === 'lcms',
    isCategories: scrV === 'categories',
    isAnnouncements: scrV === 'announcements',
    isQbank: scrV === 'qbank',
    isQuizzes: scrV === 'quizzes',
    isQuizBuild: scrV === 'quizBuild',
    isCourseAdmin: scrV === 'courseAdmin',
    isCourseForm: scrV === 'courseForm',
    isPaths: scrV === 'paths',
    isReports: scrV === 'reports',
    isUsers: scrV === 'users',
    isAutomations: scrV === 'automations',
    isIntegrations: scrV === 'integrations',
    isAudit: scrV === 'audit',
    isPerms: scrV === 'perms',
    isBranding: scrV === 'branding', isContentCheck: scrV === 'contentCheck',
  };
  // v41.13: Supabase Free plan usage meter (Settings home, LCMS, Documents library). Testing only: USAGE_METER in js/config.js.
  const UM = Backend.Usage, umHere = UM.on() && ['admin', 'lcms', 'docAdmin'].includes(scrV);
  if (umHere && !s.beUsage && !this._umAsked) { this._umAsked = true; Promise.resolve().then(() => UM.load()); }
  if (umHere) { const u = s.beUsage, row = (label, used, lim) => { const p = Math.min(100, used / lim * 100);
      return { label, pct: Math.round(p) + '%', w: Math.max(1, p).toFixed(1) + '%', col: p >= 90 ? '#D64545' : p >= 75 ? '#D97706' : '#08AE6E',
        text: UM.mb(used) + ' used of ' + UM.mb(lim) + ' · ' + UM.mb(Math.max(0, lim - used)) + ' left' }; };
    const rows = u ? [row('File storage', u.storage, UM.LIM.storage), row('Database', u.db, UM.LIM.db)] : [], worst = u ? Math.max(u.storage / UM.LIM.storage, u.db / UM.LIM.db) : 0;
    Object.assign(vals, { umShow: true, umHas: !!u, umRows: rows, umLoading: !u,
      umState: worst >= 0.9 ? 'Almost full' : worst >= 0.75 ? 'Getting full' : 'Plenty of space', umStBg: worst >= 0.9 ? '#FDECEC' : worst >= 0.75 ? '#FEF3C7' : '#DCFCE7', umStFg: worst >= 0.9 ? '#A63232' : worst >= 0.75 ? '#92400E' : '#166534',
      umWhen: u ? 'Checked ' + new Date(u.at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) + ' · ' + u.files.toLocaleString('en-US') + ' files' : '',
      umRefresh: () => UM.load(true).then(r => this.toastMsg(r ? 'Usage updated' : 'Could not read the usage. Run migration 007 in Supabase.')) });
  } else vals.umShow = false;
  // Each module computes only on the screens that use it, so a page never pays for the others (matters at 3,500 users).
  const on = ADMIN_SCREENS, scr = this._scrV;
  ADMIN_PIPELINE.forEach(fn => { const list = on[fn]; if (!list || list.includes(scr)) Object.assign(vals, this[fn](c)); });
  return vals;
};
