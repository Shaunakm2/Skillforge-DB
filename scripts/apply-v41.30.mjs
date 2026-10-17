#!/usr/bin/env node
/* Skillforge v41.30 patcher (round 3: clean-up). Run it AFTER scripts/apply-v41.29.mjs, from the repository root:
 *     node scripts/apply-v41.30.mjs --dry-run      show what would change, write nothing
 *     node scripts/apply-v41.30.mjs                apply
 *     node scripts/apply-v41.30.mjs path/to/repo
 * Safe to run twice. What it does:
 *   1. Removes handlers the reviewer found defined but never bound, ONE BY ONE and only when it can PROVE each is unused:
 *      the name is not in public/index.html, not in tests/ or scripts/, and every occurrence in public/js is the definition itself
 *      (a call such as V.exportUsers() or any other use keeps it, and the report says where). A file that no longer parses after an
 *      edit is put back exactly as it was.
 *   2. essentials.js and users.js: TODAY_KEY -> Progress.today() (the deadline / overdue maths and default due dates use the organisation's date).
 *   3. CHANGELOG.md: adds the missing entries (it stopped at v41.21) from scripts/changelog-v41.30.md.
 *   4. README.txt vs README.md: the per-release README.txt is moved to docs/archive/RELEASE-NOTES-<version>.txt and README.md points to CHANGELOG.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { removeProp } from './lib-v41.30.mjs';

const argv = process.argv.slice(2), DRY = argv.includes('--dry-run');
const ROOT = path.resolve(argv.find(a => !a.startsWith('--')) || '.'), P = (...p) => path.join(ROOT, ...p);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEAD = ['downloadTemplate', 'goAdminHome', 'saveRep', 'setBankQuery', 'setCQuizPick', 'setCdCat', 'setEwsNote', 'setEwsU', 'setGq', 'toggleAllBank', 'toggleLgDemo', 'toggleSearch', 'exportUsers'];
const out = { changed: [], skipped: [], kept: [], warn: [] };
const rd = f => fs.readFileSync(f, 'utf8'), norm = s => s.replace(/\r\n/g, '\n');
const walk = (d, ext, skip = []) => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['vendor', 'node_modules', 'fixtures', ...skip].includes(e.name) ? [] : walk(path.join(d, e.name), ext, skip)) : ext.some(x => e.name.endsWith(x)) ? [path.join(d, e.name)] : []);
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const parses = (text, name) => { try { new vm.Script(text, { filename: name }); return true; } catch (e) { return false; } };

const files = new Map();       // path -> { raw, crlf, text, orig }
const load = f => { if (!files.has(f)) { const raw = rd(f), crlf = raw.includes('\r\n'); files.set(f, { f, raw, crlf, text: crlf ? norm(raw) : raw, orig: crlf ? norm(raw) : raw }); } return files.get(f); };

/* ------------------------------------------------------------------ 1. unbound handlers */
const jsFiles = walk(P('public', 'js'), ['.js']).filter(f => !/(^|\/)(xlsx|unzip)\.js$|\.min\.js$/.test(rel(f)));
const html = fs.existsSync(P('public', 'index.html')) ? norm(rd(P('public', 'index.html'))) : null;
const outside = [...walk(P('tests'), ['.js', '.mjs', '.py', '.cjs']), ...walk(P('scripts'), ['.js', '.mjs', '.sh']).filter(f => !/apply-v41\.(29|30)\.mjs$|check-unbound\.mjs$|lib-v41\.30\.mjs$/.test(rel(f)))]
  .filter(f => !/tests\/(patch-v41_2\d|patch-v41_30)\.test\.js$/.test(rel(f))).map(f => [rel(f), norm(rd(f))]);
