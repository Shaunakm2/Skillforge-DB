/* v34: the content site holds NO Supabase key. It asks the Edge Function "content" (the real supabase/functions/content/index.ts,
 * transpiled and run here with a Deno shim and an in-memory client) for a 60-second signed URL per file. Both halves are tested
 * together: a request goes content site -> function -> (fake) storage, exactly as in production. */
import test from 'node:test'; import assert from 'node:assert';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { onRequest, injectBridge, headersFor, safeSegments, signedTarget, peekPrefix } from '../content-site/functions/c/[[path]].js';
import '../public/js/core/assessment.js'; import '../supabase/functions/_shared/learning-core.js';
const ts = createRequire(import.meta.url)('typescript'), ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'test-signing-key-0123456789', now = () => Math.floor(Date.now() / 1000);
const env = { SUPABASE_URL: 'https://x.supabase.co', APP_ORIGIN: 'https://lms.example' };   // note: no service key, no signing key

const T = { sess: new Map(), members: [{ org_id: 'acme', emp_id: 'E1', active: true }], signed: [], reads: 0 };
const fake = {
  from(table) { const f = []; const api = { select() { return api; }, eq(c, v) { f.push([c, v]); return api; },
    async maybeSingle() { T.reads++; const g = c => (f.find(x => x[0] === c) || [])[1];
      if (table === 'sf_doc') { const d = T.sess.get(g('key')); return { data: d ? { data: d } : null, error: null }; }
      if (table === 'sf_member') { const m = T.members.find(x => x.org_id === g('org_id') && x.emp_id === g('emp_id') && x.active === g('active')); return { data: m ? { active: true } : null, error: null }; }
      return { data: null, error: { message: 'unexpected table ' + table } }; } }; return api; },
  storage: { from(b) { return { createSignedUrl: async (p, ttl) => { T.signed.push([b, p, ttl]); if (p.includes('missing')) return { data: null, error: { message: 'Object not found' } };
    return { data: { signedUrl: 'https://x.supabase.co/storage/v1/object/sign/' + b + '/' + encodeURI(p) + '?token=t' }, error: null }; } }; } },
};
async function loadFn(envOver = {}) {
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/content/index.ts'), 'utf8').replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, 'const createClient = () => globalThis.__fake;');
  const js = ts.transpileModule(src, { compilerOptions: { target: 99, module: 99 } }).outputText, E = { SUPABASE_URL: 'https://p', SUPABASE_SERVICE_ROLE_KEY: 'svc', CONTENT_SIGNING_KEY: KEY, ...envOver };
  let handler; globalThis.Deno = { env: { get: k => E[k] }, serve: h => { handler = h; } }; globalThis.__fake = fake;
  const file = path.join(ROOT, 'tests', '.tmp-content-' + Math.random().toString(36).slice(2) + '.mjs'); fs.writeFileSync(file, js);
  try { await import(file); } finally { fs.unlinkSync(file); }
  return handler;
}
let handler = await loadFn();
let sidN = 0; const newSid = () => (++sidN).toString(16).padStart(32, 'a');
const launch = (over = {}) => { const sid = newSid(), k = over.k || 'E1|c1|0'; T.sess.set(k, { sid, emp: 'E1', prefix: 'acme/scorm/p1/', until: new Date(Date.now() + 1800e3).toISOString(), ...(over.sess || {}) });
  return globalThis.LearningCore.signToken(over.key || KEY, { o: 'acme', p: 'acme/scorm/p1/', e: 'E1', s: sid, k, x: now() + 3600, ...(over.tok || {}) }); };
const CALLS = []; let fnDown = false;
globalThis.fetch = async (url, init) => { url = String(url); CALLS.push(url);
  if (url === 'https://x.supabase.co/functions/v1/content') return fnDown ? new Response('boom', { status: 500 }) : handler(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: init.body }));
  if (url.startsWith('https://x.supabase.co/storage/v1/object/sign/lms-scorm/acme/scorm/p1/')) return new Response(url.includes('.html') ? '<html><head><title>x</title></head><body>pkg</body></html>' : 'body{}');
  return new Response('no', { status: 404 }); };
