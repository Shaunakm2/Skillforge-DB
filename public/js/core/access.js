/* Skillforge LMS — roles and permissions.
 *
 *  Every person has a role. A role has a base user type (Learner, Trainer or Admin) and a set of
 *  permissions: the Settings modules it can open. Admin roles always have every permission.
 *  A role can also carry default courses, assigned automatically to anyone who gets that role,
 *  so a new teammate inherits the role's access and learning on day one.
 *  Settings › User management › Roles & permissions.
 */
const MODULES = [
  // key, label, Settings section, screens it opens
  ['users', 'Users & accounts', 'users', ['users', 'team']],
  ['roles', 'Roles & permissions', 'users', ['perms']],
  ['qbank', 'Question bank', 'content', ['qbank']],
  ['quizzes', 'Quizzes', 'content', ['quizzes', 'quizBuild']],
  ['lcms', 'LCMS', 'content', ['lcms']],
  ['lcmsForms', 'LCMS: surveys and feedback forms only', 'content', ['lcms']],
  ['courseAdmin', 'Course catalog', 'content', ['courseAdmin']],
  ['assignments', 'Course assignment', 'content', ['assignments']],
  ['attempts', 'Assessment attempt management', 'content', ['attempts']],
  ['bookmarks', 'Clear SCORM bookmarking', 'content', ['bookmarks']],
  ['certs', 'Certificates', 'content', ['certs']],
  ['categories', 'Categories', 'content', ['categories']],
  ['paths', 'Learning paths', 'content', ['paths']],
  ['builder', 'Course builder', 'content', ['builder']],
  ['batches', 'Batch management (batches they run)', 'delivery', ['batches', 'batch']],
  ['places', 'Training places', 'delivery', ['places']],
  ['gradebook', 'Gradebook', 'delivery', ['gradebook']],
  ['feedback', 'Training feedback (Kirkpatrick L1–L4)', 'delivery', ['feedback', 'reports']],   // v36: the analysis is in Reports
  ['announcements', 'Announcements', 'comms', ['announcements']],
  ['automations', 'Notifications & automations', 'comms', ['automations']],
  ['documents', 'Documents library: upload and manage SOPs, policies and handbooks, track acknowledgements', 'comms', ['docAdmin']],
  ['reports', 'Reports (all)', 'reports', ['reports']],
  ['reportsCompletion', 'Reports: course completion and course progress', 'reports', ['reports']],
  ['analytics', 'Analytics', 'reports', ['analytics']],
  ['dashboard', 'Analytics dashboards (create, change, schedule, KPI builder) and Training overview & MIS', 'reports', ['dashboard', 'training', 'kpis']],
  ['dashView', 'Analytics dashboards: view the ones shared with their role (no changes, no raw-data export)', 'reports', ['dashboard']],
  ['audit', 'Audit log', 'reports', ['audit']],
  ['integrations', 'Integrations, ZingHR sync, database & storage', 'platform', ['integrations', 'zinghr', 'database']],
  ['branding', 'Branding', 'platform', ['branding']],
  ['migration', 'Migration', 'migration', ['migReport', 'migrate']],
  ['masters', 'Master data (MIS lists, holidays, badges)', 'masters', ['masters']],
];
const ALL_PERMS = Object.fromEntries(MODULES.map(m => [m[0], true]));
const ROLES0 = [
  { id:'r_learner', name:'Learner', base:'Learner', builtin:true, desc:'Trainees: assigned courses, catalog, learning paths.', perms:{}, courses:[] },
  { id:'r_trainer', name:'Trainer', base:'Trainer', builtin:true, desc:'Runs batches, assigns courses, rates answers.', perms:{ assignments:true, batches:true, gradebook:true, reportsCompletion:true }, courses:[] },
  { id:'r_admin', name:'Admin', base:'Admin', builtin:true, desc:'Full access to every Settings module.', perms: ALL_PERMS, courses:[] },
  { id:'r_qa', name:'Quality Analyst', base:'Learner', builtin:false, desc:'Learner who also rates written answers and reviews completion.', perms:{ gradebook:true, reportsCompletion:true }, courses:['feedback'] },
];
const Access = {
  roleFor: (s, u) => (s.roles || []).find(r => r.id === (u && u.roleId)) || (s.roles || []).find(r => r.base === (u && u.role) && r.builtin) || null,
  /* Set of permission keys for the signed-in person. */
  permsFor(s, u, appRole) {
    if (appRole && appRole.admin) return new Set(Object.keys(ALL_PERMS));
    const r = Access.roleFor(s, u);
    return new Set(Object.keys((r && r.perms) || {}).filter(k => r.perms[k]));
  },
  /* Screens each permission opens. */
  screenPerms: (() => { const m = {}; MODULES.forEach(([k, , , scr]) => scr.forEach(x => { (m[x] = m[x] || []).push(k); })); return m; })(),
  /* Assign a role's default courses (existing due dates kept). Returns { enroll, added }. */
  applyCourses(enroll, role, user, due) {
    const e = { ...enroll }; let added = 0;
    (role && role.courses || []).forEach(cid => { if (!(e[user] || {})[cid]) { e[user] = { ...(e[user] || {}), [cid]: due }; added++; } });
    return { enroll: e, added };
  },
};
