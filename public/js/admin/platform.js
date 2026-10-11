/* Skillforge LMS — notifications, automations, integrations, audit log, user types and branding. */
SkillforgeApp.prototype.amPlatform = function (c) {
  const { INK, W, s, tg } = c;
  // notifications + learner extras
  const NK = { due:'#D64545', reply:'#007A4D', cert:'#0066A1', assign:'#8C5A9E' };
  // v36: audit log source. Connected: the database trail (read once per visit to the screen); offline: sample + this session.
  if (Backend.on && this._scrV === 'audit' && !s.auditDb && !s.auditBusy && !s.auditErr) Promise.resolve().then(() => { if (this.state.auditBusy) return; this.setState({ auditBusy:true });
    Backend.auditList(500).then(r => this.setState({ auditDb: r, auditBusy:false }), e => this.setState({ auditErr: (e && e.message) || 'unknown error', auditBusy:false })); });
  const OPL = { insert:'Created', update:'Changed', delete:'Deleted' };
  const auditSrc = Backend.on ? (s.auditDb || []).map(a => ({ at: Fmt.dt(a.at), who: a.who, action: (OPL[a.op] || a.op) + ' · ' + a.coll, target: a.key + (a.version ? ' (v' + a.version + ')' : '') })) : (s.audit || []);
  const aq = (s.auditQuery || '').trim().toLowerCase(), auditOk = a => !aq || (a.who + ' ' + a.action + ' ' + a.target).toLowerCase().includes(aq);
  return {
    autoRows: s.autos.map(a => ({ ...a, ...tg(a.on, () => this.setState(st => ({ autos: st.autos.map(x => x.id === a.id ? { ...x, on: !x.on } : x) }))) })),
    integRows: s.integ.map((x, i) => { const c = VIVIDS[i % 7]; return { ...x, initials: x.name.slice(0, 2).toUpperCase(), color:c, colorFg:VIVID_FG[c], status: x.on ? 'Connected' : 'Not connected', stBg: x.on ? '#DCFCE7' : '#EAF1F6', stFg: x.on ? '#166534' : '#526B7A', btnLabel: x.on ? 'Disconnect' : 'Connect', btnBg: x.on ? W : INK, btnFg: x.on ? INK : '#F8FBFD', toggle: () => { this.setState(st => ({ integ: st.integ.map(y => y.id === x.id ? { ...y, on: !y.on } : y) })); this.toastMsg(x.name + (x.on ? ' disconnected' : ' connected')); } }; }),
    auditQuery: s.auditQuery,
    setAuditQuery: e => this.setState({ auditQuery: e.target.value }),
    // v36: Export writes the rows on screen to a CSV (it only showed a message). Connected: rows come from the database log.
    exportAudit: () => { const rows = auditSrc.filter(auditOk); if (!rows.length) return this.toastMsg('Nothing to export: no audit rows match the filter.');
      csvDownload('audit-log-' + TODAY_KEY + '.csv', [['When', 'Who', 'Action', 'Target']].concat(rows.map(a => [a.at, a.who, a.action, a.target]))); this.toastMsg(rows.length.toLocaleString('en-US') + ' audit rows exported'); },
    auditNote: Backend.on ? (s.auditDb ? 'From the database audit trail: every saved change, newest first (latest ' + auditSrc.length.toLocaleString('en-US') + ').' : s.auditErr ? 'The database audit trail could not be read: ' + s.auditErr : 'Loading the database audit trail…')
      : 'Demo: sample history plus the actions taken in this session. Connected, this screen reads the database audit trail.',
    auditEmpty: !auditSrc.filter(auditOk).length,
    auditRows: auditSrc.filter(auditOk).slice(0, 500).map((a, i) => ({ ...a, initials: ini(a.who), av: AV[i % 5] })),
    permRoles: ['Learner', 'Trainer', 'Admin'],
    permRows: s.perms.map(([label, vals]) => ({ label, cells: vals.map(v => ({ on: !!v, bg: v ? '#22C55E' : W, border: v ? '#22C55E' : '#BFCFDB', op: 1, toggle: () => {} })) })),
    brandName: s.brandName,
    setBrandName: e => this.setState({ brandName: e.target.value }),
    brandMsg: s.brandMsg,
    setBrandMsg: e => this.setState({ brandMsg: e.target.value }),
    brandAccent: s.brandAccent,
    brandSwatches: ['#0066A1', '#007A4D', '#0F766E', '#2563EB', '#6D28D9', '#DB2777'].map(c => ({ c, ring: s.brandAccent === c ? INK : 'transparent', pick: () => this.setState({ brandAccent:c }) })),
    saveBrand: () => this.toastMsg('Branding saved for all users'),
    uploadLogo: () => this.toastMsg('Logo upload isn’t part of this build yet. The header uses the brand name and colour above.'),   // v36: it claimed “Logo uploaded”
    notifOpen: s.notifOpen,
    toggleNotif: () => this.setState({ notifOpen: !s.notifOpen, roleMenu:false }),
    // Approvers (admins, and the requester's manager) see pending access requests in the bell.
    ...(() => { const me = c.role.name, adm = c.isAdm, mine = s.accessReqs.filter(r => r.status === 'Pending' && (adm || r.manager === me));
      const extra = mine.slice(0, 5).map(r => ({ t: r.user + ' requested ' + r.course, time: Fmt.dt(r.at), kind:'assign', go: () => this.go('assignments', { adminView:true, reqFilter:'Pending', notifOpen:false }) }));
      // Required reading in the documents library that this person has not acknowledged yet.
      const meU = s.users.find(u => u.name === me) || {}, docP = Docs.pendingFor(s, me, meU.role || (adm ? 'Admin' : 'Learner'));
      docP.slice(0, 3).forEach(d => extra.push({ t: 'Required reading: ' + d.title, time: 'Acknowledge in Documents', kind:'due', go: () => this.go('docs', { adminView:false, notifOpen:false, docF: { q:'', cat:'All', show:'Pending' } }) }));
      // v33: the person's own reminders from real data (the bell used to show the same three sample messages to everyone,
      // e.g. "Daniel Reyes replied to your discussion" to Daniel Reyes). In-app notifications can be switched off in Preferences.
      const P = prefsFor(s, me), own = [];
      if (P.notif.inapp !== false) {
        if (P.notif.due !== false) { const en = s.enroll[me] || {}, soon = Progress.plus(TODAY_KEY, 7);
          Object.keys(en).map(cid => [cid, en[cid], Progress.courseOf(s, cid)]).filter(([cid, d, a]) => a && d && d <= soon && !Progress.courseDone(s, me, a))
            .sort((x, y) => x[1].localeCompare(y[1])).slice(0, 4).forEach(([cid, d, a]) => { const days = Math.round((new Date(d + 'T12:00:00') - new Date(TODAY_KEY + 'T12:00:00')) / 864e5);
              own.push({ t: a.title + (days < 0 ? ' is overdue (was due ' + Fmt.short(d) + ')' : days === 0 ? ' is due today' : ' is due in ' + days + (days === 1 ? ' day' : ' days')), time: Fmt.short(d), kind:'due', go: () => this.go('course', { courseId: cid, notifOpen:false, adminView:false }) }); }); }
        LearnStats.build(s).comp.filter(x => x.user === me && (x.st === 'Expiring soon' || x.st === 'Expired')).slice(0, 2)
          .forEach(x => own.push({ t: x.course + (x.st === 'Expired' ? ' certification expired ' : ' certification expires ') + Fmt.short(x.exp), time: 'Re-certify', kind:'cert', go: () => this.go('course', { courseId: x.cid, notifOpen:false, adminView:false }) }));
        ((s.nudges || {})[me] || []).slice(0, 3).forEach(n => own.push({ t: 'Reminder from ' + n.from + (n.about ? ': ' + n.about : ': please continue your assigned learning'), time: Fmt.dt(n.at), kind:'due', go: () => this.go('home', { adminView:false, notifOpen:false }) }));
        (s.threads || []).filter(t => t.author === me).forEach(t => { const r = (t.replies || []).filter(x => x.author !== me); if (r.length) own.push({ t: r[r.length - 1].author + ' replied to “' + t.title + '”', time: r[r.length - 1].time || '', kind:'reply', go: () => this.go('discussions', { threadId: t.id, notifOpen:false, adminView:false }) }); });
      }
      const list = extra.concat(own.slice(0, 8)), readSet = new Set(((s.notifSeen || {})[me]) || []), unread = list.filter(n => !readSet.has(n.t));
      return { notifCount: unread.length, notifEmpty: !list.length, notifs: list.map(n => ({ ...n, dot: NK[n.kind], bg: readSet.has(n.t) ? W : '#F7FAFC' })),
        hasUnread: unread.length > 0, markRead: () => this.setState(st => ({ notifSeen: { ...(st.notifSeen || {}), [me]: list.map(n => n.t) } })) }; })(),
  };
};
