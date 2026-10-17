#!/usr/bin/env node
/* Lists handlers that are defined in public/js but never used by public/index.html (dead code, or a button that was removed).
 *   node scripts/check-unbound.mjs                       checks the 13 the reviewer named
 *   node scripts/check-unbound.mjs name1 name2 …         checks other names
 * For each name: where it is defined (file:line) and whether the template mentions it. Report only: it never edits a file.
 * A name is safe to delete when it is "not in the template" and nothing else in public/js calls it (the "other uses" column). */
import fs from 'node:fs';
import path from 'node:path';
// The reviewer's 13. v41.30 already removed toggleLgDemo, toggleSearch, setGq (auth.js) and goAdminHome (admin.js); exportUsers is NOT dead (the Export menu calls V.exportUsers()). These 8 are left.
const NAMES = ['downloadTemplate', 'saveRep', 'setBankQuery', 'setCQuizPick', 'setCdCat', 'setEwsNote', 'setEwsU', 'toggleAllBank'];
const want = process.argv.slice(2).filter(a => !a.startsWith('--')), names = want.length ? want : NAMES;
const root = process.cwd(), js = [];
const walk = d => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['vendor', 'node_modules'].includes(e.name)) walk(p); } else if (e.name.endsWith('.js')) js.push(p); });
walk(path.join(root, 'public', 'js'));
const html = ['public/index.html'].map(f => path.join(root, f)).filter(f => fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
if (!html) { console.error('public/index.html not found: run this from the repository root.'); process.exit(1); }
const lines = js.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8').split('\n')]);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let dead = 0;
console.log('name'.padEnd(18) + 'in template'.padEnd(18) + 'defined at / other uses');
for (const n of names) {
  const inTpl = new RegExp('\\{\\{[^}]*\\b' + esc(n) + '\\b[^}]*\\}\\}').test(html);
  const def = new RegExp('(^|[\\s,{(])' + esc(n) + '\\s*[:=(]'), call = new RegExp('\\b' + esc(n) + '\\b');
  const defs = [], uses = [];
  lines.forEach(([f, ls]) => ls.forEach((l, i) => { if (!call.test(l)) return; (def.test(l) && /=>|function|\)\s*\{/.test(l) ? defs : uses).push(f + ':' + (i + 1)); }));
  if (!inTpl) dead++;
  console.log(n.padEnd(18) + (inTpl ? 'yes' : 'NOT IN TEMPLATE').padEnd(18) + (defs.join(', ') || 'no definition found') + (uses.length ? '   | other uses: ' + uses.join(', ') : ''));
}
console.log('\n' + dead + ' of ' + names.length + ' are not referenced by the template.');