const req = (p, method = 'GET', e = env) => ({ request: new Request('https://content.example/c/' + p, { method }), env: e, params: {} });
const fnCalls = () => CALLS.filter(u => u.includes('/functions/v1/content')).length;
const callFn = (body) => handler(new Request('https://fn/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

test('the content site source holds no Supabase key and no signing key', () => {
  const src = fs.readFileSync(path.join(ROOT, 'content-site/functions/c/[[path]].js'), 'utf8');
  assert.ok(!/SERVICE_ROLE|CONTENT_SIGNING_KEY|authorization/i.test(src), 'no secret is read or sent');
  assert.ok(!/\/rest\/v1\//.test(src), 'no direct database access');
});
test('serves package files with isolation headers; HTML gets the bridge', async () => {
  const t = await launch(); const r = await onRequest(req(t + '/content/index.html'));
  assert.strictEqual(r.status, 200); const html = await r.text();
  assert.ok(html.includes('<head><script src="/bridge.js" data-app-origin="https://lms.example"></script>'), html);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors https:\/\/lms\.example/);
  assert.strictEqual(r.headers.get('referrer-policy'), 'no-referrer');
  const css = await onRequest(req(t + '/content/app.css')); assert.match(css.headers.get('content-type'), /text\/css/); assert.strictEqual(await css.text(), 'body{}');
  assert.deepStrictEqual(T.signed.at(-1), ['lms-scorm', 'acme/scorm/p1/content/app.css', 60], 'a 60-second URL for exactly that file');
});
test('path traversal: encoded slashes, dots, backslashes and double encoding never reach the function or storage', async () => {
  const t = await launch();
  const tricks = ['..%2F..%2F..%2F..%2Flms-files%2Facme%2Fsecret.pdf', '..%2FpkgB%2Findex.html', 'a%2F..%2F..%2Fx', '%2e%2e/x.html', '%2E%2E%2Fx', '..%5C..%5Cx',
    'a%5Cb.html', '%252e%252e%252fx', '%25%32%65', 'content%00.html', '.%2e/x', '%2Fetc%2Fpasswd', 'x%2F', '%C0%AE%C0%AE/x'];
  for (const tr of tricks) {
    const calls = fnCalls(), signed = T.signed.length, r = await onRequest(req(t + '/' + tr));
    assert.ok([403, 404].includes(r.status), tr + ' -> ' + r.status);
    assert.strictEqual(fnCalls(), calls, tr + ' must not even call the function'); assert.strictEqual(T.signed.length, signed);
  }
  assert.strictEqual((await onRequest(req(t + '/../../lms-files/x'))).status, 404, 'the URL parser removes the token segment -> not a content path');
});
test('the function itself refuses hostile file paths (it is public and never trusts its caller)', async () => {
  const token = await launch(), signed = T.signed.length;
  for (const file of [['..', 'x'], ['a/b'], ['%2e%2e'], ['a\\b'], ['x\u0000'], ['.'], [''], [], 'index.html', [1], new Array(30).fill('a'), ['a'.repeat(300)]]) {
    const r = await callFn({ token, file }); assert.strictEqual(r.status, 404, JSON.stringify(file).slice(0, 40));
  }
  assert.strictEqual(T.signed.length, signed, 'nothing was signed');
  assert.strictEqual((await callFn({ token, file: ['content', 'ok.js'] })).status, 200);
  assert.strictEqual((await handler(new Request('https://fn/content', { method: 'GET' }))).status, 405);
  assert.strictEqual((await handler(new Request('https://fn/content', { method: 'POST', body: 'x'.repeat(9000) }))).status, 413);
  assert.strictEqual((await handler(new Request('https://fn/content', { method: 'POST', body: 'not json' }))).status, 400);
});
test('expired, tampered, wrong-key and malformed tokens are refused by the function before any database read', async () => {
  const reads = () => T.reads, r0 = reads(), t = await launch(), [, s] = t.split('.');
  const bad = [await launch({ tok: { x: now() - 1 } }), await launch({ key: 'other-key' }), await launch({ tok: { p: 'other/scorm/p1/' } }), await launch({ tok: { p: 'acme/files/x/' } }),
    await launch({ tok: { s: undefined } }), await launch({ tok: { e: '' } }), 'garbage',
    Buffer.from(JSON.stringify({ o: 'acme', p: 'acme/scorm/OTHER/', e: 'E1', s: 'a'.repeat(32), k: 'E1|c1|0', x: now() + 3600 })).toString('base64url') + '.' + s];
  for (const tk of bad) assert.strictEqual((await callFn({ token: tk, file: ['index.html'] })).status, 403);
  assert.strictEqual(reads(), r0, 'no database read for a bad token');
  assert.strictEqual(peekPrefix('garbage'), null); assert.strictEqual(peekPrefix(t), 'acme/scorm/p1/');
});
test('a link stops working when the learner relaunches, leaves, goes idle, or is deactivated', async () => {
  const t1 = await launch({ k: 'E1|c1|1' });
  assert.strictEqual((await onRequest(req(t1 + '/index.html'))).status, 200);
  const t2 = await launch({ k: 'E1|c1|1' });                         // relaunch replaces the session id
  assert.strictEqual((await onRequest(req(t2 + '/index.html'))).status, 200);
  assert.strictEqual((await onRequest(req(await launch({ k: 'E1|c1|2', sess: { until: new Date(Date.now() - 1000).toISOString() } }) + '/index.html'))).status, 403, 'idle-expired session');
  assert.strictEqual((await onRequest(req(await launch({ k: 'E1|c1|3', sess: { emp: 'E2' } }) + '/index.html'))).status, 403, 'session of someone else');
  assert.strictEqual((await onRequest(req(await launch({ k: 'E1|c1|5', sess: { ended: true } }) + '/index.html'))).status, 403, 'ended session');
  assert.strictEqual((await onRequest(req(await launch({ k: 'E1|c1|4', sess: { prefix: 'acme/scorm/p9/' } }) + '/index.html'))).status, 403, 'session for another package');
  assert.strictEqual((await onRequest(req(t1 + '/index.html'))).status, 403, 'superseded link: pages refused at once');
  const t7 = await launch({ k: 'E1|c1|7' }); assert.strictEqual((await onRequest(req(t7 + '/index.html'))).status, 200);
  T.members[0].active = false;
  assert.strictEqual((await onRequest(req(t7 + '/index.html'))).status, 403, 'deactivating the person ends their open packages at once'); T.members[0].active = true;
});
test('refuses bad tokens, missing files and other methods; function outages are a 502', async () => {
  const t = await launch();
  assert.strictEqual((await onRequest(req('nope/content/index.html'))).status, 403);
  assert.strictEqual((await onRequest(req(t + '/missing.html'))).status, 404);
  assert.strictEqual((await onRequest(req(t + '/x.html', 'POST'))).status, 405);
  fnDown = true; assert.strictEqual((await onRequest(req(t + '/index.html'))).status, 502); fnDown = false;
  assert.strictEqual((await onRequest(req(t + '/index.html', 'GET', { ...env, SUPABASE_URL: '' }))).status, 403);
});
test('only the signed URL for exactly this folder + file is accepted, and its host is replaced by ours', () => {
  const base = 'https://x.supabase.co', ok = 'https://internal:8000/storage/v1/object/sign/lms-scorm/acme/scorm/p1/a/b%20c.js?token=t';
  assert.strictEqual(signedTarget(ok, base, 'acme/scorm/p1/', ['a', 'b c.js']), 'https://x.supabase.co/storage/v1/object/sign/lms-scorm/acme/scorm/p1/a/b%20c.js?token=t');
  assert.strictEqual(signedTarget(ok, base, 'acme/scorm/p1/', ['a', 'other.js']), null, 'another file');
  assert.strictEqual(signedTarget(ok.replace('p1', 'p2'), base, 'acme/scorm/p1/', ['a', 'b c.js']), null, 'another package');
  assert.strictEqual(signedTarget(ok.replace('lms-scorm', 'lms-files'), base, 'acme/scorm/p1/', ['a', 'b c.js']), null, 'another bucket');
  assert.strictEqual(signedTarget(ok.replace('?token=t', ''), base, 'acme/scorm/p1/', ['a', 'b c.js']), null, 'no token');
  assert.strictEqual(signedTarget('not a url', base, 'acme/scorm/p1/', ['a']), null); assert.strictEqual(signedTarget(ok, 'bad base', 'acme/scorm/p1/', ['a', 'b c.js']), null);
  assert.deepStrictEqual(safeSegments('tok/sub/a%20b.html'), ['tok', 'sub', 'a b.html']);
  assert.strictEqual(safeSegments('tok/a%2Fb'), null); assert.strictEqual(safeSegments('tok/a%5Cb'), null); assert.strictEqual(safeSegments('tok/%25'), null);
});
test('non-HTML files reuse a signed URL for a short time; HTML pages always ask again', async () => {
  const t = await launch({ k: 'E1|c1|8' }); await onRequest(req(t + '/a/one.js')); const c1 = fnCalls();
  await onRequest(req(t + '/a/one.js')); assert.strictEqual(fnCalls(), c1, 'cached');
  await onRequest(req(t + '/index.html')); const c2 = fnCalls(); await onRequest(req(t + '/index.html')); assert.strictEqual(fnCalls(), c2 + 1, 'pages are never cached');
});
test('bridge injection escapes the origin attribute', () => {
  assert.ok(injectBridge('<p>x</p>', 'https://a"><script>alert(1)</script>').startsWith('<script src="/bridge.js" data-app-origin="https://ascriptalert1/script">'));
  assert.match(headersFor('html', '')['content-security-policy'], /frame-ancestors 'none'/);
});
