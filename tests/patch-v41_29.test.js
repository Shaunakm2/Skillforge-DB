// v41.29: the patcher (scripts/apply-v41.29.mjs), the weekend-days setting, downloadBlob, prune-dist, check-unbound and the shared-file check.
// The patcher is run on copies of your code (tests/fixtures/v41_29: helpers.js in full, the lines around each edit of masters.js,
// platform.js and database.js, and a template excerpt) and the patched result is run, not just read.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), FX = path.join(__dirname, 'fixtures', 'v41_29'), SCRIPTS = path.join(ROOT, 'scripts');
const J = x => JSON.parse(JSON.stringify(x));

function tree(over = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-')), put = (rel, src) => { const p = path.join(t, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, src); };
  const rd = f => fs.readFileSync(path.join(FX, f), 'utf8');
  const files = { 'public/index.html': rd('index-excerpt.html'), 'public/js/core/helpers.js': rd('helpers.js'), 'public/js/admin/masters.js': rd('masters-app.js'), 'public/js/admin/platform.js': rd('platform-excerpt.js'),
    'public/js/admin/database.js': rd('database-excerpt.js'), 'public/js/features/other.js': rd('other-copy.js'), 'public/js/core/xlsx.js': rd('xlsx-like.js'), ...over };
  Object.entries(files).forEach(([k, v]) => put(k, v));
  return { t, read: rel => fs.readFileSync(path.join(t, rel), 'utf8'), snapshot: () => Object.fromEntries(Object.keys(files).map(k => [k, fs.readFileSync(path.join(t, k), 'utf8')])) };
}
const run = (script, t, ...a) => spawnSync(process.execPath, [path.join(SCRIPTS, script), ...a, ...(t ? [t] : [])], { encoding: 'utf8' });

test('dry run writes nothing; apply changes the files; a second run changes nothing', () => {
  const T = tree(), before = T.snapshot();
  let r = run('apply-v41.29.mjs', T.t, '--dry-run'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /WOULD CHANGE/); assert.deepEqual(T.snapshot(), before);
  r = run('apply-v41.29.mjs', T.t); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /6 file\(s\) written/);
  const after = T.snapshot(); assert.notDeepEqual(after, before);
  r = run('apply-v41.29.mjs', T.t); assert.equal(r.status, 0); assert.match(r.stdout, /0 file\(s\) written/); assert.deepEqual(T.snapshot(), after);
});

test('if a required anchor is missing, NOTHING is written and the exit code is 1', () => {
  const T = tree({ 'public/js/admin/masters.js': fs.readFileSync(path.join(FX, 'masters-app.js'), 'utf8').replace('idleMins: idle }; });', 'idleMins: idle, other: 1 }; });') }), before = T.snapshot();
  const r = run('apply-v41.29.mjs', T.t); assert.equal(r.status, 1); assert.match(r.stdout, /CANNOT APPLY \(nothing was written\)/); assert.match(r.stdout, /pfSave/);
  assert.deepEqual(T.snapshot(), before, 'helpers.js and the others are untouched too');
});

test('a missing template anchor is a warning with the manual step; the rest is still applied', () => {
  const T = tree({ 'public/index.html': '<template><div>no app settings here</div></template>' });
  const r = run('apply-v41.29.mjs', T.t); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /WARNINGS/); assert.match(r.stdout, /MANUAL STEP/); assert.match(r.stdout, /pfWkDays/);
  assert.match(T.read('public/js/admin/masters.js'), /weekendDays: WK/);
});

test('CRLF files stay CRLF', () => {
  const crlf = s => s.replace(/\n/g, '\r\n'), rd = f => fs.readFileSync(path.join(FX, f), 'utf8');
  const T = tree({ 'public/js/core/helpers.js': crlf(rd('helpers.js')), 'public/js/admin/masters.js': crlf(rd('masters-app.js')), 'public/index.html': crlf(rd('index-excerpt.html')) });
  assert.equal(run('apply-v41.29.mjs', T.t).status, 0);
  for (const f of ['public/js/core/helpers.js', 'public/js/admin/masters.js', 'public/index.html']) { const s = T.read(f); assert.ok(s.includes('\r\n') && !/[^\r]\n/.test(s), f + ' is CRLF throughout'); }
});

test('the patched files parse; the other download copy becomes downloadBlob(); xlsx.js and the preview link are untouched', () => {
  const T = tree(); assert.equal(run('apply-v41.29.mjs', T.t).status, 0);
  for (const f of ['public/js/core/helpers.js', 'public/js/admin/masters.js', 'public/js/admin/platform.js', 'public/js/admin/database.js', 'public/js/features/other.js']) assert.doesNotThrow(() => new vm.Script(T.read(f), { filename: f }), f);
  assert.match(T.read('public/js/features/other.js'), /downloadBlob\(name \+ '\.txt', new Blob\(\[text\], \{ type: "text\/plain" \}\)\)/);
  assert.match(T.read('public/js/features/other.js'), /return URL\.createObjectURL\(f\)/);
  assert.equal(T.read('public/js/core/xlsx.js'), fs.readFileSync(path.join(FX, 'xlsx-like.js'), 'utf8'));
  assert.match(T.read('public/js/admin/database.js'), /downloadBlob\('skillforge-backup-' \+ Progress\.today\(\) \+ '\.json', new Blob\(\[data\], \{ type:'application\/json' \}\)\)/);
  assert.doesNotMatch(T.read('public/js/admin/platform.js'), /permRows|TODAY_KEY/);
  const html = T.read('public/index.html'); assert.ok(html.indexOf('pfWkDays') > 0 && html.indexOf('pfWkDays') < html.indexOf('{{ pfDiscard }}'), 'the buttons sit above Discard / Save defaults');
  assert.equal((html.match(/pfWkDays/g) || []).length, 1);
});