if (html === null) out.warn.push('public/index.html not found: no handler was removed (the template cannot be checked).');
else if (jsFiles.length) {
  const removals = new Map();      // file -> [indexes of "name:" to remove]
  for (const name of DEAD) {
    const re = new RegExp('(?<![\\w$])' + name + '(?![\\w$])', 'g');
    const why = [];
    if (re.test(html)) why.push('used in public/index.html'); re.lastIndex = 0;
    outside.forEach(([r, t]) => { if (new RegExp('(?<![\\w$])' + name + '(?![\\w$])').test(t)) why.push('named in ' + r); });
    const defs = [], uses = [];
    for (const f of jsFiles) {
      const t = load(f).text; let m; re.lastIndex = 0;
      while ((m = re.exec(t))) {
        const at = m.index, line = t.slice(0, at).split('\n').length;
        const before = t.slice(Math.max(0, at - 200), at), after = t.slice(at + name.length, at + name.length + 3);
        const isDef = /(^|[{,])\s*$/.test(before.replace(/\/\/[^\n]*$/gm, '').replace(/\/\*[\s\S]*?\*\/\s*$/, '')) && /^\s*:/.test(after);
        (isDef ? defs : uses).push({ f, at, line });
      }
    }
    if (!defs.length && !uses.length) { out.skipped.push(name + ': not found in public/js (already removed?)'); continue; }
    if (uses.length) why.push('other uses: ' + uses.slice(0, 4).map(u => rel(u.f) + ':' + u.line).join(', ') + (uses.length > 4 ? ' …' : ''));
    if (why.length) { out.kept.push(name + ': KEPT (' + why.join('; ') + ')'); continue; }
    defs.forEach(d => { if (!removals.has(d.f)) removals.set(d.f, []); removals.get(d.f).push({ at: d.at, name, line: d.line }); });
  }
  for (const [f, list] of removals) {
    const fi = load(f), before = fi.text; let t = before;
    list.sort((a, b) => b.at - a.at).forEach(r => { t = removeProp(t, r.at); });
    if (!parses(t, rel(f))) { out.warn.push(rel(f) + ': removing ' + list.map(r => r.name).join(', ') + ' would leave the file unparseable: left as it was. Remove by hand (' + list.map(r => r.name + ' at line ' + r.line).join(', ') + ').'); continue; }
    fi.text = t; list.sort((a, b) => a.at - b.at).forEach(r => out.changed.push(rel(f) + ': removed ' + r.name + ' (was at line ' + r.line + ')'));
  }
}

/* ------------------------------------------------------------------ 2. organisation date */
for (const r of ['public/js/learner/essentials.js', 'public/js/admin/users.js']) {
  const cands = jsFiles.filter(f => rel(f) === r || rel(f).endsWith('/' + path.basename(r)));
  if (!cands.length) { out.warn.push(r + ': not found (TODAY_KEY was not replaced there)'); continue; }
  for (const f of cands) {
    const fi = load(f), n = (fi.text.match(/\bTODAY_KEY\b/g) || []).length;
    if (!n) { out.skipped.push(rel(f) + ': no TODAY_KEY left'); continue; }
    const t = fi.text.replace(/\bTODAY_KEY\b/g, 'Progress.today()');
    if (!parses(t, rel(f))) { out.warn.push(rel(f) + ': TODAY_KEY replacement left the file unparseable: not applied'); continue; }
    fi.text = t; out.changed.push(rel(f) + ': TODAY_KEY -> Progress.today() (' + n + ')');
  }
}

/* ------------------------------------------------------------------ 3. CHANGELOG, 4. README */
const clog = P('CHANGELOG.md'), entries = path.join(HERE, 'changelog-v41.30.md');
if (!fs.existsSync(clog)) out.warn.push('CHANGELOG.md not found');
else if (!fs.existsSync(entries)) out.warn.push('scripts/changelog-v41.30.md not found');
else {
  const fi = load(clog);
  if (/^## v41\.30\b/m.test(fi.text)) out.skipped.push('CHANGELOG.md: v41.30 entries already there');
  else {
    const add = norm(rd(entries)).trim() + '\n\n', m = /^Newest first\..*\n+/m.exec(fi.text), at = m ? m.index + m[0].length : fi.text.search(/^## /m);
    if (at < 0) out.warn.push('CHANGELOG.md: could not find where to insert the entries');
    else { fi.text = fi.text.slice(0, at) + add + fi.text.slice(at); out.changed.push('CHANGELOG.md: added v41.24 and v41.26 to v41.30 (it stopped at v41.21)'); }
  }
}
const rt = P('README.txt'), rm = P('README.md');
if (fs.existsSync(rt) && fs.existsSync(rm)) {
  const t = norm(rd(rt)), v = (/Skillforge v(\d+(?:\.\d+)*)/.exec(t) || [])[1] || 'old', dest = P('docs', 'archive', 'RELEASE-NOTES-v' + v + '.txt');
  if (fs.existsSync(dest)) out.warn.push('README.txt: docs/archive/RELEASE-NOTES-v' + v + '.txt already exists: README.txt left in place');
  else { if (!DRY) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, rd(rt)); fs.unlinkSync(rt); } out.changed.push('README.txt moved to ' + rel(dest) + ' (README.md is the one guide; per-release notes live in CHANGELOG.md)'); }
} else out.skipped.push('README.txt: nothing to move');
if (fs.existsSync(rm)) {
  const fi = load(rm);
  if (/CHANGELOG\.md/.test(fi.text) && /Release notes/i.test(fi.text)) out.skipped.push('README.md: already points to CHANGELOG.md');
  else { fi.text = fi.text.replace(/\s*$/, '\n') + '\n### Release notes\nWhat changed in each version is in CHANGELOG.md. A release zip carries its own PATCH-NOTES file with the deploy steps; it is not kept here.\n'; out.changed.push('README.md: added a "Release notes" pointer'); }
}

/* ------------------------------------------------------------------ write */
const show = (t, l) => { if (l.length) { console.log('\n' + t); l.forEach(x => console.log('  ' + x)); } };
show(DRY ? 'WOULD CHANGE' : 'CHANGED', out.changed); show('KEPT (not dead, or used somewhere)', out.kept); show('SKIPPED', out.skipped); show('WARNINGS', out.warn);
let n = 0;
if (!DRY) for (const fi of files.values()) { if (fi.text === fi.orig) continue; fs.writeFileSync(fi.f, fi.crlf ? fi.text.replace(/\n/g, '\r\n') : fi.text); n++; }
console.log('\n' + (DRY ? 'Dry run: nothing written.' : n + ' file(s) written. Next: npm test && npm run build, then node scripts/prune-dist.mjs --apply, and commit dist/.'));
