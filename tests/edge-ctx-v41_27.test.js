// v41.27: the "learning" Edge Function asks for who is calling in ONE database call, falls back to separate reads when migration 011
// is not installed, and records the sign-in inside `me`. The TypeScript is stripped of its types and run against a fake database.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), mod = require('node:module');
const root = path.join(__dirname, '..');
// Strips the TypeScript types before running the real function: needs Node 22.13+ (module.stripTypeScriptTypes). On older Node these tests are skipped, not failed.
const T = (name, fn) => test(name, { skip: typeof mod.stripTypeScriptTypes === 'function' ? false : 'needs Node 22.13 or newer' }, fn);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (c) => 'x.' + b64({ sub: 'u1', role: 'authenticated', exp: 4e9, session_id: 's1', ...c }) + '.y';

function load(env, db) {
  let handler = null; const calls = [];
  const ctx = { console: { log() {}, error() {} }, URL, TextDecoder, TextEncoder, Uint8Array, Response, atob, crypto: globalThis.crypto, Intl, Date, Math, JSON, Promise, Map, Set, Object, Array, String, Number, Error };
  ctx.globalThis = ctx;
  ctx.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
  ctx.__createClient = () => db.client(calls);
  vm.createContext(ctx);
  vm.runInContext(`globalThis.Assessment = { isWritten: () => false };`, ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'supabase/functions/_shared/learning-core.js'), 'utf8'), ctx);
  let ts = fs.readFileSync(path.join(root, 'supabase/functions/learning/index.ts'), 'utf8')
    .replace(/^import \{ createClient \} from .*$/m, 'const createClient = globalThis.__createClient;').replace(/^import ".*$/gm, '');
  vm.runInContext(mod.stripTypeScriptTypes(ts), ctx);
  return { call: async (body, claims) => { const r = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer ' + jwt(claims || {}) }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; }, calls, ctx };
}
// fake database: rows in sf_doc, members, sessions; sf_learning_ctx can be "installed" or not
function fakeDb(opts = {}) {
  const st = { live: true, member: { emp_id: 'E1', role: 'Learner', role_id: null, user_key: null, app_name: 'Eve', active: true }, users: [{ key: 'u-eve', data: { empId: 'E1', expires: opts.expires || '' } }],
    docs: new Map([['roles\0r_learner', { data: { perms: { gradebook: true, reports: false } }, version: 1 }]]), ctxInstalled: opts.ctxInstalled !== false, ctxCalls: 0 };
  st.client = (calls) => ({
    async rpc(name, args) { calls.push('rpc:' + name);
      if (name === 'sf_learning_ctx') { if (!st.ctxInstalled) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.sf_learning_ctx' } };
        if (opts.ctxBroken) return { data: null, error: { code: '57014', message: 'timeout' } };
        st.ctxCalls++; if (!st.live) return { data: { live: false }, error: null };
        const m = st.member; return { data: { live: true, member: m ? { ...m, user_key: m.user_key || 'u-eve' } : null, expires: st.users[0].data.expires || '', perms: st.docs.get('roles\0r_learner').data.perms ? Object.entries(st.docs.get('roles\0r_learner').data.perms).filter(([, v]) => v === true).map(([k]) => k) : [] }, error: null }; }
      if (name === 'sf_session_ok') return { data: st.live, error: null };
      return { data: null, error: { message: 'unknown rpc ' + name } }; },
    from(t) { calls.push('from:' + t); const q = { f: {}, select() { return q; }, eq(k, v) { q.f[k] = v; return q; },
      async maybeSingle() { if (t === 'sf_member') return { data: st.member, error: null };
        if (t === 'sf_doc' && q.f.coll === 'users') return { data: st.users[0], error: null };
        if (t === 'sf_doc') { const r = st.docs.get(q.f.coll + '\0' + q.f.key); return { data: r || null, error: null }; } return { data: null, error: null }; },
      async insert(row) { st.docs.set(row.coll + '\0' + row.key, { data: row.data, version: 1 }); return { error: null }; },
      update(data) { const u = { f: {}, eq(k, v) { u.f[k] = v; return u; }, async select() { const key = u.f.coll + '\0' + u.f.key, r = st.docs.get(key); if (!r || r.version !== u.f.version) return { data: [], error: null }; st.docs.set(key, { data: data.data, version: data.version }); return { data: [{ key: u.f.key }], error: null }; } }; return u; } };
      return q; },
    auth: { admin: {} }, storage: { from: () => ({}) } });
  return st;
}
const ENV = { ALLOWED_ORIGIN: '', SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' };

T('one context call replaces the four reads (session, member, expiry, permissions)', async () => {
  const db = fakeDb(), f = load(ENV, db);
  const r = await f.call({ action: 'me', org: 'o' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.perms, ['gradebook']); assert.equal(r.body.empId, 'E1');
  assert.deepEqual(f.calls, ['rpc:sf_learning_ctx'], 'nothing else was read');
});
T('a deleted session is refused with 401 and nothing else is read', async () => {
  const db = fakeDb(); db.live = false; const f = load(ENV, db);
  const r = await f.call({ action: 'me', org: 'o' }); assert.equal(r.status, 401); assert.deepEqual(f.calls, ['rpc:sf_learning_ctx']);
});
T('not linked / deactivated -> 403; expired account -> 403', async () => {
  let db = fakeDb(); db.member.active = false; assert.equal((await load(ENV, db).call({ action: 'me', org: 'o' })).status, 403);
  db = fakeDb(); db.member = null; assert.equal((await load(ENV, db).call({ action: 'me', org: 'o' })).status, 403);
  db = fakeDb({ expires: '2000-01-01' }); const r = await load(ENV, db).call({ action: 'me', org: 'o' }); assert.equal(r.status, 403); assert.match(r.body.error, /expired/);
});
T('without migration 011 the four separate reads give the same answer', async () => {
  const db = fakeDb({ ctxInstalled: false }), f = load(ENV, db);
  const r = await f.call({ action: 'me', org: 'o' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.perms, ['gradebook']);
  assert.ok(f.calls.includes('rpc:sf_session_ok') && f.calls.includes('from:sf_member'));
  const f2 = load(ENV, db);
  assert.equal((await f2.call({ action: 'me', org: 'o' })).status, 200);
});
T('a failing context call falls back to the separate reads instead of denying', async () => {
  const db = fakeDb({ ctxBroken: true }), f = load(ENV, db);
  const r = await f.call({ action: 'me', org: 'o' }); assert.equal(r.status, 200);
  db.live = false; assert.equal((await load(ENV, db).call({ action: 'me', org: 'o' })).status, 401, 'the fallback still refuses a dead session');
});
T('me with method records the sign-in once and says so; without method it records nothing', async () => {
  const db = fakeDb(), f = load(ENV, db);
  const a = await f.call({ action: 'me', org: 'o', method: 'emp' }); assert.equal(a.body.logged, true);
  const row = db.docs.get('loginLog\0E1').data; assert.equal(row.n, 1); assert.equal(row.by.emp, 1); assert.ok(row.first && row.last);
  const b = await f.call({ action: 'me', org: 'o' }); assert.equal(b.body.logged, false); assert.equal(db.docs.get('loginLog\0E1').data.n, 1);
  const c = await f.call({ action: 'me', org: 'o', method: 'email' }); assert.equal(db.docs.get('loginLog\0E1').data.n, 2); assert.equal(db.docs.get('loginLog\0E1').data.by.email, 1);
  const d = await f.call({ action: 'me', org: 'o', method: 'nonsense' }); assert.equal(d.body.logged, false);
});
T('a person who must change their password is not counted as signed in', async () => {
  const db = fakeDb(), f = load(ENV, db);
  const r = await f.call({ action: 'me', org: 'o', method: 'email' }, { app_metadata: { must_change: true } });
  assert.equal(r.body.mustChange, true); assert.equal(r.body.logged, false); assert.equal(db.docs.get('loginLog\0E1'), undefined);
});
