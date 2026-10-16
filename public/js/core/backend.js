/* Skillforge LMS — Supabase backend (used when js/config.js has SUPABASE_URL and SUPABASE_ANON_KEY).
 *
 * Identity   Every login maps to ONE person by employee ID (sf_member.emp_id). Per-person rows in the database are
 *            keyed by employee ID; the app's in-memory maps keyed by name are converted at this boundary.
 *            Names are kept unique in the app (Identity.uniqueName) and a rename is cascaded (Identity.rename).
 * Role       comes from sf_member (server), never from the editable users row.
 * Results    Learners never write results. Assessments, completion, surveys, feedback answers, access requests,
 *            profile edits and forum posts go through the Edge Function "learning" (Backend.call); the rows it
 *            changed are then re-read from the database.
 * Saving     Only rows that changed are sent, through sf_save() with the row's version. A conflict (someone else
 *            saved first) is merged field by field and retried; a refusal (Row Level Security) puts the server's
 *            value back on screen and says so. Deletes are never dropped.
 * Live       Changes made by other people arrive through Supabase Realtime and are applied on screen.
 * Files      Uploaded to Storage; rows keep only the path. Links are signed at sign-in (staff) or through the
 *            "learning" function (learners: only files of courses assigned to them).
 */
const SF_LIST = ['users', 'adminCourses', 'lcms', 'qs', 'quizzes', 'batches', 'ttypes', 'statuses', 'holidays', 'places', 'roles', 'anns', 'accessReqs',
  'badges', 'paths', 'cats', 'groups', 'extHistory', 'syncLog', 'attemptRecs', 'attemptLog', 'bmLog', 'reviews', 'threads', 'docs', 'asgSub'];
const SF_PERSON = ['enroll', 'itemDone', 'itemQuiz', 'attemptsUsed', 'extraAttempts', 'bookmarks', 'surveyResp', 'prefs', 'docAck', 'loginLog'];
const SF_SETTINGS = ['masters', 'tiles', 'repCols', 'dash', 'certTpl', 'zh', 'autos', 'integ', 'kp', 'platform', 'brand', 'docCfg'];
const SF_BRAND = ['brandName', 'brandAccent', 'brandMsg'];
/* v41.20: databases seeded by older versions hold the demo sign-in message; show Skillforge's instead (saved on the next Branding save). */
const brandFix = d => d && /Northwind/i.test(String(d.brandMsg || '')) ? { ...d, brandMsg: 'Welcome to Skillforge. Sign in with your work account.' } : d;
const SF_ALL = SF_LIST.concat(SF_PERSON, SF_SETTINGS, ['assignedOn', 'fbLog']);
/* Dashboards are stored as one row per board, per custom KPI and per schedule (v29), so the database can decide who reads
 * which: viewers get only the boards shared with their role; KPIs, schedules and templates are for dashboard editors.
 * Filters and edit mode are per person and per session: never saved. */
/* Data from the database is parsed JSON: an object can carry its own "__proto__" key, which a later assignment like
 * out[k] = v would turn into a prototype change. Such keys are removed from everything that arrives. */
const deproto = x => { if (!x || typeof x !== 'object') return x; if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) deproto(x[i]); return x; }
  if (Object.prototype.hasOwnProperty.call(x, '__proto__')) delete x['__proto__']; for (const k in x) { const v = x[k]; if (v && typeof v === 'object') deproto(v); } return x; };
const DASH_PARTS = { dashBoard:'boards', dashKpi:'kpis', dashSched:'schedules' };
const dashGroup = c => DASH_PARTS[c] ? 'dash' : c;
const DASH_LOCAL = d => ({ slicers: (d && d.slicers) || { division:'All', sub:'All', course:'All', training:'All', location:'All', from:'', to:'' }, edit: false });

/* ---------- identity helpers (also used offline) ---------- */
const Identity = {
  reserved: n => { const t = String(n == null ? '' : n).trim(); return !t || t in Object.prototype || t === '__proto__' || t === 'prototype'; },
  /* v41.20: two people may have the same name (only e-mail and employee ID must be unique). The app still uses the name
   * as each person's key, so a second "Gagan Sharma" gets an INVISIBLE marker (U+2063) at the end: it looks exactly the
   * same everywhere, and Identity.plain() removes it for exports, certificates and editing. (It used to add "(employee ID)".) */
  MARK: '\u2063',
  plain: n => String(n == null ? '' : n).replace(/\u2063+$/, ''),
  uniqueName(users, name, empId, exceptId) {
    name = Identity.plain(name);
    // Names are keys in the app's records: a name equal to a built-in object property (__proto__, constructor, toString…)
    // would corrupt them, so it gets the employee ID added.
    if (Identity.reserved(name)) name = name + ' (' + (empId || 'new') + ')';
    const taken = new Set(users.filter(u => u.id !== exceptId).map(u => String(u.name).toLowerCase()));
    let out = name; while (taken.has(out.toLowerCase())) out += Identity.MARK;
    return out;
  },
  /* Rename a person everywhere the app refers to them by name. Returns a state patch. */
  rename(s, from, to) {
    if (!from || from === to) return {};
    const P = {}, rk = m => { if (!m || !(from in m)) return m; const o = { ...m }; o[to] = o[from]; delete o[from]; return o; };
    SF_PERSON.forEach(c => { const v = rk(s[c]); if (v !== s[c]) P[c] = v; });
    if (s.assignedOn) { const o = {}; let ch = false; for (const k in s.assignedOn) { const i = k.indexOf('|'); if (k.slice(0, i) === from) { o[to + k.slice(i)] = s.assignedOn[k]; ch = true; } else o[k] = s.assignedOn[k]; } if (ch) P.assignedOn = o; }
    if (s.fbLog) { const o = {}; let ch = false; for (const k in s.fbLog) { const p = k.split('|'); if (p[1] === from || p[3] === from) { if (p[1] === from) p[1] = to; if (p[3] === from) p[3] = to; ch = true; } const v = s.fbLog[k]; o[p.join('|')] = v; } if (ch) P.fbLog = o; }
    const sw = v => v === from ? to : v;
    P.users = s.users.map(u => u.name === from ? { ...u, name: to } : u.manager === from ? { ...u, manager: to } : u);
    P.batches = s.batches.map(b => { if (b.trainer !== from && !b.trainees.includes(from)) return b;
      const nb = { ...b, trainer: sw(b.trainer), trainees: b.trainees.map(sw) };
      ['st', 'prog', 'ext', 'extBy', 'manual', 'ack', 'rag'].forEach(k => { if (nb[k]) nb[k] = rk(nb[k]); });
      if (nb.att) nb.att = Object.fromEntries(Object.entries(nb.att).map(([d, m]) => [d, rk(m)]));
      return nb; });
    const byField = (list, f) => (list || []).some(x => x[f] === from) ? list.map(x => x[f] === from ? { ...x, [f]: to } : x) : list;
    P.accessReqs = byField(byField(s.accessReqs, 'user'), 'manager'); P.attemptRecs = byField(s.attemptRecs, 'user'); P.reviews = byField(s.reviews, 'learner');
    P.extHistory = byField(s.extHistory, 'user'); P.threads = (s.threads || []).map(t => { const nt = t.author === from ? { ...t, author: to } : t; return (nt.replies || []).some(r => r.author === from) ? { ...nt, replies: nt.replies.map(r => r.author === from ? { ...r, author: to } : r) } : nt; });
    if (s.meName === from) P.meName = to;
    return P;
  },
};

