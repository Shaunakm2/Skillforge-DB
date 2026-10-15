/* Test double for supabase-js used by tests/e2e/backend_e2e.py.
 * It mirrors the database policy (sf_can_read / sf_can_write in supabase/migrations/001_skillforge.sql), the
 * versioned sf_save / sf_delete RPCs, Realtime, Storage, and routes Edge Function calls to the REAL server code
 * (supabase/functions/_shared/learning-core.js). The SQL itself is not executed here.
 */
(function () {
  const ORG = 'testorg';
  const rows = new Map(), K = (c, k) => ORG + '|' + c + '|' + k;
  const members = [];      // { user_id, email, emp_id, app_name, role, active, password, must_change }
  const storage = new Map();
  const listeners = [];
  let session = null;
  const T = window.__sb = { rows, members, storage, calls: [], denied: 0, session: () => session };
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const expired = m => { const u = [...rows.values()].find(r => r.coll === 'users' && r.data.empId === m.emp_id); const t = new Date(); const today = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    return !!(u && u.data.expires && u.data.expires < today); };
  const me = () => session && members.find(m => m.user_id === session.user.id && m.active && !m.must_change && !expired(m));
  const role = () => (me() || {}).role, emp = () => (me() || {}).emp_id;
  const meRaw = () => session && members.find(m => m.user_id === session.user.id && m.active);
  // Mirror of sf_ctx / sf_read_ok / sf_write_ok in supabase/migrations/001_skillforge.sql (tests/db checks the real SQL).
  const SERVER_ONLY = ['attempt','stepOpen','scormSess','itemDone','itemQuiz','attemptsUsed','attemptRecs','reviews','surveyResp','fbLog','threads','accessReqs','docAck','loginLog'];
  const PERSON = ['enroll','itemDone','itemQuiz','attemptsUsed','extraAttempts','bookmarks','surveyResp','prefs','assignedOn'];
  const SHARED = ['lcms','quizzes','cats','paths','anns','badges','masters','tiles','platform','brand','certTpl','holidays','roles','statuses','threads'];
  const PW = { users:['users'], groups:['users','assignments'], qs:['qbank'], quizzes:['quizzes','qbank'], lcms:['lcms'], adminCourses:['courseAdmin','builder'], cats:['categories'], paths:['paths'], anns:['announcements'], autos:['automations'],
    certTpl:['certs'], places:['places'], masters:['masters'], tiles:['masters'], platform:['masters'], badges:['masters'], holidays:['masters','batches'], ttypes:['masters','batches'], statuses:['masters','batches'],
    brand:['branding'], integ:['integrations'], zh:['integrations'], extHistory:['migration'], syncLog:['migration','integrations'], dash:['dashboard'], dashBoard:['dashboard'], dashKpi:['dashboard'], dashSched:['dashboard'], repCols:['reports'], kp:['feedback'], docs:['documents'], docCfg:['documents'] };
  function ctx() { const m = me(); if (!m) return null;
    const rk = m.role_id || (m.role === 'Trainer' ? 'r_trainer' : 'r_learner'), rd = rows.get(K('roles', rk));
    const perms = m.role === 'Admin' ? [] : Object.entries((rd && rd.data.perms) || {}).filter(([, v]) => v === true).map(([k]) => k);
    const trainees = [...rows.values()].filter(r => r.coll === 'batches' && r.data.trainerEmp === m.emp_id).flatMap(r => r.data.traineeEmps || []).filter(e => e !== m.emp_id);
    const uk = m.user_key || ([...rows.values()].find(r => r.coll === 'users' && r.data.empId === m.emp_id) || {}).key;
    return { emp: m.emp_id, admin: m.role === 'Admin', role: m.role, roleId: m.role_id || ({ Admin:'r_admin', Trainer:'r_trainer' })[m.role] || 'r_learner', perms, trainees, ukey: uk }; }
  const any = (c, ps) => ps.some(p => c.perms.includes(p));
  function canRead(r) { const c = ctx(); if (!c || ['attempt','stepOpen','scormSess'].includes(r.coll)) return false; if (c.admin) return true;
    const d = r.data, k = r.key, P = p => c.perms.includes(p), tr = e => c.trainees.includes(e);
    if (SHARED.includes(r.coll)) return true;
    if (['prefs','surveyResp'].includes(r.coll)) return k === c.emp;
    if (r.coll === 'bookmarks') return k === c.emp || P('bookmarks');
    if (PERSON.includes(r.coll)) return k === c.emp || any(c, ['reports','analytics','dashboard']) || (any(c, ['batches','assignments','attempts','gradebook']) && tr(k));
    if (r.coll === 'users') return d.empId === c.emp || any(c, ['users','reports']) || (P('batches') && tr(d.empId));
    if (['attemptRecs','extHistory'].includes(r.coll)) return d.empId === c.emp || P('reports') || (any(c, ['batches','attempts','gradebook']) && tr(d.empId));
    // v41.21 (migration 009): graders read their batch trainees' answers; all learners only with gradeAll or reports
    if (r.coll === 'reviews' || r.coll === 'asgSub') return d.learnerEmp === c.emp || any(c, ['reports','gradeAll']) || (any(c, ['gradebook','batches','attempts']) && tr(d.learnerEmp));
    if (r.coll === 'fbLog') return k.split('|')[3] === c.emp || any(c, ['feedback','reports']);
    if (r.coll === 'accessReqs') return d.empId === c.emp || d.managerKey === c.ukey || P('assignments');
    if (r.coll === 'adminCourses') return d.status === 'Published' || any(c, ['courseAdmin','builder','assignments','lcms']);
    if (r.coll === 'batches') return any(c, ['dashboard','reports','analytics']) || (P('batches') && d.trainerEmp === c.emp);
    if (r.coll === 'qs') return any(c, ['qbank','quizzes']);
    if (r.coll === 'attemptLog') return P('attempts'); if (r.coll === 'bmLog') return P('bookmarks');
    if (['ttypes','places','groups'].includes(r.coll)) return any(c, ['batches','places','assignments','masters']);
    if (r.coll === 'dashBoard') return P('dashboard') || (P('dashView') && !['mis', 'mistab', 'attr'].includes(k) && d.area !== 'train' && (!(d.audience || []).length || d.audience.includes(c.roleId)));
    if (r.coll === 'loginLog') return k === c.emp || P('reports');
    if (r.coll === 'docCfg') return true; if (r.coll === 'docAck') return k === c.emp || P('documents');
    if (r.coll === 'docs') return P('documents') || (d.status === 'Published' && (d.audience || []).some(a => a === 'All' || a === c.role));
    return any(c, PW[r.coll] || []); }
  // sf_sched_guard: recipients inside the organisation (every writer, admins too)
  const schedOk = d => { const to = Array.isArray(d && d.to) ? d.to : [], doms = new Set(members.map(m => String(m.email || '').toLowerCase().split('@')[1]));
    return to.length > 0 && to.length <= 20 && to.every(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && doms.has(String(x).toLowerCase().split('@')[1])); };
  function canWrite(coll, key, data) { if (coll === 'dashSched' && data && !schedOk(data)) return false; return canWrite0(coll, key, data); }
  function canWrite0(coll, key, data) { const c = ctx(); if (!c || ['attempt','stepOpen','scormSess'].includes(coll)) return false; if (c.admin) return true;
    if (SERVER_ONLY.includes(coll) || coll === 'roles') return false; const P = p => c.perms.includes(p), d = data || {};
    if (['prefs','bookmarks'].includes(coll)) return key === c.emp || (coll === 'bookmarks' && P('bookmarks'));
    if (coll === 'batches') return P('batches') && d.trainerEmp === c.emp;
    if (['enroll','assignedOn'].includes(coll)) return P('assignments') && c.trainees.includes(key);
    if (coll === 'extraAttempts') return P('attempts') && c.trainees.includes(key);
    if (coll === 'attemptLog') return P('attempts') && d.byEmp === c.emp; if (coll === 'bmLog') return P('bookmarks') && d.byEmp === c.emp;
    if (coll === 'lcms') return P('lcms') || (P('lcmsForms') && ['Survey','Feedback form'].includes(d.type) && d.ownerEmp === c.emp);
    return any(c, PW[coll] || []); }
  // sf_batch_guard
  function batchGuard(cur, data) { if ((data.traineeEmps || []).includes(data.trainerEmp)) return false; const c = ctx(); if (c && c.admin) return true;
    if (!cur) return false; return JSON.stringify(cur.data.traineeEmps || []) === JSON.stringify(data.traineeEmps || []) && cur.data.trainerEmp === data.trainerEmp; }
  const emit = (eventType, n, o) => { const r = { eventType, new: n ? { org_id: ORG, ...clone(n) } : {}, old: o ? { org_id: ORG, ...clone(o) } : {} }; listeners.forEach(f => { if (!n || canRead(n)) setTimeout(() => f(r), 0); }); };
  /* direct write by "someone else" (test helper): bumps version and emits a realtime event */
  // sf_user_active_sync: a users row marked Deactivated deactivates the matching login
  const activeSync = r => { if (r.coll !== 'users' || !r.data || !r.data.empId) return; members.filter(m => m.emp_id === r.data.empId).forEach(m => { m.active = r.data.status !== 'Deactivated'; }); };
  T.activeSync = activeSync;
  T.serverWrite = (coll, key, data) => { const cur = rows.get(K(coll, key)), v = cur ? cur.version + 1 : 1, r = { coll, key, data: clone(data), version: v }; rows.set(K(coll, key), r); emit(cur ? 'UPDATE' : 'INSERT', r); return v; };
  T.get = (coll, key) => { const r = rows.get(K(coll, key)); return r && clone(r.data); };
  T.all = coll => [...rows.values()].filter(r => r.coll === coll).map(r => ({ key: r.key, data: clone(r.data) }));

  function query(table) {
    const f = []; let rng = null, single = false, sel = '*';
    let lim = null, after = null;
    const api = { select(s) { sel = s; return api; }, eq(c, v) { f.push([c, v]); return api; }, in(c, vs) { f.push([c, vs, 'in']); return api; }, order() { return api; }, range(a, b) { rng = [a, b]; return api; }, maybeSingle() { single = true; return api; },
      limit(n) { lim = n; return api; },
      or(expr) { const m = expr.match(/^coll\.gt\."((?:[^"\\]|\\.)*)",and\(coll\.eq\."(?:[^"\\]|\\.)*",key\.gt\."((?:[^"\\]|\\.)*)"\)$/); if (!m) throw new Error('unsupported or(): ' + expr);
        const un = v => v.replace(/\\(.)/g, '$1'); after = [un(m[1]), un(m[2])]; return api; },
      then(res, rej) {
        if (table === 'sf_member') { const list = members.filter(m => f.every(([c, v]) => c === 'org_id' ? v === ORG : m[c] === v) && (m.user_id === (session && session.user.id) || role() === 'Admin'));
          const out = list.map(m => ({ emp_id: m.emp_id, role: m.role, app_name: m.app_name, active: m.active }));
          return res({ data: single ? out[0] || null : out, error: null }); }
        let out = [...rows.values()].filter(r => f.every(([c, v, op]) => c === 'org_id' ? v === ORG : op === 'in' ? v.includes(r[c]) : r[c] === v)).filter(canRead)
          .sort((a, b) => a.coll < b.coll ? -1 : a.coll > b.coll ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        if (rng) out = out.slice(rng[0], rng[1] + 1);
        if (after) out = out.filter(r => r.coll > after[0] || (r.coll === after[0] && r.key > after[1]));
        if (lim) out = out.slice(0, lim);
        res({ data: out.map(r => ({ coll: r.coll, key: r.key, data: clone(r.data), version: r.version })), error: null });
      } };
    return api;
  }
  function sfSave(p_rows) {
    T.calls.push(['sf_save', p_rows.map(r => r.coll + ':' + r.key)]);
    return p_rows.map(r => {
      const cur = rows.get(K(r.coll, r.key));
      const ok = (cur ? canWrite(r.coll, r.key, cur.data) && canWrite(r.coll, r.key, r.data) : canWrite(r.coll, r.key, r.data)) && (r.coll !== 'batches' || batchGuard(cur, r.data));
      if (r.version == null) {
        if (cur) return canRead(cur) ? { coll: r.coll, key: r.key, status: 'conflict', version: cur.version, data: clone(cur.data) } : { coll: r.coll, key: r.key, status: 'denied' };
        if (!ok) { T.denied++; return { coll: r.coll, key: r.key, status: 'denied' }; }
        const n = { coll: r.coll, key: r.key, data: clone(r.data), version: 1 }; rows.set(K(r.coll, r.key), n); activeSync(n); emit('INSERT', n); return { coll: r.coll, key: r.key, status: 'ok', version: 1 };
      }
      if (!cur) return { coll: r.coll, key: r.key, status: 'gone' };
      if (cur.version !== r.version) return canRead(cur) ? { coll: r.coll, key: r.key, status: 'conflict', version: cur.version, data: clone(cur.data) } : { coll: r.coll, key: r.key, status: 'gone' };
      if (!ok) { T.denied++; return { coll: r.coll, key: r.key, status: 'denied', version: cur.version }; }
      const n = { coll: r.coll, key: r.key, data: clone(r.data), version: cur.version + 1 }; rows.set(K(r.coll, r.key), n); activeSync(n); emit('UPDATE', n); return { coll: r.coll, key: r.key, status: 'ok', version: n.version };
    });
  }
  function sfDelete(items) {
    T.calls.push(['sf_delete', items.map(r => r.coll + ':' + r.key)]);
    return items.map(r => { const cur = rows.get(K(r.coll, r.key)); if (!cur) return { ...r, status: 'ok' };
      const ok = role() === 'Admin' && !['attempt','stepOpen'].includes(r.coll);
      if (!ok) { T.denied++; return { ...r, status: 'denied' }; } rows.delete(K(r.coll, r.key)); emit('DELETE', null, cur); return { ...r, status: 'ok' }; });
  }
  // service-role db for the Edge Function code
  const sdb = {
    async get(c, k) { const r = rows.get(K(c, k)); return r ? { data: clone(r.data), version: r.version } : null; },
    async getMany(c, ks) { const m = new Map(); ks.forEach(k => { const r = rows.get(K(c, k)); if (r) m.set(k, { data: clone(r.data), version: r.version }); }); return m; },
    async put(c, k, d, v) { const r = rows.get(K(c, k)); if (v == null) { if (r) return false; } else if (!r || r.version !== v) return false; const n = { coll: c, key: k, data: clone(d), version: (r ? r.version : 0) + 1 }; rows.set(K(c, k), n); emit(r ? 'UPDATE' : 'INSERT', n); return true; },
    async del(c, k) { rows.delete(K(c, k)); },
  };
  const strong = p => p.length >= 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
  let pwSeq = 0; const temp = () => T.firstPw || ('Tmp-' + (++pwSeq) + 'xY9!kQ');   // v41.19: T.firstPw mirrors DEFAULT_PASSWORD
  async function learning(b) {
    T.calls.push(['learning', b.action]);
    if (!session) return { error: 'Not signed in' };
    if (b.action === 'changePassword') { const m = members.find(x => x.user_id === session.user.id); if (!strong(b.password)) return { error: 'Use at least 10 characters with upper- and lower-case letters and a number.' }; m.password = b.password; m.must_change = false; if (T.dropSessionOnPw) session = null; return { ok: true }; }   // v41.19: T.dropSessionOnPw = the old session no longer works after the change
    const m = me(); if (!m) return { error: 'Not linked' };
    const c0 = ctx();
    if (b.action === 'me') return { empId: m.emp_id, role: m.role, roleId: m.role_id || null, perms: m.role === 'Admin' ? ['*'] : c0.perms, name: m.app_name, mustChange: !!m.must_change };
    if (m.must_change) return { error: 'Set a new password first' };
    if (b.action === 'sign') { const out = {}; (b.paths || []).forEach(p => { out[p] = 'https://files.test/' + p; }); return { urls: out }; }
    const urow = [...rows.values()].find(r => r.coll === 'users' && r.data.empId === m.emp_id);
    try { return await LearningCore.handle(sdb, { org: ORG, emp: m.emp_id, role: m.role, perms: c0.perms, trainees: c0.trainees, name: m.app_name, userKey: urow && urow.key, now: new Date(Date.now() + (T.clockSkew || 0)), contentOrigin: T.contentOrigin || 'https://content.test', signKey: T.signKey || 'k' }, b.action, b); }
    catch (e) { return { error: e.message }; }
  }
  async function adminUsers(b) {
    T.calls.push(['admin-users', b.action]);
    const m = me(); if (!m || m.role !== 'Admin') return { error: 'Only admins can manage accounts' };
    if (T.failAdmin) return { error: T.failAdmin };
    const create = p => { const email = String(p.email).toLowerCase(), e = String(p.empId).toUpperCase(); if (members.some(x => x.emp_id === e && x.email !== email)) return { email, reason: 'Employee ID taken' };
      let x = members.find(y => y.email === email); const pw = temp();
      if (!x) { x = { user_id: 'u' + (members.length + 1), email, emp_id: e, app_name: p.name, role: p.role || 'Learner', active: true }; members.push(x); }
      Object.assign(x, { password: pw, must_change: true, emp_id: e, app_name: p.name, role: p.role || x.role, role_id: p.roleId || null, user_key: p.userKey || null }); return { email, empId: e, tempPassword: pw }; };
    const find = () => members.find(x => x.email === String(b.email).toLowerCase()) || (b.empId ? members.find(x => x.emp_id === String(b.empId).toUpperCase()) : null);
    switch (b.action) {
      case 'create': { const r = create(b); return r.reason ? { error: r.reason } : r; }
      case 'bulkCreate': { const c = [], s = []; (b.people || []).forEach(p => { const r = create(p); (r.reason ? s : c).push(r); }); return { created: c, skipped: s }; }
      case 'resetPassword': { const x = find(); if (!x) return { error: 'No login' }; x.password = temp(); x.must_change = true; return { tempPassword: x.password }; }
      case 'ban': case 'unban': { const x = find(); if (!x) return { error: (b.email || 'This person') + ' has no login yet.' }; x.active = b.action === 'unban'; return { ok: true }; }
      case 'setRole': { const x = find(); if (!x) return { error: 'No login' }; x.role = b.role; x.role_id = b.roleId || null; return { ok: true }; }
      case 'rename': { const x = find(); if (x) x.app_name = b.name; return { ok: true }; }
    }
    return { error: 'Unknown action' };
  }
  // v41.20: like supabase-js, the sign-in is kept in the storage the app passes in (auth.storage), under sb-<ref>-auth-token
  const AK = 'sb-mock-auth-token'; let store = null;
  const save = () => { if (!store) return; if (session) store.setItem(AK, JSON.stringify(session)); else store.removeItem(AK); };
  const load = () => { if (session || !store) return; try { const v = store.getItem(AK); if (v) session = JSON.parse(v); } catch (e) {} };
  window.supabase = { createClient(url, key, opts) { store = (opts && opts.auth && opts.auth.storage) || null; return {
    from: t => query(t),
    rpc: async (fn, a) => {
      if (fn === 'sf_login_lookup') { T.calls.push(['sf_login_lookup']); const m = members.find(x => x.emp_id === String(a.p_emp).toUpperCase() && x.active);
        return { data: m && m.password === a.p_password ? { email: m.email } : { error: 'invalid' }, error: null }; }
      if (!role()) return { data: null, error: { message: 'not signed in' } };
      if (fn === 'sf_save') return { data: sfSave(a.p_rows), error: null };
      if (fn === 'sf_delete') return { data: sfDelete(a.p_items), error: null };
      if (fn === 'sf_directory') return { data: [...rows.values()].filter(r => r.coll === 'users' && r.data.status !== 'Deactivated').map(r => ({ id: r.key, name: r.data.name, dept: r.data.dept, designation: r.data.designation, role: r.data.role, manager: r.data.manager, managerKey: r.data.managerKey, status: r.data.status })), error: null };
      return { data: null, error: { message: 'unknown rpc' } }; },
    auth: {
      getSession: async () => { load(); return { data: { session } }; },
      getUser: async () => { load(); return ({ data: { user: session && { ...session.user, app_metadata: { must_change: !!(members.find(m => m.user_id === session.user.id) || {}).must_change } } } }); },
      signInWithPassword: async ({ email, password }) => { const m = members.find(x => x.email === String(email).toLowerCase()); if (!m || m.password !== password) return { data: null, error: { message: 'Invalid login credentials' } };
        session = { access_token: 'at-' + m.user_id, user: { id: m.user_id, email: m.email } }; save(); return { data: { user: session.user, session }, error: null }; },
      setSession: async ({ access_token }) => { const id = access_token.slice(3), m = members.find(x => x.user_id === id); session = { access_token, user: { id, email: m.email } }; return { error: null }; },
      signOut: async () => { session = null; save(); return {}; }, refreshSession: async () => ({}), onAuthStateChange: () => ({}), signInWithOAuth: async () => ({}),
      resetPasswordForEmail: async () => ({ error: null }),
    },
    storage: { from: b => ({ upload: async (p, f) => { if (role() !== 'Admin' && !(role() === 'Trainer' && p.split('/')[1] === 'lcms')) return { error: { message: 'new row violates row-level security policy' } }; storage.set(b + '/' + p, f); return { error: null }; },
      createSignedUrl: async p => ({ data: { signedUrl: 'https://files.test/' + p } }), createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: 'https://files.test/' + p })) }) }) },
    functions: { invoke: async (name, o) => ({ data: name === 'learning' ? await learning(o.body) : await adminUsers(o.body), error: null }) },
    channel: () => { const ch = { on: (t, opt, fn) => { listeners.push(fn); return ch; }, subscribe: () => ch }; return ch; }, removeChannel: () => {},
  }; } };
  T.addMember = m => members.push({ active: true, must_change: false, ...m });
})();
