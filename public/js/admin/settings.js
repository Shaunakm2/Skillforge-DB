/* Skillforge LMS — Settings home: tiles grouped into sections (what each user type can open). */
SkillforgeApp.prototype.amSettings = function (c) {
  const { I, INK, W, activeUsers, ago, isAdm, perms, s } = c;
  // Settings tiles grouped into sections. Trainers only see what they can use.
  const asgCount = Object.values(s.enroll).reduce((n, m) => n + Object.keys(m).length, 0);
  const extraCount = Object.values(s.extraAttempts).reduce((n, m) => n + Object.values(m).reduce((a, v) => a + v, 0), 0);
  const migCount = s.syncLog.length;
  // Every tile lists the screen it opens; it shows only if the person's role has a permission for that screen.
  const can = id => (Access.screenPerms[id] || []).some(k => perms.has(k));
  const pending = Feedback.list(s).filter(x => x.status === 'Due').length;
  const SECTIONS = [
    ['users', 'User management', 'Accounts, roles and what each role can do.', [
      ['Users & accounts', 'Create and edit accounts, reset passwords, deactivate.', activeUsers + ' active', 'users', '#DB2777', W, I.users],
      ['Roles & permissions', 'Create roles, choose their permissions and default courses.', s.roles.length + ' roles', 'perms', '#84CC16', INK, I.shield]]],
    ['content', 'Learning content', 'Questions, uploads, courses, assignments and certificates.', [
      ['Question bank', 'Every question with its metadata. Assessments are built from it.', s.qs.length + ' questions', 'qbank', '#7C5CFF', W, I.bank],
      ['LCMS', 'Upload hub for documents, video, audio, SCORM and assessments.', s.lcms.length + ' modules', 'lcms', '#0F766E', W, I.layers],
      ['Course catalog', 'Build courses from LCMS modules.', s.adminCourses.length + ' courses', 'courseAdmin', '#08AE6E', INK, I.course],
      ['Course assignment', 'Assign courses to one person or upload a file for many.', asgCount + ' assignments', 'assignments', '#0891B2', W, I.plan],
      ['Access requests', 'Courses learners asked for from the catalog. Approve (assigns the course) or decline.', s.accessReqs.filter(r => r.status === 'Pending').length + ' pending', 'assignments', '#D64545', W, I.bell, { reqFilter:'Pending', rqFocus:true }],
      ['Assessment attempt management', 'Give a learner extra attempts on an assessment.', extraCount + (extraCount === 1 ? ' extra attempt given' : ' extra attempts given'), 'attempts', '#7C3AED', W, I.retry],
      ['Clear SCORM bookmarking', 'Reset where a learner resumes a SCORM course.', Object.values(s.bookmarks).reduce((n, m) => n + Object.keys(m).length, 0) + ' bookmarks', 'bookmarks', '#B45309', W, I.bookmark],
      ['Certificates', 'Design the certificate: background, name, course, date and score.', 'v' + s.certTpl.version, 'certs', '#CA8A04', W, I.award],
      ['Categories', 'Categories, sub categories and sub-sub categories.', s.cats.length + ' categories', 'categories', '#F59E0B', INK, I.tree],
      ['Learning paths', 'Sequence courses for a role or a team.', s.paths.length + ' paths', 'paths', '#FF6B4A', INK, I.path],
      ['Course builder', 'Draft a course module by module.', s.bMods.length + ' modules in draft', 'builder', '#8C5A9E', W, I.course]]],
    ['delivery', 'Training delivery', 'Batches, classrooms, gradebook and training feedback.', [
      ['Batch management', 'Batches, outcomes, history, training types, statuses and holidays.', s.batches.filter(b => batchStatus(b) === 'Ongoing').length + ' ongoing', 'batches', '#4F46E5', W, I.batch],
      ['Training places', 'Classrooms, seating capacity and IT infrastructure.', s.places.length + ' rooms', 'places', '#0E7490', W, I.room],
      ['Gradebook', 'Scores per learner, and written answers to rate.', s.reviews.filter(r => r.rating === null).length + ' answers to rate', 'gradebook', '#0D9488', W, I.report]]],
    ['comms', 'Communication', 'What learners see and get reminded about.', [
      ['Announcements', 'Homepage banners with a live-until date.', s.anns.filter(a => annStatus(a) === 'Live').length + ' live', 'announcements', '#E11D48', W, I.megaphone],
      ['Notifications & automations', 'Reminders, escalations and re-enrollment.', s.autos.filter(a => a.on).length + ' rules on', 'automations', '#22C55E', INK, I.bell],
      ['Documents library', 'SOPs, policies, handbooks and forms: upload, versions, who sees them, required reading and acknowledgements.', (s.docs || []).filter(d => d.status === 'Published').length + ' published', 'docAdmin', '#0E7490', W, I.log]]],
    ['reports', 'Reports', 'Reporting, trends and the admin audit trail.', [
      ['Reports', perms.has('reports') ? 'Completion, users, assessment results, feedback, compliance and more. Choose the columns of each report.' : 'Course completion and course progress reports.', (n => n + (n === 1 ? ' report' : ' reports'))(Object.keys(RDEF).filter(k => perms.has('reports') || (['usercourses', 'allcompletion', 'progress'].includes(k) && perms.has('reportsCompletion')) || (['kirkpatrick', 'kpfeedback'].includes(k) && perms.has('feedback'))).length), 'reports', '#2563EB', W, I.report],
      ['Kirkpatrick analysis', 'Opens Reports › Kirkpatrick L1–L4 analysis: results per level, schedule and sending. Forms are built in LCMS.', Feedback.list(s).filter(x => x.status === 'Due').length + ' due to send', 'feedback', '#9333EA', W, I.chat],
      ['Training overview & MIS', 'All training batches in one place: overview, MIS (trained, handed over, attrition, throughput, absorb, handover pipeline), attrition and every trainee with their scores.', s.batches.filter(b => batchStatus(b) !== 'Completed').length + ' active batches', 'training', '#0F766E', W, I.chart, { trTab:'overview' }],
      ['Analytics dashboards', 'Power BI–style, from LMS courses, training batches and the HRMS employee master: add charts, heat maps and spider webs, pick measures (including your own KPIs), filter, drill into the records, schedule.', (s.dash.boards.length - 2) + ' dashboards', 'dashboard', '#9333EA', W, I.chart, { dbBoard:'b1' }],
      ['KPI builder', 'Your own KPIs as formulas, e.g. joined on day 0 as per HRMS minus absent on day 1, with targets and RAG colours. Plus every dataset and field.', (s.dash.kpis || []).length + ' custom KPIs', 'kpis', '#7C3AED', W, I.chart],
      ['Engagement trends', 'Active learners, completion and time spent over 30 days to 12 months.', 'Last 90 days', 'analytics', '#7C3AED', W, I.chart],
      ['Audit log', 'Every admin action, timestamped and exportable.', AUDIT.length + ' recent events', 'audit', '#16324F', '#F8FBFD', I.log]]],
    ['platform', 'Platform', 'Connected systems and how the portal looks.', [
      ['ZingHR employee master', 'Sync employees from ZingHR: field mapping, rules, schedule and run history.', s.users.length.toLocaleString('en-US') + ' people synced', 'zinghr', '#0F766E', W, I.sync],
      ['Database & storage', Backend.on ? 'Supabase connection, what is stored, sample data and backups.' : 'Not connected: data lives in this browser only. Connect Supabase to keep it.', Backend.on ? 'Supabase · ' + Backend.org : 'Offline', 'database', '#3ECF8E', '#16324F', I.layers],
      ['Integrations', 'SSO, HRIS sync, virtual classrooms, SCORM.', s.integ.filter(a => a.on).length + ' connected', 'integrations', '#0EA5E9', INK, I.plug],
      ['Branding', 'Portal name, colors and sign-in page.', s.brandName, 'branding', '#F43F5E', INK, I.brush]]],
    ['masters', 'Master data', 'Lists and settings the old MIS workbook kept on its Validation sheet, plus holidays and badges.', [
      ['MIS lists', 'Training segment, type of trainee, training name, division, sub division, location, brand, attrition reasons…', MASTER_DEFS.length + ' lists', 'masters', '#0F766E', W, I.tree, { mdTab:'lists' }],
      ['Training types', 'Duration, day-wise plan, passing %, weights, batch ID code.', s.ttypes.length + ' types', 'batches', '#4F46E5', W, I.batch, { bView:'types' }],
      ['Trainee statuses', 'In-Training, Early Absorb, Attried… and the group each counts in.', s.statuses.length + ' statuses', 'batches', '#7C3AED', W, I.users, { bView:'statuses' }],
      ['Holiday list', 'Standard holidays. Add one or upload a CSV; batch end dates move automatically.', s.holidays.length + ' holidays', 'masters', '#B45309', W, I.bell, { mdTab:'holidays' }],
      ['Badges', 'What learners earn: icon, name, colour and the rule to earn it.', s.badges.filter(b => b.on).length + ' active', 'masters', '#CA8A04', W, I.award, { mdTab:'badges' }],
      ['Tile management', 'Show, hide, rename and reorder tiles on Home, Settings, batch cards, Training overview and the learner menu.', Object.keys(TILE_GROUPS).length + ' tile groups', 'masters', '#9333EA', W, I.layers, { mdTab:'tiles' }],
      ['App settings', 'Switch features on or off (gamification, badges, discussions, calendar, access requests…), defaults, and a map of everything you can customise.', Object.values((s.platform || PLATFORM0).feat).filter(Boolean).length + ' features on', 'masters', '#0F766E', W, I.shield, { mdTab:'app' }]]],
    ['migration', 'Migration', 'Data coming in from HRMS and APIs, and moving learning records in or out of Skillforge.', [
      ['Data migration report', 'Every change received from HRMS or other APIs between two dates.', migCount + ' changes logged', 'migReport', '#0369A1', W, I.sync],
      ['Migrate to or from Skillforge', 'Upload completions from another LMS, or download everything to move out.', (s.extHistory.length) + ' imported records', 'migrate', '#B45309', W, I.move]]],
  ].map(([k, t, d, list]) => [k, t, d, k === 'masters' && !perms.has('masters') ? [] : list.filter(x => can(x[3]))]);
  const mkTile = ([title, desc, stat, id, bg, fg, icon, extra]) => { const light = fg !== INK; return { title, desc, stat, bg, fg, icon, blob: light ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.35)', iconBg: light ? '#FFFFFF' : INK, iconFg: bg === '#16324F' ? INK : bg, chipBg: light ? 'rgba(255,255,255,.2)' : 'rgba(22,50,79,.12)', iconBgSafe: '#FFFFFF', go: () => this.go(id, { adminView:true, ...(extra || {}) }) }; };
  const setSections = SECTIONS.map(([key, title, desc, list]) => ({ key, title, desc, tiles: Tiles.apply(s, 'settings', list.filter(Boolean), x => x[0], (x, l) => [l].concat(x.slice(1))).map(mkTile) })).filter(x => x.tiles.length).map(x => ({ ...x, count: x.tiles.length + (x.tiles.length === 1 ? ' module' : ' modules') }));
  const tiles = setSections.flatMap(x => x.tiles);
  // Section tabs: one section open at a time.
  const curKey = setSections.some(x => x.key === s.setTab) ? s.setTab : (setSections[0] || {}).key;
  const curSec = setSections.find(x => x.key === curKey) || { title:'', desc:'', tiles:[] };
  return {
    setAllTiles: SECTIONS.flatMap(x => x[3].filter(Boolean).map(t => ({ key: t[0], sec: x[1] }))),
    tiles,
    setSections, setCur: curSec,
    setTabs: setSections.map(x => { const on = x.key === curKey; return { label: ({ users:'Users', content:'Content', delivery:'Delivery', comms:'Communication' })[x.key] || x.title, n: x.tiles.length, on, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', nBg: on ? 'rgba(248,251,253,.18)' : '#EAF1F6', pick: () => this.setState({ setTab: x.key }) }; }),
    showAttn: isAdm,
    consoleTitle: isAdm ? 'Admin Console' : 'Settings',
    consoleSub: isAdm ? 'Everything you manage for Northwind, grouped by area.' : 'The Settings tools your role gives you.',
  };
};
