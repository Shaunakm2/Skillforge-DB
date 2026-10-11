/* Skillforge LMS — Settings › Clear SCORM bookmarking.
 * A SCORM package remembers where the learner left off (its bookmark / suspend data). When a package gets stuck
 * on resume, an admin clears the bookmark so it starts again from the beginning. Optionally the SCORM step's
 * completion is reset too. Every clear is logged. */
SkillforgeApp.prototype.amBookmarks = function (c) {
  const { s, role } = c;
  if (this._scrV !== 'bookmarks') return { isBookmarks:false };
  const B = { param:'empId', q:'', sel:null, reset:false, reason:'', ...(s.bm || {}) };
  const st = { ...s, bm: B };
  const up = pickUser(this, st, 'bm', s.users.filter(u => u.status !== 'Deactivated'));
  const scormCourses = s.adminCourses.filter(a => a.items.some(it => it.kind === 'scorm'));
  const fmtT = t => { const d = new Date(t); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }); };
  const u = up.chosen;
  const clear = (a, all) => {
    const list = all ? scormCourses.filter(x => (s.bookmarks[u.name] || {})[x.id]) : [a];
    if (!list.length) return this.toastMsg('No bookmarks to clear');
    this.setState(x => {
      const bms = { ...x.bookmarks, [u.name]: { ...(x.bookmarks[u.name] || {}) } }; list.forEach(cc => delete bms[u.name][cc.id]);
      let itemDone = x.itemDone;
      if (B.reset) { itemDone = { ...x.itemDone, [u.name]: { ...(x.itemDone[u.name] || {}) } }; list.forEach(cc => { const idx = cc.items.findIndex(it => it.kind === 'scorm'); itemDone[u.name][cc.id] = { ...(itemDone[u.name][cc.id] || {}) }; delete itemDone[u.name][cc.id][idx]; }); }
      return { bookmarks: bms, itemDone, bm: { ...B, reason:'' }, bmLog: list.map(cc => ({ id:'bl' + Date.now() + cc.id, at: nowStamp(), by: role.name, user: u.name, course: cc.code + ' · ' + cc.title, resetDone: !!B.reset, reason: (B.reason || '').trim() })).concat(x.bmLog) };
    });
    this.toastMsg((list.length === 1 ? 'Bookmark cleared for ' + list[0].title : list.length + ' bookmarks cleared') + ' · ' + u.name.split(' ')[0] + ' starts from the beginning' + (B.reset ? ' and completion was reset' : ''));
  };
  return {
    isBookmarks:true, bmUp: up, bmUser: !!u,
    bmRows: u ? scormCourses.map(a => { const bk = (s.bookmarks[u.name] || {})[a.id], st2 = Progress.itemStates(s, a, u.name)[a.items.findIndex(it => it.kind === 'scorm')] || {};
      return { title: a.title, code: a.code, has: !!bk, none: !bk, where: bk ? bk.location : 'No bookmark saved', when: bk ? 'Saved ' + fmtT(bk.savedAt) : '', done: st2.done ? 'SCORM step completed' : 'SCORM step not completed', clear: () => clear(a) }; }) : [],
    bmNone: !!u && !scormCourses.some(a => (s.bookmarks[u.name] || {})[a.id]),
    bmClearAll: () => clear(null, true),
    bmReset: UI.toggle(B.reset, () => this.setState({ bm: { ...B, reset: !B.reset } })),
    bmReason: B.reason, setBmReason: e => this.setState({ bm: { ...B, reason: e.target.value } }),
    bmLogRows: s.bmLog.slice(0, 30).map(l => ({ ...l, when: fmtT(l.at), extra: l.resetDone ? 'Completion reset too' : 'Bookmark only', reasonLabel: l.reason || '—' })), bmLogEmpty: !s.bmLog.length,
  };
};
