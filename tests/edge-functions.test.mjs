/* Runs the real Edge Function source (supabase/functions/<name>/index.ts, transpiled) in Node with a Deno shim and an
 * in-memory stand-in for the Supabase client. Checks request handling around the shared rules: JWT claims, CORS
 * and origin, must-change, custom-role permissions, file-link entitlement, SCORM launch, account management. */
import test from 'node:test'; import assert from 'node:assert';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
// typescript is a devDependency (npm install); NODE_PATH also works for a global install
const require = createRequire(import.meta.url), ts = require('typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('../public/js/core/assessment.js'); await import('../supabase/functions/_shared/learning-core.js');

function fakeSupabase(T) {
  const q = (table) => { const f = []; let single = false, op = 'select', payload = null, sel = null;
    const api = { select(s) { if (op === 'select') sel = s; else sel = s; return api; }, eq(c, v) { f.push([c, v]); return api; }, in(c, vs) { f.push([c, vs, 'in']); return api; }, neq(c, v) { f.push([c, v, 'neq']); return api; }, ilike(c, v) { f.push([c, String(v).replace(/\\(.)/g, '$1').toLowerCase(), 'ilike']); return api; }, limit() { return api; }, maybeSingle() { single = true; return api; },
      insert(p) { op = 'insert'; payload = p; return api; }, update(p) { op = 'update'; payload = p; return api; }, upsert(p) { op = 'upsert'; payload = p; return api; }, delete() { op = 'delete'; return api; },
      then(res) { const rows = T[table], m = r => f.every(([c, v, k]) => { const val = c === 'data->>empId' ? r.data && r.data.empId : r[c]; return k === 'in' ? v.includes(val) : k === 'neq' ? val !== v : k === 'ilike' ? String(val || '').toLowerCase() === v : val === v; });
        if (op === 'select') { const out = rows.filter(m); return res({ data: single ? out[0] || null : out, error: null }); }
        if (op === 'insert') { if (rows.some(r => r.org_id === payload.org_id && r.coll === payload.coll && r.key === payload.key)) return res({ error: { code: '23505' } }); rows.push({ ...payload }); return res({ error: null }); }
        if (op === 'update') { const hit = rows.filter(m); hit.forEach(r => Object.assign(r, payload)); return res({ data: hit.map(r => ({ key: r.key })), error: null }); }
        if (op === 'upsert') { const i = rows.findIndex(r => r.org_id === payload.org_id && r.user_id === payload.user_id); if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ ...payload }); return res({ error: null }); }
        if (op === 'delete') { T[table] = rows.filter(r => !m(r)); return res({ error: null }); } } };
    return api; };
  return { from: q, rpc: async (fn, a) => fn === 'sf_session_ok' ? { data: !(T.deadSessions || []).includes(a.p_sid), error: null } : fn === 'sf_revoke_sessions' ? (T.revoked.push([a.p_user, a.p_keep]), { data: 1, error: null }) : fn === 'sf_auth_user_id' ? { data: (T.authUsers.find(u => u.email === a.p_email) || {}).id || null, error: null } : { data: null, error: { message: 'no' } },
    auth: { admin: { updateUserById: async (id, p) => { T.updates.push([id, p]); return { error: null }; }, createUser: async ({ email }) => { const u = { id: 'new-' + email, email }; T.authUsers.push(u); return { data: { user: u }, error: null }; } } },
    storage: { from: () => ({ createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: 'https://s/' + p })) }) }) } };
}
async function load(fnName, T, env) {
  let src = fs.readFileSync(path.join(ROOT, 'supabase/functions', fnName, 'index.ts'), 'utf8')
    .replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, 'const createClient = () => globalThis.__fake;')
    .replace(/^import "\.\.\/_shared\/.*";$/gm, '');
  const js = ts.transpileModule(src, { compilerOptions: { target: 99, module: 99 } }).outputText;
  let handler; globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } }; globalThis.__fake = fakeSupabase(T);
  const file = path.join(ROOT, 'tests', '.tmp-' + fnName + '-' + Math.random().toString(36).slice(2) + '.mjs'); fs.writeFileSync(file, js);
  try { await import(file); } finally { fs.unlinkSync(file); }
  return (body, { token, origin } = {}) => handler(new Request('https://fn/' + fnName, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }));
}
const jwt = (claims) => 'x.' + Buffer.from(JSON.stringify({ role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600, ...claims })).toString('base64url') + '.sig';
const world = () => ({ updates: [], revoked: [], deadSessions: [], authUsers: [{ id: 'U-L', email: 'l@x' }],
  sf_member: [{ org_id: 'o', user_id: 'U-A', email: 'a@x', emp_id: 'A1', role: 'Admin', active: true, app_name: 'Ann' },
              { org_id: 'o', user_id: 'U-T', email: 't@x', emp_id: 'T1', role: 'Trainer', role_id: 'r_lite', active: true, app_name: 'Tom', user_key: 'uT' },
              { org_id: 'o', user_id: 'U-L', email: 'l@x', emp_id: 'L1', role: 'Learner', active: true, app_name: 'Lia', user_key: 'uL' }],
  sf_doc: [{ org_id: 'o', coll: 'roles', key: 'r_lite', data: { perms: { batches: true } }, version: 1 }, { org_id: 'o', coll: 'roles', key: 'r_learner', data: { perms: {} }, version: 1 },
           { org_id: 'o', coll: 'enroll', key: 'L1', data: { c1: '2026-12-01' }, version: 1 },
           { org_id: 'o', coll: 'adminCourses', key: 'c1', data: { id: 'c1', title: 'C', status: 'Published', features: {}, items: [{ kind: 'pdf', moduleId: 'm1' }, { kind: 'scorm', moduleId: 'm2' }] }, version: 1 },
           { org_id: 'o', coll: 'lcms', key: 'm1', data: { type: 'Document', file: { path: 'o/lcms/2026-10/a.pdf' } }, version: 1 },
           { org_id: 'o', coll: 'lcms', key: 'm2', data: { type: 'SCORM', file: { path: 'o/scorm/pk1/', launch: 'content/index.html' } }, version: 1 },
           { org_id: 'o', coll: 'itemDone', key: 'L1', data: { c1: { 0: '2026-10-01' } }, version: 1 }] });
