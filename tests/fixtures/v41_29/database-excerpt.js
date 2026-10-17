SkillforgeApp.prototype.amDatabase = function (c) {
  const { s } = c, rows = [];
  return {
    dbLoginsCsv: () => { const L = s.dbLogins; csvDownload('temporary-passwords-' + TODAY_KEY + '.csv', [['Email']].concat(L.created.map(x => [x.email]))); },
    dbBackup: () => { const data = JSON.stringify({ org: Backend.org, exportedAt: new Date().toISOString(), rows: rows.map(r => ({ coll: r.coll, key: r.key, data: r.data })) });
      const url = URL.createObjectURL(new Blob([data], { type:'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'skillforge-backup-' + TODAY_KEY + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.toastMsg('Backup downloaded · ' + rows.length.toLocaleString('en-US') + ' records'); },
  };
};