// ---- the weekend setting, run for real ----
function app(T) {
  const ctx = { console, Backend: { on: false }, TODAY_KEY: '2026-10-17', Assessment: { score: () => ({ final: true, pct: 0 }) }, daysUntil: () => 0, JSON, Object, Array, Math, Date, Intl, Number, String, parseInt, Set, Map };
  ctx.SkillforgeApp = function () {}; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js/core/progress.js'), 'utf8') + '\n;globalThis.Progress = Progress;', ctx);
  vm.runInContext(T.read('public/js/core/helpers.js') + '\n;globalThis.UI = UI; globalThis.PLATFORM0 = PLATFORM0; globalThis.PLATFORM_FEATS = PLATFORM_FEATS; globalThis.defaultDue = defaultDue; globalThis.csvDownload = csvDownload;', ctx);
  vm.runInContext(T.read('public/js/admin/masters.js'), ctx);
  const a = Object.create(ctx.SkillforgeApp.prototype); a.toasts = []; a.state = { platform: JSON.parse(JSON.stringify(ctx.PLATFORM0)), pfDraft: null, mdTab: 'app' };
  a.setState = u => { const p = typeof u === 'function' ? u(a.state) : u; a.state = Object.assign({}, a.state, p); };
  a.toastMsg = m => a.toasts.push(m); a.vals = () => a.amApp({ s: a.state }); a.ctx = ctx;
  return a;
}
const chips = v => v.pfWkDays.map(c => [c.label, c.bg === '#16324F']);

test('weekend buttons: Mon..Sun, Saturday and Sunday selected by default; clicking changes the draft; saving keeps it', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T);
  assert.deepEqual(J(chips(a.vals())), [['Mon', false], ['Tue', false], ['Wed', false], ['Thu', false], ['Fri', false], ['Sat', true], ['Sun', true]]);
  a.vals().pfWkDays[4].pick();                                                    // Friday
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 5, 6]); assert.equal(a.vals().pfDirty, true);
  assert.deepEqual(J(chips(a.vals()).filter(c => c[1]).map(c => c[0])), ['Fri', 'Sat', 'Sun']);
  a.vals().pfSave(); assert.deepEqual(a.toasts, ['App settings saved']);
  assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 5, 6]); assert.equal(a.state.pfDraft, null);
  assert.equal(a.state.platform.defaults.dueDays, 30, 'the other defaults are kept');
  a.vals().pfWkDays[5].pick();                                                    // Saturday off again
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 5]);
});

test('other defaults edited after the weekend keep it; saving without touching it keeps what was saved', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T);
  a.vals().pfWkDays[0].pick();                                                    // Monday off: [0,1,6]
  a.vals().setPfDue({ target: { value: '45' } });                                 // a different field next: spread must keep weekendDays
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 1, 6]); a.vals().pfSave();
  assert.equal(a.state.platform.defaults.dueDays, 45); assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 1, 6]);
  a.vals().setPfIdle({ target: { value: '60' } }); a.vals().pfSave();             // untouched weekend
  assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 1, 6]);
});

test('settings saved before v41.29 (no weekendDays) show Saturday + Sunday and save them', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T);
  a.state.platform = { feat: {}, defaults: { password: 'Pass@123', dueDays: 30, essDays: 30, idleMins: 30 } };
  assert.deepEqual(J(chips(a.vals()).filter(c => c[1]).map(c => c[0])), ['Sat', 'Sun']);
  a.vals().setPfDue({ target: { value: '31' } }); a.vals().pfSave(); assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 6]);
});

test('at least one working day must remain: the seventh day cannot be switched off', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T);
  for (const i of [0, 1, 2, 3, 4]) a.vals().pfWkDays[i].pick();                   // Mon..Fri one after the other: Mon-Thu are accepted, Fri would leave no working day
  assert.deepEqual(J(a.state.pfDraft.weekendDays), [0, 1, 2, 3, 4, 6]);
  assert.deepEqual(J(a.toasts), ['Weekend days: keep at least one working day']);
  assert.deepEqual(J(chips(a.vals()).filter(c => !c[1]).map(c => c[0])), ['Fri'], 'Friday is the one working day left');
  a.vals().pfSave(); assert.deepEqual(J(a.state.platform.defaults.weekendDays), [0, 1, 2, 3, 4, 6]);
});

