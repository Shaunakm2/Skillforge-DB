/* Skillforge LMS — SCORM content site (a SEPARATE origin from the app, e.g. https://content.example.com).  v34
 *
 *   GET /c/<token>/<file...>
 * <token> is issued by the Edge Function "learning" (action scormLaunch). THIS SITE HOLDS NO SUPABASE KEY AND NO SIGNING
 * KEY. For every file it asks the Edge Function "content" (supabase functions deploy content --no-verify-jwt), which
 * verifies the token, checks the launch session is still live and the person still active, and returns a 60-second signed
 * URL for exactly that file of exactly that package. This site then fetches that URL and serves the bytes. A bug or a
 * leaked Pages setting here therefore exposes no database access and no other storage.
 *
 * Paths are taken from the raw request URL (not from params, whose decoding is platform-specific). Every segment is
 * percent-decoded ONCE and must then be a plain file or folder name: no '/', '\\', '%', NUL/control characters, '.' or
 * '..'. The signed URL that comes back must name exactly the package folder + file this request asked for, or it is refused.
 * HTML pages always go through the function (always fresh); other files may reuse a signed URL for up to 30 s.
 *
 * HTML files get /bridge.js injected first. The bridge provides the SCORM 1.2 / 2004 API inside the package and
 * forwards calls to the app with postMessage (to APP_ORIGIN only); the app validates the sender.
 *
 * Environment (Pages project settings, none of them secret):
 *   SUPABASE_URL  e.g. https://abcdefghijkl.supabase.co      APP_ORIGIN  e.g. https://lms.example.com
 *   CONTENT_FN_URL  optional, default SUPABASE_URL + /functions/v1/content
 *   SUPABASE_ANON_KEY  optional: sent as the `apikey` header if your gateway setup wants one (it is public by design)
 */
const MIME = { html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8', js:'text/javascript', css:'text/css', json:'application/json', xml:'application/xml', xsd:'application/xml',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', webp:'image/webp', mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav',
  woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', pdf:'application/pdf', txt:'text/plain', vtt:'text/vtt' };
const b64uDecode = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const deny = (status, msg) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export function headersFor(ext, appOrigin) {
  return {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'private, max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    // Packages commonly need inline script and eval; they may embed only from here and only into the app.
    'content-security-policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors " + (appOrigin || "'none'"),
  };
}
export function injectBridge(html, appOrigin) {
  const tag = '<script src="/bridge.js" data-app-origin="' + String(appOrigin || '').replace(/[^A-Za-z0-9:/._-]/g, '') + '"></script>';
  const m = html.match(/<head[^>]*>/i);
  return m ? html.replace(m[0], m[0] + tag) : tag + html;
}

/* Raw path after /c/ -> decoded segments, or null if any segment is unsafe. Exported for tests. */
export function safeSegments(rawPath) {
  const raw = String(rawPath || '').split('/');
  if (raw.length < 2) return null;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let p; try { p = decodeURIComponent(raw[i]); } catch (e) { return null; }
    // v41.17: the first part is the launch token (can be 300+ chars); file and folder names stay capped at 255
    const max = i === 0 ? 2048 : 255;
    if (!p || p === '.' || p === '..' || /[\/\\%]/.test(p) || /[\u0000-\u001f\u007f]/.test(p) || p.length > max) return null;
    out.push(p);
  }
  return out;
}
/* v41.16: undo Cloudflare Pages pretty-URL rewriting. Exported for tests. */
export function prettyRaw(raw) { raw = String(raw || ''); return raw.endsWith('/') ? raw + 'index.html' : raw; }
export function fixPretty(parts) {
  if (!parts || parts.length < 2) return parts;
  const last = parts[parts.length - 1];
  if (!last.includes('.')) parts[parts.length - 1] = last + '.html';
  return parts;
}
/* The signed URL the function returned must name exactly this package folder + file (decoded), on /object/sign/<bucket>/.
 * Its host is replaced by this site's own SUPABASE_URL, so a wrong or hostile answer can never send us elsewhere. */
export function signedTarget(answer, base, prefix, segs, bucket = 'lms-scorm') {
  let u; try { u = new URL(String(answer)); } catch (e) { return null; }
  let want = '/storage/v1/object/sign/' + bucket + '/' + prefix + segs.join('/'), got;
  try { got = decodeURIComponent(u.pathname); } catch (e) { return null; }
  if (got !== want || !u.searchParams.get('token')) return null;
  let b; try { b = new URL(String(base)); } catch (e) { return null; }
  return b.origin + u.pathname + u.search;
}
/* The package folder a token names. Read WITHOUT trusting it: only used to check the function's answer; the function
 * verifies the signature and refuses a token whose payload was changed. */
export function peekPrefix(token) {
  try { const p = JSON.parse(new TextDecoder().decode(b64uDecode(String(token).split('.')[0]))); return p && typeof p.p === 'string' && /^[A-Za-z0-9_-]+\/scorm\/[A-Za-z0-9_-]+\/$/.test(p.p) ? p.p : null; } catch (e) { return null; }
}

const URL_CACHE_MS = 30 * 1000, urlCache = new Map();

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405, 'Method not allowed');
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/c/')) return deny(404, 'Not found (C1: not a content address)');
  // v41.16: Cloudflare Pages "pretty URLs" turn /c/<token>/index.html into /c/<token>/ and /c/<token>/story.html into
  // /c/<token>/story before this function runs. Put the page name back: empty last part -> index.html, no extension -> .html
  const parts = fixPretty(safeSegments(prettyRaw(path.slice(3))));
  if (!parts || parts.length < 2) return deny(404, 'Not found (C2: the address is incomplete)');
  const token = parts[0], file = parts.slice(1), prefix = peekPrefix(token);
  if (!prefix || !env.SUPABASE_URL) return deny(403, 'This link has expired. Open the course again in Skillforge.');
  const name = file[file.length - 1], ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase(), isPage = ext === 'html' || ext === 'htm';
  const ck = token + '|' + file.join('/'), now = Date.now(), hit = isPage ? null : urlCache.get(ck);
  let url = hit && hit.t > now - URL_CACHE_MS ? hit.url : null;
  if (!url) {
    const fnUrl = env.CONTENT_FN_URL || String(env.SUPABASE_URL).replace(/\/$/, '') + '/functions/v1/content';
    let r; try { r = await fetch(fnUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY } : {}) }, body: JSON.stringify({ token, file }) }); } catch (e) { return deny(502, 'Content service unavailable'); }
    if (r.status === 403) return deny(403, 'This link has expired. Open the course again in Skillforge.');
    if (r.status === 404) return deny(404, 'Not found (C3: the content service said the file does not exist, or SUPABASE_URL on this site is wrong. Open /health on this site.)');
    if (!r.ok) return deny(502, 'Content service unavailable');
    let a; try { a = await r.json(); } catch (e) { a = null; }
    url = a && signedTarget(a.url, env.SUPABASE_URL, prefix, file);
    if (!url) return deny(502, 'Content service unavailable');
    if (!isPage) { if (urlCache.size > 5000) urlCache.clear(); urlCache.set(ck, { t: now, url }); }
  }
  const obj = await fetch(url);                      // signed URL: no key needed
  if (!obj.ok) return deny(404, 'Not found (C4: storage refused the file, status ' + obj.status + ')');
  const h = headersFor(ext, env.APP_ORIGIN);
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers: h });
  if (isPage) return new Response(injectBridge(await obj.text(), env.APP_ORIGIN), { status: 200, headers: h });
  return new Response(obj.body, { status: 200, headers: h });
}
