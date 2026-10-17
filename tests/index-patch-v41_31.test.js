// v41.31: the two diffs that add the Weekend days buttons to public/index.html (patches/*.patch) apply with a plain `git apply`,
// put the block where it belongs, refuse a file whose Defaults block has changed, and use only fields that masters.js provides.
// Run against tests/fixtures/v41_31/index-defaults.html: the exact lines 2166-2181 of public/index.html as of v41.30.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), P = f => path.join(ROOT, 'patches', f), FX = path.join(__dirname, 'fixtures', 'v41_31', 'index-defaults.html');
const hasGit = spawnSync('git', ['--version']).status === 0;
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
function repo(content) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sf31-')); git(d, 'init', '-q'); fs.mkdirSync(path.join(d, 'public')); fs.writeFileSync(path.join(d, 'public', 'index.html'), content); return d; }
const lf = fs.readFileSync(FX, 'utf8').replace(/\r\n/g, '\n'), crlf = lf.replace(/\n/g, '\r\n');

test('the LF diff applies to an LF file and adds one Weekend days block between the idle field and Discard / Save', { skip: !hasGit }, () => {
  const d = repo(lf), r = git(d, 'apply', P('v41.31-index-weekend-days.patch')); assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(path.join(d, 'public', 'index.html'), 'utf8'), L = out.split('\n');
  assert.equal((out.match(/\{\{\s*pfWkDays\s*\}\}/g) || []).length, 1); assert.ok(!out.includes('\r'));
  const i = L.findIndex(x => x.includes('{{ pfWkDays }}')); assert.match(L[i - 1], /setPfIdle/); assert.match(L[i + 1], /pfDirty/);
  assert.equal(L.length, lf.split('\n').length + 1, 'exactly one line added');
});
test('the CRLF diff applies to a CRLF file and keeps every line CRLF', { skip: !hasGit }, () => {
  const d = repo(crlf), r = git(d, 'apply', P('v41.31-index-weekend-days.crlf.patch')); assert.equal(r.status, 0, r.stderr);
  const out = fs.readFileSync(path.join(d, 'public', 'index.html'), 'utf8'); assert.ok(!/[^\r]\n/.test(out), 'no bare LF'); assert.equal((out.match(/pfWkDays/g) || []).length, 1);
});
test('a diff for the wrong line endings, a second run, and a changed Defaults block are all refused and change nothing', { skip: !hasGit }, () => {
  let d = repo(crlf); assert.notEqual(git(d, 'apply', '--check', P('v41.31-index-weekend-days.patch')).status, 0);
  d = repo(lf); git(d, 'apply', P('v41.31-index-weekend-days.patch')); const once = fs.readFileSync(path.join(d, 'public', 'index.html'), 'utf8');
  assert.notEqual(git(d, 'apply', P('v41.31-index-weekend-days.patch')).status, 0); assert.equal(fs.readFileSync(path.join(d, 'public', 'index.html'), 'utf8'), once);
  d = repo(lf.replace('Sign people out after inactivity', 'Sign people out when idle')); assert.notEqual(git(d, 'apply', '--check', P('v41.31-index-weekend-days.patch')).status, 0);
});
test('the block binds only fields that the Weekend days chips provide (label, bg, fg, border, pick)', () => {
  const p = fs.readFileSync(P('v41.31-index-weekend-days.patch'), 'utf8'), added = p.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))[0];
  const used = [...added.matchAll(/\{\{\s*o\.(\w+)\s*\}\}/g)].map(m => m[1]).sort(); assert.deepEqual(used, ['bg', 'border', 'fg', 'label', 'pick']);
});
