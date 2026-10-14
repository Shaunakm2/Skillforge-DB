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
    dbEmpty: Backend.on && !!s.beEmpty, dbBusy: !!s.dbSeeding, dbSeedLabel: s.dbSeeding ? 'Saving ' + s.dbSeeding + '…' : 'Start with an empty organisation',
    dbRows: rows.length.toLocaleString('en-US'), dbFiles: files.length,
    dbCounts: Object.keys(LBL).filter(k => by[k]).map(k => ({ l: LBL[k], v: by[k].toLocaleString('en-US') })),
    // v41.19: remove the sample organisation (courses, people, modules, questions, batches, records…) from the database
    dbSampleOpen: !!s.dbSample, dbSample: { line:'', ...(s.dbSample || {}), list: ((s.dbSample || {}).list) || [] }, dbSampleBusy: !!(s.dbSample && s.dbSample.busy),
    dbSampleFind: () => { if (!Backend.on || !this._sample) return this.toastMsg('Sign in as an admin with Supabase connected first');
      this.setState({ dbSample: { busy:true, line:'Looking for sample data…' } });
      Backend.sampleRows(this._sample).then(items => { const by = {}; items.forEach(i => { by[i.coll] = (by[i.coll] || 0) + 1; });
        const L2 = { ...LBL, threads:'Discussions', anns:'Announcements', docs:'Documents', places:'Training venues', paths:'Learning paths', groups:'Groups', reviews:'Written answers to rate', attemptLog:'Attempt changes', bmLog:'Bookmark changes', extHistory:'Imported history', asgSub:'Assignment submissions', itemQuiz:'Quiz records (per person)', attemptsUsed:'Attempts used (per person)', extraAttempts:'Extra attempts (per person)', bookmarks:'SCORM bookmarks (per person)', surveyResp:'Survey answers (per person)', prefs:'Preferences (per person)', docAck:'Document acknowledgements (per person)', loginLog:'Sign-in records (per person)' };
        this.setState({ dbSample: { items, list: Object.keys(by).map(k => ({ l: L2[k] || k, v: by[k].toLocaleString('en-US') })), line: items.length ? items.length.toLocaleString('en-US') + ' sample records found. You, everyone with a login, and anything you created are kept.' : 'No sample data left in the database.' } }); })
        .catch(e => this.setState({ dbSample: { line: 'Could not check: ' + e.message } })); },
    dbSampleHas: !!(s.dbSample && s.dbSample.items && s.dbSample.items.length),
    dbSampleClose: () => this.setState({ dbSample:null }),
    dbSampleDelete: () => { const items = (s.dbSample || {}).items || []; if (!items.length) return;
      if (!window.confirm('Delete ' + items.length.toLocaleString('en-US') + ' sample records from the database? This cannot be undone (download a backup first if unsure).')) return;
      this.setState({ dbSample: { ...s.dbSample, busy:true, line:'Deleting…' } });
      Backend.purge(items, (n, t) => this.setState(st => ({ dbSample: { ...(st.dbSample || {}), line:'Deleting… ' + Math.round(n / t * 100) + '%' } })))
        .then(r => { this.setState({ dbSample: { line: r.removed.toLocaleString('en-US') + ' sample records deleted' + (r.refused ? ' · ' + r.refused + ' refused' : '') + '.' } }); this.logAudit('Deleted sample data', r.removed + ' records'); this.toastMsg('Sample data deleted'); })
        .catch(e => this.setState(st => ({ dbSample: { ...(st.dbSample || {}), busy:false, line:'Stopped: ' + e.message + '. Select Delete again to continue.' } }))); },
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
