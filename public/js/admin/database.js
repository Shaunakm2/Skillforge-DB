/* Skillforge LMS — Settings › Platform › Database & storage.
 * Shows whether the app is connected to Supabase, what is stored, and lets an admin load the sample data into an
 * empty database or download a full backup (JSON). Setup steps are in SETUP-SUPABASE.md. */
SkillforgeApp.prototype.amDatabase = function (c) {
  const { s } = c;
  if (this._scrV !== 'database') return { isDatabase:false };
  const st = s.beStatus || Backend.status(), rows = Backend.rowsOf(s), by = {};
  rows.forEach(r => { by[r.coll] = (by[r.coll] || 0) + 1; });
  const LBL = { users:'People', adminCourses:'Courses', lcms:'LCMS modules', qs:'Questions', quizzes:'Assessments', batches:'Batches', enroll:'Assignments (per person)', itemDone:'Learning records (per person)',
    assignedOn:'Assignment dates (per person)', accessReqs:'Access requests', fbLog:'Feedback requests', attemptRecs:'Assessment attempts', syncLog:'HR change log', masters:'Master data', dash:'Dashboards' };
  const files = []; const walk = v => { if (!v || typeof v !== 'object') return; if (v.path && 'src' in v) files.push(v); for (const k in v) walk(v[k]); }; ['lcms', 'adminCourses', 'certTpl', 'qs'].forEach(k => walk(s[k]));
  return {
    isDatabase:true, dbOn: Backend.on, dbOff: !Backend.on, dbOk: !!st.ok, dbStatus: st.text, dbAt: st.at || '', dbOrg: Backend.org, dbBucket: Backend.BUCKET,
    dbEmpty: Backend.on && !!s.beEmpty, dbBusy: !!s.dbSeeding, dbSeedLabel: s.dbSeeding ? 'Saving ' + s.dbSeeding + '…' : 'Save the data shown in the app to the database',
    dbRows: rows.length.toLocaleString('en-US'), dbFiles: files.length,
    dbCounts: Object.keys(LBL).filter(k => by[k]).map(k => ({ l: LBL[k], v: by[k].toLocaleString('en-US') })),
    dbSeedFull: () => { if (!Backend.on) return; const d = ScaleData.build(this.state); this.setState({ ...d }); this.toastMsg('Full sample organisation prepared (' + d.stats.users.toLocaleString('en-US') + ' people). Now save it.'); },
    dbSeed: () => { if (!Backend.on) return this.toastMsg('Connect Supabase first (js/config.js)');
      this.setState({ dbSeeding: '0%' });
      Backend.seed(this.state, (n, t) => this.setState({ dbSeeding: Math.round(n / t * 100) + '%' }))
        .then(n => { this.setState({ dbSeeding:null }); this.toastMsg(n.toLocaleString('en-US') + ' records saved to Supabase'); })
        .catch(e => { this.setState({ dbSeeding:null }); this.toastMsg('Could not save: ' + e.message); }); },
    // Logins for everyone in the people list who doesn't have one yet (e.g. after loading sample or migrated data).
    dbLoginsBusy: !!s.dbLogins && !!s.dbLogins.busy, dbLoginsDone: !!(s.dbLogins && s.dbLogins.created), dbLoginsLine: s.dbLogins && s.dbLogins.created ? s.dbLogins.created.length + ' logins created · ' + s.dbLogins.skipped.length + ' skipped. Download the temporary passwords now: they are not shown again.' : '',
    dbLoginsErr: (s.dbLogins && s.dbLogins.error) || '',
    dbCreateLogins: () => { if (!Backend.on) return; this.setState({ dbLogins: { busy:true } });
      Backend.membersWithLogin().then(have => { const todo = s.users.filter(u => !u._dir && u.status !== 'Deactivated' && u.empId && u.email && !have.has(String(u.empId).toUpperCase()));
        if (!todo.length) { this.setState({ dbLogins: { created:[], skipped:[] } }); return; }
        return Backend.createLogins(todo.map(u => ({ email: u.email, empId: u.empId, name: u.name, role: u.role, roleId: u.roleId, userKey: String(u.id) }))).then(r => this.setState({ dbLogins: r })); })
      .catch(e => this.setState({ dbLogins: { error: e.message } })); },
    dbLoginsCsv: () => { const L = s.dbLogins; csvDownload('temporary-passwords-' + TODAY_KEY + '.csv', [['Email', 'Employee ID', 'Temporary password', 'Note']].concat(L.created.map(x => [x.email, x.empId, x.tempPassword, 'Must be changed at first sign-in'])).concat(L.skipped.map(x => [x.email, '', '', 'Skipped: ' + x.reason]))); },
    dbIsAdmin: Backend.on && (Backend.me() || {}).role === 'Admin',
    dbBackup: () => { const data = JSON.stringify({ org: Backend.org, exportedAt: new Date().toISOString(), rows: rows.map(r => ({ coll: r.coll, key: r.key, data: r.data })) });
      const url = URL.createObjectURL(new Blob([data], { type:'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'skillforge-backup-' + TODAY_KEY + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.toastMsg('Backup downloaded · ' + rows.length.toLocaleString('en-US') + ' records'); },
  };
};
