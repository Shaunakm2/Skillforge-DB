// v41.27: sign-in makes fewer calls (no getUser, no separate signedIn), organisation rows are read in parallel by collection,
// the directory is read at the same time, and learners ask to sign only files that can qualify.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public/js/core/backend.js'), 'utf8') + '\n;globalThis.__B = Backend;';
const jwt = meta => 'h.' + Buffer.from(JSON.stringify({ sub: 'u1', app_metadata: meta })).toString('base64url') + '.s';
const tick = () => new Promise(r => setImmediate(r));

function make({ rows = [], me = { empId: 'E1', role: 'Learner', perms: [], name: 'Eve', mustChange: false, logged: true }, meta = {}, session = true, dir = [] } = {}) {
  const log = [], ev = [], signed = []; let inflight = 0, maxInflight = 0, sfQueries = 0;
  const store = rows.map(r => ({ org_id: 'o', version: 1, ...r }));
  const builder = () => { const q = { f: {}, ord: [], lim: 1e9, orx: null,
    select() { return q; }, eq(k, v) { q.f[k] = v; return q; }, in(k, v) { q.f['in:' + k] = v; return q; }, order(c) { q.ord.push(c); return q; }, limit(n) { q.lim = n; return q; },
    or(str) { const m = /coll\.gt\."(.*?)",and\(coll\.eq\."(.*?)",key\.gt\."(.*?)"\)/.exec(str); q.orx = m ? { c: m[1], k: m[3] } : null; return q; },
    then(res, rej) { return (async () => { sfQueries++; inflight++; maxInflight = Math.max(maxInflight, inflight); ev.push('start:sf_doc'); await tick(); await tick();
      let out = store.filter(r => r.org_id === q.f.org_id && (q.f.coll == null || r.coll === q.f.coll));
      if (q.orx) out = out.filter(r => r.coll > q.orx.c || (r.coll === q.orx.c && r.key > q.orx.k));
      out = out.sort((a, b) => (a.coll === b.coll ? 0 : a.coll < b.coll ? -1 : 1) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, q.lim);
      inflight--; ev.push('end:sf_doc'); return { data: JSON.parse(JSON.stringify(out)), error: null }; })().then(res, rej); } }; return q; };
  const sb = { auth: { getSession: async () => ({ data: { session: session ? { access_token: jwt(meta), user: { email: 'eve@x.com', app_metadata: {} } } : null }, error: null }),
      onAuthStateChange() {}, signInWithPassword: async () => ({ error: null }), signOut: async () => {}, refreshSession: async () => ({ data: {} }) },
    functions: { invoke: async (name, o) => { log.push(o.body.action + (o.body.method ? ':' + o.body.method : '')); if (o.body.action === 'me') return { data: me, error: null };
      if (o.body.action === 'sign') { signed.push(o.body.paths.slice()); return { data: { urls: Object.fromEntries(o.body.paths.map(p => [p, 'https://signed/' + p])) }, error: null }; } return { data: { ok: true }, error: null }; } },
    from: t => { if (t !== 'sf_doc') throw new Error('unexpected table ' + t); return builder(); },
    rpc: async n => { ev.push('rpc:' + n); log.push('rpc:' + n); await tick(); return { data: n === 'sf_directory' ? dir : n === 'sf_login_lookup' ? { email: 'eve@x.com' } : null, error: null }; },
    storage: { from: () => ({ createSignedUrls: async (ps) => { signed.push({ staff: ps.slice() }); return { data: ps.map(p => ({ path: p, signedUrl: 'https://s/' + p })) }; } }) },
    channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; }, removeChannel() {} };
  const ls = (() => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
  const window = { SKILLFORGE_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k', ORG_ID: 'o' }, localStorage: ls, sessionStorage: ls, addEventListener() {} };
  const ctx = { window, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, supabase: { createClient: () => sb }, localStorage: ls, location: { hash: '', search: '', pathname: '/' },
    console, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {}, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    unescape, encodeURIComponent, URL, Date, Math, JSON, Promise, ROLES0: [], Fmt: { dt: x => x } };
  ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(SRC, ctx);
  const app = { state: {}, setState(p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); }, onBackendSignedIn(r) { this.signed = r; }, toastMsg() {} };
  return { B: ctx.__B, app, log, ev, signed, stats: () => ({ maxInflight, sfQueries }) };
}
const U = (extra) => ({ coll: 'users', key: 'u-eve', data: { id: 'u-eve', name: 'Eve', empId: 'E1', status: 'Active', role: 'Learner', ...extra } });
const J = x => JSON.parse(JSON.stringify(x));

