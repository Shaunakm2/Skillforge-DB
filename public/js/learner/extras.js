/* Skillforge LMS — learner values computed with admin data: my learning path, calendar sign-ups, certificates. */
SkillforgeApp.prototype.amLearnerExtras = function (c) {
  const { INK, all, s, role } = c;
  // My learning path (v32): the path built in Settings › Learning paths that covers most of the courses assigned to this person
  // (it used to be the same fixed three courses for everyone). No path covers any of my courses: the card is hidden.
  const mine = new Set(Object.keys(s.enroll[role.name] || {}));
  const scored = (s.paths || []).map(p => ({ p, n: (p.courses || []).filter(cid => mine.has(cid)).length })).filter(x => x.n > 0).sort((x, y) => y.n - x.n);
  const myPath = scored.length ? scored[0].p : null;
  const pcs = myPath ? myPath.courses.map(cid => all.find(x => x.id === cid)).filter(Boolean) : [];
  const myPathSteps = pcs.map((c, i) => { const prevDone = i === 0 || !myPath.ordered || pcs[i - 1].pct === 100;
    const st = c.pct === 100 ? ['Completed', '#DCFCE7', '#166534'] : c.pct > 0 ? ['In progress', '#FEF3C7', '#92400E'] : prevDone ? ['Next', '#DBEAFE', '#1E40AF'] : ['Locked', '#EAF1F6', '#526B7A'];
    return { n:i + 1, title:c.title, color:c.color, tint:c.tint, iconSrc:c.iconSrc || '', hasIcon:!!c.hasIcon, pctStr:c.pctStr, status:st[0], stBg:st[1], stFg:st[2], icon:({ Completed:'✓', 'In progress':'●', Next:'○', Locked:'\uD83D\uDD12' })[st[0]],
      nodeBg:({ Completed:'#007A4D', 'In progress':'#0066A1', Next:'#FFFFFF', Locked:'#EAF1F6' })[st[0]], nodeFg:({ Completed:'#FFFFFF', 'In progress':'#FFFFFF', Next:'#16324F', Locked:'#526B7A' })[st[0]],
      nodeBd:({ Completed:'#007A4D', 'In progress':'#0066A1', Next:'#16324F', Locked:'#C9D7E2' })[st[0]], notEnd: i < pcs.length - 1, locked: st[0] === 'Locked',
      open: () => st[0] === 'Locked' ? this.toastMsg('Finish ' + pcs[i - 1].title + ' first') : this.openCourse(c.id) }; });
  // Sign-ups to organisation sessions: per person, saved with their preferences. No invite e-mail is sent in this build,
  // so the screen no longer says one was.
  const me = role.name, reg0 = (((s.prefs || {})[me] || {}).reg) || {};
  const selEvents = (calEvents(s, me)[s.calSel] || []).map(e => ({ e, key: e.key })).map(({ e, key }) => { const reg = !!reg0[key], org = /^\d{4}-/.test(key);
    return { full:e.t, time:e.time, kindLabel:KIND[e.kind].label, bg:KIND[e.kind].bg, fg:KIND[e.kind].fg, isLive: org, regLabel: reg ? 'Registered ✓' : 'Register', regBg: reg ? '#FFFFFF' : INK, regFg: reg ? '#245E52' : '#F8FBFD',
      register: () => { this.setState(st => { const p0 = (st.prefs || {})[me] || {}, r = { ...(p0.reg || {}) }; if (r[key]) delete r[key]; else r[key] = true; return { prefs: { ...st.prefs, [me]: { ...p0, reg: r } } }; });
        this.toastMsg(reg ? 'Registration cancelled' : 'Registered · it is in your calendar here'); } }; });
  return {
    myPathSteps, myPathHas: myPathSteps.length > 0, myPathName: myPath ? myPath.name : '', myPathLegend: myPath && myPath.ordered ? 'Completed → Current → Next → Locked' : 'Any order',
    selEvents,
    // v36: My progress numbers from the person's own records (they were fixed sample values: “26.5h”, “2 certificates”,
    // and the same five skills for everyone). Time = estimated minutes of completed steps; skills = completion by course category.
    ...(() => { const mc = Progress.myCourses(s, me), certN = mc.filter(({ a, d }) => d.pct === 100 && (a.features || {}).cert === true).length;
      let mins = 0; mc.forEach(({ a, d }) => d.mods.forEach((m, i) => { if (m.done) mins += +((a.items[i] || {}).mins) || 10; }));
      const byCat = new Map(); mc.forEach(({ a, d }) => { const k = a.cat || 'General', g = byCat.get(k) || { done:0, n:0 }; g.done += d.doneN; g.n += d.total; byCat.set(k, g); });
      const COL = ['#0066A1', '#007A4D', '#8C5A9E', '#2F4A7A', '#D64545'];
      const skills = [...byCat.entries()].filter(([, g]) => g.n).map(([name, g]) => ({ name, v: Math.round(g.done / g.n * 100) })).sort((x, y) => y.v - x.v || x.name.localeCompare(y.name)).slice(0, 6).map((x, i) => ({ ...x, pct: x.v + '%', color: COL[i % 5] }));
      return { statCards: [{ v: mc.filter(x => x.d.pct === 100).length, l:'Courses completed', tint:'#E3F1EE', color:'#007A4D' }, { v: (mins >= 60 ? (Math.round(mins / 6) / 10) + 'h' : mins + ' min'), l:'Time learning (estimated)', tint:'#F1E7F4', color:'#8C5A9E' }, { v: certN, l: certN === 1 ? 'Certificate' : 'Certificates', tint:'#FDECEC', color:'#D64545' }],
        skills, skillsEmpty: !skills.length, certsEmpty: !certN }; })(),
    // Certificates use the current template (Settings › Certificates): name, course, date and score fill in.
    certs: all.filter(c => c.pct === 100 && (s.adminCourses.find(a => a.id === c.id) || { features:{} }).features.cert === true).map(c => {
      const a = s.adminCourses.find(x => x.id === c.id), d = a ? Progress.detail(s, role.name, a) : null, best = d ? Math.max(-1, ...d.mods.map(m => m.best === '' ? -1 : +m.best)) : -1, on = (d && d.completedOn) || TODAY_KEY;
      // v33: the ID is unique per person, course and completion (it was the same for everyone who finished the course), the
      // validity shows when a re-certification has expired, and the printed name leaves out the “(employee ID)” added to tell
      // two people with the same name apart.
      const meU = s.users.find(u => u.name === role.name) || {}, cid = 'SF-' + Progress.hash((meU.empId || role.name) + '|' + c.id + '|' + on).toString(36).slice(2, 8).toUpperCase() + '-' + on.replace(/-/g, '').slice(2);
      const cmp = LearnStats.build(s).comp.find(x => x.user === role.name && x.cid === c.id), expd = cmp && cmp.st === 'Expired', soon = cmp && cmp.st === 'Expiring soon';
      const printName = meU.empId ? role.name.replace(new RegExp(' \\(' + meU.empId.replace(/[^A-Za-z0-9-]/g, '') + '\\)( \\d+)?$'), '') : role.name;
      return { title: c.title, date: new Date(on + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }), id: cid, tint: c.tint, color: c.color,
        exp: expd ? 'Expired ' + Fmt.medium(cmp.exp) + ' · re-certify' : soon ? 'Expires ' + Fmt.medium(cmp.exp) : a && a.recert !== 'Never' ? 'Valid ' + a.recert : 'No expiry',
        expBg: expd ? '#FEE2E2' : soon ? '#FEF3C7' : '#DCFCE7', expFg: expd ? '#991B1B' : soon ? '#92400E' : '#166534',
        download: () => { Certificate.download(s.certTpl, { ...Certificate.values(printName, c.title, on, best < 0 ? '' : best), id: cid }, 'certificate-' + c.id + '.png'); this.toastMsg('Certificate downloaded'); } }; }),
  };
};
