/* Skillforge LMS — notifications, automations, integrations, audit log, user types and branding. */
SkillforgeApp.prototype.amPlatform = function (c) {
  const { INK, W, s, tg } = c;
  const auditSrc = [], auditOk = () => true;
  return {
    // v36: Export writes the rows on screen to a CSV (it only showed a message). Connected: rows come from the database log.
    exportAudit: () => { const rows = auditSrc.filter(auditOk); if (!rows.length) return this.toastMsg('Nothing to export: no audit rows match the filter.');
      csvDownload('audit-log-' + TODAY_KEY + '.csv', [['Date and time', 'Who']].concat(rows.map(a => [a.who])));
      this.toastMsg(rows.length.toLocaleString('en-US') + ' audit rows exported'); },
    permRoles: ['Learner', 'Trainer', 'Admin'],
    permRows: s.perms.map(([label, vals]) => ({ label, cells: vals.map(v => ({ on: !!v, bg: v ? '#22C55E' : W, border: v ? '#22C55E' : '#BFCFDB', op: 1, toggle: () => {} })) })),
    brandName: s.brandName,
    ...(() => { const own = [];
        if (true) { const en = s.enroll[me] || {}, soon = Progress.plus(TODAY_KEY, 7);
          Object.keys(en).map(cid => [cid, en[cid], Progress.courseOf(s, cid)]).filter(([cid, d, a]) => a && d && d <= soon && !Progress.courseDone(s, me, a))
            .sort((x, y) => x[1].localeCompare(y[1])).slice(0, 4).forEach(([cid, d, a]) => { const days = Math.round((new Date(d + 'T12:00:00') - new Date(TODAY_KEY + 'T12:00:00')) / 864e5);
              own.push({ t: a.title + (days < 0 ? ' is overdue' : days === 0 ? ' is due today' : ' is due in ' + days), time: Fmt.short(d), kind:'due' }); }); }
      return { own }; })(),
  };
};
