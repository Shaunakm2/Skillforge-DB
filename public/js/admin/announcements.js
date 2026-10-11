/* Skillforge LMS — homepage announcements editor. */
SkillforgeApp.prototype.amAnnouncements = function (c) {
  const { s, segs } = c;
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const annD = s.an || { id:null, title:'', msg:'', tone:'Info', from: nowLocal(), until:'' };
  const setAn = k => e => { const v = e.target.value; this.setState(st => ({ an: { ...(st.an || annD), [k]: v } })); };
  return {
    annRows: s.anns.slice().sort((a, b) => (b.from || '').localeCompare(a.from || '')).map(a => { const st = annStatus(a); const C = { Live:['#DCFCE7', '#166534'], Scheduled:['#DBEAFE', '#1E40AF'], Ended:['#EAF1F6', '#526B7A'] }[st]; return { ...a, st, stBg:C[0], stFg:C[1], toneImportant: a.tone === 'Important', window: (a.from ? fmtDateTime(a.from) : 'Now') + ' → ' + fmtDateTime(a.until), edit: () => this.setState({ annModal:true, an:{ ...a } }), del: () => { this.setState(s2 => ({ anns: s2.anns.filter(x => x.id !== a.id) })); this.toastMsg('Announcement deleted'); } }; }),
    annEmpty: s.anns.length === 0,
    newAnn: () => this.setState({ annModal:true, an:null }),
    annModal: s.annModal,
    closeAnn: () => this.setState({ annModal:false }),
    an: annD,
    annTitleLabel: annD.id ? 'Edit announcement' : 'New announcement',
    setAnTitle: setAn('title'),
    setAnMsg: setAn('msg'),
    setAnFrom: setAn('from'),
    setAnUntil: setAn('until'),
    anTones: segs(annD.tone, ['Info', 'Important'], v => this.setState(st => ({ an: { ...(st.an || annD), tone:v } }))),
    saveAnn: () => { if (!annD.title.trim()) return this.toastMsg('Add a title'); if (!annD.until) return this.toastMsg('Set when the announcement ends'); if (annD.from && new Date(annD.until) <= new Date(annD.from)) return this.toastMsg('“Live until” must be after “Live from”'); const rec = { ...annD, title: annD.title.trim(), msg: annD.msg.trim() }; if (annD.id) this.setState({ anns: s.anns.map(x => x.id === annD.id ? rec : x), annModal:false }); else this.setState({ anns: [{ ...rec, id: Date.now() }].concat(s.anns), annModal:false }); this.toastMsg(annStatus(rec) === 'Live' ? 'Announcement is live on the homepage' : annStatus(rec) === 'Scheduled' ? 'Announcement scheduled' : 'Saved · already ended'); },
  };
};