test('a saved sign-in is opened with ONE call (me): no getUser, no signedIn', async () => {
  const t = make({ rows: [U()] }); await t.B.start(t.app);
  assert.deepEqual(J(t.log.filter(x => !x.startsWith('rpc:sf_public'))), ['me', 'rpc:sf_directory']);
  assert.ok(t.app.signed && t.app.signed.me.emp === 'E1');
});
test('a fresh sign-in asks me to record it and does not call signedIn when me did', async () => {
  const t = make({ rows: [U()] }); t.app.state = {}; await t.B.start(Object.assign(t.app, {})); t.log.length = 0;
  await t.B.signIn('eve@x.com', 'pw'); await t.B.afterSignIn();
  assert.ok(t.log.includes('me:email')); assert.ok(!t.log.includes('signedIn:email') && !t.log.includes('signedIn'));
});
test('an older server (no "logged" in its answer) still gets the separate signedIn call', async () => {
  const t = make({ rows: [U()], me: { empId: 'E1', role: 'Learner', perms: [], name: 'Eve', mustChange: false } }); await t.B.start(t.app); t.log.length = 0;
  await t.B.signIn('E1', 'pw'); await t.B.afterSignIn();
  assert.ok(t.log.includes('me:emp')); assert.ok(t.log.includes('signedIn:emp'));
});
test('must-change-password is read from the token, with no call to the server', async () => {
  const t = make({ rows: [U()], meta: { must_change: true } }); const me = await (async () => { await t.B.start(t.app); return t.app.signed; })();
  assert.equal(me.mustChange, true); assert.ok(!t.log.includes('me'));
});
test('rows are read per collection, several at once, in pages of 1000, none lost', async () => {
  const rows = [U()]; for (let i = 0; i < 2500; i++) rows.push({ coll: 'lcms', key: 'm' + String(i).padStart(5, '0'), data: { id: 'm' + i, title: 't' + i } });
  for (let i = 0; i < 40; i++) rows.push({ coll: 'qs', key: 'q' + String(i).padStart(3, '0'), data: { id: 'q' + i } });
  const t = make({ rows }); await t.B.start(t.app);
  assert.equal(t.app.state.lcms.length, 2500); assert.equal(t.app.state.qs.length, 40); assert.equal(t.app.state.users.length, 1);
  assert.deepEqual(J(t.app.state.lcms.slice(0, 3).map(x => x.id)), ['m0', 'm1', 'm2'], 'order inside a collection is by key');
  const st = t.B.loadStats(); assert.equal(st.rows, 2541); assert.equal(st.per.lcms.rows, 2500);
  const s = t.stats(); assert.ok(s.maxInflight > 1 && s.maxInflight <= 6, 'parallel but capped: ' + s.maxInflight);
  const lastDirStart = t.ev.indexOf('rpc:sf_directory'), lastEnd = t.ev.lastIndexOf('end:sf_doc'); assert.ok(lastDirStart > -1 && lastDirStart < lastEnd, 'the directory is read while rows are still loading');
});
test('a learner asks to sign only the files of assigned courses and documents', async () => {
  const rows = [U(), { coll: 'enroll', key: 'E1', data: { c1: '2027-01-01', c3: '2027-01-01' } }];
  for (let i = 1; i <= 300; i++) rows.push({ coll: 'lcms', key: 'm' + i, data: { id: 'm' + i, file: { path: 'o/lcms/2026-10/' + i + '.pdf', src: '' } } });
  rows.push({ coll: 'adminCourses', key: 'c1', data: { id: 'c1', status: 'Published', items: [{ moduleId: 'm1' }, { moduleId: 'm2' }] } });
  rows.push({ coll: 'adminCourses', key: 'c2', data: { id: 'c2', status: 'Published', items: [{ moduleId: 'm10' }] } });
  rows.push({ coll: 'adminCourses', key: 'c3', data: { id: 'c3', status: 'Published', items: [{ moduleId: 'm300' }, { kind: 'quiz' }] } });
  rows.push({ coll: 'docs', key: 'd1', data: { id: 'd1', versions: [{ v: 1, file: { path: 'o/docs/2026-10/a.pdf', src: '' } }, { v: 2, file: { path: 'o/docs/2026-10/b.pdf', src: '' } }] } });
  const t = make({ rows }); await t.B.start(t.app);
  const asked = t.signed.flat().sort(); assert.deepEqual(J(asked), ['o/docs/2026-10/a.pdf', 'o/docs/2026-10/b.pdf', 'o/lcms/2026-10/1.pdf', 'o/lcms/2026-10/2.pdf', 'o/lcms/2026-10/300.pdf'].sort());
  const m1 = t.app.state.lcms.find(x => x.id === 'm1'), m10 = t.app.state.lcms.find(x => x.id === 'm10');
  assert.match(m1.file.src, /^https:\/\/signed\//); assert.equal(m10.file.src, '', 'a file of a course that is not assigned gets no link');
});
test('content staff sign everything themselves, 100 paths per request', async () => {
  const rows = [U({ role: 'Admin' })]; for (let i = 1; i <= 250; i++) rows.push({ coll: 'lcms', key: 'm' + i, data: { id: 'm' + i, file: { path: 'o/lcms/' + i + '.pdf', src: '' } } });
  const t = make({ rows, me: { empId: 'E1', role: 'Admin', perms: [], name: 'Eve', mustChange: false, logged: true } }); await t.B.start(t.app);
  const reqs = t.signed.filter(x => x.staff); assert.deepEqual(J(reqs.map(r => r.staff.length).sort((a, b) => b - a)), [100, 100, 50]);
  assert.ok(!t.log.includes('sign'), 'no call to the learning function for signing');
});
