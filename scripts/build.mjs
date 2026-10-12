// Skillforge — production build: public/ -> dist/ (the Cloudflare Pages output directory).
//   • the ~57 application scripts are joined, in the order index.html loads them, into ONE file named by its content
//     hash (js/app.<hash>.js, cached for a year); config.js and boot.js stay separate (per-deployment settings, and
//     boot.js loads the vendored Supabase client before the app);
//   • the vendored Supabase client must exist (scripts/vendor-supabase.sh) unless SF_ALLOW_NO_VENDOR=1 (offline demo);
//   • everything else is copied as is. Run: npm run build   (Pages build command: npm run vendor && npm run build)
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), SRC = path.join(ROOT, 'public'), OUT = path.resolve(ROOT, process.env.SF_OUT || 'dist');   // SF_OUT: build somewhere else (tests)
const KEEP = new Set(['js/config.js', 'js/boot.js']);
fs.rmSync(OUT, { recursive: true, force: true }); fs.cpSync(SRC, OUT, { recursive: true });

// ---- Content-Security-Policy (v34) ----
// The policy names YOUR Supabase project and YOUR content site only (read from js/config.js: SUPABASE_URL, CONTENT_ORIGIN; or the
// environment variables SF_SUPABASE_URL / SF_CONTENT_ORIGIN). No wildcard for all of supabase.co, no "any https page" in frames.
// Offline demo build (config empty): no external origin at all. The same text goes into the _headers file and the <meta> tag.
const cfgText = fs.readFileSync(path.join(SRC, 'js/config.js'), 'utf8');
const cfgVal = k => { const m = cfgText.match(new RegExp(k + "\\s*:\\s*'([^']*)'")); return m ? m[1].trim() : ''; };
function originOf(label, v) {
  if (!v) return '';
  if (/[\s;,'"]/.test(v)) throw new Error(label + ' contains characters that cannot be put in a policy: ' + v);
  let u; try { u = new URL(v); } catch (e) { throw new Error(label + ' is not a URL: ' + v); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error(label + ' must be an https:// address: ' + v);
  return u.origin;
}
const SB = originOf('SUPABASE_URL', process.env.SF_SUPABASE_URL || cfgVal('SUPABASE_URL')), CT = originOf('CONTENT_ORIGIN', process.env.SF_CONTENT_ORIGIN || cfgVal('CONTENT_ORIGIN'));
if (SB && !String(process.env.SF_ORG_ID || cfgVal('ORG_ID') || '').trim()) throw new Error('ORG_ID is empty in js/config.js (or SF_ORG_ID): a connected build needs an organisation id');
if (SB && CT === SB) throw new Error('CONTENT_ORIGIN must be a different origin from SUPABASE_URL (and from the app)');
const WS = SB ? SB.replace(/^http/, 'ws') : '';
// v41.11: sites that may be shown inside the LMS (YouTube privacy mode, Vimeo, H5P) + EMBED_ORIGINS from js/config.js (or SF_EMBED_ORIGINS).
// Same default list as EMBED_ORIGINS in js/data/seed.js. Each entry must be an https origin (a leading *. wildcard is allowed).
const EMB = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://h5p.org', 'https://*.h5p.com']
  .concat(String(process.env.SF_EMBED_ORIGINS || cfgVal('EMBED_ORIGINS') || '').split(/[\s,]+/).filter(Boolean))
  .map(o => { if (!/^https:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(o.replace(/\/$/, ''))) throw new Error('EMBED_ORIGINS: not an https origin: ' + o); return o.replace(/\/$/, ''); });
const policy = withAncestors => [
  "default-src 'self'", "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",          // fallback for browsers without the two lines below
  "style-src-elem 'self' https://fonts.googleapis.com",                     // no injected <style> element, no stylesheet from another site
  "style-src-attr 'unsafe-inline'",                                         // style=\"…\" attributes (the screens bind colours and widths)
  "font-src 'self' https://fonts.gstatic.com",
  ['img-src', "'self' data: blob:", SB].filter(Boolean).join(' '),
  ['media-src', "'self' blob:", SB].filter(Boolean).join(' '),
  ['connect-src', "'self'", SB, WS].filter(Boolean).join(' '),
  ['frame-src', "'self' blob:", SB, CT, ...EMB].filter(Boolean).join(' '),          // stored documents, the content site, and video / H5P / listed embed sites (v41.11)
  "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ...(withAncestors ? ["frame-ancestors 'self'"] : [])].join('; ');
const hdr = path.join(OUT, '_headers');
{ const t = fs.readFileSync(hdr, 'utf8'); if (!/^\s*Content-Security-Policy:.*$/m.test(t)) throw new Error('public/_headers has no Content-Security-Policy line');
  fs.writeFileSync(hdr, t.replace(/^(\s*Content-Security-Policy:).*$/m, (m, a) => a + ' ' + policy(true))); }
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<script src="([^"]+)"><\/script>\n?/g)].filter(m => !KEEP.has(m[1]));
if (tags.length < 10) throw new Error('expected the app scripts in index.html, found ' + tags.length);
const parts = tags.map(m => { const f = path.join(SRC, m[1]); if (!fs.existsSync(f)) throw new Error('missing ' + m[1]);
  return '/* ---- ' + m[1] + ' ---- */\n' + fs.readFileSync(f, 'utf8').replace(/\s*$/, '\n'); });
const bundle = parts.join(';\n'), hash = crypto.createHash('sha256').update(bundle).digest('hex').slice(0, 12), name = 'js/app.' + hash + '.js';
fs.writeFileSync(path.join(OUT, name), bundle);
// one tag where the first app script was; the rest removed
html = html.replace(tags[0][0], '<script src="' + name + '"></script>\n');
for (const m of tags.slice(1)) html = html.replace(m[0], '');
{ const before = html; html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, (m, a, b) => a + policy(false) + b);
  if (html === before) throw new Error('index.html has no Content-Security-Policy <meta> tag'); }
fs.writeFileSync(path.join(OUT, 'index.html'), html);
// the separate source files are not needed in the output
for (const m of tags) fs.rmSync(path.join(OUT, m[1]), { force: true });
for (const d of ['js/core', 'js/data', 'js/learner', 'js/staff', 'js/admin']) { const p = path.join(OUT, d); if (fs.existsSync(p) && !fs.readdirSync(p).length) fs.rmdirSync(p); }
fs.appendFileSync(path.join(OUT, '_headers'), '\n/js/app.*\n  Cache-Control: public, max-age=31536000, immutable\n/index.html\n  Cache-Control: no-cache\n');
const vend = path.join(OUT, 'vendor', 'supabase.js');
if (!fs.existsSync(vend) && !process.env.SF_ALLOW_NO_VENDOR) throw new Error('public/vendor/supabase.js is missing: run `npm run vendor` and commit the file');
console.log('dist/ built:', tags.length, 'scripts ->', name, '(' + Math.round(bundle.length / 1024) + ' KB)');
console.log('CSP origins -> Supabase:', SB || '(none: offline demo)', ' content site:', CT || '(none: SCORM disabled)');
