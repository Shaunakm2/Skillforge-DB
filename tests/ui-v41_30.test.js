// v41.30: the edited front-end files, run as they are (no stand-ins): helpers.js, masters.js (Weekend days), auth.js, admin.js, platform.js,
// database.js and essentials.js. Only the globals those files use are stubbed.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), SRC = f => fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), J = x => JSON.parse(JSON.stringify(x));
const base = () => { const ctx = { console, Intl, JSON, Math, Date, Object, Array, Set, Map, Number, String, parseInt, Promise, Symbol, RegExp, Error, TODAY_KEY: '2026-10-17', Backend: { on: false }, Assessment: { score: () => ({ final: true, pct: 0 }) }, daysUntil: () => 0 };
  ctx.globalThis = ctx; ctx.SkillforgeApp = function () {}; vm.createContext(ctx); return ctx; };
const run = (ctx, code, name) => vm.runInContext(code, ctx, { filename: name });
const withProgress = ctx => { run(ctx, SRC('core/progress.js') + '\n;globalThis.Progress = Progress;', 'progress.js'); return ctx; };
const withHelpers = ctx => { run(ctx, SRC('core/helpers.js') + '\n;Object.assign(globalThis, { UI, PLATFORM0, PLATFORM_FEATS, TILE_GROUPS, defaultDue, csvDownload, downloadBlob, parseCsv });', 'helpers.js'); return ctx; };

test('every edited file parses', () => { for (const f of ['core/helpers.js', 'admin/masters.js', 'admin/platform.js', 'admin/database.js', 'admin/admin.js', 'learner/auth.js', 'learner/essentials.js']) assert.doesNotThrow(() => new vm.Script(SRC(f), { filename: f }), f); });

test('helpers.js: csvDownload goes through downloadBlob (one Blob, one link, released after 2 s); defaults carry Saturday + Sunday', () => {
  const ctx = withHelpers(withProgress(base())), log = [], timers = [];
  ctx.Blob = function (parts, o) { this.type = o.type; this.text = parts.join(''); };
  ctx.URL = { createObjectURL: b => { log.push(['create', b.type]); return 'blob:x'; }, revokeObjectURL: u => log.push(['revoke', u]) };
  const el = { click: () => log.push(['click', el.download]), remove: () => log.push(['remove']) };
  ctx.document = { createElement: t => { log.push(['el', t]); return el; }, body: { appendChild: () => log.push(['append']) } };
  ctx.setTimeout = (f, ms) => timers.push([f, ms]);
  run(ctx, "csvDownload('a.csv', [['n', 'v'], ['x', '=SUM(1)']])", 't');
  assert.deepEqual(J(log.map(x => x[0])), ['el', 'create', 'append', 'click', 'remove']); assert.equal(log[3][1], 'a.csv');
  assert.equal(timers.length, 1); assert.equal(timers[0][1], 2000); timers[0][0](); assert.deepEqual(J(log.at(-1)), ['revoke', 'blob:x']);
  assert.deepEqual(J(ctx.PLATFORM0.defaults.weekendDays), [0, 6]);
});
test('helpers.js: defaultDue is the organisation\'s today + the due days (offline: TODAY_KEY)', () => {
  const ctx = withHelpers(withProgress(base())), P = ctx.Progress;
  assert.equal(ctx.defaultDue({}), '2026-11-16');
  ctx.Backend.on = true; ctx.TODAY_KEY = '2000-01-01'; assert.equal(ctx.defaultDue({ platform: { defaults: { dueDays: 10 } } }), P.plus(P.orgToday(), 10));
});

// ---- masters.js: App settings > Weekend days ----
function masters() {
  const ctx = withHelpers(withProgress(base())); Object.assign(ctx, { MASTERS0: { trainingNames: [] }, MASTER_DEFS: [['trainingNames', 'Training name', 'Batches', 'x']], BADGE_METRICS: {}, KP_LEVELS: [], TRAIN_KPIS: [], ROLES: [{ nav: [] }], Badges: { earnedCount: () => 0 }, lastLogged: () => null, trainDays: () => [], holSetFor: () => new Set(), isWeekend: () => false, umDate: () => '' });
  run(ctx, SRC('admin/masters.js'), 'masters.js');
  const a = Object.create(ctx.SkillforgeApp.prototype); a._scrV = 'masters'; a.toasts = [];
  a.state = { platform: J(ctx.PLATFORM0), pfDraft: null, mdTab: 'app', masters: {}, users: [], batches: [], holidays: [], ttypes: [], badges: [], kpLib: { L1: { qs: [], audience: 'Learner', days: 0, on: true } }, kp: {}, tiles: {} };
  a.setState = u => { const p = typeof u === 'function' ? u(a.state) : u; a.state = Object.assign({}, a.state, p); };
  a.toastMsg = m => a.toasts.push(m); a.vals = () => a.amMasters({ s: a.state, role: {}, INK: '#16324F', W: '#FFFFFF' }); a.ctx = ctx; return a;
}
const on = v => v.pfWkDays.filter(c => c.bg === '#16324F').map(c => c.label);