const Backend = (() => {
  const cfg = (typeof window !== 'undefined' && window.SKILLFORGE_CONFIG) || {};
  const on = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && typeof supabase !== 'undefined');
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  // v37: no silent default organisation. With a backend configured, an empty ORG_ID is a deployment error.
  if (configured && !String(cfg.ORG_ID || '').trim()) throw new Error('js/config.js: ORG_ID is empty. Set your organisation id before deploying.');
  const org = String(cfg.ORG_ID || '').trim() || 'demo-offline', BUCKET = cfg.STORAGE_BUCKET || 'lms-files', SCORM_BUCKET = 'lms-scorm';
  let sb = null, app = null, me = null, ready = false, channel = null, freshLogin = null;
  let status = { text: on ? 'Connecting…' : configured ? 'Supabase is configured, but vendor/supabase.js is missing (see SETUP-SUPABASE.md)' : 'Offline (sample data in this browser only)', ok: !configured, at: '' };
  // x-sf-org tells the database which organisation this session works in (policies compute the caller's context once).
  // v34: the sign-in (access + refresh token) is kept in sessionStorage, so it ends with the tab/browser and is not left behind on a shared PC;
  // SESSION_STORAGE: 'local' in js/config.js restores the old behaviour. If the chosen storage is unusable, an in-memory store is used (never localStorage by accident).
  /* v41.20: "Remember me". Ticked: the sign-in is kept in localStorage and survives closing the tab or browser for
   * KEEP_MIN minutes (default 45) after the last activity; every activity moves that time forward. Not ticked: sessionStorage
   * (ends with the tab). SESSION_STORAGE: 'local' in js/config.js still means "always remembered". */
  const KEEP_MIN = Math.max(1, +cfg.REMEMBER_MINUTES || 45), KEEP_KEY = 'sf-keep-until';
  const mem = {}, memory = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  const usable = st => { try { st.setItem('sf-probe', '1'); st.removeItem('sf-probe'); return true; } catch (e) { return false; } };
  const LS = typeof window !== 'undefined' && usable(window.localStorage) ? window.localStorage : null;
  const SS = typeof window !== 'undefined' && usable(window.sessionStorage) ? window.sessionStorage : null;
  const isAuthKey = k => /^sb-.*-auth-token/.test(k);
  const keepOn = () => { if (!LS) return false; if (cfg.SESSION_STORAGE === 'local') return true;
    const t = +LS.getItem(KEEP_KEY) || 0; if (t && t > Date.now()) return true;
    if (t) { LS.removeItem(KEEP_KEY); Object.keys(LS).filter(isAuthKey).forEach(k => LS.removeItem(k)); }   // expired: forget the stored sign-in
    return false; };
  const authStore = {
    getItem: k => { const st = keepOn() ? LS : (SS || memory); let v = st.getItem(k); if (v == null && st === LS && SS) v = SS.getItem(k); return v; },
    setItem: (k, v) => { const st = keepOn() ? LS : (SS || memory); st.setItem(k, v); const other = st === LS ? SS : LS; if (other && isAuthKey(k)) other.removeItem(k); },
    removeItem: k => { [LS, SS, memory].forEach(st => { try { st && st.removeItem(k); } catch (e) {} }); },
  };
  /* Called before signing in (the box on the sign-in page) and on activity (to move the 45 minutes forward). */
  function keepSignIn(on) {
    if (!LS) return;
    if (on) { LS.setItem(KEEP_KEY, String(Date.now() + KEEP_MIN * 60000));
      if (SS) Object.keys(SS).filter(isAuthKey).forEach(k => { LS.setItem(k, SS.getItem(k)); SS.removeItem(k); }); }
    else { LS.removeItem(KEEP_KEY);
      Object.keys(LS).filter(isAuthKey).forEach(k => { if (SS) SS.setItem(k, LS.getItem(k)); LS.removeItem(k); }); }
  }
  let touchAt = 0;
  function rememberTouch() { if (!LS || cfg.SESSION_STORAGE === 'local' || Date.now() - touchAt < 30000) return; touchAt = Date.now();
    if (+LS.getItem(KEEP_KEY) > Date.now()) LS.setItem(KEEP_KEY, String(Date.now() + KEEP_MIN * 60000)); }
  const remembered = () => keepOn();
  // v41.19: opened from a "reset password" e-mail? (read before the Supabase client removes it from the address)
  let recovery = typeof location !== 'undefined' && /(^|[#&?])type=recovery\b/.test(String(location.hash || '') + '&' + String(location.search || ''));
  if (on) sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, storage: authStore }, global: { headers: { 'x-sf-org': org } } });
  const setStatus = (text, ok) => { status = { text, ok, at: new Date().toLocaleTimeString() }; if (app) app.setState({ beStatus: status }); };
  const notify = msg => { if (app && app.toastMsg) app.toastMsg(msg); };

  /* ---------- name <-> employee ID ---------- */
  let idx = { ref: null, emp: new Map(), name: new Map() };
  const index = users => { if (idx.ref !== users) { idx = { ref: users, emp: new Map(), name: new Map() }; (users || []).forEach(u => { if (u.empId) { idx.emp.set(u.name, u.empId); idx.name.set(u.empId, u.name); } }); } return idx; };
  const empOf = (s, name) => index(s.users).emp.get(name) || '';
  const nameOf = (s, emp) => index(s.users).name.get(emp) || emp;
  const idOf = x => x && (x.id != null ? String(x.id) : x.code || x.k || x.name);
  const brandOf = s => Object.fromEntries(SF_BRAND.map(k => [k, s[k]]));
  // Never store links that only work in this tab or expire: keep the path, drop the src.
  const clean = v => JSON.parse(JSON.stringify(v, function (k, x) {
    if (typeof x === 'string' && x.startsWith('blob:')) return '';
    if (k === 'src' && this && typeof this.path === 'string' && this.path) return '';
    if (k === '_dir') return undefined;
    return x; }));

  /* ---------- app shape <-> database shape ---------- */
  function listToDb(s, c, it) {
    const d = { ...it }, e = n => empOf(s, n);
    if (c === 'users') { const mk = (s.users || []).find(u => u.name === it.manager); d.managerKey = mk ? idOf(mk) : ''; delete d.managerEmp; }
    if (c === 'batches') { d.trainerEmp = e(it.trainer); d.traineeEmps = (it.trainees || []).map(e).filter(Boolean); }
    if (c === 'accessReqs') { d.empId = it.empId || e(it.user); const mk = (s.users || []).find(u => u.name === it.manager); d.managerKey = it.managerKey || (mk ? idOf(mk) : ''); delete d.managerEmp; }
    if (c === 'reviews') d.learnerEmp = it.learnerEmp || e(it.learner);
    if (c === 'attemptRecs' || c === 'extHistory') d.empId = it.empId || e(it.user);
    if (c === 'threads') { const k = n => { const u = (s.users || []).find(x => x.name === n); return u ? idOf(u) : ''; }; d.authorKey = it.authorKey || k(it.author); d.replies = (it.replies || []).map(r => ({ ...r, authorKey: r.authorKey || k(r.author) })); delete d.authorEmp; }
    if (c === 'attemptLog' || c === 'bmLog') d.byEmp = it.byEmp || e(it.by);
    return clean(d);
  }
  function listFromDb(s, c, d) {
    const n = x => nameOf(s, x), o = { ...d };
    const byKey = k => { const u = (s.users || []).find(x => idOf(x) === String(k)); return u ? u.name : ''; };
    if (c === 'accessReqs') { o.user = o.user || n(d.empId); if (d.managerKey) o.manager = byKey(d.managerKey) || o.manager; }
    if (c === 'reviews' || c === 'asgSub') o.learner = o.learner || n(d.learnerEmp);
    if ((c === 'attemptRecs' || c === 'extHistory') && !o.user) o.user = n(d.empId);
    if (c === 'threads') { o.author = byKey(d.authorKey) || o.author || 'Member'; o.replies = (d.replies || []).map(r => ({ ...r, author: byKey(r.authorKey) || r.author || 'Member', text: r.text || r.body, time: r.time || (r.at ? Fmt.dt(r.at) : '') })); o.when = o.when || (d.at ? Fmt.dt(d.at) : ''); o.votes = o.votes || 0; o.text = o.text || d.body; }
    return o;
  }
  const fbKeyToDb = (s, k) => { const p = k.split('|'); if (p.length === 4) { p[1] = empOf(s, p[1]) || p[1]; p[3] = empOf(s, p[3]) || p[3]; } return p.join('|'); };
  const fbKeyFromDb = (s, k) => { const p = k.split('|'); if (p.length === 4) { p[1] = nameOf(s, p[1]); p[3] = nameOf(s, p[3]); } return p.join('|'); };
  const assignedByPerson = (s, m) => { const out = {}; for (const k in m || {}) { const i = k.indexOf('|'), emp = empOf(s, k.slice(0, i)); if (emp) (out[emp] = out[emp] || {})[k.slice(i + 1)] = m[k]; } return out; };

  /* Every row of the app state, in database shape: [{ coll, key, data, ref }] (ref = the app object it came from). */
  function rowsOf(s) {
    const rows = [];
    SF_LIST.forEach(c => (s[c] || []).forEach(x => { if (!x._dir) rows.push({ coll: c, key: idOf(x), data: listToDb(s, c, x), ref: x }); }));
    SF_PERSON.forEach(c => Object.entries(s[c] || {}).forEach(([n, v]) => { const e = empOf(s, n); if (e) rows.push({ coll: c, key: e, data: clean(v), ref: v }); }));
    Object.entries(assignedByPerson(s, s.assignedOn)).forEach(([e, v]) => rows.push({ coll: 'assignedOn', key: e, data: v, ref: null }));
    Object.entries(s.fbLog || {}).forEach(([k, v]) => rows.push({ coll: 'fbLog', key: fbKeyToDb(s, k), data: clean(v), ref: v }));
    SF_SETTINGS.forEach(c => { if (c === 'dash') return; const v = c === 'brand' ? brandOf(s) : s[c]; if (v !== undefined) rows.push({ coll: c, key: 'value', data: clean(v), ref: c === 'brand' ? null : v }); });
    const d = s.dash; if (d) {
      rows.push({ coll: 'dash', key: 'value', data: clean({ v: 2, templates: d.templates || [] }), ref: d.templates || null });
      (d.boards || []).forEach((b, i) => rows.push({ coll: 'dashBoard', key: String(b.id), data: clean({ ...b, ord: i }), ref: b }));
      (d.kpis || []).forEach(k => rows.push({ coll: 'dashKpi', key: String(k.id), data: clean(k), ref: k }));
      (d.schedules || []).forEach(x => rows.push({ coll: 'dashSched', key: String(x.id), data: clean(x), ref: x }));
    }
    return rows;
  }
  /* Database rows -> state patch. users must be applied first (names are resolved from them). */
  function stateOf(rows, baseState) {
    const by = {}; rows.forEach(r => { (by[r.coll] = by[r.coll] || []).push(r); });
    const st = {};
    // v41.19: there is no "Invited" status any more: an account is Active from creation until it is deactivated (by an admin or the HRMS)
    st.users = (by.users || []).map(r => { let d = r.data; if (d && d.status === 'Invited') d = { ...d, status: 'Active' };
      if (d && (d.id == null || d.id !== d.id)) d = { ...d, id: /^\d+$/.test(r.key) ? +r.key : r.key };   // v41.19: repair people saved with id NaN (key "NaN")
      return d; });
    const s = { ...baseState, users: st.users };
    SF_LIST.forEach(c => { if (c !== 'users') st[c] = (by[c] || []).map(r => listFromDb(s, c, r.data)); });
    // v41.4: the three built-in roles (Learner, Trainer, Admin) always exist, even before any role has been saved to a new database.
    { const have = new Set((st.roles || []).map(r => r.id)); st.roles = ROLES0.filter(r => r.builtin && !have.has(r.id)).concat(st.roles || []); }
    SF_PERSON.forEach(c => { st[c] = Object.fromEntries((by[c] || []).map(r => [nameOf(s, r.key), r.data])); });
    st.assignedOn = {}; (by.assignedOn || []).forEach(r => { const n = nameOf(s, r.key); for (const cid in r.data) st.assignedOn[n + '|' + cid] = r.data[cid]; });
    st.fbLog = Object.fromEntries((by.fbLog || []).map(r => [fbKeyFromDb(s, r.key), r.data]));
    SF_SETTINGS.forEach(c => { if (c === 'dash') return; const r = (by[c] || [])[0]; if (!r) return; if (c === 'brand') Object.assign(st, brandFix(r.data)); else st[c] = r.data; });
    const dv = ((by.dash || [])[0] || {}).data, local = DASH_LOCAL(baseState.dash);
    if (dv && dv.boards) st.dash = { ...dv, ...local };                                   // v28 single-row format
    else if (dv || by.dashBoard || by.dashKpi || by.dashSched) st.dash = { ...local, templates: (dv && dv.templates) || [],   // a viewer has no 'dash' row
      boards: (by.dashBoard || []).map(r => r.data).sort((a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9)), kpis: (by.dashKpi || []).map(r => r.data), schedules: (by.dashSched || []).map(r => r.data) };
    ['users', 'adminCourses', 'qs'].forEach(c => st[c].sort((a, b) => String(a.code || a.id).localeCompare(String(b.code || b.id), undefined, { numeric: true })));
    return st;
  }

  /* ---------- sync state ---------- */
  const rid = (c, k) => c + '\u0000' + k;
  const base = new Map();      // rowId -> { version, json (last known server data as JSON), ref }
  let lastColl = {};           // collection -> state reference last compared
  const dirty = new Map();     // rowId -> { coll, key, data, ref }  (waiting to be saved)
  const delQ = new Map();      // rowId -> { coll, key }
  let busy = false, timer = null;
  const remember = (coll, key, version, data, ref) => base.set(rid(coll, key), { version, json: JSON.stringify(data), ref });

  /* Compare the app state with what the server has; queue changed rows. */
  function observe(s) {
    if (!on || !ready) return;
    const changed = SF_ALL.filter(c => c === 'brand' ? SF_BRAND.some(k => s[k] !== (lastColl.brand || {})[k]) : s[c] !== lastColl[c]);
    if (!changed.length) return;
    const rows = rowsOf(s), seen = new Set();
    rows.forEach(r => { if (!changed.includes(dashGroup(r.coll))) { seen.add(rid(r.coll, r.key)); return; }
      const id = rid(r.coll, r.key); seen.add(id); const b = base.get(id);
      if (b && r.ref && b.ref === r.ref) return;
      const json = JSON.stringify(r.data);
      if (b && b.json === json) { b.ref = r.ref; return; }
      if (!canWrite(r.coll, r.key, r.data)) return;          // the server would refuse: the Edge Function writes these
      dirty.set(id, r); delQ.delete(id); });
    base.forEach((b, id) => { const [c, k] = id.split('\u0000'); if (changed.includes(dashGroup(c)) && !seen.has(id) && canWrite(c, k, null)) { delQ.set(id, { coll: c, key: k }); dirty.delete(id); } });
    lastColl = Object.fromEntries(SF_ALL.map(c => [c, c === 'brand' ? brandOf(s) : s[c]]));
    if (dirty.size || delQ.size) { clearTimeout(timer); timer = setTimeout(flush, 600); setStatus('Saving…', true); }
  }
  // Client-side mirror of the database policy (the database still decides): avoids sending writes that can't succeed.
  function canWrite(coll, key, data) {
    if (!me) return false;
    if (me.role === 'Admin') return !['attempt', 'stepOpen'].includes(coll);
    const P = p => (me.perms || []).includes(p);
    if (['attempt','stepOpen','itemDone','itemQuiz','attemptsUsed','attemptRecs','reviews','surveyResp','fbLog','threads','accessReqs','roles','docAck','loginLog','asgSub'].includes(coll)) return false;
    if (['prefs', 'bookmarks'].includes(coll)) return key === me.emp;
    if (coll === 'batches') return P('batches') && (!data || data.trainerEmp === me.emp);
    if (coll === 'enroll' || coll === 'assignedOn') return P('assignments');
    if (coll === 'extraAttempts' || coll === 'attemptLog') return P('attempts');
    if (coll === 'bmLog') return P('bookmarks');
    if (coll === 'lcms') return P('lcms') || (P('lcmsForms') && (!data || ['Survey', 'Feedback form'].includes(data.type)));
    const W = { users:['users'], groups:['users','assignments'], qs:['qbank'], quizzes:['quizzes','qbank'], adminCourses:['courseAdmin','builder'], cats:['categories'], paths:['paths'], anns:['announcements'], autos:['automations'],
      certTpl:['certs'], places:['places'], masters:['masters'], tiles:['masters'], platform:['masters'], badges:['masters'], holidays:['masters','batches'], ttypes:['masters','batches'], statuses:['masters','batches'],
      brand:['branding'], integ:['integrations'], zh:['integrations'], extHistory:['migration'], syncLog:['migration','integrations'], dash:['dashboard'], dashBoard:['dashboard'], dashKpi:['dashboard'], dashSched:['dashboard'], repCols:['reports'], kp:['feedback'], docs:['documents'], docCfg:['documents'] };
    return (W[coll] || []).some(P);
  }

  /* Three-way merge of one row: keep my changed fields, take theirs for the rest. */
  function merge(baseJson, mine, theirs) {
    const b = baseJson ? JSON.parse(baseJson) : {}, out = { ...theirs }, clashes = [];
    if (!mine || typeof mine !== 'object' || Array.isArray(mine)) return { data: mine, clashes: ['whole row'] };
    deproto(theirs);
    for (const k of new Set(Object.keys(mine).concat(Object.keys(b)))) {
      if (k === '__proto__') continue;
      const mj = JSON.stringify(mine[k]), bj = JSON.stringify(b[k]), tj = JSON.stringify(theirs[k]);
      if (mj === bj) continue;                          // I didn't change it: keep theirs
      if (tj !== bj && tj !== mj) clashes.push(k);      // we both changed it: mine wins, but say so
      if (k in mine) out[k] = mine[k]; else delete out[k];
    }
    return { data: out, clashes };
  }

  async function flush() {
    if (busy) return; busy = true;
    try {
      const saves = [...dirty.values()], dels = [...delQ.values()]; dirty.clear(); delQ.clear();
      let ok = 0, merged = 0, refused = [], clashes = 0;
      // deletes first, all of them, every time
      for (let i = 0; i < dels.length; i += 200) {
        const { data, error } = await sb.rpc('sf_delete', { p_org: org, p_items: dels.slice(i, i + 200).map(d => ({ coll: d.coll, key: d.key })) });
        if (error) throw Object.assign(error, { retry: { dels: dels.slice(i) } });
        data.forEach(r => { if (r.status === 'ok') { base.delete(rid(r.coll, r.key)); ok++; } else refused.push(r); });
      }
      let queue = saves.map(r => ({ ...r, version: (base.get(rid(r.coll, r.key)) || {}).version ?? null })), tries = 0;
      while (queue.length && tries++ < 4) {
        const next = [];
        for (let i = 0; i < queue.length; i += 300) {
          const part = queue.slice(i, i + 300);
          const { data, error } = await sb.rpc('sf_save', { p_org: org, p_rows: part.map(r => ({ coll: r.coll, key: r.key, data: r.data, version: r.version })) });
          if (error) throw Object.assign(error, { retry: { saves: queue.slice(i).concat(next) } });
          data.forEach((res, j) => { const r = part[j], id = rid(r.coll, r.key), b = base.get(id);
            if (res.status === 'ok') { remember(r.coll, r.key, res.version, r.data, r.ref); ok++; }
            else if (res.status === 'conflict') { deproto(res.data); const m = merge(b && b.json, r.data, res.data); clashes += m.clashes.length; merged++;
              next.push({ ...r, data: m.data, version: res.version }); applyRows([{ coll: r.coll, key: r.key, data: m.data, version: res.version, provisional: true }]); }
            else if (res.status === 'gone') { applyRows([{ coll: r.coll, key: r.key, deleted: true }]); refused.push({ ...res, why: 'deleted by someone else' }); }
            else refused.push(res); });
        }
        queue = next;
      }
      // put the server's value back on screen; a refused NEW row has no server value, so it is removed from the screen
      if (refused.length) await pull(refused.map(r => ({ coll: r.coll, key: r.key })), true);
      const parts = [ok + (ok === 1 ? ' change saved' : ' changes saved')];
      if (merged) parts.push(merged + ' merged with someone else’s edit' + (clashes ? ' (' + clashes + ' field' + (clashes === 1 ? '' : 's') + ' changed by both: yours kept)' : ''));
      if (refused.length) parts.push(refused.length + ' not saved: your role can’t change ' + [...new Set(refused.map(r => r.coll))].join(', ') + '. The saved value is shown again.');
      setStatus(parts.join(' · '), !refused.length);
      if (refused.length || clashes) notify(parts.slice(1).join(' · '));
    } catch (e) {
      console.error(e);
      const r = e.retry || {};
      (r.saves || []).forEach(x => { const id = rid(x.coll, x.key); if (!dirty.has(id)) dirty.set(id, x); });
      (r.dels || []).forEach(x => { const id = rid(x.coll, x.key); if (!delQ.has(id) && !dirty.has(id)) delQ.set(id, x); });
      setStatus('Not saved yet (' + (e.message || e) + '). Retrying…', false); setTimeout(flush, 8000);
    } finally { busy = false; if (dirty.size || delQ.size) setTimeout(flush, 300); }
  }

  /* Apply database rows (pulled, realtime or merged) to the app without sending them back. */
  function applyRows(rows) {
    if (!rows.length) return;
    const s = app.state, P = {};
    const get = c => (c in P ? P[c] : s[c]);
    rows.forEach(r => {
      const c = r.coll;
      if (c === 'users' && !r.deleted) { const cur = get('users'), i = cur.findIndex(x => idOf(x) === r.key), o = { ...r.data }; P.users = i < 0 ? cur.concat([o]) : cur.map((x, j) => j === i ? o : x); if (!r.provisional) remember(c, r.key, r.version, r.data, o); return; }
      const sNow = { ...s, users: get('users') };
      if (SF_LIST.includes(c)) { const cur = get(c) || [], i = cur.findIndex(x => idOf(x) === r.key);
        if (r.deleted) { if (i >= 0) P[c] = cur.filter((_, j) => j !== i); base.delete(rid(c, r.key)); return; }
        const o = listFromDb(sNow, c, r.data); P[c] = i < 0 ? cur.concat([o]) : cur.map((x, j) => j === i ? o : x); if (!r.provisional) remember(c, r.key, r.version, r.data, o); return; }
      if (SF_PERSON.includes(c)) { const n = nameOf(sNow, r.key), cur = { ...(get(c) || {}) };
        if (r.deleted) delete cur[n]; else cur[n] = r.data; P[c] = cur; if (r.deleted) base.delete(rid(c, r.key)); else if (!r.provisional) remember(c, r.key, r.version, r.data, r.data); return; }
      if (c === 'assignedOn') { const n = nameOf(sNow, r.key), cur = {}; const old = get('assignedOn') || {};
        for (const k in old) if (k.slice(0, k.indexOf('|')) !== n) cur[k] = old[k]; if (!r.deleted) for (const cid in r.data) cur[n + '|' + cid] = r.data[cid];
        P.assignedOn = cur; if (!r.provisional && !r.deleted) remember(c, r.key, r.version, r.data, null); return; }
      if (c === 'fbLog') { const k = fbKeyFromDb(sNow, r.key), cur = { ...(get('fbLog') || {}) }; if (r.deleted) delete cur[k]; else cur[k] = r.data; P.fbLog = cur; if (!r.provisional && !r.deleted) remember(c, r.key, r.version, r.data, r.data); return; }
      if (c === 'dash' || DASH_PARTS[c]) { const d = { ...(get('dash') || {}) };
        if (c === 'dash') { if (!r.deleted && r.data) { if (r.data.boards) Object.assign(d, r.data, DASH_LOCAL(d)); else d.templates = r.data.templates || []; if (!r.provisional) remember(c, r.key, r.version, r.data, d.templates); } }
        else { const f = DASH_PARTS[c], l = (d[f] || []).slice(), i = l.findIndex(x => String(x.id) === r.key);
          if (r.deleted) { if (i >= 0) l.splice(i, 1); base.delete(rid(c, r.key)); }
          else { const o = { ...r.data }; if (i >= 0) l[i] = o; else l.push(o); if (f === 'boards') l.sort((a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9)); if (!r.provisional) remember(c, r.key, r.version, r.data, o); }
          d[f] = l; }
        P.dash = d; return; }
      if (SF_SETTINGS.includes(c) && !r.deleted) { if (c === 'brand') Object.assign(P, brandFix(r.data)); else P[c] = r.data; if (!r.provisional) remember(c, r.key, r.version, r.data, c === 'brand' ? null : r.data); }
    });
    app.setState(P);
    // the patched collections are now the reference point (no echo back to the server)
    const s2 = app.state; Object.keys(P).forEach(c => { if (SF_ALL.includes(c)) lastColl[c] = s2[c]; }); if (SF_BRAND.some(k => k in P)) lastColl.brand = brandOf(s2);
  }

  /* Re-read specific rows from the database and show them. */
  async function pull(items, dropMissing) {
    const byColl = {}; items.forEach(i => { (byColl[i.coll] = byColl[i.coll] || new Set()).add(i.key); });
    const rows = [];
    for (const c in byColl) { const keys = [...byColl[c]];
      for (let i = 0; i < keys.length; i += 200) { const { data, error } = await sb.from('sf_doc').select('coll,key,data,version').eq('org_id', org).eq('coll', c).in('key', keys.slice(i, i + 200));
        if (error) throw error; data.forEach(deproto); const got = new Set(data.map(d => d.key)); rows.push(...data); keys.slice(i, i + 200).forEach(k => { if (!got.has(k) && (dropMissing || base.has(rid(c, k)))) rows.push({ coll: c, key: k, deleted: true }); }); } }
    applyRows(rows);
  }

  /* ---------- v41.19: no sample data in a connected organisation ----------
   * SAMPLE_LISTS are the collections that hold people, content and learning records. The sample organisation's rows in
   * them are removed; set-up lists (roles, categories, badges, training types, statuses, holidays) and settings stay. */
  const SAMPLE_LISTS = ['users', 'adminCourses', 'lcms', 'qs', 'quizzes', 'batches', 'places', 'anns', 'accessReqs', 'paths', 'groups', 'extHistory', 'syncLog', 'attemptRecs', 'attemptLog', 'bmLog', 'reviews', 'threads', 'docs', 'asgSub'];
  const SAMPLE_OTHER = SF_PERSON.concat(['assignedOn', 'fbLog']);
  const labelOf = d => { if (!d || typeof d !== 'object') return ''; const v = d.title || d.name || d.text || d.email || d.code || d.t || ''; return typeof v === 'string' ? v : ''; };
  /* An empty organisation: no sample people, content or records (used for a new database). */
  function cleanPatch(s) {
    const P = {}; SAMPLE_LISTS.forEach(c => { P[c] = []; }); SF_PERSON.forEach(c => { P[c] = {}; }); P.assignedOn = {}; P.fbLog = {};
    P.passwords = {}; P.audit = [];   // dashboards, roles, categories and badges are set-up, not sample data: kept P.bookmarks = {}; P.surveyResp = {};
    return P;
  }
  /* Fingerprints of the sample organisation (taken from the app's built-in starting state before anything loads). */
  function sampleIndex(s) {
    const idx = new Map(), emps = new Set((s.users || []).map(u => String(u.empId || '')).filter(Boolean));
    rowsOf(s).forEach(r => { if (SAMPLE_LISTS.includes(r.coll) || SAMPLE_OTHER.includes(r.coll)) idx.set(rid(r.coll, r.key), labelOf(r.data)); });
    return { idx, emps };
  }
  /* Rows in the database that came from the sample organisation. Kept: you, anyone with a login, and rows whose title /
   * name no longer matches the sample (something you created that happens to reuse a sample key). */
  async function sampleRows(sample) {
    const have = await membersWithLogin(), meEmp = me && me.emp, out = [];
    base.forEach((b, id) => { if (!sample.idx.has(id)) return; const [c, k] = id.split('\u0000'); let d = null; try { d = JSON.parse(b.json); } catch (e) {}
      if (c === 'users') { const e = String((d && d.empId) || '').toUpperCase(); if (!e || e === String(meEmp || '').toUpperCase() || have.has(e)) return; }
      else if (SF_PERSON.includes(c) || c === 'assignedOn') { const e = String(k).toUpperCase(); if (e === String(meEmp || '').toUpperCase() || have.has(e) || !sample.emps.has(k)) return; }
      const want = sample.idx.get(id); if (want && labelOf(d) !== want) return;
      out.push({ coll: c, key: k }); });
    return out;
  }
  async function purge(items, onProgress) {
    let done = 0, refused = 0; const gone = [];
    for (let i = 0; i < items.length; i += 200) {
      const part = items.slice(i, i + 200);
      const { data, error } = await sb.rpc('sf_delete', { p_org: org, p_items: part });
      if (error) throw error;
      data.forEach(r => { if (r.status === 'ok') gone.push({ coll: r.coll, key: r.key, deleted: true }); else refused++; });
      done += part.length; if (onProgress) onProgress(done, items.length);
    }
    // per-person rows first, while the person's name can still be looked up; people last
    gone.sort((a, b) => (a.coll === 'users') - (b.coll === 'users')); applyRows(gone);
    return { removed: gone.length, refused };
  }

  /* v41.19: re-read one whole collection (Discussions: learners have no live updates, so threads are re-read on opening). */
  async function reloadColl(coll) {
    if (!on || !ready) return;
    const { data, error } = await sb.from('sf_doc').select('coll,key,data,version').eq('org_id', org).eq('coll', coll).limit(2000);
    if (error) throw error; data.forEach(deproto);
    const got = new Set(data.map(d => d.key)), rows = data.filter(d => { const b = base.get(rid(d.coll, d.key)); return !b || b.version < d.version; });
    base.forEach((b, id) => { const [c, k] = id.split('\u0000'); if (c === coll && !got.has(k)) rows.push({ coll: c, key: k, deleted: true }); });
    applyRows(rows);
  }

  /* ---------- server actions (Edge Function "learning") ---------- */
  async function call(action, body) {
    const { data, error } = await sb.functions.invoke('learning', { body: { action, org, ...body } });
    let msg = data && data.error;
    if (error && !msg) { try { const j = await error.context.json(); msg = j.error; } catch (e) { msg = error.message; } }
    if (msg) throw new Error(msg);
    if (data && data._touched && data._touched.length) await pull(data._touched);
    return data || {};
  }
  async function adminUsers(action, payload) {
    const { data, error } = await sb.functions.invoke('admin-users', { body: { action, org, ...payload } });
    let msg = data && data.error; if (error && !msg) { try { msg = (await error.context.json()).error; } catch (e) { msg = error.message; } }
    if (msg) throw new Error(msg); return data;
  }

  /* ---------- load ---------- */
  async function loadAll() {
    const all = [];
    let last = null;   // keyset paging (OFFSET would re-check every skipped row against the policies)
    const qv = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    for (;;) { let q = sb.from('sf_doc').select('coll,key,data,version').eq('org_id', org).order('coll').order('key').limit(1000);
      if (last) q = q.or('coll.gt.' + qv(last.coll) + ',and(coll.eq.' + qv(last.coll) + ',key.gt.' + qv(last.key) + ')');
      const { data, error } = await q; if (error) throw error; data.forEach(deproto); all.push(...data); if (data.length < 1000) break; last = data[data.length - 1]; }
    return all;
  }
  async function signFiles(st) {
    const metas = [], walk = v => { if (!v || typeof v !== 'object') return; if (typeof v.path === 'string' && v.path && 'src' in v && !v.path.includes('/scorm/')) metas.push(v); for (const k in v) walk(v[k]); };
    ['lcms', 'adminCourses', 'certTpl', 'qs', 'docs'].forEach(k => walk(st[k]));
    // SCORM packages are served same-origin by /content (Cloudflare Pages Function)
    (st.lcms || []).forEach(m => { if (m.file && m.file.path && m.file.path.includes('/scorm/')) m.file.src = ''; });   // launched through the content site
    const paths = [...new Set(metas.map(m => m.path))]; if (!paths.length) return;
    let urls = {};
    if (me.role !== 'Admin' && !['lcms', 'lcmsForms', 'courseAdmin', 'builder', 'certs', 'qbank'].some(p => (me.perms || []).includes(p))) { for (let i = 0; i < paths.length; i += 200) Object.assign(urls, (await call('sign', { paths: paths.slice(i, i + 200) })).urls || {}); }
    else for (let i = 0; i < paths.length; i += 100) { const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 60 * 60 * 8); (data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; }); }
    metas.forEach(m => { m.src = urls[m.path] || ''; });
  }

  async function whoAmI() {
    const { data: u, error: ue } = await sb.auth.getUser(); if (!u || !u.user) return ue ? { none: true, why: 'Your session has ended' } : null;
    if ((u.user.app_metadata || {}).must_change) return { mustChange: true, email: u.user.email };
    let m; try { m = await call('me', {}); } catch (e) { return { none: true, email: u.user.email, why: e.message }; }
    return { emp: m.empId, role: m.role, roleId: m.roleId, perms: m.role === 'Admin' ? [] : (m.perms || []), name: m.name, email: u.user.email, mustChange: !!m.mustChange };
  }
  async function afterSignIn() {
    me = await whoAmI();
    if (!me || me.none) { const why = (me && me.why) || ''; await sb.auth.signOut();
      // v41.19: say what actually went wrong (it was always the same sentence)
      if (/session has ended/i.test(why)) throw new Error('Your session ended. Sign in again with your current password.');
      if (/expired/i.test(why)) throw new Error(why);
      throw new Error('Your sign-in worked, but it is not linked to an active Skillforge account. Ask your L&D administrator.' + (why && !/not linked/i.test(why) ? ' (' + why + ')' : '')); }
    if (me.mustChange) return { mustChange: true, me };
    if (freshLogin) { const m = freshLogin; freshLogin = null; call('signedIn', { method: m }).catch(() => {}); }
    setStatus('Loading data…', true);
    const rows = await loadAll();
    const empty = !rows.some(r => r.coll === 'users');
    if (!empty && me.role === 'Learner') {   // other people: names only, from the directory (no emails, phones, HR fields)
      const { data: dir } = await sb.rpc('sf_directory', { p_org: org });
      const mine = new Set(rows.filter(r => r.coll === 'users').map(r => r.data.empId));
      (dir || []).filter(d => !mine.has(d.empId)).forEach(d => rows.push({ coll: 'users', key: d.id, data: { ...d, _dir: true, email: '', phone: '' }, version: 0, dir: true }));
    }
    const st = empty ? cleanPatch(app.state) : stateOf(rows, app.state);   // v41.19: a new database starts empty, not with the sample organisation
    if (!empty) await signFiles(st);
    base.clear(); rows.forEach(r => { if (!r.dir) remember(r.coll, r.key, r.version, r.data, null); });
    ready = false; app.setState({ ...st, beReady: true, beEmpty: empty, beMe: me });
    // references for change detection
    const s = app.state; lastColl = Object.fromEntries(SF_ALL.map(c => [c, c === 'brand' ? brandOf(s) : s[c]]));
    rowsOf(s).forEach(r => { const b = base.get(rid(r.coll, r.key)); if (b && b.json === JSON.stringify(r.data)) b.ref = r.ref; });
    ready = true;
    // Live updates only for staff: each event is checked against RLS per subscriber, and the Free plan allows 200
    // concurrent Realtime connections, so thousands of learners must not subscribe.
    if (me.role !== 'Learner' || (me.perms || []).length) subscribe();
    setStatus(empty ? 'Connected. The database is empty: load the starting data in Settings › Platform › Database & storage.' : 'Connected · ' + rows.length.toLocaleString('en-US') + ' records', true);
    return { empty, me, user: (st.users || []).find(u => u.empId === me.emp) || null };
  }
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('sf-' + org).on('postgres_changes', { event: '*', schema: 'public', table: 'sf_doc', filter: 'org_id=eq.' + org }, p => {
      const row = p.new && p.new.coll ? deproto(p.new) : null, old = p.old || {};
      if (p.eventType === 'DELETE') { const id = rid(old.coll, old.key); if (old.coll && base.has(id) && !dirty.has(id)) applyRows([{ coll: old.coll, key: old.key, deleted: true }]); return; }
      if (!row) return; const id = rid(row.coll, row.key), b = base.get(id);
      if (dirty.has(id) || (b && b.version >= row.version)) return;     // mine, or already known
      if (row.coll === 'attempt' || row.coll === 'stepOpen') return;
      applyRows([{ coll: row.coll, key: row.key, data: row.data, version: row.version }]);
      if (row.coll === 'lcms' || row.coll === 'adminCourses' || row.coll === 'docs') signFiles({ [row.coll]: app.state[row.coll] }).then(() => app.setState({ [row.coll]: app.state[row.coll].slice() })).catch(() => {});
    }).subscribe();
  }

  /* ---------- auth ---------- */
  async function signIn(username, password) {
    let email = String(username || '').trim();
    if (!/@/.test(email)) {   // employee ID: checked by the database (throttled per ID and per IP); the email comes back only with the right password
      const { data, error } = await sb.rpc('sf_login_lookup', { p_org: org, p_emp: email, p_password: password });
      if (error) throw error;
      if (data && data.error === 'locked') { const m = Math.max(1, Math.ceil((data.retryAfter || 900) / 60));
        throw new Error(data.useEmail ? 'Sign-in with this employee ID is paused for ' + m + ' minutes after many failed attempts. Sign in with your work email instead, or ask your L&D administrator.'
          : 'Too many attempts. Try again in ' + (m === 1 ? 'a minute' : m + ' minutes') + ', or sign in with your work email.'); }
      if (!data || !data.email) throw new Error('Invalid login credentials');
      email = data.email;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;   // from the user's own IP
    freshLogin = /@/.test(String(username || '')) ? 'email' : 'emp';   // recorded after sign-in (not on page reloads)
  }
  async function signOut() { if (on) { scormLeave(); if (channel) sb.removeChannel(channel); await sb.auth.signOut(); } if (LS) { LS.removeItem(KEEP_KEY); Object.keys(LS).filter(isAuthKey).forEach(k => LS.removeItem(k)); } }
  async function setNewPassword(pw) {
    const { data: u0 } = await sb.auth.getUser(); const email = u0 && u0.user && u0.user.email; recovery = false;
    const { data, error } = await sb.functions.invoke('learning', { body: { action: 'changePassword', password: pw, org } });
    let msg = data && data.error; if (error && !msg) { try { msg = (await error.context.json()).error; } catch (e) { msg = error.message; } } if (msg) throw new Error(msg);
    // v41.19: sign in again with the new password. Only refreshing the old session could leave the browser holding the
    // token from before the change (still marked "must change", or a session Supabase had already closed), and the next
    // step then said "Your sign-in worked, but it is not linked to an active Skillforge account" until a fresh sign-in.
    const r = await sb.auth.refreshSession();
    const fresh = r && r.data && r.data.session && !((r.data.session.user || {}).app_metadata || {}).must_change;
    if (!fresh && email) { const { error: e2 } = await sb.auth.signInWithPassword({ email, password: pw }); if (e2) throw new Error('Password changed. Sign in again with your new password.'); }
  }
  async function resetLink(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; }

  /* ---------- SCORM on the separate content origin ----------
   * Each launch is a server-side session (sid). The link works only while that session is current and not idle:
   * it is renewed every few minutes while the package is on screen and ended when the learner leaves the step or
   * signs out. Completion is never decided here: the package's status goes to the server (scormCommit), which
   * checks the session and the minimum time.                                                                     */
  let scormFrameOrigin = '', sess = null, pingTimer = null, retryTimer = null, lastSent = '';
  const b64u = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function stopSession() { clearInterval(pingTimer); clearTimeout(retryTimer); pingTimer = retryTimer = null; sess = null; lastSent = ''; }
  function startSession(s, pingSecs) {
    stopSession(); sess = s;
    pingTimer = setInterval(() => { const cur = sess; if (!cur) return;
      call('scormPing', cur.ids).catch(() => { if (sess === cur) stopSession(); }); }, Math.max(60, pingSecs || 600) * 1000);
  }
  async function scormLaunch(courseId, step, cmi) {
    const r = await call('scormLaunch', { courseId, step });
    scormFrameOrigin = r.origin; startSession({ kind: 'course', ids: { courseId, step, sid: r.sid } }, r.pingSecs);
    return r.url + '#sfcmi=' + b64u(JSON.stringify(cmi || {}));
  }
  async function scormPreview(moduleId) { const r = await call('scormLaunch', { moduleId }); scormFrameOrigin = r.origin;
    startSession({ kind: 'preview', ids: { moduleId, sid: r.sid } }, r.pingSecs); return r.url; }
  /* The package's current status -> server. Resolves { done, wait?, status }. A "wait" (minimum time not reached yet)
   * is retried automatically once the time is up. */
  async function scormReport(force) {
    const cur = sess; if (!cur || cur.kind !== 'course') return { done: false };
    const d = (typeof ScormRT !== 'undefined' && ScormRT.peek()) || {};
    const status = typeof ScormRT !== 'undefined' && ScormRT.status ? ScormRT.status(d) : String(d['cmi.core.lesson_status'] || '').toLowerCase();
    const score = d.score != null ? d.score : (d['cmi.core.score.raw'] || d['cmi.score.raw'] || null);
    const sig = status + '|' + score; if (!force && sig === lastSent) return { done: false, status };
    lastSent = sig;
    const r = await call('scormCommit', { ...cur.ids, status, score });
    if (r && r.wait && sess === cur) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { if (sess === cur) scormReport(true).then(x => x.done && app && app._scormServerDone && app._scormServerDone(cur.ids)).catch(() => {}); }, (r.wait + 1) * 1000); }
    return r || { done: false };
  }
  /* Leaving the SCORM step (or signing out) ends the course session so its link stops working. */
  function scormLeave() { const cur = sess; if (!cur || cur.kind !== 'course') return; stopSession(); call('scormEnd', cur.ids).catch(() => {}); }
  async function scormFlush() { clearTimeout(retryTimer); return scormReport(true); }   // tests and "Check again"
  function scormActive(courseId, step) { return !!(sess && sess.kind === 'course' && sess.ids.courseId === courseId && sess.ids.step === step); }
  // Messages from the bridge: accepted only from the content origin AND from the SCORM frame on screen.
  if (typeof window !== 'undefined') window.addEventListener('message', e => {
    const d = e.data; if (!d || d.sf !== 'scorm' || !scormFrameOrigin || e.origin !== scormFrameOrigin) return;
    const fr = document.querySelector('iframe.sf-scorm'); if (!fr || e.source !== fr.contentWindow) return;
    if (d.op === 'init') window.API.LMSInitialize('');
    else if (d.op === 'set' && typeof d.k === 'string' && d.k.length <= 255) window.API.LMSSetValue(d.k, String(d.v).slice(0, 65536));
    else if (d.op === 'commit') window.API.LMSCommit('');
    else if (d.op === 'finish') window.API.LMSFinish('');
    // keep the server's copy of the status current (only sends when it changed)
    if ((d.op === 'commit' || d.op === 'finish') && sess && sess.kind === 'course') scormReport(false).then(r => { if (r.done && app && app._scormServerDone) app._scormServerDone(sess && sess.ids); }).catch(() => {});
  });

  async function start(a) {
    app = a; if (!on) { a.setState({ beStatus: status }); return; }
    a.setState({ beOn: true, beStatus: status });
    // v41.2: while the saved sign-in is checked the app shows a short "Loading" screen (state.booting), not the
    // sign-in form, and a restored session returns to the page the person was on (NavMemory), not the landing page.
    // v41.19: a reset-password link signs the person in; ask for the new password first instead of opening the app.
    try { sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { recovery = true; a.setState(st => ({ authed: false, booting: false, loginView: 'newpw', login: { ...st.login, busy: false, err: '', recovery: true } })); } }); } catch (e) {}
    try { const { data: sess } = await sb.auth.getSession();
      if (sess && sess.session && recovery) { a.setState(st => ({ authed: false, loginView: 'newpw', login: { ...st.login, busy: false, err: '', recovery: true } })); try { history.replaceState(null, '', location.pathname); } catch (e) {} return; }
      if (sess && sess.session) { const r = await afterSignIn(); a.onBackendSignedIn && a.onBackendSignedIn(r, { restore: true }); } }
    finally { a.setState({ booting: false }); }
  }

  /* ---------- seeding and logins (admins) ---------- */
  async function seed(state, onProgress) {
    const rows = rowsOf(state).map(r => ({ coll: r.coll, key: r.key, data: r.data, version: (base.get(rid(r.coll, r.key)) || {}).version ?? null }));
    let done = 0, refused = 0;
    for (let i = 0; i < rows.length; i += 400) {
      const { data, error } = await sb.rpc('sf_save', { p_org: org, p_rows: rows.slice(i, i + 400) }); if (error) throw error;
      data.forEach((r, j) => { if (r.status === 'ok') remember(r.coll, r.key, r.version, rows[i + j].data, null); else refused++; });
      done = Math.min(rows.length, i + 400); if (onProgress) onProgress(done, rows.length);
    }
    const s = app.state; lastColl = Object.fromEntries(SF_ALL.map(c => [c, c === 'brand' ? brandOf(s) : s[c]]));
    rowsOf(s).forEach(r => { const b = base.get(rid(r.coll, r.key)); if (b) b.ref = r.ref; });
    ready = true; app.setState({ beReady: true, beEmpty: false });
    setStatus('Starting data saved · ' + (rows.length - refused).toLocaleString('en-US') + ' records' + (refused ? ' · ' + refused + ' refused' : ''), !refused);
    return rows.length - refused;
  }
  /* Create logins for people who don't have one yet; returns temporary passwords (shown once). */
  // v37: chunks of 100 (the server limit); onProgress(done, total); on failure the result carries `next` so the
  // caller can resume with createLogins(people, onProgress, next) without recreating anyone.
  async function createLogins(people, onProgress, from = 0) {
    const out = { created: [], skipped: [], next: null, error: null };
    for (let i = from; i < people.length; i += 100) {
      try { const r = await adminUsers('bulkCreate', { people: people.slice(i, i + 100) }); out.created.push(...r.created); out.skipped.push(...r.skipped); }
      catch (e) { out.next = i; out.error = String(e && e.message || e); return out; }
      if (onProgress) onProgress(Math.min(i + 100, people.length), people.length);
    }
    return out;
  }
  async function membersWithLogin() { const { data, error } = await sb.from('sf_member').select('emp_id').eq('org_id', org); if (error) throw error; return new Set(data.map(d => d.emp_id)); }

  /* ---------- files ---------- */
  const SIG = { 'application/pdf': [[0x25, 0x50, 0x44, 0x46]], 'image/png': [[0x89, 0x50, 0x4E, 0x47]], 'image/jpeg': [[0xFF, 0xD8, 0xFF]], 'image/gif': [[0x47, 0x49, 0x46]], 'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'application/zip': [[0x50, 0x4B, 0x03, 0x04]], 'video/mp4': [[0, 0, 0], 'ftyp'], 'audio/mpeg': [[0x49, 0x44, 0x33], [0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2]], 'video/webm': [[0x1A, 0x45, 0xDF, 0xA3]] };
  const OFFICE = /officedocument/;
  /* Check the file's first bytes match its type (a renamed .exe won't pass as a PDF). */
  async function sniff(f) {
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer()), t = f.type || '';
    const starts = sig => sig.every((b, i) => head[i] === b);
    if (OFFICE.test(t)) return starts([0x50, 0x4B, 0x03, 0x04]);
    if (t === 'video/mp4' || t === 'audio/mp4') return String.fromCharCode(...head.slice(4, 8)) === 'ftyp';
    const sigs = SIG[t]; if (!sigs) return ['text/plain', 'text/csv'].includes(t) || /^(audio|video)\//.test(t);
    return sigs.some(s => Array.isArray(s) ? starts(s) : true);
  }
  // Uploads still running: closing the tab now would leave records without their file, so the browser asks first.
  let pending = 0;
  const track = pr => { pending++; return Promise.resolve(pr).finally(() => { pending--; }); };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', e => { if (pending > 0) { e.preventDefault(); e.returnValue = ''; } });
  /* Upload and wait (documents library): resolves { path, src } only when the file is stored; throws otherwise.
   * Offline: a link that lasts for this tab. */
  async function put(f, folder) {
    if (!on) return { path: '', src: URL.createObjectURL(f) };
    if (f.type === 'image/svg+xml' || /\.svgz?$/i.test(f.name)) throw new Error('SVG files are not accepted');
    if (!(await sniff(f))) throw new Error('The file content does not match its type');
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80), path = org + '/' + folder + '/' + new Date().toISOString().slice(0, 7) + '/' + Date.now() + '-' + safe;
    return track((async () => { setStatus('Uploading ' + f.name + '…', true);
      const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) { setStatus('Upload failed: ' + error.message, false); throw new Error('Upload failed: ' + error.message); }
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 10); setStatus('Uploaded ' + f.name, true);
      return { path, src: (data && data.signedUrl) || '' }; })());
  }
  const Files = {
    put,
    pending: () => pending,
    local(f, folder) { const blob = URL.createObjectURL(f); if (on) track(upload(f, folder || 'misc', blob)); return blob; },
    /* SCORM .zip: extract in the browser, upload every file to the private SCORM bucket, return { path, launch }. */
    async scorm(f, onProgress) {
      if (!on) throw new Error('Connect Supabase to upload SCORM packages');
      if (!(await sniff(new File([f], f.name, { type: 'application/zip' })))) throw new Error('That file is not a ZIP');
      const Z = globalThis.Unzip, files = await Z.read(await f.arrayBuffer()), info = Z.packageInfo(files);   // v41.11: SCORM, xAPI / cmi5 or HTML5
      { const full = await spaceCheck(files.reduce((n, x) => n + x.data.length, 0)); if (full) throw new Error(full); }
      const pkg = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), prefix = org + '/scorm/' + pkg + '/';
      let n = 0;
      for (const x of files) { const { error } = await sb.storage.from(SCORM_BUCKET).upload(prefix + x.name, new Blob([x.data], { type: Z.mimeOf(x.name) }), { contentType: Z.mimeOf(x.name), upsert: false });
        if (error) throw new Error('Upload failed at ' + x.name + ': ' + error.message); n++; if (onProgress) onProgress(n, files.length); }
      spaceAdd(files.reduce((n, x) => n + x.data.length, 0));
      return { name: f.name, size: f.size, path: prefix, launch: info.launch, version: info.version, std: info.std, title: info.title, src: '' };
    },
  };
  /* ---------- v41.13: Supabase Free plan usage meter (testing) ----------
   * Free plan: 1 GB file storage, 500 MB database. Supabase does not charge on the Free plan; when a quota is exceeded the
   * project gets a grace period and is then restricted (uploads / the whole project can stop). This keeps us well below that:
   * live totals from sf_usage(), uploads that would go over the limit are refused, and a warning shows from 75 %.
   * Switch off in js/config.js with USAGE_METER: false (e.g. after moving to a paid plan). */
  const LIM = { storage: (+cfg.FREE_STORAGE_MB || 1024) * 1048576, db: (+cfg.FREE_DB_MB || 500) * 1048576 };
  const meterOn = cfg.USAGE_METER !== false;
  let usage = null, usageAt = 0, usageBusy = null;
  async function usageLoad(force) {
    if (!on || !meterOn) return null;
    if (!force && usage && Date.now() - usageAt < 60000) return usage;
    if (usageBusy) return usageBusy;
    usageBusy = sb.rpc('sf_usage').then(({ data, error }) => { usageBusy = null; if (error || !data) return usage; usage = data; usageAt = Date.now(); if (app) app.setState({ beUsage: usage }); return usage; },
      () => { usageBusy = null; return usage; });
    return usageBusy;
  }
  const mb = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  /* Before an upload: refuse it if it would take Storage over the Free plan limit (returns an error message, or ''). */
  async function spaceCheck(bytes) {
    if (!on || !meterOn) return ''; const u = await usageLoad(); if (!u) return '';
    const left = LIM.storage - u.storage;
    return bytes > left ? 'Not uploaded: this file is ' + mb(bytes) + ' but only ' + mb(Math.max(0, left)) + ' of the ' + mb(LIM.storage) + ' free Supabase storage is left. Delete unused files or modules first.' : '';
  }
  function spaceAdd(bytes) { if (usage) { usage = { ...usage, storage: usage.storage + bytes }; if (app) app.setState({ beUsage: usage });
    const p = usage.storage / LIM.storage; if (p >= 0.75) notify('Supabase storage ' + Math.round(p * 100) + ' % used: ' + mb(LIM.storage - usage.storage) + ' left of the free ' + mb(LIM.storage) + '.'); } }
  const Usage = { load: usageLoad, check: spaceCheck, LIM, on: () => on && meterOn, mb };

  async function upload(f, folder, blob) {
    const swap = patch => { const sw = v => { if (!v || typeof v !== 'object') return v; if (Array.isArray(v)) { let ch = false; const o = v.map(x => { const y = sw(x); if (y !== x) ch = true; return y; }); return ch ? o : v; }
      if (v.src === blob) return { ...v, ...patch }; let ch = false; const o = {}; for (const k in v) { o[k] = sw(v[k]); if (o[k] !== v[k]) ch = true; } return ch ? o : v; };
      app.setState(st => Object.fromEntries(['mod', 'lcms', 'adminCourses', 'cDraft', 'certDraft', 'certTpl', 'qm', 'qs', 'docs', 'docEd'].map(k => [k, sw(st[k])]).filter(([k, v]) => v !== st[k]))); };
    // SVG can carry script, so it is not accepted (the storage bucket refuses it too).
    if (f.type === 'image/svg+xml' || /\.svgz?$/i.test(f.name)) { swap({ src: '', uploadError: 'SVG files are not accepted' }); return setStatus(f.name + ' was not uploaded: SVG files can contain scripts. Use PNG, JPG, GIF or WebP.', false); }
    if (!(await sniff(f))) { swap({ src: '', uploadError: 'The file content does not match its type' }); return setStatus(f.name + ' was not uploaded: its content does not match its type (' + (f.type || 'unknown') + ').', false); }
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80), path = org + '/' + folder + '/' + new Date().toISOString().slice(0, 7) + '/' + Date.now() + '-' + safe;
    { const full = await spaceCheck(f.size || 0); if (full) { swap({ src: '', uploadError: full }); notify(full); return setStatus(full, false); } }
    setStatus('Uploading ' + f.name + '…', true);
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) { swap({ src: '', uploadError: error.message }); return setStatus('Upload failed: ' + error.message, false); }
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 8);
    swap({ src: data.signedUrl, path }); setStatus('Uploaded ' + f.name, true); spaceAdd(f.size || 0);
  }

  const fbKey = k => fbKeyToDb(app.state, k), empOfName = n => empOf(app.state, n);
  /* v36: the database audit trail for the Audit log screen (admins only: RLS sf_audit_admin), newest first, with the
     actor's app name from sf_member. */
  async function auditList(limit) {
    const { data, error } = await sb.from('sf_audit').select('at,actor,op,coll,key,version,changes').eq('org_id', org).order('at', { ascending:false }).limit(limit || 500);
    if (error) throw error; const ids = [...new Set(data.map(d => d.actor).filter(Boolean))], names = {};
    if (ids.length) { const r = await sb.from('sf_member').select('user_id,app_name').eq('org_id', org).in('user_id', ids); if (!r.error) r.data.forEach(m => { names[m.user_id] = m.app_name; }); }
    return data.map(d => deproto({ ...d, who: names[d.actor] || (d.actor ? 'User ' + String(d.actor).slice(0, 8) : 'System') })); }
  return { Usage, auditList, deproto, scormLaunch, scormPreview, scormReport, scormLeave, scormFlush, scormActive, fbKey, empOfName, on, configured, org, BUCKET, start, observe, signIn, signOut, setNewPassword, resetLink, adminUsers, call, pull, reloadColl, keepSignIn, rememberTouch, remembered, KEEP_MIN, cleanPatch, sampleIndex, sampleRows, purge, afterSignIn, seed, createLogins, membersWithLogin,
    Files, status: () => status, me: () => me, rowsOf, stateOf, merge, canWrite, client: () => sb, _sniff: sniff };
})();
const Files = Backend.Files;
