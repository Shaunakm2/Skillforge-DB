/* Skillforge LMS — notifications, automations, integrations, audit log, user types and branding. */
SkillforgeApp.prototype.amPlatform = function (c) {
  const { INK, W, s, tg } = c;
  // notifications + learner extras
  const NK = { due:'#D64545', reply:'#007A4D', cert:'#0066A1', assign:'#8C5A9E' };
  // v36: audit log source. Connected: the database trail (read once per visit to the screen); offline: sample + this session.
  if (Backend.on && this._scrV === 'audit' && !s.auditDb && !s.auditBusy && !s.auditErr) Promise.resolve().then(() => { if (this.state.auditBusy) return; this.setState({ auditBusy:true });
    Backend.auditList(500).then(r => this.setState({ auditDb: r, auditBusy:false }), e => this.setState({ auditErr: (e && e.message) || 'unknown error', auditBusy:false })); });
  // v41.10: plain-language audit log (js/admin/audit.js). Double rows from the old trigger are skipped here too.
  const AF = s.auditF || { area:'All', who:'All', when:'7' }, setAF = patch => this.setState(st => ({ auditF: { ...(st.auditF || { area:'All', who:'All', when:'7' }), ...patch } }));
  const auditAll = (() => { if (this._scrV !== 'audit') return [];
    if (!Backend.on) return (s.audit || []).map(a => ({ t: '', at: a.at, who: a.who, auto: false, area: 'Other', text: a.action + (a.target ? ' · ' + a.target : ''), details: [], count: 1 }));
    const raw = s.auditDb || [], twin = new Set(raw.filter(a => a.changes).map(a => a.coll + '|' + a.key + '|' + a.op + '|' + a.version));
    const clean = raw.filter((a, i) => a.changes || !twin.has(a.coll + '|' + a.key + '|' + a.op + '|' + a.version)).filter((a, i, arr) => !a.changes ? arr.findIndex(b => !b.changes && b.coll === a.coll && b.key === a.key && b.op === a.op && b.version === a.version) === i : true);
    const A = AuditText.make(s); return A.group(clean.map(A.one)).map(r => ({ ...r, at: Fmt.dt(r.t) })); })();
  const cutoff = AF.when === 'All' ? '' : new Date(Date.now() - (+AF.when) * 864e5).toISOString();
  const aq = (s.auditQuery || '').trim().toLowerCase();
  const auditOk = a => (AF.area === 'All' || a.area === AF.area) && (AF.who === 'All' || a.who === AF.who) && (!cutoff || !a.t || a.t >= cutoff)
    && (!aq || (a.who + ' ' + a.text + ' ' + a.area + ' ' + (a.details || []).join(' ')).toLowerCase().includes(aq));
  const auditSrc = auditAll, dayOf = t => { if (!t) return ''; const d = new Date(t), k = d.toDateString(), now = new Date();
    return k === now.toDateString() ? 'Today' : k === new Date(now - 864e5).toDateString() ? 'Yesterday' : Fmt.medium(t.slice(0, 10)); };
  return {
    autoRows: s.autos.map(a => ({ ...a, ...tg(a.on, () => this.setState(st => ({ autos: st.autos.map(x => x.id === a.id ? { ...x, on: !x.on } : x) }))) })),
    integRows: s.integ.map((x, i) => { const c = VIVIDS[i % 7]; return { ...x, initials: x.name.slice(0, 2).toUpperCase(), color:c, colorFg:VIVID_FG[c], status: x.on ? 'Connected' : 'Not connected', stBg: x.on ? '#DCFCE7' : '#EAF1F6', stFg: x.on ? '#166534' : '#526B7A', btnLabel: x.on ? 'Disconnect' : 'Connect', btnBg: x.on ? W : INK, btnFg: x.on ? INK : '#F8FBFD', toggle: () => { this.setState(st => ({ integ: st.integ.map(y => y.id === x.id ? { ...y, on: !y.on } : y) })); this.toastMsg(x.name + (x.on ? ' disconnected' : ' connected')); } }; }),
    auditQuery: s.auditQuery,
    setAuditQuery: e => this.setState({ auditQuery: e.target.value }),
    // v36: Export writes the rows on screen to a CSV (it only showed a message). Connected: rows come from the database log.
    exportAudit: () => { const rows = auditSrc.filter(auditOk); if (!rows.length) return this.toastMsg('Nothing to export: no audit rows match the filter.');
      csvDownload('audit-log-' + Progress.today() + '.csv', [['Date and time', 'Who', 'Area', 'What happened', 'Details', 'Recorded by', 'Record (technical)']].concat(rows.map(a => [a.t ? a.t.replace('T', ' ').slice(0, 19) : a.at, a.who, a.area, a.text, (a.details || []).join('; '), a.auto ? 'System (automatic)' : 'Person', a.coll ? a.coll + ' / ' + a.key + (a.version ? ' / v' + a.version : '') + (a.count > 1 ? ' (+' + (a.count - 1) + ' more)' : '') : ''])));
      this.toastMsg(rows.length.toLocaleString('en-US') + ' audit rows exported'); },
    auditAreaOpts: ['All'].concat(AuditText.AREAS.filter(x => auditSrc.some(a => a.area === x))).map(v => ({ v, l: v === 'All' ? 'All areas' : v })), auditAreaVal: AF.area, setAuditArea: e => setAF({ area: e.target.value }),
    auditWhoOpts: ['All'].concat([...new Set(auditSrc.map(a => a.who))].sort()).map(v => ({ v, l: v === 'All' ? 'Everyone' : v })), auditWhoVal: AF.who, setAuditWho: e => setAF({ who: e.target.value }),
    auditWhenOpts: [['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['All', 'All time']].map(([v, l]) => ({ v, l })), auditWhenVal: AF.when, setAuditWhen: e => setAF({ when: e.target.value }),
    auditCountLine: (n => n.toLocaleString('en-US') + (n === 1 ? ' entry' : ' entries'))(auditSrc.filter(auditOk).length),
    auditNote: Backend.on ? (s.auditDb ? 'Who did what, and when. Newest first. Select an entry to see the details.' : s.auditErr ? 'The database audit trail could not be read: ' + s.auditErr : 'Loading the database audit trail…')
      : 'Demo: sample history plus the actions taken in this session. Connected, this screen reads the database audit trail.',
    auditEmpty: !auditSrc.filter(auditOk).length,
    auditRows: (rows => rows.map((a, i) => { const d = dayOf(a.t), k = 'a' + i, open = !!(s.auditOpen || {})[k] || false;
      return { ...a, initials: a.who === 'System' ? '⚙' : ini(a.who), av: a.who === 'System' ? '#7A8FA0' : ['#0066A1', '#08875A', '#16324F', '#8C5A9E', '#B45309'][[...a.who].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 5],
        time: a.t ? new Date(a.t).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : a.at, dayHead: d && (i === 0 || dayOf(rows[i - 1].t) !== d) ? d : '',
        hasDetails: (a.details || []).length > 0, detailList: (a.details || []).map(x => ({ x })), open, autoTag: a.auto && a.who !== 'System',
        toggle: () => this.setState(st => ({ auditOpen: { ...(st.auditOpen || {}), [k]: !open } })), chev: open ? '▾' : '▸' }; }))(auditSrc.filter(auditOk).slice(0, 500)),
    permRoles: ['Learner', 'Trainer', 'Admin'],
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
        if (P.notif.due !== false) { const en = s.enroll[me] || {}, soon = Progress.plus(Progress.today(), 7);
          Object.keys(en).map(cid => [cid, en[cid], Progress.courseOf(s, cid)]).filter(([cid, d, a]) => a && d && d <= soon && !Progress.courseDone(s, me, a))
            .sort((x, y) => x[1].localeCompare(y[1])).slice(0, 4).forEach(([cid, d, a]) => { const days = Math.round((new Date(d + 'T12:00:00') - new Date(Progress.today() + 'T12:00:00')) / 864e5);
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
