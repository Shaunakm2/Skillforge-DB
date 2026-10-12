/* Skillforge LMS — Course assignment (admin and super admin).
 * Pick a course, then assign or unassign it for one person or many at once.
 * Assignments live in state.enroll: { userName: { courseId: dueDateKey } }.
 * "+ Assign" opens a pop-up: Single (course search + user search) or Bulk upload (CSV template → import →
 * result with a downloadable file of rejected rows and reasons).
 *
 * Assessment attempt management: give a user extra attempts on one assessment in a course.
 * Extra attempts live in state.extraAttempts: { userName: { quizId: n } }; every grant is logged.
 *
 * Adds SkillforgeApp.prototype.assignVals() and .attemptVals(), merged into renderVals() by app.js.
 */
const USER_PARAMS = [['empId', 'Employee ID'], ['email', 'Username (email)'], ['name', 'Full name']];
const PARAM_LABEL = Object.fromEntries(USER_PARAMS);

/* Search-as-you-type pickers shared by both screens. q = text typed, sel = chosen id. */
const pickUser = (app, s, key, users) => {
  const st = s[key] || {}, param = st.param || 'empId', q = (st.q || '').trim().toLowerCase();
  const chosen = users.find(u => u.id === st.sel) || null;
  const set = patch => app.setState(x => ({ [key]: { ...(x[key] || {}), ...patch, msg:null } }));
  const all = !q || (chosen && (chosen[param] || '').toLowerCase() === q) ? [] : users.filter(u => (u[param] || '').toLowerCase().includes(q)), hits = all.slice(0, 8);
  return { param, q: st.q || '', chosen, hits,
    paramOpts: USER_PARAMS.map(([v, l]) => ({ v, l })), setParam: e => set({ param: e.target.value, q:'', sel:null }),
    placeholder: 'Type ' + PARAM_LABEL[param].toLowerCase() + ' to search',
    setQ: e => set({ q: e.target.value, sel:null }),
    rows: hits.map(u => ({ main: u[param], sub: [u.name, u.empId, u.email, u.dept].filter((v, i, a) => v && v !== u[param] && a.indexOf(v) === i).join(' · '), pick: () => set({ q: u[param], sel: u.id }) })),
    none: !!q && !chosen && !hits.length, noneText: 'No matching user', more: all.length > 8 ? '+' + (all.length - 8) + ' more, keep typing to narrow down' : '',
    card: chosen ? [['Name', chosen.name], ['Employee ID', chosen.empId], ['Username (email)', chosen.email], ['Department', chosen.dept], ['User type', chosen.role], ['Manager', chosen.manager]].map(([l, v]) => ({ l, v: v || '—' })) : [],
    clear: () => set({ q:'', sel:null }) };
};
const pickCourse = (app, s, key, courses) => {
  const st = s[key] || {}, q = (st.cq || '').trim().toLowerCase(), label = c => c.code + ' · ' + c.title;
  const chosen = courses.find(c => c.id === st.course) || null;
  const set = patch => app.setState(x => ({ [key]: { ...(x[key] || {}), ...patch, msg:null } }));
  const hits = !q || (chosen && label(chosen).toLowerCase() === q) ? [] : courses.filter(c => (c.code + ' ' + c.title).toLowerCase().includes(q)).slice(0, 8);
  return { cq: st.cq || '', chosen, setQ: e => set({ cq: e.target.value, course:null, quiz:null }),
    rows: hits.map(c => ({ main: c.title, sub: c.code + ' · ' + c.cat + ' · ' + availability(c), pick: () => set({ cq: label(c), course: c.id, quiz:null }) })),
    none: !!q && !chosen && !hits.length, noneText: 'No matching course', clear: () => set({ cq:'', course:null, quiz:null }) };
};
/* Bulk file follows the Northwind CourseApplicability template: CourseCode, UserId, AssignmentType.
   AssignmentType = Assign or Unassign (blank = Assign). Optional DueDate column (YYYY-MM-DD or DD-MM-YYYY). */
