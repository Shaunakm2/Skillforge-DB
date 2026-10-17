SkillforgeApp.prototype.amApp = function (c) {
  const { s } = c, tab = s.mdTab || 'app';
  const hy = s.mdYear || TODAY_KEY.slice(0, 4), years = [...new Set([TODAY_KEY.slice(0, 4), String(+TODAY_KEY.slice(0, 4) + 1)])].sort();
  const holPast = h => ({ ...h, past: h.date < TODAY_KEY });
  // ---- App settings: feature switches and defaults ----
  const PF = s.platform || PLATFORM0, setPF = fn => this.setState(st => { const p = JSON.parse(JSON.stringify(st.platform || PLATFORM0)); fn(p); return { platform: p }; });
  const DF = s.pfDraft || PF.defaults;
  const appVals = {
    mdIsApp: tab === 'app',
    pfFeats: PLATFORM_FEATS.map(([k, l, d]) => ({ l, d, ...UI.toggle(PF.feat[k] !== false, () => setPF(p => { p.feat[k] = p.feat[k] === false; })) })),
    pfD: DF, setPfPw: e => this.setState({ pfDraft: { ...DF, password: e.target.value } }), setPfDue: e => this.setState({ pfDraft: { ...DF, dueDays: e.target.value } }), setPfEss: e => this.setState({ pfDraft: { ...DF, essDays: e.target.value } }), setPfIdle: e => this.setState({ pfDraft: { ...DF, idleMins: e.target.value } }), pfIdle: DF.idleMins == null ? 30 : DF.idleMins,
    pfDirty: !!s.pfDraft, pfDiscard: () => this.setState({ pfDraft:null }),
    pfSave: () => { const pw = String(DF.password || ''), due = parseInt(DF.dueDays, 10), ess = parseInt(DF.essDays, 10), idle = DF.idleMins == null || DF.idleMins === '' ? 30 : parseInt(DF.idleMins, 10);
      if (pw.length < 8 || pw.length > 72 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return this.toastMsg('Default password: at least 8 characters with an upper-case letter, a lower-case letter and a number (Supabase refuses anything weaker)');
      if (!(due >= 1 && due <= 365)) return this.toastMsg('Default due date: 1 to 365 days'); if (!(ess >= 1 && ess <= 365)) return this.toastMsg('Essential-training window: 1 to 365 working days');
      if (!(idle === 0 || (idle >= 5 && idle <= 480))) return this.toastMsg('Sign out after inactivity: 5 to 480 minutes, or 0 for never');
      setPF(p => { p.defaults = { password: pw, dueDays: due, essDays: ess, idleMins: idle }; }); this.setState({ pfDraft:null }); this.toastMsg('App settings saved'); },
  };
  return { ...appVals, hy, years, holPast };
};
