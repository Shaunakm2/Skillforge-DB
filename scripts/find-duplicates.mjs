#!/usr/bin/env node
/* Finds identical code lines that appear in more than one place under public/js, and ranks the pairs of files that share the most.
 * The reviewer suspected overlaps between lcms.js / documents.js / courses.js, kpis.js / dashboard.js / reports.js,
 * database.js / migration.js / user-import.js and questions.js / question-list.js / question-meta.js but did not check them.
 *     node scripts/find-duplicates.mjs                 whole of public/js
 *     node scripts/find-duplicates.mjs --min 120       only lines of at least 120 characters (default 90)
 *     node scripts/find-duplicates.mjs --show 3        show 3 example lines per file pair (default 2)
 * Report only. An identical long line in two files is a candidate for one shared helper (like downloadBlob in helpers.js); it is not
 * automatically a bug. Lines that are only comments, imports or data tables are ignored. */
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? +argv[i + 1] || d : d; };
const MIN = opt('min', 90), SHOW = opt('show', 2), ROOT = path.resolve(argv.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || '.');
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['vendor', 'node_modules'].includes(e.name) ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []) : [];
const files = walk(path.join(ROOT, 'public', 'js')).filter(f => !/(^|\/)(xlsx|unzip|scale|seed|extras|migration)\.js$|\.min\.js$/.test(f.replace(/\\/g, '/')));
if (!files.length) { console.error('No files under public/js: run this from the repository root.'); process.exit(1); }
const seen = new Map();
for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((raw, i) => {
  const l = raw.trim().replace(/\s+/g, ' ');
  if (l.length < MIN || /^(\/\/|\/\*|\*)/.test(l) || /^(import|export)\b/.test(l)) return;
  if (!seen.has(l)) seen.set(l, []); seen.get(l).push(path.relative(ROOT, f).replace(/\\/g, '/') + ':' + (i + 1));
});
const dup = [...seen].filter(([, w]) => new Set(w.map(x => x.split(':')[0])).size > 1 || w.length > 1);
const pairs = new Map();
for (const [l, w] of dup) {
  const fs_ = [...new Set(w.map(x => x.split(':')[0]))].sort();
  for (let a = 0; a < fs_.length; a++) for (let b = a + 1; b < fs_.length; b++) { const k = fs_[a] + '  <->  ' + fs_[b]; if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(l); }
}
console.log('Lines of at least ' + MIN + ' characters that occur more than once: ' + dup.length + ' (in ' + files.length + ' files)\n');
const same = dup.filter(([, w]) => new Set(w.map(x => x.split(':')[0])).size === 1);
if (pairs.size) {
  console.log('Pairs of files that share identical lines (most first):');
  [...pairs].sort((a, b) => b[1].length - a[1].length).slice(0, 25).forEach(([k, ls]) => { console.log('  ' + String(ls.length).padStart(4) + '  ' + k); ls.slice(0, SHOW).forEach(l => console.log('          ' + l.slice(0, 110) + (l.length > 110 ? '…' : ''))); });
} else console.log('No identical long line is shared between two files.');
if (same.length) { console.log('\nRepeated inside ONE file (' + same.length + '), first 10:'); same.slice(0, 10).forEach(([l, w]) => console.log('  ' + w.slice(0, 3).join(', ') + (w.length > 3 ? ' …' : '') + '   ' + l.slice(0, 90) + '…')); }