const BULK_HEAD = ['CourseCode', 'UserId', 'AssignmentType', 'DueDate'];
SkillforgeApp.prototype.assignVals = function (s, role) {
  if (this._scrV !== 'assignments') return { isAssign:false, caModal:false };
  const app = this;
  const W = '#FFFFFF', INK = '#16324F';
  const chip = (cur, v, label, pick) => { const on = cur === v; return { label, bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick }; };
  const fmtD = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
  const courses = s.adminCourses.filter(c => c.status === 'Published').slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  const course = courses.find(c => c.id === s.caCourse) || courses[0];
  const cid = course ? course.id : null;
  const has = u => !!cid && !!(s.enroll[u.name] || {})[cid];
  const people = s.users.filter(u => u.status !== 'Deactivated');
  const q = s.caQuery.trim().toLowerCase();
  const rows = people.filter(u => (s.caDept === 'All' || u.dept === s.caDept) && (s.caRole === 'All' || u.role === s.caRole) && (s.caShow === 'All' || (s.caShow === 'Assigned' ? has(u) : !has(u)))
    && (!q || (u.name + ' ' + u.email + ' ' + (u.empId || '') + ' ' + u.dept).toLowerCase().includes(q)));
  const sel = rows.filter(u => s.caSel[u.id]);
  const CPG = Pager(this, s, 'ca-' + (cid || ''), rows, 50);
  const nAssigned = people.filter(has).length; // has() is a direct lookup in s.enroll
  const setEnroll = (names, due) => this.setState(st => { const e = { ...st.enroll }; const on = { ...st.assignedOn }; names.forEach(n => { const m = { ...(e[n] || {}) }; if (due === null) delete m[cid]; else { if (!m[cid]) on[n + '|' + cid] = TODAY_KEY; m[cid] = due; } e[n] = m; }); return { assignedOn: on, enroll: e }; });
  const validDue = () => { if (!s.caDue) { this.toastMsg('Pick a due date'); return false; } if (s.caDue < TODAY_KEY) { this.toastMsg('The due date is in the past'); return false; } return true; };
  const allOn = rows.length > 0 && rows.every(u => s.caSel[u.id]);
  const AVC = { Learner:['#EAF1F6', '#334E68'], Trainer:['#CCFBF1', '#115E59'], Admin:['#EDE9FE', '#5B21B6'], 'Super admin':['#16324F', '#F8FBFD'] };
  // ---- "+ Assign" pop-up ----
  let modal = { caModal:false };
  if (s.caM) {
    const M = s.caM, setM = patch => this.setState(x => ({ caM: { ...x.caM, ...patch } }));
    const active = s.users.filter(u => u.status !== 'Deactivated');
    const cp = pickCourse(this, s, 'caM', courses), up = pickUser(this, s, 'caM', active);
    const dueOk = realDate;
    const B = M.bulk || {};
    modal = {
      caModal: true, caTabs: [['single', 'Assign'], ['unassign', 'Unassign'], ['bulk', 'Bulk upload']].map(([k, l]) => chip(M.tab, k, l, () => setM({ tab:k, msg:null }))),
      caSingle: M.tab === 'single', caBulk: M.tab === 'bulk', caUn: M.tab === 'unassign',
      // Unassign: pick a person, see every course assigned to them with progress, tick and remove.
      unRows: M.tab === 'unassign' && up.chosen ? Progress.myCourses(s, up.chosen.name).filter(x => (s.enroll[up.chosen.name] || {})[x.a.id]).sort((x, y) => x.a.title.localeCompare(y.a.title)).map(x => { const on = !!(M.unSel || {})[x.a.id];
        return { code: x.a.code, title: x.a.title, due: fmtD(x.d.due), pct: x.d.pct + '%', status: x.d.status, warn: x.d.pct > 0 && x.d.pct < 100, sel: !!on, tick: on ? '✓' : '', bg: on ? INK : W, bd: on ? INK : '#BFCFDB',
          toggle: () => setM({ unSel: { ...(M.unSel || {}), [x.a.id]: !on }, msg:null }) }; }) : [],
      unHasUser: M.tab === 'unassign' && !!up.chosen, unCount: Object.values(M.unSel || {}).filter(Boolean).length,
      unNone: M.tab === 'unassign' && !!up.chosen && !Object.keys(s.enroll[up.chosen.name] || {}).length,
      caUnassignSel: () => { const ids = Object.keys(M.unSel || {}).filter(k => M.unSel[k]); if (!up.chosen) return setM({ msg:{ ok:false, text:'Search for the person first.' } }); if (!ids.length) return setM({ msg:{ ok:false, text:'Tick the courses to remove.' } });
        const nm = up.chosen.name, started = ids.filter(id => { const a = Progress.courseOf(s, id); return a && Progress.detail(s, nm, a).pct > 0; }).length;
        this.setState(st => { const m = { ...(st.enroll[nm] || {}) }; ids.forEach(id => delete m[id]); return { enroll: { ...st.enroll, [nm]: m }, caM: { ...st.caM, unSel:{}, msg:{ ok:true, text: ids.length + (ids.length === 1 ? ' course' : ' courses') + ' unassigned from ' + nm + '.' + (started ? ' Progress on ' + started + ' is kept if it is assigned again.' : '') } } }; }); }, closeCaM: () => this.setState({ caM:null }),
      caMsg: M.msg ? M.msg.text : '', caMsgOk: !!M.msg && M.msg.ok, caMsgErr: !!M.msg && !M.msg.ok,
      cp, up, caMDue: M.due, setCaMDue: e => setM({ due: e.target.value, msg:null }),
      caAlready: cp.chosen && up.chosen && (s.enroll[up.chosen.name] || {})[cp.chosen.id] ? up.chosen.name + ' already has this course, due ' + fmtD(s.enroll[up.chosen.name][cp.chosen.id]) + '.' : '',
      caAssignOne: () => {
        const fail = t => setM({ msg:{ ok:false, text:t } });
        if (!cp.chosen) return fail('Search for a course and pick it from the list.');
        if (!up.chosen) return fail('Search for a user and pick them from the list.');
        if (!dueOk(M.due)) return fail('Enter a due date.');
        if (M.due < TODAY_KEY) return fail('The due date is in the past.');
        if ((s.enroll[up.chosen.name] || {})[cp.chosen.id]) return fail(up.chosen.name + ' already has ' + cp.chosen.title + '.');
        setEnrollFor(up.chosen.name, cp.chosen.id, M.due);
        this.setState(x => ({ caM: { ...x.caM, q:'', sel:null, msg:{ ok:true, text:'Assigned: 1 user, 1 course. ' + up.chosen.name + ' now has ' + cp.chosen.title + ', due ' + fmtD(M.due) + '.' } } }));
      },
      // bulk
      caTemplate: () => { const ex = s.adminCourses.filter(c => c.status === 'Published').slice(0, 2), us = active.filter(u => u.role === 'Learner').slice(0, 3);
        // v41.5: works with fewer than 2 published courses / 3 learners (new database): sample codes fill the gaps
        const cc = i => (ex[i] || ex[0] || { code:'CRS-0001' }).code, ee = i => (us[i] || us[0] || { empId:'EMP-0001' }).empId;
        const rows = [BULK_HEAD, [cc(0), ee(0), 'Assign', Progress.plus(TODAY_KEY, 30)], [cc(1), ee(1), 'Assign', ''], [cc(0), ee(2), 'Unassign', '']];
        csvDownload('CourseApplicability-Import.csv', rows); this.toastMsg('Template downloaded'); },
      caFileName: B.name || '', caHasFile: !!B.text, caNoFile: !B.text,
      caPickFile: e => { const f = e.target.files && e.target.files[0]; if (!f) return;
        if (!/\.csv$/i.test(f.name)) { e.target.value = ''; return setM({ bulk:{}, msg:{ ok:false, text:'Upload a .csv file. In Excel, use File › Save As › CSV.' } }); }
        f.text().then(t => this.setState(x => ({ caM: { ...x.caM, bulk:{ name: f.name, text: t }, result:null, msg:null } }))); },
      caImport: () => {
        if (!B.text) return setM({ msg:{ ok:false, text:'Choose a file first.' } });
        const rows = parseCsv(B.text); if (!rows.length) return setM({ msg:{ ok:false, text:'The file is empty.' } });
        const head = rows[0].map(h => h.replace(/\*/g, '').replace(/[\s_]/g, '').toLowerCase()), col = (...n) => head.findIndex(h => n.includes(h));
        const iC = col('coursecode'), iU = col('userid', 'employeeid', 'empid'), iT = col('assignmenttype', 'type', 'action'), iD = col('duedate', 'due');
        if (iC < 0 || iU < 0) return setM({ msg:{ ok:false, text:'The header row must include CourseCode and UserId (AssignmentType and DueDate are optional). Download the template to see the format.' } });
        if (rows.length === 1) return setM({ msg:{ ok:false, text:'The file has a header row but no data rows.' } });
        // Indexes so a 10,000-row file checks in a blink.
        const cBy = new Map(s.adminCourses.map(x => [(x.code || '').toLowerCase(), x])), uBy = new Map(s.users.map(u => [String(u.empId || '').toLowerCase(), u])), uMail = new Map(s.users.map(u => [u.email.toLowerCase(), u]));
        const newOn = {}, enroll = { ...s.enroll }, touched = new Set(), seen = {}, ok = [], un = [], bad = [];
        const mine = n => { if (!touched.has(n)) { enroll[n] = { ...(enroll[n] || {}) }; touched.add(n); } return enroll[n]; };
        rows.slice(1).forEach((r, i) => {
          const n = i + 2, g = k => k < 0 ? '' : (r[k] || '').trim(), code = g(iC), uid = g(iU), typeRaw = g(iT), due0 = g(iD), rej = why => bad.push({ n, code, emp: uid, type: typeRaw, due: due0, why });
          const type = !typeRaw ? 'Assign' : /^(assign|add|a)$/i.test(typeRaw) ? 'Assign' : /^(unassign|remove|delete|u|r)$/i.test(typeRaw) ? 'Unassign' : null;
          if (!code) return rej('CourseCode is missing'); if (!uid) return rej('UserId is missing');
          if (!type) return rej('AssignmentType must be Assign or Unassign');
          const c = cBy.get(code.toLowerCase()); if (!c) return rej('No course with code ' + code);
          const u = uBy.get(uid.toLowerCase()) || uMail.get(uid.toLowerCase()); if (!u) return rej('No user with UserId ' + uid);
          const k = u.id + '|' + c.id; if (seen[k]) return rej('Duplicate of row ' + seen[k]); seen[k] = n;
          if (type === 'Unassign') { if (!(enroll[u.name] || {})[c.id]) return rej(u.name + ' does not have ' + c.code); const m = mine(u.name); delete m[c.id]; un.push({ u: u.name, c: c.id }); return; }
          if (c.status !== 'Published') return rej(c.code + ' is a draft. Publish it first');
          if (u.status === 'Deactivated') return rej(u.name + ' is deactivated');
          let due = due0 || M.due; if (due0) { const m2 = due0.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m2) due = umReal(m2[3], m2[2], m2[1]) || 'bad'; else if (/^\d{4}-\d{2}-\d{2}$/.test(due0)) due = umReal(...due0.split('-')) || 'bad'; }
          if (!dueOk(due)) return rej('DueDate must be YYYY-MM-DD or DD-MM-YYYY');
          if (due < TODAY_KEY) return rej('DueDate ' + due + ' is in the past');
          if ((enroll[u.name] || {})[c.id]) return rej(u.name + ' already has ' + c.code + ' (due ' + enroll[u.name][c.id] + ')');
          mine(u.name)[c.id] = due; ok.push({ u: u.name, c: c.id }); newOn[u.name + '|' + c.id] = TODAY_KEY;
        });
        const nu = new Set(ok.map(x => x.u)).size, nc = new Set(ok.map(x => x.c)).size;
        this.setState(x => ({ enroll, assignedOn: { ...x.assignedOn, ...newOn }, caM: { ...x.caM, msg:null, result:{ total: rows.length - 1, ok: ok.length, un: un.length, nu, nc, bad } } }));
      },
      caResult: !!M.result, caRes: M.result ? { unLine: M.result.un ? M.result.un + (M.result.un === 1 ? ' assignment removed (Unassign rows).' : ' assignments removed (Unassign rows).') : '', hasUn: !!M.result.un, okLine: M.result.ok ? M.result.ok + (M.result.ok === 1 ? ' assignment made: ' : ' assignments made: ') + M.result.nu + (M.result.nu === 1 ? ' user' : ' users') + ' and ' + M.result.nc + (M.result.nc === 1 ? ' course' : ' courses') + ' assigned.' : 'Nothing was assigned.',
        hasOk: M.result.ok > 0, hasBad: M.result.bad.length > 0, badLine: M.result.bad.length + ' of ' + M.result.total + (M.result.total === 1 ? ' row' : ' rows') + ' not processed.',
        badRows: M.result.bad.slice(0, 5).map(x => ({ n: 'Row ' + x.n, why: x.why })), more: M.result.bad.length > 5 ? '+ ' + (M.result.bad.length - 5) + ' more in the download' : '' } : {},
      caDlRejects: () => { const R = M.result; csvDownload('rejected-assignments-' + TODAY_KEY + '.csv', [['Row', ...BULK_HEAD, 'Reason']].concat(R.bad.map(x => [x.n, x.code, x.emp, x.type, x.due, x.why]))); this.toastMsg(R.bad.length + ' rejected rows downloaded'); },
      caResetBulk: () => setM({ bulk:{}, result:null, msg:null }),
    };
  }
  function setEnrollFor(name, cid, due) { app.setState(st => ({ assignedOn: { ...st.assignedOn, [name + '|' + cid]: TODAY_KEY }, enroll: { ...st.enroll, [name]: { ...(st.enroll[name] || {}), [cid]: due } } })); }
  // Access requests from the catalog: approve (assigns the course) or decline, one at a time or in bulk.
  const RQ = s.accessReqs.filter(r => s.reqFilter === 'All' || r.status === s.reqFilter);
  const decide = (ids, ok2) => { const due = s.caDue >= TODAY_KEY ? s.caDue : Progress.plus(TODAY_KEY, +((s.platform || PLATFORM0).defaults.dueDays) || 30);
    if (Backend.on) { Promise.all(ids.map(id => Backend.call('decideRequest', { id, approve: ok2, due }))).then(() => { this.setState({ rqSel:{} }); this.toastMsg(ids.length + (ids.length === 1 ? ' request ' : ' requests ') + (ok2 ? 'approved' : 'declined')); }).catch(e => this.toastMsg(e.message)); return; }
    this.setState(st => { const enroll = { ...st.enroll }, on = { ...st.assignedOn };
      const reqs = st.accessReqs.map(r => { if (!ids.includes(r.id) || r.status !== 'Pending') return r; if (ok2) { enroll[r.user] = { ...(enroll[r.user] || {}), [r.courseId]: due }; on[r.user + '|' + r.courseId] = TODAY_KEY; } return { ...r, status: ok2 ? 'Approved' : 'Declined', by: role.name, decidedAt: nowStamp() }; });
      return { accessReqs: reqs, enroll, assignedOn: on, rqSel:{} }; });
    this.toastMsg(ids.length + (ids.length === 1 ? ' request ' : ' requests ') + (ok2 ? 'approved · course assigned, due ' + Fmt.medium(due) : 'declined')); };
  const rqSelIds = Object.keys(s.rqSel || {}).filter(k => s.rqSel[k]);
  const reqVals = {
    rqCount: s.accessReqs.filter(r => r.status === 'Pending').length, rqHas: s.accessReqs.length > 0,
    rqChips: ['Pending', 'Approved', 'Declined', 'All'].map(v => UI.chip(s.reqFilter, v, v + ' · ' + (v === 'All' ? s.accessReqs.length : s.accessReqs.filter(r => r.status === v).length), () => this.setState({ reqFilter: v, rqSel:{} }))),
    rqRows: RQ.slice(0, 50).map(r => { const on = !!(s.rqSel || {})[r.id], pend = r.status === 'Pending'; return { ...r, when: Fmt.dt(r.at), pend, on, sel: !!on, tick: on ? '✓' : '', bg: on ? INK : W, bd: on ? INK : '#BFCFDB',
      stBg: r.status === 'Approved' ? '#DCFCE7' : r.status === 'Declined' ? '#FDECEC' : '#FEF3C7', stFg: r.status === 'Approved' ? '#166534' : r.status === 'Declined' ? '#A63232' : '#92400E', byLine: r.by ? r.by + ' · ' + Fmt.dt(r.decidedAt) : '',
      pick: () => { if (!pend) return; this.setState(st => ({ rqSel: { ...(st.rqSel || {}), [r.id]: !on } })); }, approve: () => decide([r.id], true), decline: () => decide([r.id], false) }; }),
    rqEmpty: !RQ.length, rqSelN: rqSelIds.length, rqHasSel: rqSelIds.length > 0,
    rqApproveSel: () => decide(rqSelIds, true), rqDeclineSel: () => decide(rqSelIds, false),
  };
  return {
    ...modal, ...reqVals, openCaM: () => this.setState({ caM: { tab:'single', param:'empId', q:'', sel:null, cq:'', course:null, due: s.caDue, bulk:{}, result:null, msg:null } }),
    isAssign: true,
    caCourseOpts: courses.map(c => ({ v:c.id, l:c.code + ' · ' + c.title })), caCourseVal: cid || '', setCaCourse: e => this.setState({ caCourse: e.target.value, caSel:{}, caConfirm:false }),
    caCourseInfo: course ? [availability(course), (course.items.length) + (course.items.length === 1 ? ' module' : ' modules'), 'Assigned to ' + nAssigned + ' of ' + people.length + ' people'].join(' · ') : 'No published courses yet',
    caCourseInactive: !!course && availability(course) !== 'Active', caInactiveNote: course ? 'This course is ' + availability(course).toLowerCase() + '. People can be assigned now and will see it once it is live.' : '',
    caDue: s.caDue, setCaDue: e => this.setState({ caDue: e.target.value }),
    caQuery: s.caQuery, setCaQuery: e => this.setState({ caQuery: e.target.value }),
    caDeptOpts: [{ v:'All', l:'All departments' }].concat(deptList(s).map(d => ({ v:d, l:d }))), caDeptVal: s.caDept, setCaDept: e => this.setState({ caDept: e.target.value }),
    caRoleOpts: [{ v:'All', l:'All roles' }].concat(['Learner', 'Trainer', 'Admin'].map(r => ({ v:r, l:r }))), caRoleVal: s.caRole, setCaRole: e => this.setState({ caRole: e.target.value }),
    caShowChips: ['All', 'Assigned', 'Not assigned'].map(k => chip(s.caShow, k, k, () => this.setState({ caShow:k, caSel:{} }))),
    caPager: CPG.pager, caCountLabel: rows.length.toLocaleString('en-US') + ' people',
    caRows: CPG.rows.map((u, i) => { const on = !!s.caSel[u.id], h = has(u), due = h ? (s.enroll[u.name] || {})[cid] : '', n = Object.keys(s.enroll[u.name] || {}).length;
      return { name:u.name, sub:(u.empId || '') + ' · ' + u.email, dept:u.dept, role:u.role, roleBg: AVC[u.role][0], roleFg: AVC[u.role][1], initials: ini(u.name), av: AV[u.id % 5],
        sel: !!on, tick: on ? '✓' : '', bg: on ? INK : W, bd: on ? INK : '#BFCFDB', rowBg: on ? '#EDF5FA' : 'transparent',
        st: h ? 'Assigned · due ' + fmtD(due) : 'Not assigned', stBg: h ? '#DCFCE7' : '#EAF1F6', stFg: h ? '#166534' : '#526B7A', overdue: h && due < TODAY_KEY,
        total: n + (n === 1 ? ' course' : ' courses'), has: h, not: !h,
        pick: () => this.setState(st => ({ caSel: { ...st.caSel, [u.id]: !st.caSel[u.id] }, caConfirm:false })),
        assign: () => { if (!validDue()) return; setEnroll([u.name], s.caDue); this.toastMsg(course.title + ' assigned to ' + u.name.split(' ')[0] + ' · due ' + fmtD(s.caDue)); },
        unassign: () => { setEnroll([u.name], null); this.toastMsg(course.title + ' unassigned from ' + u.name.split(' ')[0]); },
        manage: () => this.setState({ enrModal: { user: u.name } }) }; }),
    caEmpty: rows.length === 0, caAll: { on: allOn, sel: !!allOn, tick: allOn ? '✓' : '', bg: allOn ? INK : W, bd: allOn ? INK : '#BFCFDB' },
    caToggleAll: () => this.setState({ caSel: allOn ? {} : Object.fromEntries(rows.map(u => [u.id, true])), caConfirm:false }),
    caSelCount: sel.length, caHasSel: sel.length > 0, caSelLabel: sel.length + (sel.length === 1 ? ' person selected' : ' people selected'),
    caBulkAssign: () => { if (!validDue()) return; const todo = sel.filter(u => !has(u)); setEnroll(todo.map(u => u.name), s.caDue); this.setState({ caSel:{} });
      this.toastMsg(course.title + ' assigned to ' + todo.length + (todo.length === 1 ? ' person' : ' people') + (sel.length - todo.length ? ' · ' + (sel.length - todo.length) + ' already had it (due dates kept)' : '')); },
    caAskUnassign: () => { if (!sel.some(has)) return this.toastMsg('None of the selected people have this course'); this.setState({ caConfirm:true }); },
    caConfirm: !!s.caConfirm, caConfirmText: 'Unassign ' + (course ? course.title : '') + ' from ' + sel.filter(has).length + ' of the selected people? Their progress is kept if you assign it again.',
    caCancelUnassign: () => this.setState({ caConfirm:false }),
    caBulkUnassign: () => { const todo = sel.filter(has); setEnroll(todo.map(u => u.name), null); this.setState({ caSel:{}, caConfirm:false }); this.toastMsg(course.title + ' unassigned from ' + todo.length + (todo.length === 1 ? ' person' : ' people')); },
    caClear: () => this.setState({ caSel:{}, caConfirm:false }),
    caExport: () => { if (!course || !course.id) return this.toastMsg('Pick a course first'); const rws = [['Course', (course.code || '') + ' · ' + course.title], [], ['Name', 'Employee ID', 'Email', 'Department', 'Role', 'Assigned', 'Due date']];
      rows.forEach(u => rws.push([u.name, u.empId || '', u.email, u.dept, u.role, has(u) ? 'Yes' : 'No', has(u) ? s.enroll[u.name][cid] : '']));
      csvDownload('skillforge-assignments-' + (course.code || 'course') + '-' + TODAY_KEY + '.csv', rws); this.toastMsg(rows.length + ' rows exported'); },
  };
};

