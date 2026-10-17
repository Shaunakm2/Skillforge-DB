// v41.30 (round 3): the clean-up patcher (scripts/apply-v41.30.mjs), the property remover, the two report scripts, and Weekend days in essential training.
// The patcher is run on copies of your code: tests/fixtures/v41_30 holds the real lines around the handlers (auth.js, admin.js, users.js) and essentials.js whole.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), FX = path.join(__dirname, 'fixtures', 'v41_30'), SCRIPTS = path.join(ROOT, 'scripts');
const J = x => JSON.parse(JSON.stringify(x)), rd = f => fs.readFileSync(path.join(FX, f), 'utf8');

function tree(over = {}, opts = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'sf30-')), put = (rel, src) => { const p = path.join(t, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, src); };
  const files = { 'public/index.html': rd('template-excerpt.html'), 'public/js/learner/essentials.js': rd('essentials.js'), 'public/js/admin/users.js': rd('users-excerpt.js'), 'public/js/learner/auth.js': rd('auth-excerpt.js'), 'public/js/admin/admin.js': rd('admin-excerpt.js'),
    'public/js/other.js': 'const other = { keep: 1 };\n', 'scripts/changelog-v41.30.md': fs.readFileSync(path.join(SCRIPTS, 'changelog-v41.30.md'), 'utf8'),
    'CHANGELOG.md': '# Changelog\n\nNewest first. Entries before v38 are the original per-version files, kept verbatim; originals are in `docs/archive/`.\n\n## v41.21 (assessments)\n- old entry\n',
    'README.md': '## Skillforge LMS\n\n### Tests\nnpm test\n', 'README.txt': 'Skillforge v41.24: Certificates moves into Master data (admins only)\nDEPLOY\n- x\n', ...over };
  Object.entries(files).forEach(([k, v]) => { if (v !== null) put(k, v); });
  fs.copyFileSync(path.join(SCRIPTS, 'lib-v41.30.mjs'), path.join(t, 'scripts', 'lib-v41.30.mjs'));
  return { t, read: rel => fs.readFileSync(path.join(t, rel), 'utf8'), has: rel => fs.existsSync(path.join(t, rel)), put, run: (...a) => spawnSync(process.execPath, [path.join(SCRIPTS, 'apply-v41.30.mjs'), ...a, t], { encoding: 'utf8' }) };
}
const parses = (src, name) => { try { new vm.Script(src, { filename: name }); return true; } catch (e) { return false; } };

test('removes the handlers it can prove unused, keeps exportUsers (the Export menu calls V.exportUsers()), and reports both', () => {
  const T = tree(), r = T.run(); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /auth\.js: removed toggleLgDemo/); assert.match(r.stdout, /auth\.js: removed toggleSearch/); assert.match(r.stdout, /auth\.js: removed setGq/); assert.match(r.stdout, /admin\.js: removed goAdminHome/);
  assert.match(r.stdout, /exportUsers: KEPT \(other uses: public\/js\/admin\/users\.js:/);
  const a = T.read('public/js/learner/auth.js'), d = T.read('public/js/admin/admin.js'), u = T.read('public/js/admin/users.js');
  assert.doesNotMatch(a, /toggleLgDemo|toggleSearch|setGq/); assert.doesNotMatch(d, /goAdminHome/); assert.match(u, /exportUsers: \(\) =>/);
  // neighbours are intact
  assert.match(a, /lgDemoOpen: !!s\.lgDemo, lgKey: e =>/); assert.match(a, /searchOpen: s\.searchOpen, gq: s\.gq,\s*\n?\s*\};/); assert.match(d, /showAdminBack: s\.adminView && s\.screen !== 'admin' && s\.screen !== 'batch', backToLearning:/);
  for (const f of ['public/js/learner/auth.js', 'public/js/admin/admin.js', 'public/js/admin/users.js']) assert.ok(parses(T.read(f), f), f + ' still parses');
  assert.match(r.stdout, /downloadTemplate: .*not found/);
});

