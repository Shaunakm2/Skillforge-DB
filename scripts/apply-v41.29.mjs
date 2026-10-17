#!/usr/bin/env node
/* Skillforge v41.29 patcher.
 *
 * Applies the v41.29 changes to the front-end files that are NOT shipped whole in the patch zip (they are large, and only a few lines change):
 *
 *   public/js/core/helpers.js    downloadBlob() (one place that saves a Blob; was copied into several files), PLATFORM0 weekendDays,
 *                                defaultDue() uses the organisation's today
 *   public/js/admin/masters.js   App settings: "Weekend days" (default Saturday + Sunday), saved with the other defaults; today = organisation date
 *   public/index.html            the "Weekend days" buttons in App settings (a block placed above the Discard / Save defaults buttons)
 *   public/js/admin/platform.js  TODAY_KEY -> Progress.today(); removes the unused permRows (a no-op)
 *   public/js/admin/database.js  TODAY_KEY -> Progress.today()
 *   public/js/**                 every other copy of the "save a Blob as a file" code is replaced by downloadBlob()
 *
 * Usage (from the repository root, e.g. in a Codespace):
 *     node scripts/apply-v41.29.mjs --dry-run     show what would change, write nothing
 *     node scripts/apply-v41.29.mjs               apply
 *     node scripts/apply-v41.29.mjs path/to/repo  another folder
 *
 * Safe to run twice (already-applied edits are skipped). Every anchor is checked first: if a REQUIRED edit cannot be placed, NOTHING is written.
 * Optional edits that cannot be placed are reported as warnings, with the exact manual step.
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2), DRY = argv.includes('--dry-run');
const ROOT = path.resolve(argv.find(a => !a.startsWith('--')) || '.');
const P = (...p) => path.join(ROOT, ...p);
const res = { ok: [], skip: [], warn: [], fail: [] };
const files = new Map();

const load = p => {
  if (!files.has(p)) {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8'), crlf = raw.includes('\r\n');
    files.set(p, { p, raw, crlf, text: crlf ? raw.replace(/\r\n/g, '\n') : raw });
  }
  return files.get(p);
};
const bad = (o, msg) => (o.required ? res.fail : res.warn).push(msg);

/* edit(file, name, { marker, find: RegExp, count: n | 'any', replace: (…m) => string, required }) */
function edit(rel, name, o) {
  const tag = rel + ' › ' + name, f = load(P(rel));
  if (!f) return bad(o, tag + ': file not found');
  if (o.marker && f.text.includes(o.marker)) return res.skip.push(tag + ': already applied');
  const g = new RegExp(o.find.source, o.find.flags.includes('g') ? o.find.flags : o.find.flags + 'g');
  const n = (f.text.match(g) || []).length, want = o.count === undefined ? 1 : o.count;
  if (want === 'any') { if (!n) return res.skip.push(tag + ': nothing to change'); }
  else if (n !== want) return bad(o, tag + ': expected ' + want + ' match(es) of the anchor, found ' + n + (o.hint ? '. ' + o.hint : ''));
  f.text = f.text.replace(g, o.replace);
  res.ok.push(tag + (want === 'any' ? ' (' + n + ')' : ''));
}

