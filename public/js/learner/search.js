/* Skillforge LMS — header search bar and the full-page search results. */
SkillforgeApp.prototype.vmSearch = function (c) {
  const { liveAll, role, s, scrV } = c;
  const gsq = (s.gq || '').trim().toLowerCase(), gqRows = [];
  const hit = (...a) => a.join(' ').toLowerCase().includes(gsq);
  const goS = (scr, x) => () => { this.setState({ searchOpen:false, gq:'' }); this.go(scr, x); };
  const addG = (label, items) => { if (items.length) { gqRows.push({ isHead:true, label }); items.slice(0, 4).forEach(r => gqRows.push({ isItem:true, ...r })); } };
  if (gsq) {
    addG('Courses', liveAll.filter(c => hit(c.title, c.cat, c.instructor)).map(c => ({ t:c.title, sub:c.cat + ' · ' + c.hours, go:goS('course', { courseId:c.id, from:s.screen }) })));
    addG('Lessons', (Backend.on ? [] : FLAT).filter(l => hit(l.title, l.module)).map(l => ({ t:l.title, sub:'Leading Through Change · ' + l.type, go:goS('course', { courseId:'change', from:s.screen }) })));
    addG('Learning paths', s.paths.filter(p => hit(p.name, p.audience)).map(p => ({ t:p.name, sub:p.audience, go:goS('progress') })));
    if (role.admin) {
      addG('Assessments', s.quizzes.filter(q => hit(q.name, q.course)).map(q => ({ t:q.name, sub:q.course || 'Not attached yet', go:goS('quizzes', { adminView:true }) })));
      addG('LCMS modules', s.lcms.filter(m => hit(m.title, m.code, m.type)).map(m => ({ t:m.title, sub:m.code + ' · ' + m.type, go:goS('lcms', { adminView:true, lcmsQuery:m.code }) })));
      addG('Users', s.users.filter(u => hit(u.name, u.dept, u.email, u.empId || '')).map(u => ({ t:u.name, sub:u.role + ' · ' + u.dept, go:goS('users', { adminView:true }) })));
      addG('Reports', Object.values(RDEF).filter(r => hit(r.name, r.short)).map(r => ({ t:r.name, sub:r.short, go:goS('reports', { adminView:true }) })));
    }
  }
  // full-page search
  const sq = (s.gq || '').trim().toLowerCase(), sHit = (...a) => a.join(' ').toLowerCase().includes(sq);
  const goR = (scr, x) => () => { this.setState({ gq:'' }); this.go(scr, x); };
  const searchGroups = !sq ? [] : [
    ['Courses', liveAll.filter(c => sHit(c.title, c.cat, c.instructor)).map(c => ({ t:c.title, sub:c.cat + ' · ' + c.hours, go:goR('course', { courseId:c.id, from:'catalog', adminView:false }) }))],
    ['Lessons', (Backend.on ? [] : FLAT).filter(l => sHit(l.title, l.module)).map(l => ({ t:l.title, sub:'Leading Through Change · ' + l.type, go:goR('course', { courseId:'change', from:'catalog', adminView:false }) }))],
    ['Learning paths', s.paths.filter(p => sHit(p.name, p.audience)).map(p => ({ t:p.name, sub:p.audience, go:goR(role.admin ? 'paths' : 'progress', role.admin ? { adminView:true } : {}) }))],
  ].concat(role.admin ? [
    ['Assessments', s.quizzes.filter(q => sHit(q.name, q.course)).map(q => ({ t:q.name, sub:(q.course || 'Not attached') + ' · ' + q.ids.length + ' questions', go:goR('quizzes', { adminView:true }) }))],
    ['Questions', s.qs.filter(q => sHit(q.text, q.topic, q.type)).map(q => ({ t:q.text, sub:q.topic + ' · ' + q.type, go:goR('qbank', { adminView:true }) }))],
    ['Users', s.users.filter(u => sHit(u.name, u.dept, u.email, u.empId || '')).map(u => ({ t:u.name, sub:u.role + ' · ' + u.dept + ' · ' + (u.empId || ''), go:goR('users', { adminView:true, userQuery:u.name }) }))],
    ['Reports', Object.values(RDEF).filter(r => sHit(r.name, r.short)).map(r => ({ t:r.name, sub:r.short, go:goR('reports', { adminView:true }) }))],
  ] : []).filter(g => g[1].length).map(([label, items]) => ({ label, count: items.length, items }));
  const searchVals = { isSearch: scrV === 'search', searchGroups, searchTotal: searchGroups.reduce((a, g) => a + g.count, 0), searchTotalLabel: (n => n + (n === 1 ? ' result' : ' results'))(searchGroups.reduce((a, g) => a + g.count, 0)), searchIdle: !sq, searchNone: !!sq && !searchGroups.length, searchQ: s.gq || '',
    setGqBar: e => { const v = e.target.value; if (v.trim() && s.screen !== 'search') this.go('search', { gq:v, searchFrom:s.screen }); else this.setState({ gq:v }); },
    searchKey: e => { if (e.key === 'Escape') { this.setState({ gq:'' }); e.target.blur(); } else if (e.key === 'Enter' && e.target.value.trim() && s.screen !== 'search') this.go('search', { searchFrom:s.screen }); },
    clearSearch: () => this.setState({ gq:'' }), searchCls: (s.gq || '').length ? 'has-q' : '', hasGq: !!(s.gq || '').length };
  return {
    ...searchVals,
    gqRows,
    gqEmpty: gsq.length > 0 && gqRows.length === 0,
    gqIdle: gsq.length === 0,
  };
};
