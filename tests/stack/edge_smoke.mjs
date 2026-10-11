/* Smoke test against a REAL local Supabase stack (CI job "supabase-stack": `supabase start` + `supabase functions
 * serve`). Unlike tests/edge-functions.test.mjs (Node + shim), this runs the Edge Functions on the Deno edge runtime
 * behind the real gateway (JWT verification), with real Auth, PostgREST and the migration's policies.
 * Needs: SB_API_URL, SB_ANON_KEY, SB_SERVICE_ROLE_KEY (from `supabase status -o env`), functions served with
 * ALLOWED_ORIGIN=https://app.test, CONTENT_ORIGIN, CONTENT_SIGNING_KEY.                                              */
import assert from 'node:assert';
const API = process.env.SB_API_URL, ANON = process.env.SB_ANON_KEY, SVC = process.env.SB_SERVICE_ROLE_KEY, ORIGIN = 'https://app.test';
if (!API || !ANON || !SVC) { console.error('Set SB_API_URL, SB_ANON_KEY, SB_SERVICE_ROLE_KEY'); process.exit(2); }
const ORG = 'smoke' + Date.now().toString(36), RES = [];
const ok = (n, c, x = '') => { RES.push([n, !!c]); console.log((c ? 'PASS ' : 'FAIL ') + n, c ? '' : JSON.stringify(x).slice(0, 400)); };
const j = async (r) => { const t = await r.text(); try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; } };
const svc = (path, init = {}) => fetch(API + path, { ...init, headers: { apikey: SVC, authorization: 'Bearer ' + SVC, 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers || {}) } }).then(j);
const anon = (path, init = {}, token) => fetch(API + path, { ...init, headers: { apikey: ANON, authorization: 'Bearer ' + (token || ANON), 'content-type': 'application/json', ...(init.headers || {}) } }).then(j);
const fn = (name, body, token, origin = ORIGIN) => fetch(API + '/functions/v1/' + name, { method: 'POST', headers: { apikey: ANON, authorization: 'Bearer ' + token, 'content-type': 'application/json', origin }, body: JSON.stringify({ org: ORG, ...body }) }).then(j);

