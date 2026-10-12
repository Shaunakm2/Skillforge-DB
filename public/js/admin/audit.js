/* Skillforge LMS — Audit log in plain language (v41.10).
 * Turns database audit rows { at, who, actor, op, coll, key, version, changes } into sentences a normal reader understands:
 *   "Shaunak Mistry signed in with email"   "Acknowledged “POSH Policy” (v1)"   "Changed user account “Riya Shah”: Role Learner → Trainer"
 * Record ids are replaced by names, the person a record belongs to is shown instead of "System", bursts of the same action
 * (e.g. 21 accounts created by the starting data) become one row with the names listed, and each row gets an area for filtering.
 */
const AuditText = (() => {
  // collection -> [singular, plural, area]
  const C = {
    users:['user account', 'user accounts', 'People & access'], roles:['role', 'roles', 'People & access'], groups:['group', 'groups', 'People & access'],
    accessReqs:['access request', 'access requests', 'People & access'],
    adminCourses:['course', 'courses', 'Courses & content'], lcms:['LCMS module', 'LCMS modules', 'Courses & content'], qs:['question', 'questions', 'Courses & content'],
    quizzes:['assessment', 'assessments', 'Courses & content'], paths:['learning path', 'learning paths', 'Courses & content'], cats:['category', 'categories', 'Courses & content'],
    badges:['badge', 'badges', 'Courses & content'],
    enroll:['course assignment', 'course assignments', 'Learning activity'], itemDone:['course progress', 'course progress', 'Learning activity'],
    itemQuiz:['assessment answers', 'assessment answers', 'Learning activity'], attemptsUsed:['assessment attempt', 'assessment attempts', 'Learning activity'],
    extraAttempts:['extra attempt', 'extra attempts', 'Learning activity'], attemptRecs:['assessment result', 'assessment results', 'Learning activity'],
    attemptLog:['attempt record', 'attempt records', 'Learning activity'], reviews:['answer review', 'answer reviews', 'Learning activity'],
    bookmarks:['SCORM bookmark', 'SCORM bookmarks', 'Learning activity'], bmLog:['bookmark reset', 'bookmark resets', 'Learning activity'],
    surveyResp:['survey answer', 'survey answers', 'Learning activity'], fbLog:['feedback response', 'feedback responses', 'Learning activity'],
    assignedOn:['assignment date', 'assignment dates', 'Learning activity'], extHistory:['migrated record', 'migrated records', 'Learning activity'],
    batches:['batch', 'batches', 'Training delivery'], ttypes:['training type', 'training types', 'Training delivery'], statuses:['trainee status', 'trainee statuses', 'Training delivery'],
    holidays:['holiday', 'holidays', 'Training delivery'], places:['training place', 'training places', 'Training delivery'],
    docs:['document', 'documents', 'Documents'], docAck:['document record', 'document records', 'Documents'],
    anns:['announcement', 'announcements', 'Communication'], threads:['discussion', 'discussions', 'Communication'],
    loginLog:['sign-in', 'sign-ins', 'Sign-ins'],
    masters:['master data', 'master data', 'Settings'], tiles:['tile settings', 'tile settings', 'Settings'], repCols:['report columns', 'report columns', 'Settings'],
    dash:['dashboards', 'dashboards', 'Settings'], certTpl:['certificate template', 'certificate templates', 'Settings'], zh:['ZingHR settings', 'ZingHR settings', 'Settings'],
    autos:['notification rules', 'notification rules', 'Settings'], integ:['integrations', 'integrations', 'Settings'], kp:['KPI library', 'KPI library', 'Settings'],
    platform:['platform settings', 'platform settings', 'Settings'], brand:['branding', 'branding', 'Settings'], docCfg:['document settings', 'document settings', 'Settings'],
    syncLog:['sync record', 'sync records', 'Settings'], prefs:['personal preferences', 'personal preferences', 'People & access'],
  };
  const AREAS = ['People & access', 'Sign-ins', 'Courses & content', 'Learning activity', 'Training delivery', 'Documents', 'Communication', 'Settings', 'Other'];
  const PERSON = new Set(['enroll', 'itemDone', 'itemQuiz', 'attemptsUsed', 'extraAttempts', 'bookmarks', 'surveyResp', 'prefs', 'docAck', 'loginLog', 'attemptRecs']);
  const SETTING = new Set(['masters', 'tiles', 'repCols', 'dash', 'certTpl', 'zh', 'autos', 'integ', 'kp', 'platform', 'brand', 'docCfg']);
  const labelOf = coll => C[coll] || [coll.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), coll.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), 'Other'];
  const FIELD = { dept:'Department', empId:'Employee ID', roleId:'Role', desc:'Description', mins:'Duration (minutes)', catId:'Category', subId:'Sub category', aud:'Audience',
    availFrom:'Available from', availUntil:'Available until', doj:'Date of joining', wfo:'Work mode', site:'Location', ackV:'Acknowledged version', cur:'Current version', pass:'Pass mark' };
  const words = k => FIELD[k] || String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, ch => ch.toUpperCase());
  const short = v => v === null || v === undefined || v === '' ? '(empty)' : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
    : typeof v === 'number' ? String(v) : typeof v === 'string' ? (v.length > 40 ? v.slice(0, 39) + '…' : v)
    : Array.isArray(v) ? v.length + (v.length === 1 ? ' item' : ' items') : '(updated)';
  const nameField = o => o && typeof o === 'object' ? (o.title || o.name || o.text || o.q || o.label || '') : '';
  const HIDE = new Set(['updated', 'updatedAt', 'version', 'by', 'ownerEmp', 'src', 'uid', '_dir', 'id', 'code']);

  function make(s) {
    const users = s.users || [], byEmp = new Map(users.map(u => [String(u.empId || ''), u])), byId = new Map(users.map(u => [String(u.id), u]));
    const find = (list, key) => (list || []).find(x => String(x.id != null ? x.id : x.code || x.k || x.name) === String(key));
    const person = key => { const k = String(key || ''); const u = byEmp.get(k) || byId.get(k) || (k.startsWith('me-') ? byEmp.get(k.slice(3)) : null); return u ? u.name : ''; };
    const courseName = id => { const c = find(s.adminCourses, id) || (typeof COURSES !== 'undefined' ? COURSES.find(x => x.id === id) : null); return c ? c.title : 'a course'; };
    const docName = id => { const d = find(s.docs, id); return d ? d.title : 'a document'; };
    const recName = (coll, key, ch) => {
      if (coll === 'users') return person(key) || nameField(after(ch)) || nameField(before(ch)) || '';
      if (coll === 'qs') { const q = find(s.qs, key); const t = q ? (q.text || q.q || q.t || '') : ''; return t ? short(t) : ''; }
      const rec = find(s[coll], key); return nameField(rec) || nameField(after(ch)) || nameField(before(ch)) || '';
    };
    // changes = { field: [before, after] } (top-level fields of the record)
    const before = ch => { if (!ch || typeof ch !== 'object') return null; const o = {}; for (const k in ch) if (Array.isArray(ch[k])) o[k] = ch[k][0]; return o; };
    const after = ch => { if (!ch || typeof ch !== 'object') return null; const o = {}; for (const k in ch) if (Array.isArray(ch[k])) o[k] = ch[k][1]; return o; };
    const fieldList = ch => !ch || ch.truncated ? [] : Object.keys(ch).filter(k => !HIDE.has(k) && Array.isArray(ch[k]))
      .map(k => words(k) + ': ' + short(ch[k][0]) + ' → ' + short(ch[k][1]));

    function one(a) {
      const [sing, , area] = labelOf(a.coll), ch = a.changes, op = a.op, owner = PERSON.has(a.coll) ? person(a.key) : '';
      const actor = a.who && a.who !== 'System' ? a.who : '', who = actor || owner || 'System', auto = !actor;
      let text = '', details = [];
      if (a.coll === 'loginLog') {
        const by = ch && ch.by ? ch.by : null, b0 = (by && by[0]) || {}, b1 = (by && by[1]) || {};
        const m = Object.keys(b1).find(k => (b1[k] || 0) > (b0[k] || 0));
        text = 'Signed in' + (m === 'email' ? ' with email' : m === 'emp' ? ' with employee ID' : '');
      } else if (a.coll === 'docAck') {
        const ks = ch ? Object.keys(ch) : [];
        const acts = ks.map(id => { const [b, n] = ch[id] || [], t = '“' + docName(id) + '”';
          if (n && n.ackAt && !(b && b.ackAt)) return 'Acknowledged ' + t + (n.ackV ? ' (version ' + n.ackV + ')' : '');
          if (n && !b) return 'Opened ' + t; if (n) return 'Opened ' + t + ' again'; return 'Record cleared for ' + t; });
        text = acts[0] || 'Document record updated'; details = acts.slice(1);
      } else if (a.coll === 'enroll') {
        const ks = ch ? Object.keys(ch) : [], add = ks.filter(id => ch[id][1] && !ch[id][0]), rem = ks.filter(id => !ch[id][1] && ch[id][0]);
        const to = owner ? ' to ' + owner : '', from = owner ? ' from ' + owner : '';
        text = add.length ? 'Assigned ' + (add.length === 1 ? '“' + courseName(add[0]) + '”' : add.length + ' courses') + to
          : rem.length ? 'Removed ' + (rem.length === 1 ? '“' + courseName(rem[0]) + '”' : rem.length + ' courses') + from : 'Updated course assignments' + (owner ? ' for ' + owner : '');
        details = add.length > 1 ? add.map(courseName) : rem.length > 1 ? rem.map(courseName) : [];
        if (actor && owner === actor) text = text.replace(' to ' + owner, ' to themselves');
      } else if (['itemDone', 'itemQuiz', 'attemptsUsed', 'bookmarks', 'surveyResp'].includes(a.coll)) {
        const ks = ch ? Object.keys(ch) : [], cn = ks.length === 1 ? '“' + courseName(ks[0]) + '”' : ks.length + ' courses';
        text = { itemDone:'Made progress in ', itemQuiz:'Answered an assessment in ', attemptsUsed:'Used an assessment attempt in ', bookmarks:'SCORM position saved in ', surveyResp:'Submitted a survey in ' }[a.coll] + cn;
      } else if (SETTING.has(a.coll)) {
        text = (op === 'delete' ? 'Reset ' : 'Changed ') + sing; details = fieldList(ch).map(f => f.replace(/: \(updated\) → \(updated\)$/, ' updated'));
      } else {
        const nm = recName(a.coll, a.key, ch), q = nm ? ' “' + nm + '”' : '';
        text = (op === 'insert' ? 'Added ' : op === 'delete' ? 'Deleted ' : 'Changed ') + sing + q;
        if (op === 'update') { details = fieldList(ch);
          if (details.length) text += ': ' + details[0].replace(': ', ' ').replace(' → ', ' changed to ') + (details.length > 1 ? ' (and ' + (details.length - 1) + ' more)' : ''); }
      }
      return { t: a.at, who, auto, area, text, details, coll: a.coll, op, key: a.key, version: a.version, name: '' };
    }

    // one burst = same person, same action on the same kind of record, within 2 minutes (e.g. the starting data)
    function group(rows) {
      const out = [];
      for (const r of rows) {
        const last = out[out.length - 1];
        const same = last && last.who === r.who && last.op === r.op && last.coll === r.coll && !['loginLog', 'docAck', 'enroll'].includes(r.coll)
          && Math.abs(new Date(last.t0) - new Date(r.t)) < 120000 && r.op !== 'update';
        if (same) { last.items.push(r); continue; }
        out.push({ ...r, t0: r.t, items: [r] });
      }
      return out.map(g => {
        if (g.items.length < 3) return g.items.map(x => ({ ...x, count: 1 }));
        const [, plural] = labelOf(g.coll), names = g.items.map(x => (x.text.match(/“(.*)”/) || [])[1]).filter(Boolean);
        return [{ ...g, count: g.items.length, text: (g.op === 'insert' ? 'Added ' : 'Deleted ') + g.items.length + ' ' + plural, details: names.length ? [names.join(', ')] : [] }];
      }).flat();
    }

    return { one, group, AREAS };
  }
  return { make, AREAS };
})();