const ENV = { SUPABASE_URL: 'https://p', SUPABASE_SERVICE_ROLE_KEY: 'svc', ALLOWED_ORIGIN: 'https://lms.example', CONTENT_ORIGIN: 'https://content.example', CONTENT_SIGNING_KEY: 'k' };

test('learning: rejects missing/expired tokens and other origins; CORS is the app origin only', async () => {
  const call = await load('learning', world(), ENV);
  assert.strictEqual((await call({ action: 'me', org: 'o' })).status, 401);
  assert.strictEqual((await call({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-L', exp: 1 }) })).status, 401);
  const r = await call({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-L' }), origin: 'https://evil.example' }); assert.strictEqual(r.status, 403);
  const ok = await call({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-L' }), origin: 'https://lms.example' });
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'https://lms.example');
  const noOrigin = await load('learning', world(), { ...ENV, ALLOWED_ORIGIN: '' });
  assert.strictEqual((await noOrigin({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-L' }) })).headers.get('access-control-allow-origin'), null, 'no wildcard');
});
test('learning: custom role permissions come from the roles row', async () => {
  const call = await load('learning', world(), ENV);
  const me = await (await call({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-T' }) })).json();
  assert.deepStrictEqual(me.perms, ['batches']);
});
test('learning: must-change sessions can only change the password', async () => {
  const T = world(), call = await load('learning', T, ENV), tok = jwt({ sub: 'U-L', app_metadata: { must_change: true } });
  assert.strictEqual((await call({ action: 'openStep', org: 'o', courseId: 'c1', step: 0 }, { token: tok })).status, 403);
  assert.strictEqual((await call({ action: 'changePassword', password: 'weak' }, { token: tok })).status, 400);
  assert.strictEqual((await call({ action: 'changePassword', password: 'Strong-pass-2026' }, { token: tok })).status, 200);
  assert.strictEqual(T.updates[0][1].app_metadata.must_change, false);
});
test('learning: learners get links only for files of their assigned courses', async () => {
  const call = await load('learning', world(), ENV);
  const r = await (await call({ action: 'sign', org: 'o', paths: ['o/lcms/2026-10/a.pdf', 'o/lcms/2026-10/secret.pdf', 'o/courses/guessed.pdf', 'o/certificates/another-user.pdf', 'x/lcms/a.pdf'] }, { token: jwt({ sub: 'U-L' }) })).json();
  assert.deepStrictEqual(Object.keys(r.urls), ['o/lcms/2026-10/a.pdf']);
});
test('learning: SCORM launch returns a content-site URL with a token for that package only', async () => {
  const T = world(), call = await load('learning', T, ENV);
  const r = await (await call({ action: 'scormLaunch', org: 'o', courseId: 'c1', step: 1 }, { token: jwt({ sub: 'U-L' }) })).json();
  assert.match(r.url, /^https:\/\/content\.example\/c\/[^/]+\.[^/]+\/content\/index\.html$/); assert.strictEqual(r.origin, 'https://content.example');
  const tok = r.url.split('/c/')[1].split('/')[0], [b, sig] = tok.split('.'), { createHmac } = await import('node:crypto');
  assert.strictEqual(createHmac('sha256', 'k').update(b).digest('base64url'), sig, 'signed with CONTENT_SIGNING_KEY');
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()); assert.strictEqual(p.p, 'o/scorm/pk1/'); assert.strictEqual(p.e, 'L1');
  assert.strictEqual(p.s, r.sid, 'token is bound to the launch session');
  assert.ok(T.sf_doc.some(x => x.coll === 'scormSess' && x.key === 'L1|c1|1' && x.data.sid === r.sid), 'launch session written');
  const early = await call({ action: 'completeStep', org: 'o', courseId: 'c1', step: 1 }, { token: jwt({ sub: 'U-L' }) });
  assert.strictEqual(early.status, 400, 'SCORM steps cannot be completed with completeStep');
  const bad = await call({ action: 'scormLaunch', org: 'o', moduleId: 'm2' }, { token: jwt({ sub: 'U-L' }) }); assert.strictEqual(bad.status, 403, 'learners cannot preview arbitrary packages');
});
test('admin-users: only admins; temporary password; custom role saved; no user listing', async () => {
  const T = world(), call = await load('admin-users', T, ENV);
  assert.strictEqual((await call({ action: 'create', org: 'o', email: 'n@x.co', empId: 'N1', name: 'New' }, { token: jwt({ sub: 'U-T' }) })).status, 403);
  const r = await (await call({ action: 'create', org: 'o', email: 'n@x.co', empId: 'N1', name: 'New', role: 'Learner', roleId: 'r_qa', userKey: 'u9' }, { token: jwt({ sub: 'U-A' }) })).json();
  assert.strictEqual(r.tempPassword, 'Pass@123', 'v41.19: new logins get the default first password');
  const m = T.sf_member.find(x => x.emp_id === 'N1'); assert.strictEqual(m.role_id, 'r_qa'); assert.strictEqual(m.user_key, 'u9');
  assert.strictEqual(T.updates.length, 0);
  const r2 = await (await call({ action: 'resetPassword', org: 'o', email: 'l@x' }, { token: jwt({ sub: 'U-A' }) })).json();
  assert.ok(r2.tempPassword); assert.strictEqual(T.updates[0][1].app_metadata.must_change, true);
});

test('v34: a token whose session was ended is refused by both functions (and a database error means "no")', async () => {
  const T = world(), learning = await load('learning', T, ENV), adm = await load('admin-users', T, ENV);
  const tokL = jwt({ sub: 'U-L', session_id: 'sess-1' }), tokA = jwt({ sub: 'U-A', session_id: 'sess-a' });
  assert.strictEqual((await learning({ action: 'me', org: 'o' }, { token: tokL })).status, 200);
  T.deadSessions.push('sess-1', 'sess-a');
  assert.strictEqual((await learning({ action: 'me', org: 'o' }, { token: tokL })).status, 401);
  assert.strictEqual((await learning({ action: 'changePassword', password: 'Strong-pass-2026' }, { token: tokL })).status, 401, 'even the password change');
  assert.strictEqual((await adm({ action: 'resetPassword', org: 'o', email: 'l@x' }, { token: tokA })).status, 401);
  assert.strictEqual(T.updates.length, 0, 'nothing was changed');
  const T2 = world(); T2.deadSessions = null; const l2 = await load('learning', T2, ENV);
  globalThis.__fake.rpc = async () => ({ data: null, error: { message: 'function does not exist' } });
  assert.strictEqual((await l2({ action: 'me', org: 'o' }, { token: jwt({ sub: 'U-L', session_id: 'x' }) })).status, 401, 'fail closed');
});
test('v34: reset, create-over-existing and deactivate end ALL sessions of that person; unban and role change do not', async () => {
  const T = world(), call = await load('admin-users', T, ENV), tok = jwt({ sub: 'U-A', session_id: 'sess-a' });
  await call({ action: 'resetPassword', org: 'o', email: 'l@x' }, { token: tok });
  assert.deepStrictEqual(T.revoked.splice(0), [['U-L', null]]);
  await call({ action: 'ban', org: 'o', email: 'l@x' }, { token: tok });
  assert.deepStrictEqual(T.revoked.splice(0), [['U-L', null]]);
  await call({ action: 'unban', org: 'o', email: 'l@x' }, { token: tok }); await call({ action: 'setRole', org: 'o', email: 'l@x', role: 'Trainer' }, { token: tok });
  assert.deepStrictEqual(T.revoked, [], 'role and active flag are read live from the database on every request, nothing to revoke');
  T.sf_member[2].email = 'lia@x.com'; T.authUsers[0].email = 'lia@x.com';
  const again = await call({ action: 'create', org: 'o', email: 'lia@x.com', empId: 'L1', name: 'Lia', role: 'Learner' }, { token: tok }); assert.strictEqual(again.status, 200, JSON.stringify(await again.clone().json()));
  assert.deepStrictEqual(T.revoked.splice(0), [['U-L', null]], 're-creating an existing login resets its password, so its sessions end too');
  const fresh = await call({ action: 'create', org: 'o', email: 'new@x.com', empId: 'N1', name: 'Nia', role: 'Learner' }, { token: tok });
  assert.strictEqual(fresh.status, 200); assert.deepStrictEqual(T.revoked, [], 'a brand-new login has no sessions');
});
test('v34: changing your own password ends your OTHER sessions and keeps this one', async () => {
  const T = world(), call = await load('learning', T, ENV);
  assert.strictEqual((await call({ action: 'changePassword', password: 'Strong-pass-2026' }, { token: jwt({ sub: 'U-L', session_id: 'sess-1' }) })).status, 200);
  assert.deepStrictEqual(T.revoked.splice(0), [['U-L', 'sess-1']]);
  assert.strictEqual((await call({ action: 'changePassword', password: 'Strong-pass-2026' }, { token: jwt({ sub: 'U-L' }) })).status, 200);
  assert.deepStrictEqual(T.revoked, [], 'no session id in the token: nothing is revoked (so the person is not signed out)');
});

// v41.18: account actions stay inside the admin's own organisation; no admin can lock themselves out
test('admin-users: no reset / ban / takeover of a login from another organisation; no self-ban or self-demotion', async () => {
  const T = world(); T.authUsers.push({ id: 'U-Z', email: 'z@other.co' }); T.sf_member.push({ org_id: 'other', user_id: 'U-Z', email: 'z@other.co', emp_id: 'Z1', role: 'Learner', active: true, app_name: 'Zed' });
  const call = await load('admin-users', T, ENV), tok = jwt({ sub: 'U-A' });
  assert.strictEqual((await call({ action: 'resetPassword', org: 'o', email: 'z@other.co' }, { token: tok })).status, 404);
  assert.strictEqual((await call({ action: 'ban', org: 'o', email: 'z@other.co' }, { token: tok })).status, 404);
  const take = await call({ action: 'create', org: 'o', email: 'z@other.co', empId: 'Z9', name: 'Zed', role: 'Learner' }, { token: tok });
  assert.strictEqual(take.status, 400); assert.match((await take.json()).error, /another organisation/);
  assert.strictEqual(T.updates.length, 0, 'no password was changed');
  assert.strictEqual((await call({ action: 'ban', org: 'o', email: 'a@x' }, { token: tok })).status, 400);
  assert.strictEqual((await call({ action: 'setRole', org: 'o', email: 'a@x', role: 'Learner' }, { token: tok })).status, 400);
  assert.strictEqual((await call({ action: 'setRole', org: 'o', email: 'l@x', role: 'Trainer' }, { token: tok })).status, 200);
});

// v41.19: default first password, login found by employee ID or any letter case, default password can't be kept
test('v41.19: default first password Pass@123 (or random), member found by employee ID / e-mail case, default refused as new password', async () => {
  const T = world(), call = await load('admin-users', T, ENV), tok = jwt({ sub: 'U-A' });
  const r = await (await call({ action: 'resetPassword', org: 'o', email: 'L@X' }, { token: tok })).json();
  assert.strictEqual(r.tempPassword, 'Pass@123'); assert.strictEqual(T.updates[0][0], 'U-L'); assert.strictEqual(T.updates[0][1].app_metadata.must_change, true);
  const byEmp = await call({ action: 'ban', org: 'o', email: 'changed@x', empId: 'L1' }, { token: tok }); assert.strictEqual(byEmp.status, 200, 'found by employee ID after an e-mail edit');
  const none = await call({ action: 'unban', org: 'o', email: 'nobody@x', empId: 'Q9' }, { token: tok }); assert.strictEqual(none.status, 404);
  const nb = await none.json(); assert.ok(nb.noLogin && /no login yet/.test(nb.error), JSON.stringify(nb));
  const T2 = world(), rnd = await load('admin-users', T2, { ...ENV, DEFAULT_PASSWORD: 'random' });
  const r2 = await (await rnd({ action: 'create', org: 'o', email: 'n@x.co', empId: 'N1', name: 'New' }, { token: tok })).json();
  assert.ok(r2.tempPassword && r2.tempPassword.length === 14, JSON.stringify(r2));
  const learning = await load('learning', world(), ENV);
  const keep = await learning({ action: 'changePassword', password: 'Pass@123' }, { token: jwt({ sub: 'U-L' }) }); assert.strictEqual(keep.status, 400);
  assert.strictEqual((await learning({ action: 'changePassword', password: 'Strong-pass-2026' }, { token: jwt({ sub: 'U-L' }) })).status, 200);
});