/* ---------------------------------------------------------------------------------------------- helpers.js */
const DL_DEF = `/* v41.29: the one place that saves a Blob as a file (this code was copied into several files). The link is released after 2 seconds. */
const downloadBlob = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); return blob; };
`;
edit('public/js/core/helpers.js', 'downloadBlob()', {
  required: true, marker: 'const downloadBlob =',
  find: /^const csvDownload = \(name, rows\) =>/m, replace: m => DL_DEF + m,
  hint: 'csvDownload was not found in helpers.js',
});
edit('public/js/core/helpers.js', 'weekendDays default', {
  required: true, marker: 'weekendDays:[0, 6]',
  find: /idleMins:\s*30\s*\}\s*\};/, replace: () => 'idleMins:30, weekendDays:[0, 6] } };',
  hint: 'PLATFORM0.defaults was not found as "{ password, dueDays, essDays, idleMins:30 } };"',
});
edit('public/js/core/helpers.js', 'defaultDue uses the organisation date', {
  required: true, marker: 'Progress.plus(Progress.today()',
  find: /Progress\.plus\(TODAY_KEY,\s*Math\.max\(1,/, replace: () => 'Progress.plus(Progress.today(), Math.max(1,',
});

/* ---------------------------------------------------------------------------------------------- masters.js (App settings) */
const M = 'public/js/admin/masters.js';
edit(M, 'weekend days of the draft', {
  required: true, marker: 'WK_NAMES',
  find: /(const DF = s\.pfDraft \|\| PF\.defaults;)/,
  replace: (m, a) => a + `
  // v41.29: weekend days (0 = Sunday ... 6 = Saturday), default Saturday + Sunday. Never all seven: at least one working day must remain.
  const WK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WK = Array.isArray(DF.weekendDays) && DF.weekendDays.length < 7 ? DF.weekendDays.map(Number).filter(n => n >= 0 && n <= 6) : [0, 6];`,
});
edit(M, 'weekend day buttons', {
  required: true, marker: 'pfWkDays',
  find: /\n(\s*)(pfDirty: !!s\.pfDraft,)/,
  replace: (m, ind, a) => `\n${ind}pfWkDays: [1, 2, 3, 4, 5, 6, 0].map(d => UI.chip(WK.includes(d) ? 1 : 0, 1, WK_NAMES[d].slice(0, 3), () => {
${ind}  if (!WK.includes(d) && WK.length >= 6) return this.toastMsg('Weekend days: keep at least one working day');
${ind}  this.setState({ pfDraft: { ...DF, weekendDays: (WK.includes(d) ? WK.filter(x => x !== d) : WK.concat([d])).sort((x, y) => x - y) } }); })),
${ind}${a}`,
});
edit(M, 'weekend days are saved with the defaults', {
  required: true, marker: 'weekendDays: WK',
  find: /p\.defaults\s*=\s*\{\s*password:\s*pw,\s*dueDays:\s*due,\s*essDays:\s*ess,\s*idleMins:\s*idle\s*\}/,
  replace: () => 'p.defaults = { password: pw, dueDays: due, essDays: ess, idleMins: idle, weekendDays: WK }',
  hint: 'the line "p.defaults = { password: pw, dueDays: due, essDays: ess, idleMins: idle }" was not found in pfSave',
});
edit(M, "today is the organisation's date", {
  required: false, find: /\bTODAY_KEY\b/, count: 'any', replace: () => 'Progress.today()',
});

/* ---------------------------------------------------------------------------------------------- index.html (the buttons) */
const WK_BLOCK = `<div class="ui-61"><span class="ui-5">Weekend days (not counted as working days when essential-training deadlines are worked out)</span><div class="ui-63"><sf-for list="{{ pfWkDays }}" as="o"><button class="ovl-25" on-click="{{ o.pick }}" style="border:1px solid {{ o.border }};background:{{ o.bg }};color:{{ o.fg }}">{{ o.label }}</button></sf-for></div><span class="ui-6">Selected days are days off. Default: Saturday and Sunday. Batch training days and the holiday list keep their own rules.</span></div>
  `;
{
  const rel = 'public/index.html', f = load(P(rel)), tag = rel + ' › Weekend days buttons';
  const manual = 'MANUAL STEP: in ' + rel + ', inside the App settings block, just above the Discard / Save defaults buttons, paste:\n      ' + WK_BLOCK.trim();
  if (!f) res.warn.push(tag + ': file not found. ' + manual);
  else if (f.text.includes('pfWkDays')) res.skip.push(tag + ': already applied');
  else {
    const hits = [...f.text.matchAll(/\{\{\s*pfDiscard\s*\}\}/g)];
    if (hits.length !== 1) res.warn.push(tag + ': found ' + hits.length + ' pfDiscard bindings (expected 1). ' + manual);
    else {
      // the innermost <div> that contains the Discard button = the row of Discard / Save defaults buttons
      const upto = f.text.slice(0, hits[0].index), stack = [];
      for (const t of upto.matchAll(/<div\b|<\/div>/g)) { if (t[0] === '</div>') stack.pop(); else stack.push(t.index); }
      if (!stack.length) res.warn.push(tag + ': could not find the buttons row. ' + manual);
      else { const at = stack[stack.length - 1]; f.text = f.text.slice(0, at) + WK_BLOCK + f.text.slice(at); res.ok.push(tag); }
    }
  }
}

/* ---------------------------------------------------------------------------------------------- platform.js, database.js */
edit('public/js/admin/platform.js', "today is the organisation's date", { find: /\bTODAY_KEY\b/, count: 'any', replace: () => 'Progress.today()' });
edit('public/js/admin/platform.js', 'remove the unused permRows no-op', {
  find: /^[ \t]*permRows:[^\n]*\n/m, count: 'any', replace: () => '',
});
edit('public/js/admin/database.js', "today is the organisation's date", { find: /\bTODAY_KEY\b/, count: 'any', replace: () => 'Progress.today()' });

/* ---------------------------------------------------------------------------------------------- every other copy of the download code */
const SKIP_DIR = new Set(['vendor', 'node_modules']), SKIP_FILE = /(^|\/)(xlsx|engine|unzip)\.js$|\.min\.js$/;
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (SKIP_DIR.has(e.name) ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []) : [];
const BLOB = '((?:[^()]|\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\))*?)';
const DL = new RegExp(
  'const\\s+url\\s*=\\s*URL\\.createObjectURL\\(' + BLOB + '\\)\\s*,\\s*a\\s*=\\s*document\\.createElement\\(\\s*([\'"])a\\2\\s*\\)\\s*;\\s*' +
  'a\\.href\\s*=\\s*url\\s*;\\s*a\\.download\\s*=\\s*([^;]+?)\\s*;\\s*document\\.body\\.appendChild\\(a\\)\\s*;\\s*a\\.click\\(\\)\\s*;\\s*a\\.remove\\(\\)\\s*;\\s*' +
  'setTimeout\\(\\s*\\(\\)\\s*=>\\s*URL\\.revokeObjectURL\\(url\\)\\s*,\\s*\\d+\\s*\\)\\s*;', 'g');
let converted = 0;
const roots = [P('public', 'js')];
for (const dir of roots) for (const fp of walk(dir)) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  if (SKIP_FILE.test(rel)) continue;
  const f = load(fp); if (!f) continue;
  const n = (f.text.match(DL) || []).length;
  if (n) { f.text = f.text.replace(DL, (m, blob, q, name) => 'downloadBlob(' + name.trim() + ', ' + blob.trim() + ');'); converted += n; res.ok.push(rel + ' › download code replaced by downloadBlob() (' + n + ')'); }
}
if (!converted) res.skip.push('public/js › no other copy of the download code found');

/* anything left that still builds a download link by hand (informational: a blob URL for previewing a file is fine) */
const left = [];
for (const dir of roots) for (const fp of walk(dir)) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/'); if (SKIP_FILE.test(rel)) continue;
  const f = load(fp); if (!f) continue;
  f.text.split('\n').forEach((l, i) => { if (/URL\.createObjectURL\(/.test(l) && !/const downloadBlob =/.test(l)) left.push(rel + ':' + (i + 1)); });
}

/* ---------------------------------------------------------------------------------------------- result */
const show = (title, list) => { if (list.length) { console.log('\n' + title); list.forEach(x => console.log('  ' + x)); } };
show(DRY ? 'WOULD CHANGE' : 'CHANGED', res.ok);
show('SKIPPED', res.skip);
show('WARNINGS (not required; the rest still works)', res.warn);
if (left.length) show('STILL BUILDS A FILE LINK BY HAND (review; fine if it only previews a file, not a download)', left);
if (res.fail.length) {
  show('CANNOT APPLY (nothing was written)', res.fail);
  console.log('\nSend me the file(s) named above, or the exact lines near the anchor, and I will adjust the patcher.');
  process.exit(1);
}
if (!DRY) {
  let n = 0;
  for (const f of files.values()) { const out = f.crlf ? f.text.replace(/\n/g, '\r\n') : f.text; if (out !== f.raw) { fs.writeFileSync(f.p, out); n++; } }
  console.log('\n' + n + ' file(s) written. Next: npm test && npm run build, then commit dist/.');
} else console.log('\nDry run: nothing written.');
