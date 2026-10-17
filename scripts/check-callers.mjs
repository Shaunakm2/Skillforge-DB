#!/usr/bin/env node
/* Lists every place that uses a working-day or assignment-date function, so nothing is left that breaks on "date unknown".
 * Since v41.26 a missing assignment date is '' (it used to be invented as the due date minus 21 days) and
 * Progress.workingDaysBetween() returns null when either date is unknown. A caller is fine when it only compares or prints the value;
 * it needs a look when it does arithmetic with it, builds a Date from it, or sorts/groups by it.
 *     node scripts/check-callers.mjs
 * Report only. Lines marked  CHECK  do arithmetic or build a Date near the call. */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || '.');
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['vendor', 'node_modules'].includes(e.name) ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []) : [];
const files = walk(path.join(ROOT, 'public', 'js'));
if (!files.length) { console.error('No files under public/js: run this from the repository root.'); process.exit(1); }
const PAT = [[/workingDaysBetween\s*\(/, 'workingDaysBetween (null when a date is unknown)'], [/Progress\.assignedOn\s*\(|(?<![\w$.])assignedOn\s*\(/, 'assignedOn() ("" when unknown)'], [/\.assignedOn\b(?!\s*[:=(])/, '.assignedOn value ("" when unknown)'], [/\bassignedOn\s*:/, 'assignedOn property']];
let n = 0, check = 0;
for (const f of files) {
  const r = path.relative(ROOT, f).replace(/\\/g, '/'), ls = fs.readFileSync(f, 'utf8').split('\n');
  ls.forEach((l, i) => PAT.forEach(([re, label]) => {
    if (!re.test(l)) return; n++;
    const risky = /new Date\([^)]*assignedOn|assignedOn[^;]{0,40}(?:\s[-+*/<>]\s|\bsort\b|\.localeCompare)|workingDaysBetween\([^)]*\)\s*(?:[-+*/]|\)?\s*[<>]=?\s*-?\d)/.test(l) || /(?:[-+*/]|[<>]=?)\s*Progress\.workingDaysBetween/.test(l);
    if (risky) check++;
    console.log((risky ? 'CHECK  ' : '       ') + r + ':' + (i + 1) + '   ' + label + '\n         ' + l.trim().slice(0, 150));
  }));
}
console.log('\n' + n + ' use(s) in ' + files.length + ' files, ' + check + ' marked CHECK.');