test('Weekend days: Mon..Sun buttons, Saturday + Sunday selected by default', () => {
  const a = masters(), v = a.vals(); assert.equal(v.mdIsApp, true);
  assert.deepEqual(J(v.pfWkDays.map(c => c.label)), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']); assert.deepEqual(J(on(v)), ['Sat', 'Sun']);
});
test('Weekend days: clicking edits the draft, Save keeps it with the other defaults, Discard drops it', () => {
  const a = masters(); a.vals().pfWkDays[4].pick();                                // Friday
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 5, 6]); assert.equal(a.vals().pfDirty, true); assert.deepEqual(J(on(a.vals())), ['Fri', 'Sat', 'Sun']);
  a.vals().setPfDue({ target: { value: '45' } }); assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 5, 6], 'editing another field keeps the weekend choice');
  a.vals().pfSave(); assert.deepEqual(a.toasts, ['App settings saved']); assert.equal(a.state.pfDraft, null);
  assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 5, 6]); assert.equal(a.state.platform.defaults.dueDays, 45);
  a.vals().pfWkDays[5].pick(); a.vals().pfDiscard(); assert.equal(a.state.pfDraft, null); assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 5, 6]);
});
test('Weekend days: settings saved before v41.29 (no weekendDays) show Saturday + Sunday and save them; at least one working day must remain', () => {
  const a = masters(); a.state.platform = { feat: {}, defaults: { password: 'Pass@123', dueDays: 30, essDays: 30, idleMins: 30 } };
  assert.deepEqual(J(on(a.vals())), ['Sat', 'Sun']); a.vals().setPfDue({ target: { value: '31' } }); a.vals().pfSave(); assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 6]);
  for (const i of [0, 1, 2, 3, 4]) a.vals().pfWkDays[i].pick();                    // Mon..Fri
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 1, 2, 3, 4, 6]); assert.deepEqual(J(a.toasts.slice(-1)), ['Weekend days: keep at least one working day']);
  assert.deepEqual(J(a.vals().pfWkDays.filter(c => c.bg !== '#16324F').map(c => c.label)), ['Fri']);
});
test('Weekend days: the saved setting drives Progress (a Friday off moves an essential-training deadline)', () => {
  const a = masters(), P = a.ctx.Progress; P.configure(a.state); assert.equal(P.workingDeadline('2026-10-16', 1, []), '2026-10-16');   // Friday is a working day
  a.vals().pfWkDays[4].pick(); a.vals().pfSave(); P.configure(a.state); assert.equal(P.workingDeadline('2026-10-16', 1, []), '2026-10-19');   // Fri, Sat and Sun are all off now: Monday is the first working day
});
test('the Weekend days buttons are bound in public/index.html (paste the block if this fails)', { skip: !fs.existsSync(path.join(ROOT, 'public/index.html')) }, () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(/\{\{\s*pfWkDays\s*\}\}/.test(html), 'public/index.html has no {{ pfWkDays }}: apply patches/v41.31-index-weekend-days.patch (or the .crlf.patch if the file has Windows line endings): git apply patches/v41.31-index-weekend-days.patch');
});