async function user(email, password) {
  const r = await svc('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.ok(r.body.id, JSON.stringify(r)); return r.body.id;
}
const doc = (coll, key, data) => svc('/rest/v1/sf_doc', { method: 'POST', body: JSON.stringify({ org_id: ORG, coll, key, data }) });
const signIn = async (email, password) => (await anon('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })).body.access_token;

const pw = 'Smoke-pass-2026x', lid = await user(ORG + '.learner@smoke.test', pw), aid = await user(ORG + '.admin@smoke.test', pw);
await svc('/rest/v1/sf_member', { method: 'POST', body: JSON.stringify([
  { org_id: ORG, user_id: lid, email: ORG + '.learner@smoke.test', emp_id: 'SM-1', user_key: 'u1', app_name: 'Lea', role: 'Learner' },
  { org_id: ORG, user_id: aid, email: ORG + '.admin@smoke.test', emp_id: 'SM-9', user_key: 'u9', app_name: 'Ada', role: 'Admin' }]) });
await doc('roles', 'r_learner', { perms: {} }); await doc('roles', 'r_trainer', { perms: { gradebook: true } });
await doc('users', 'u1', { name: 'Lea', empId: 'SM-1', status: 'Active' });
await doc('qs', 'q1', { id: 1, type: 'Multiple choice', text: 'Q', opts: ['a', 'b'], ans: 1 });
await doc('lcms', 'pk', { id: 'pk', type: 'SCORM', file: { path: ORG + '/scorm/pk1/', launch: 'index.html' } });
await doc('adminCourses', 'c1', { id: 'c1', title: 'C', status: 'Published', features: {}, items: [{ kind: 'scorm', moduleId: 'pk', mins: 5 }] });
await doc('enroll', 'SM-1', { c1: '2026-12-31' });

// employee-ID lookup (real pgcrypto + bcrypt hashes from GoTrue)
const lk = await anon('/rest/v1/rpc/sf_login_lookup', { method: 'POST', body: JSON.stringify({ p_org: ORG, p_emp: 'sm-1', p_password: pw }) });
ok('employee-ID lookup returns the email with the right password (real bcrypt)', lk.body && lk.body.email === ORG + '.learner@smoke.test', lk);
const bad = await anon('/rest/v1/rpc/sf_login_lookup', { method: 'POST', body: JSON.stringify({ p_org: ORG, p_emp: 'SM-404', p_password: 'x' }) });
ok('unknown ID: same answer as a wrong password', bad.body && bad.body.error === 'invalid', bad);
const ip = await anon('/rest/v1/rpc/sf_client_ip', { method: 'POST', body: '{}' });
console.log('sf_client_ip() through the local gateway:', JSON.stringify(ip.body), '(empty locally: no Cloudflare in front)');

const tok = await signIn(ORG + '.learner@smoke.test', pw); ok('learner signs in', !!tok);
const forged = tok.split('.').slice(0, 2).join('.') + '.AAAA';
ok('gateway rejects a JWT with a bad signature (verify_jwt)', (await fn('learning', { action: 'me' }, forged)).status === 401);
ok('other origins are refused', (await fn('learning', { action: 'me' }, tok, 'https://evil.test')).status === 403);
const me = await fn('learning', { action: 'me' }, tok);
ok('learning function runs on the edge runtime and reads the membership', me.status === 200 && me.body.empId === 'SM-1', me);
const cs = await fn('learning', { action: 'completeStep', courseId: 'c1', step: 0 }, tok);
ok('SCORM step cannot be completed with completeStep', cs.status === 400, cs);
const ln = await fn('learning', { action: 'scormLaunch', courseId: 'c1', step: 0 }, tok);
ok('SCORM launch returns a content link and a session id', ln.status === 200 && ln.body.url.startsWith('https://content.test/c/') && ln.body.sid, ln);
const early = await fn('learning', { action: 'scormCommit', courseId: 'c1', step: 0, sid: ln.body.sid, status: 'completed' }, tok);
ok('completion before the minimum time is held back', early.status === 200 && early.body.done === false && early.body.wait > 0, early);
const rd = async coll => (await anon('/rest/v1/sf_doc?select=key&org_id=eq.' + ORG + '&coll=eq.' + coll, {}, tok)).body;
ok('learner cannot read launch sessions or the question bank', JSON.stringify(await rd('scormSess')) === '[]' && JSON.stringify(await rd('qs')) === '[]');
const w = await anon('/rest/v1/rpc/sf_save', { method: 'POST', body: JSON.stringify({ p_org: ORG, p_rows: [{ coll: 'itemDone', key: 'SM-1', data: { c1: { 0: 'x' } }, version: null }] }) }, tok);
ok('learner cannot write results directly', Array.isArray(w.body) && w.body[0].status === 'denied', w);
const up = await fetch(API + '/storage/v1/object/lms-files/' + ORG + '/lcms/x.svg', { method: 'POST', headers: { apikey: ANON, authorization: 'Bearer ' + await signIn(ORG + '.admin@smoke.test', pw), 'content-type': 'image/svg+xml' }, body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' });
ok('storage refuses SVG uploads (even for admins)', up.status >= 400, up.status);


// ---- v34: Auth policy, session revocation, content function ----
const tokA = await signIn(ORG + '.learner@smoke.test', pw);
const weak = await fetch(API + '/auth/v1/user', { method: 'PUT', headers: { apikey: ANON, authorization: 'Bearer ' + tokA, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'abc12345' }) });
ok('Auth refuses a weak password even when the user calls it directly (supabase/config.toml: minimum_password_length, password_requirements)', weak.status === 422 || weak.status === 400, weak.status);
const su = await fetch(API + '/auth/v1/signup', { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: ORG + '.self@smoke.test', password: 'Smoke-pass-2026x' }) });
ok('self sign-up is switched off', su.status >= 400, su.status);
const before = await anon('/rest/v1/sf_doc?select=key&org_id=eq.' + ORG + '&coll=eq.enroll', {}, tokA);
ok('a live session reads its own enrolments', Array.isArray(before.body) && before.body.length === 1, before);
const rv = await svc('/rest/v1/rpc/sf_revoke_sessions', { method: 'POST', body: JSON.stringify({ p_user: lid, p_keep: null }) });
ok('service role can end a person\'s sessions', rv.status === 200 && Number(rv.body) >= 1, rv);
const after = await anon('/rest/v1/sf_doc?select=key&org_id=eq.' + ORG + '&coll=eq.enroll', {}, tokA);
ok('the OLD access token sees nothing at once after revocation (no waiting for it to expire)', Array.isArray(after.body) && after.body.length === 0, after);
const afterFn = await fn('learning', { action: 'me' }, tokA);
ok('and the learning function refuses it', afterFn.status === 401, afterFn);
const rt = await anon('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: ORG + '.learner@smoke.test', password: pw }) });
ok('signing in again works and gets a working session', rt.body.access_token && (await anon('/rest/v1/sf_doc?select=key&org_id=eq.' + ORG + '&coll=eq.enroll', {}, rt.body.access_token)).body.length === 1, rt.status);
const cf = (b) => fetch(API + '/functions/v1/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
ok('content function: reachable without a Supabase login, but refuses a bad token', (await cf({ token: 'x.y', file: ['index.html'] })).status === 403);
ok('content function: GET is not allowed', (await fetch(API + '/functions/v1/content')).status === 405);

const failed = RES.filter(r => !r[1]); console.log('\nSUMMARY', RES.length - failed.length, '/', RES.length); process.exit(failed.length ? 1 : 0);