test('the patched objects still work: removed keys are gone and every other key is still there', () => {
  const T = tree(); T.run();
  const load = (f, setup) => { const ctx = { console, SkillforgeApp: function () {}, Progress: {}, csvDownload() {}, TODAY_KEY: '2026-10-17', Intl, JSON }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(T.read(f), ctx); return ctx; };
  const A = load('public/js/learner/auth.js'), app = Object.create(A.SkillforgeApp.prototype); app.setState = () => {};
  const v = A.SkillforgeApp.prototype.vmAuth.call(app, { navItems: [], role: {}, s: { login: {}, loginView: 'signin', authed: true } });
  assert.deepEqual(J(Object.keys(v)), ['authed', 'lgRemOn', 'lgRemember', 'lgDemoOpen', 'lgKey', 'lgKeyReset', 'doLogin', 'lgSignin', 'navItems', 'searchOpen', 'gq']);
  const D = load('public/js/admin/admin.js'), app2 = Object.create(D.SkillforgeApp.prototype); app2.roleOf = () => ({}); app2.go = () => {};
  const dv = D.SkillforgeApp.prototype.adminVals.call(app2, { adminView: true, screen: 'x' }, {});
  assert.deepEqual(J(Object.keys(dv)), ['canAdmin', 'toggleAdmin', 'goHomeRole', 'showAdminBack', 'backToLearning', 'isAdminHome']);
});

test('a second run changes nothing; dry run writes nothing', () => {
  const T = tree(), snap = () => ['public/js/learner/auth.js', 'public/js/admin/admin.js', 'public/js/admin/users.js', 'public/js/learner/essentials.js', 'CHANGELOG.md', 'README.md'].map(f => T.read(f)).join('\n=====\n');
  const before = snap(); let r = T.run('--dry-run'); assert.equal(r.status, 0); assert.match(r.stdout, /WOULD CHANGE/); assert.equal(snap(), before); assert.ok(T.has('README.txt'), 'README.txt untouched by a dry run');
  T.run(); const after = snap(); assert.notEqual(after, before);
  r = T.run(); assert.equal(r.status, 0); assert.match(r.stdout, /0 file\(s\) written/); assert.equal(snap(), after);
});

test('a name that the template, a test or other code uses is kept', () => {
  const T = tree({
    'public/index.html': rd('template-excerpt.html').replace('</template>', '<button on-click="{{ toggleSearch }}">s</button></template>'),
    'tests/e2e/x_e2e.py': "await pg.evaluate(\"window.__app.renderVals().goAdminHome()\")\n",
    'public/js/learner/search.js': 'const f = vals.setGq; const g = { saveRep: 1 };\n' });
  const r = T.run(); assert.equal(r.status, 0);
  assert.match(r.stdout, /toggleSearch: KEPT \(used in public\/index\.html\)/); assert.match(r.stdout, /goAdminHome: KEPT \(named in tests\/e2e\/x_e2e\.py\)/); assert.match(r.stdout, /setGq: KEPT \(other uses: public\/js\/learner\/search\.js:1\)/);
  assert.match(T.read('public/js/learner/auth.js'), /toggleSearch/); assert.match(T.read('public/js/admin/admin.js'), /goAdminHome/); assert.match(T.read('public/js/learner/auth.js'), /setGq/);
  assert.doesNotMatch(T.read('public/js/learner/auth.js'), /toggleLgDemo/, 'the others are still removed');
});

test('without public/index.html nothing is removed (the template cannot be checked)', () => {
  const T = tree({ 'public/index.html': null }), r = T.run(); assert.equal(r.status, 0); assert.match(r.stdout, /public\/index\.html not found: no handler was removed/);
  assert.match(T.read('public/js/learner/auth.js'), /toggleLgDemo/);
});

// ---- the property remover on awkward code ----
async function lib() { return import(path.join(SCRIPTS, 'lib-v41.30.mjs')); }
const cut = async (src, name) => { const { removeProp } = await lib(); const at = src.search(new RegExp('(?<![\\w$.])' + name + '\\s*:')); assert.ok(at >= 0); return removeProp(src, at); };
test('removeProp: strings, template literals, regexes and nested braces inside the value do not confuse it', async () => {
  const src = "const o = {\n  keep1: 1,\n  gone: () => { const s = 'a, b } ) ,'; const t = `x ${ {a:1}.a } , }`; const r = /[,}'\"]/g; return [s, t, r, { k: [1, 2, (3)] }]; },\n  keep2: 2,\n};\n";
  const out = await cut(src, 'gone'); assert.equal(out, "const o = {\n  keep1: 1,\n  keep2: 2,\n};\n"); assert.ok(parses(out, 'x'));
});
test('removeProp: first, middle and last property; last one takes the previous comma; trailing // comment goes only when the property had the line to itself', async () => {
  assert.equal(await cut("const o = { gone: 1, a: 2, b: 3 };", 'gone'), "const o = { a: 2, b: 3 };");
  assert.equal(await cut("const o = { a: 2, gone: 1, b: 3 };", 'gone'), "const o = { a: 2, b: 3 };");
  assert.equal(await cut("const o = { a: 2, b: 3, gone: () => 1 };", 'gone'), "const o = { a: 2, b: 3 };");
  assert.equal(await cut("const o = {\n  a: 2,\n  gone: () => 1,   // old helper\n  b: 3,\n};", 'gone'), "const o = {\n  a: 2,\n  b: 3,\n};");
  assert.equal(await cut("const o = {\n  a: 2,  // about a\n  gone: 1,\n};", 'gone'), "const o = {\n  a: 2,  // about a\n};");
  assert.equal(await cut("const o = { a: 2, // about a\n  gone: 1 };", 'gone'), "const o = { a: 2, // about a\n   };");
  assert.equal(await cut("const o = {\n  a: 2,\n  gone: () => {\n    return 1;\n  }\n};", 'gone'), "const o = {\n  a: 2\n};");
  assert.equal(await cut("f({ x: 1, gone: e => { if (e) { return 1; } return 2; }, y: 2 });", 'gone'), "f({ x: 1, y: 2 });");
});