test('the saved setting drives working-day maths in Progress (Friday off moves a deadline), and "today" follows the organisation', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T), P = a.ctx.Progress;
  P.configure(a.state); assert.equal(P.workingDeadline('2026-10-16', 2, []), '2026-10-19');                  // Fri, Mon (Sat/Sun off)
  a.vals().pfWkDays[4].pick(); a.vals().pfSave(); P.configure(a.state);
  assert.equal(P.workingDeadline('2026-10-16', 2, []), '2026-10-20');                                         // Fri off now: Mon, Tue
  a.ctx.Backend.on = true; assert.equal(a.ctx.defaultDue({}), P.plus(P.orgToday(), 30));                      // connected: organisation's today + 30
  a.ctx.Backend.on = false; assert.equal(a.ctx.defaultDue({}), '2026-11-16');                                 // offline demo: TODAY_KEY + 30
});

test('csvDownload now goes through downloadBlob: one Blob, one link, released after 2 s', () => {
  const T = tree(); run('apply-v41.29.mjs', T.t); const a = app(T), ctx = a.ctx, log = [];
  ctx.Blob = function (parts, o) { this.parts = parts; this.type = o.type; };
  ctx.URL = { createObjectURL: b => { log.push(['create', b.type]); return 'blob:x'; }, revokeObjectURL: u => log.push(['revoke', u]) };
  const el = { click: () => log.push(['click', el.download]), remove: () => log.push(['remove']) };
  ctx.document = { createElement: t => { log.push(['el', t]); return el; }, body: { appendChild: () => log.push(['append']) } };
  const timers = []; ctx.setTimeout = (f, ms) => timers.push([f, ms]);
  vm.runInContext("csvDownload('a.csv', [['n', 'v'], ['x', '=SUM(1)']])", ctx);
  assert.deepEqual(J(log.map(x => x[0])), ['el', 'create', 'append', 'click', 'remove']); assert.deepEqual(J(log[1]), ['create', 'text/csv;charset=utf-8']); assert.equal(log[3][1], 'a.csv');
  assert.equal(timers.length, 1); assert.equal(timers[0][1], 2000); timers[0][0](); assert.deepEqual(J(log.at(-1)), ['revoke', 'blob:x']);
});

// ---- the other scripts ----
test('prune-dist removes only bundles the page does not load (and their maps), and only with --apply', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dist-')), w = (f, c = 'x') => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), c); };
  w('dist/index.html', '<script src="js/app.0b408c6ab8b3.js"></script>');
  for (const h of ['0b408c6ab8b3', '6396ed82c4be', '1c21bef71f78', '7c47e4a03831', 'ba476eedf170']) w('dist/js/app.' + h + '.js', 'y'.repeat(100));
  w('dist/js/app.6396ed82c4be.js.map'); w('dist/js/config.js'); w('dist/vendor/supabase.js');
  const run2 = (...a) => spawnSync(process.execPath, [path.join(SCRIPTS, 'prune-dist.mjs'), ...a, path.join(t, 'dist')], { encoding: 'utf8', cwd: t });
  let r = run2(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /would remove/); assert.equal(fs.readdirSync(path.join(t, 'dist/js')).length, 7, 'dry run removes nothing');
  r = run2('--apply'); assert.equal(r.status, 0); const left = fs.readdirSync(path.join(t, 'dist/js')).sort();
  assert.deepEqual(J(left), ['app.0b408c6ab8b3.js', 'config.js']); assert.ok(fs.existsSync(path.join(t, 'dist/vendor/supabase.js')));
  r = run2('--apply'); assert.match(r.stdout, /Nothing to remove/);
  w('dist/index.html', '<script src="js/main.js"></script>'); r = run2('--apply'); assert.equal(r.status, 1, 'no bundle named: nothing is removed');
});

test('check-unbound reports where a handler is defined and whether the template uses it', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-unb-')), w = (f, c) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), c); };
  w('public/index.html', '<button on-click="{{ goHome }}">x</button><button on-click="{{ o.pick }}">y</button>');
  w('public/js/a.js', "const v = { goHome: () => 1, saveRep: () => { return 2; }, other: 3 };\nconst k = v.saveRep();\n");
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'check-unbound.mjs'), 'goHome', 'saveRep', 'missing'], { encoding: 'utf8', cwd: t });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /goHome\s+yes\s+public\/js\/a\.js:1/); assert.match(r.stdout, /saveRep\s+NOT IN TEMPLATE\s+public\/js\/a\.js:1\s+\| other uses: public\/js\/a\.js:2/);
  assert.match(r.stdout, /missing\s+NOT IN TEMPLATE\s+no definition found/); assert.match(r.stdout, /2 of 3 are not referenced/);
});

test('assessment.js is identical in public/ and supabase/functions/_shared/ (the manual sync-shared step)', { skip: !fs.existsSync(path.join(ROOT, 'public/js/core/assessment.js')) || !fs.existsSync(path.join(ROOT, 'supabase/functions/_shared/assessment.js')) }, () => {
  const a = fs.readFileSync(path.join(ROOT, 'public/js/core/assessment.js'), 'utf8').replace(/\r\n/g, '\n'), b = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/assessment.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(a, b, 'run: npm run sync-shared');
});
