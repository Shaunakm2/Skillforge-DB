#!/usr/bin/env node
/* Removes old hashed app bundles from dist/ (the reviewer found 5 committed bundles where 1 is used).
 *   node scripts/prune-dist.mjs            list what would be removed
 *   node scripts/prune-dist.mjs --apply    remove them
 *   node scripts/prune-dist.mjs --apply some/other/dist
 * The bundle in use is the one dist/index.html loads (js/app.<hash>.js). Source maps of removed bundles go with them.
 * Nothing is removed if dist/index.html does not name a bundle. Run it right after `npm run build`, before committing dist/. */
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2), APPLY = argv.includes('--apply');
const dist = path.resolve(argv.find(a => !a.startsWith('--')) || 'dist');
const idx = path.join(dist, 'index.html');
if (!fs.existsSync(idx)) { console.error('No ' + idx + '. Run npm run build first.'); process.exit(1); }
const html = fs.readFileSync(idx, 'utf8'), used = new Set([...html.matchAll(/app\.([0-9a-f]{8,})\.js/g)].map(m => m[1]));
if (!used.size) { console.error('dist/index.html does not load a hashed app bundle: nothing removed.'); process.exit(1); }
const stale = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  const m = /^app\.([0-9a-f]{8,})\.js(\.map)?$/.exec(e.name);
  if (m && !used.has(m[1])) stale.push(p);
});
walk(dist);
if (!stale.length) { console.log('Nothing to remove: dist/ holds only the bundle in use (' + [...used].join(', ') + ').'); process.exit(0); }
const kb = stale.reduce((n, p) => n + fs.statSync(p).size, 0) / 1024;
stale.forEach(p => console.log((APPLY ? 'removed ' : 'would remove ') + path.relative(process.cwd(), p)));
if (APPLY) stale.forEach(p => fs.unlinkSync(p));
console.log('\n' + stale.length + ' file(s), ' + kb.toFixed(0) + ' KB' + (APPLY ? ' removed.' : '. Run with --apply to remove them.') + ' In use: ' + [...used].join(', '));