SkillforgeApp.prototype.attemptVals = function (s, role) {
  if (this._scrV !== 'attempts') return { isAttempts:false };
  const me = role.name, myRole = role.admin ? 'Admin' : 'Trainer';
  const quizzesOf = c => c.items.filter(i => i.kind === 'quiz').map(i => s.quizzes.find(z => z.id === i.quizId)).filter((z, i, a) => z && a.indexOf(z) === i);
  const courses = s.adminCourses.filter(c => quizzesOf(c).length).slice().sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  const A = { param:'empId', q:'', sel:null, cq:'', course:null, quiz:null, n:1, reason:'', msg:null, ...(s.am || {}) };
  const setA = patch => this.setState(x => ({ am: { ...A, ...(x.am || {}), ...patch } }));
  const st = { ...s, am: A };
  const cp = pickCourse(this, st, 'am', courses), up = pickUser(this, st, 'am', s.users.filter(u => u.status !== 'Deactivated'));
  const qz = cp.chosen ? quizzesOf(cp.chosen) : [], quiz = qz.length === 1 ? qz[0] : qz.find(z => z.id === A.quiz) || null;
  const info = quiz && up.chosen ? Assessment.attemptsInfo(quiz, (s.attemptsUsed[up.chosen.name] || {})[quiz.id], (s.extraAttempts[up.chosen.name] || {})[quiz.id]) : null;
  const fmtT = t => { const d = new Date(t); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); };
  const lq = (s.alQuery || '').trim().toLowerCase();
  const log = s.attemptLog.filter(l => !lq || (l.user + ' ' + l.course + ' ' + l.courseCode + ' ' + l.quiz + ' ' + l.by).toLowerCase().includes(lq));
  return {
    isAttempts: true, am: A, amCp: cp, amUp: up,
    amQuizOpts: [{ v:'', l: qz.length > 1 ? 'Choose an assessment…' : 'No assessments' }].concat(qz.map(z => ({ v: String(z.id), l: z.name + ' · ' + (z.attempts === 'Unlimited' ? 'unlimited' : z.attempts) + ' attempts allowed' }))),
    amQuizVal: quiz ? String(quiz.id) : '', amMulti: qz.length > 1, amOne: qz.length === 1, amOneName: qz.length === 1 ? qz[0].name : '', amCourseNote: cp.chosen ? qz.length + (qz.length === 1 ? ' assessment' : ' assessments') + ' in this course' : '',
    setAmQuiz: e => setA({ quiz: Number(e.target.value) || null, msg:null }),
    amHasInfo: !!info, amInfo: info ? [['Allowed', info.unlimited ? 'Unlimited' : info.base + (info.extra ? ' + ' + info.extra + ' extra' : '')], ['Used', info.used], ['Left', info.unlimited ? '—' : info.left]].map(([l, v]) => ({ l, v })) : [],
    amUnlimited: !!info && info.unlimited, amNotAssigned: !!(cp.chosen && up.chosen && !(s.enroll[up.chosen.name] || {})[cp.chosen.id]),
    amNotAssignedNote: cp.chosen && up.chosen ? up.chosen.name + ' isn’t assigned to ' + cp.chosen.title + '. The attempts will be ready if they start it.' : '',
    setAmN: e => setA({ n: e.target.value === '' ? '' : parseInt(e.target.value, 10), msg:null }), setAmReason: e => setA({ reason: e.target.value, msg:null }),
    amMsg: A.msg ? A.msg.text : '', amOk: !!A.msg && A.msg.ok, amErr: !!A.msg && !A.msg.ok,
    amAssign: () => {
      const fail = t => setA({ msg:{ ok:false, text:t } });
      if (!cp.chosen) return fail('Search for a course by code or name and pick it from the list.');
      if (!quiz) return fail('Choose which assessment gets the extra attempts.');
      if (!up.chosen) return fail('Search for the user and pick them from the list.');
      if (info.unlimited) return fail(quiz.name + ' already allows unlimited attempts.');
      if (!(A.n >= 1 && A.n <= 10)) return fail('Give between 1 and 10 extra attempts.');
      const u = up.chosen.name, n = A.n, left = info.left + n;
      this.setState(x => ({ extraAttempts: { ...x.extraAttempts, [u]: { ...(x.extraAttempts[u] || {}), [quiz.id]: ((x.extraAttempts[u] || {})[quiz.id] || 0) + n } },
        attemptLog: [{ id:'al' + Date.now(), at: new Date().toISOString(), by: me, role: myRole, user: u, course: cp.chosen.title, courseCode: cp.chosen.code, quiz: quiz.name, n, reason: (A.reason || '').trim() }].concat(x.attemptLog),
        am: { ...A, ...(x.am || {}), q:'', sel:null, n:1, reason:'', msg:{ ok:true, text: n + (n === 1 ? ' extra attempt' : ' extra attempts') + ' given to ' + u + ' for ' + quiz.name + ' (' + cp.chosen.code + '). They now have ' + left + (left === 1 ? ' attempt' : ' attempts') + ' left.' } } }));
    },
    amReset: () => this.setState({ am:null }),
    alRows: log.map(l => ({ ...l, when: fmtT(l.at), plus: '+' + l.n, reasonLabel: l.reason || '—' })), alEmpty: !log.length, alQuery: s.alQuery || '', setAlQuery: e => this.setState({ alQuery: e.target.value }),
    alExport: () => { csvDownload('extra-attempts-' + TODAY_KEY + '.csv', [['When', 'Given by', 'Role', 'User', 'Course code', 'Course', 'Assessment', 'Extra attempts', 'Reason']].concat(log.map(l => [l.at.replace('T', ' ').slice(0, 16), l.by, l.role, l.user, l.courseCode, l.course, l.quiz, l.n, l.reason]))); this.toastMsg(log.length + ' rows exported'); },
  };
};
