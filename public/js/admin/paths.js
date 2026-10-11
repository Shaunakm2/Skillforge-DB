/* Skillforge LMS — learning paths editor. */
SkillforgeApp.prototype.amPaths = function (c) {
  const { INK, all, s, segs, tg } = c;
  // paths
  const pSel = s.paths.find(p => p.id === s.pathSel) || s.paths[0] || { id: 0, name:'', audience:'', courses:[], auto:'Manual', ordered:true };
  const cOf = cid => all.find(c => c.id === cid);   // a course removed from the catalog no longer breaks this screen
  // v32: "enrolled" = active or invited people who have every course of the path assigned (it was a fixed sample number).
  const enrolledIn = p => { const cs = (p.courses || []).filter(cOf); if (!cs.length) return 0; let n = 0;
    s.users.forEach(u => { if (u.status === 'Deactivated') return; const en = s.enroll[u.name]; if (en && cs.every(c => en[c])) n++; }); return n; };
  const depts = [...new Set(s.users.map(u => u.dept).filter(Boolean))].sort(), roleNames = s.roles.map(r => r.name);
  // who an auto rule covers today
  const targetsOf = p => p.auto === 'Department' ? s.users.filter(u => u.status !== 'Deactivated' && u.dept === p.ruleDept)
    : p.auto === 'Role' ? s.users.filter(u => u.status !== 'Deactivated' && (Access.roleFor(s, u) || {}).name === p.ruleRole)
    : p.auto === 'New hires' ? s.users.filter(u => u.status !== 'Deactivated' && u.joined && u.joined >= Progress.plus(TODAY_KEY, -30) && u.joined <= TODAY_KEY) : [];
  const setP = patch => this.setState(st => ({ paths: st.paths.map(p => p.id === pSel.id ? { ...p, ...patch } : p) }));
  const pathCards = s.paths.map((p, i) => ({ name:p.name, audience:p.audience, count: p.courses.length + ' courses', enrolled: enrolledIn(p).toLocaleString('en-US') + ' enrolled', border: p.id === pSel.id ? INK : '#D7E3EC', dots: p.courses.filter(cOf).map(cid => ({ color: cOf(cid).color })), pick: () => this.setState({ pathSel:p.id }) }));
  const peSteps = pSel.courses.map((cid, i) => { const c = cOf(cid) || { title: cid + ' (no longer in the catalog)', hours:'', cat:'', color:'#9CB3C4', tint:'#EAF1F6' }; return { n:i + 1, title:c.title, hours:c.hours, cat:c.cat, color:c.color, tint:c.tint, notLast: i < pSel.courses.length - 1, remove: () => setP({ courses: pSel.courses.filter((_, j) => j !== i) }) }; });
  return {
    pathCards,
    pe: { name:pSel.name, audience:pSel.audience },
    peSteps,
    peEmpty: pSel.courses.length === 0,
    setPeName: e => setP({ name: e.target.value }),
    setPeAudience: e => setP({ audience: e.target.value }),
    peAddOptions: [{ id:'', title:'+ Add a course…' }].concat(all.filter(c => !pSel.courses.includes(c.id)).map(c => ({ id:c.id, title:c.title }))),
    peAdd: e => { if (e.target.value) setP({ courses: pSel.courses.concat([e.target.value]) }); },
    peAuto: segs(pSel.auto, ['Manual', 'Department', 'Role', 'New hires'], v => setP({ auto:v })),
    peOrder: tg(pSel.ordered, () => setP({ ordered: !pSel.ordered })),
    peIsDept: pSel.auto === 'Department', peIsRole: pSel.auto === 'Role', peIsNew: pSel.auto === 'New hires',
    peDeptOpts: [{ v:'', l:'Choose a department' }].concat(depts.map(d => ({ v:d, l:d }))), peRoleOpts: [{ v:'', l:'Choose a role' }].concat(roleNames.map(r => ({ v:r, l:r }))),
    peRuleDept: pSel.ruleDept || '', peRuleRole: pSel.ruleRole || '', setPeDept: e => setP({ ruleDept: e.target.value }), setPeRole: e => setP({ ruleRole: e.target.value }),
    peRuleNote: pSel.auto === 'Manual' ? 'Assign the courses yourself (Course assignment).' : 'Save assigns the path’s courses to the ' + targetsOf(pSel).length.toLocaleString('en-US') + ' people this covers today. People who join or move later are assigned when the path is saved again.',
    newPath: () => { const id = Math.max(0, ...s.paths.map(p => p.id)) + 1; this.setState({ paths: s.paths.concat([{ id, name:'Untitled path', audience:'', courses:[], auto:'Manual', ordered:true, enrolled:0 }]), pathSel:id }); },
    // v32: saving applies the auto rule (it used to only show a message): every course of the path is assigned to the people the
    // rule covers, keeping existing due dates.
    savePath: () => { const nm = String(pSel.name || '').trim(); if (!nm) return this.toastMsg('Give the path a name');
      if (pSel.auto === 'Department' && !pSel.ruleDept) return this.toastMsg('Choose the department'); if (pSel.auto === 'Role' && !pSel.ruleRole) return this.toastMsg('Choose the role');
      const cs = pSel.courses.filter(cid => { const a = Progress.courseOf(s, cid); return !a || (a.status === 'Published' && a.active !== false); });
      const tg = pSel.auto === 'Manual' ? [] : targetsOf(pSel); if (!tg.length || !cs.length) return this.toastMsg(nm + ' saved · ' + pSel.courses.length + ' courses' + (pSel.auto !== 'Manual' ? ' · nobody new to assign' : ''));
      const enroll = { ...s.enroll }, on = { ...(s.assignedOn || {}) }, due = defaultDue(s); let added = 0;
      tg.forEach(u => cs.forEach(cid => { if ((enroll[u.name] || {})[cid]) return; enroll[u.name] = { ...(enroll[u.name] || {}), [cid]: due }; on[u.name + '|' + cid] = TODAY_KEY; added++; }));
      this.setState({ enroll, assignedOn: on }); this.toastMsg(nm + ' saved · ' + added.toLocaleString('en-US') + ' course assignment' + (added === 1 ? '' : 's') + ' added for ' + tg.length.toLocaleString('en-US') + ' people'); },
  };
};