// ---- auth.js and admin.js: the dead handlers are gone, everything else is still there ----
test('auth.js: toggleLgDemo, toggleSearch and setGq are removed; the rest of the sign-in values are unchanged', () => {
  const ctx = base(); Object.assign(ctx, { ROLES: [], NavMemory: { load() {}, clear() {} }, DEMO_PASSWORD: 'skillforge', DEFAULT_PASSWORD: 'Pass@123', ini: s => String(s || '').slice(0, 2), Fmt: { medium: x => x }, Backend: { on: false, configured: false, KEEP_MIN: 45 } });
  run(ctx, SRC('learner/auth.js'), 'auth.js'); const a = Object.create(ctx.SkillforgeApp.prototype); a.setState = () => {};
  const v = a.vmAuth({ navItems: [], role: { name: 'Eve', label: 'Learner' }, s: { login: {}, loginView: 'signin', authed: true, users: [], lgDemo: false } });
  for (const k of ['toggleLgDemo', 'toggleSearch', 'setGq']) assert.ok(!(k in v), k + ' is gone');
  for (const k of ['doLogin', 'lgKey', 'lgKeyReset', 'lgKeyNew', 'lgDemoOpen', 'demoAccounts', 'signOut', 'goForgot', 'sendReset', 'ssoLogin', 'saveNewPw', 'cancelNewPw', 'goAccount', 'searchOpen', 'gq', 'navItems', 'persona']) assert.ok(k in v, k + ' is still there');
});
test('admin.js: goAdminHome is removed; backToLearning, showAdminBack and the screen flags are still there', () => {
  const s = SRC('admin/admin.js'); assert.doesNotMatch(s, /goAdminHome/); for (const k of ['backToLearning', 'showAdminBack', 'goHomeRole', 'toggleAdmin', 'isAdminHome', 'isContentCheck']) assert.match(s, new RegExp(k + ':'));
});
test('platform.js: permRows (an unused no-op) is gone; TODAY_KEY is replaced by the organisation date', () => {
  const s = SRC('admin/platform.js'); assert.doesNotMatch(s, /permRows/); assert.doesNotMatch(s, /TODAY_KEY/); assert.equal((s.match(/Progress\.today\(\)/g) || []).length, 3); assert.match(s, /permRoles:/);
});

// ---- database.js: the backup uses downloadBlob ----
test('database.js: Download backup saves one JSON file named with the organisation date', () => {
  const ctx = withHelpers(withProgress(base())), log = []; Object.assign(ctx, { Backend: { on: false, status: () => ({ ok: false, text: 'x' }), rowsOf: () => [{ coll: 'users', key: 'u1', data: {} }], org: 'o', BUCKET: 'b', me: () => ({}) } });
  ctx.Blob = function (p, o) { this.type = o.type; this.p = p; }; ctx.URL = { createObjectURL: b => { log.push(['blob', b.type]); return 'blob:x'; }, revokeObjectURL() {} }; ctx.setTimeout = () => 1;
  const el = { click: () => log.push(['click', el.download]), remove() {} }; ctx.document = { createElement: () => el, body: { appendChild() {} } };
  run(ctx, SRC('admin/database.js'), 'database.js'); const a = Object.create(ctx.SkillforgeApp.prototype); a._scrV = 'database'; a.toastMsg = m => log.push(['toast', m]);
  const v = a.amDatabase({ s: {} }); v.dbBackup();
  assert.deepEqual(J(log.filter(x => x[0] !== 'toast')), [['blob', 'application/json'], ['click', 'skillforge-backup-2026-10-17.json']]); assert.match(log.at(-1)[1], /Backup downloaded · 1 records/);
});

// ---- essentials.js: Weekend days and the organisation date ----
test('essentials.js: deadlines follow the Weekend days setting and "overdue" follows the organisation date, not the browser date', () => {
  const ctx = withProgress(base()); ctx.Progress.courseDone = () => false; ctx.PLATFORM0 = { feat: {} }; run(ctx, SRC('learner/essentials.js') + '\n;globalThis.Essentials = Essentials;', 'essentials.js');
  const P = ctx.Progress, E = ctx.Essentials; ctx.Backend.on = true; ctx.TODAY_KEY = '2000-01-01';       // a browser/sample date far in the past: only the organisation's date gives the answers below
  const u = { name: 'Eve', joined: '2026-10-16', status: 'Active' }, a = { id: 'c1', title: 'T', essential: true, status: 'Published', essentialFrom: '2026-01-01', essentialDays: 1 };
  P.configure({}); assert.equal(E.deadline(u, a, []), '2026-10-16'); P.configure({ platform: { defaults: { weekendDays: [5, 6] } } }); assert.equal(E.deadline(u, a, []), '2026-10-18'); P.configure({});
  const now = P.orgToday(), st = by => J(E.statusFor({ enroll: { Eve: { c1: by } }, adminCourses: [a], holidays: [] }, u).map(x => ({ overdue: x.overdue, left: x.left })))[0];
  assert.equal(st(P.plus(now, -1)).overdue, true); assert.equal(st(now).overdue, false); assert.equal(st(P.plus(now, 1)).overdue, false);
  ctx.Backend.on = false; ctx.TODAY_KEY = '2026-10-17'; assert.equal(st('2026-10-16').overdue, true, 'offline demo: TODAY_KEY');
  const r = E.apply({}, [a], [u], [], {}); assert.equal(r.added, 1); assert.equal(r.assignedOn['Eve|c1'], '2026-10-16');
});
