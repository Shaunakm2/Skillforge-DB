// Serves the content-site Function locally for tests/e2e/scorm_isolation_e2e.py. Storage reads come from tests/fixtures/scorm-pkg.
import http from 'node:http'; import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), PKG = path.join(HERE, '..', 'fixtures', 'scorm-pkg'), PUB = path.join(HERE, '..', '..', 'content-site', 'public');
const { onRequest } = await import('../../content-site/functions/c/[[path]].js');
const env = { SUPABASE_URL: 'https://x.supabase.co', APP_ORIGIN: process.argv[3] || 'https://app.test' };   // v34: the content site holds no keys
const SESS = new Map();   // launch sessions, pushed by the test from the mock database (POST /__sess)
const KEY = 'k', b64u = x => Buffer.from(x).toString('base64url');
// stand-in for the Edge Function "content": same rules (signature, live session), answers with a signed URL
function contentFn(body) {
  const { token, file } = JSON.parse(body), [b, sig] = String(token).split('.');
  if (!b || sig !== crypto.createHmac('sha256', KEY).update(b).digest('base64url')) return new Response('{}', { status: 403 });
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()), d = SESS.get(p.k);
  if (!d || d.sid !== p.s || d.emp !== p.e || d.prefix !== p.p || d.ended || !(Date.parse(d.until) > Date.now()) || !(p.x > Date.now() / 1000)) return new Response('{}', { status: 403 });
  return new Response(JSON.stringify({ url: 'https://x.supabase.co/storage/v1/object/sign/lms-scorm/' + p.p + file.join('/') + '?token=t' }), { headers: { 'content-type': 'application/json' } });
}
globalThis.fetch = async (url, init) => {
  url = String(url); if (url === 'https://x.supabase.co/functions/v1/content') return contentFn(init.body);
  const m = url.match(/\/object\/sign\/lms-scorm\/testorg\/scorm\/pk1\/([^?]+)\?token=/); const f = m && path.join(PKG, decodeURIComponent(m[1]));
  return f && f.startsWith(PKG) && fs.existsSync(f) ? new Response(fs.readFileSync(f)) : new Response('no', { status: 404 }); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'https://content.test');
  if (u.pathname === '/__sess' && req.method === 'POST') { let b = ''; for await (const ch of req) b += ch; SESS.clear(); JSON.parse(b).forEach(r => SESS.set(r.key, r.data)); res.writeHead(204); return res.end(); }
  if (u.pathname === '/bridge.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(PUB, 'bridge.js'))); }
  if (!u.pathname.startsWith('/c/')) { res.writeHead(404); return res.end('nf'); }
  const r = await onRequest({ request: new Request(u.href), env, params: { path: u.pathname.slice(3).split('/') } });
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(+process.argv[2], '127.0.0.1', () => console.log('ready'));