test('CRLF files stay CRLF after a removal', () => {
  const crlf = s => s.replace(/\n/g, '\r\n'), T = tree({ 'public/js/learner/auth.js': crlf(rd('auth-excerpt.js')), 'CHANGELOG.md': crlf('# Changelog\n\nNewest first. x\n\n## v41.21 (a)\n- old\n') });
  assert.equal(T.run().status, 0); const a = T.read('public/js/learner/auth.js'), c = T.read('CHANGELOG.md');
  assert.ok(a.includes('\r\n') && !/[^\r]\n/.test(a)); assert.doesNotMatch(a, /toggleSearch/); assert.ok(c.includes('\r\n') && !/[^\r]\n/.test(c)); assert.match(c, /## v41\.30/);
});

// ---- organisation date in essential training ----
test('essentials.js and users.js use Progress.today(); other files keep TODAY_KEY', () => {
  const T = tree({ 'public/js/other.js': 'const x = TODAY_KEY;\n' }); T.run();
  assert.doesNotMatch(T.read('public/js/learner/essentials.js'), /TODAY_KEY/); assert.doesNotMatch(T.read('public/js/admin/users.js'), /TODAY_KEY/);
  assert.match(T.read('public/js/learner/essentials.js'), /TODAY_KEY|Progress\.today\(\) > by/.source ? /Progress\.today\(\) > by/ : /x/); assert.equal(T.read('public/js/other.js'), 'const x = TODAY_KEY;\n');
});

function essentials(T, backendOn, todayKey) {
  const ctx = { console, TODAY_KEY: todayKey || '2026-10-17', Backend: { on: !!backendOn }, Assessment: { score: () => ({ final: true, pct: 0 }) }, daysUntil: () => 0, Intl, JSON, Math, Date, Object, Array, Set, Map, Number, String }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/core/progress.js'), 'utf8') + '\n;globalThis.Progress = Progress;', ctx);
  ctx.Progress.courseDone = () => false;
  vm.runInContext(T.read('public/js/learner/essentials.js') + '\n;globalThis.Essentials = Essentials;', ctx);
  return ctx;
}
test('essential-training deadlines follow the Weekend days setting, and "overdue" follows the organisation date', () => {
  const T = tree(); T.run();
  const c = essentials(T, true, '2000-01-01'), P = c.Progress, E = c.Essentials;     // the browser/sample date is far in the past: only the organisation's date can give the answers below
  const u = { name: 'Eve', joined: '2026-10-16', status: 'Active' }, a = { id: 'c1', title: 'T', essential: true, status: 'Published', essentialFrom: '2026-01-01', essentialDays: 1 };
  P.configure({}); assert.equal(E.deadline(u, a, []), '2026-10-16');                  // joined on a Friday: day 1 is that Friday (Sat/Sun off)
  P.configure({ platform: { defaults: { weekendDays: [5, 6] } } }); assert.equal(E.deadline(u, a, []), '2026-10-18');   // Friday and Saturday off: the first working day is Sunday 18th
  P.configure({});
  const now = P.orgToday(), yest = P.plus(now, -1), tom = P.plus(now, 1);
  const mk = by => ({ enroll: { Eve: { c1: by } }, adminCourses: [a], holidays: [] }), st = by => J(E.statusFor(mk(by), u).map(x => ({ overdue: x.overdue, left: x.left })))[0];
  assert.equal(st(yest).overdue, true); assert.equal(st(now).overdue, false); assert.equal(st(tom).overdue, false);
  assert.ok(st(yest).left <= 0 && st(tom).left >= 0);   // 0 when only a weekend lies between today and the due date
});
test('essentials.js: unpatched code would fail the same test (the test is not vacuous)', () => {
  const T = tree(); const c = essentials(T, true, '2000-01-01'), P = c.Progress, E = c.Essentials, a = { id: 'c1', essential: true, status: 'Published', essentialFrom: '2026-01-01' }, u = { name: 'Eve', joined: '2026-10-16' };
  const yest = P.plus(P.orgToday(), -1); assert.equal(J(E.statusFor({ enroll: { Eve: { c1: yest } }, adminCourses: [a], holidays: [] }, u).map(x => x.overdue))[0], false, 'with TODAY_KEY (2000) yesterday is not overdue');
});
test('app.js configures the weekend setting at the start of every render', () => {
  const s = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8'), i = s.indexOf('renderVals() {'); assert.ok(i > 0);
  assert.match(s.slice(i, i + 200), /Progress\.configure\(s\);/);
});

// ---- CHANGELOG and README ----
test('CHANGELOG gets the missing entries in the right place, once; README.txt moves to docs/archive; README.md points to the changelog', () => {
  const T = tree(), r = T.run(); assert.equal(r.status, 0);
  const c = T.read('CHANGELOG.md'), at = n => c.indexOf('## ' + n);
  assert.ok(at('v41.30') > 0 && at('v41.30') < at('v41.29') && at('v41.29') < at('v41.24') && at('v41.24') < at('v41.22 and v41.23') && at('v41.22 and v41.23') < at('v41.21'), 'order');
  assert.equal((c.match(/^## v41\.30/gm) || []).length, 1); assert.match(c, /^Newest first\./m); assert.match(c, /- old entry/);
  assert.ok(!T.has('README.txt')); assert.match(T.read('docs/archive/RELEASE-NOTES-v41.24.txt'), /Certificates moves into Master data/);
  assert.match(T.read('README.md'), /### Release notes[\s\S]*CHANGELOG\.md/); assert.equal((T.read('README.md').match(/### Release notes/g) || []).length, 1);
  T.run(); assert.equal((T.read('CHANGELOG.md').match(/^## v41\.30/gm) || []).length, 1); assert.equal((T.read('README.md').match(/### Release notes/g) || []).length, 1);
});
test('README.txt stays when there is no README.md, or when the archive copy already exists', () => {
  let T = tree({ 'README.md': null }); T.run(); assert.ok(T.has('README.txt'));
  T = tree({ 'docs/archive/RELEASE-NOTES-v41.24.txt': 'old' }); const r = T.run(); assert.ok(T.has('README.txt')); assert.match(r.stdout, /already exists: README\.txt left in place/); assert.equal(T.read('docs/archive/RELEASE-NOTES-v41.24.txt'), 'old');
});

// ---- the report scripts ----
test('find-duplicates lists file pairs that share identical long lines', () => {
  const line = "const downloadIt = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };";
  const T = tree({ 'public/js/admin/lcms.js': line + '\nconst a = 1;\n', 'public/js/admin/documents.js': line + '\n', 'public/js/admin/courses.js': 'const z = 1;\n' });
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'find-duplicates.mjs'), T.t], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\s+public\/js\/admin\/documents\.js\s+<->\s+public\/js\/admin\/lcms\.js/); assert.match(r.stdout, /const downloadIt/); assert.doesNotMatch(r.stdout, /courses\.js\s+<->/);
});
test('check-callers lists callers and marks the ones that do arithmetic or build a Date from a possibly-empty value', () => {
  const T = tree({ 'public/js/admin/reports.js': "const a = Progress.workingDaysBetween(from, to, hol) + 1;\nconst b = d.assignedOn;\nconst c = new Date(d.assignedOn + 'T12:00:00');\nconst ok = Progress.workingDaysBetween(x, y, h);\n" });
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'check-callers.mjs'), T.t], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CHECK\s+public\/js\/admin\/reports\.js:1/); assert.match(r.stdout, /CHECK\s+public\/js\/admin\/reports\.js:3/); assert.match(r.stdout, /\n\s{7}public\/js\/admin\/reports\.js:4/); assert.match(r.stdout, /essentials\.js:\d+/);
});
