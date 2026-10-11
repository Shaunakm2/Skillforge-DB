/* Skillforge LMS — course catalog.
 * Everyone sees the full catalogue (1,000+ courses). Assigned courses come first and open straight away;
 * every other course can be requested — the request goes to the person's manager and L&D (Settings › Course
 * assignment › Access requests), and on approval the course is assigned. Cards are paged so the page stays light.
 */
const CAT_SIZE = 24;
SkillforgeApp.prototype.vmCatalog = function (c) {
  const { liveAll, s, role } = c;
  const me = role.name, mine = s.enroll[me] || {};
  const cats = ['All'].concat(Array.from(new Set(liveAll.map(x => x.cat))).filter(Boolean).sort());
  const q = s.catQuery.trim().toLowerCase();
  const stOf = x => x.d ? x.d.status : x.pct === 100 ? 'Completed' : x.pct > 0 ? 'In progress' : 'Not started';
  const reqOf = id => s.accessReqs.find(r => r.user === me && r.courseId === id && r.status !== 'Approved');
  const ok = x => (s.catCat === 'All' || x.cat === s.catCat) && (s.catLvl === 'All' || x.level === s.catLvl) && (!q || (x.title + ' ' + x.instructor + ' ' + (x.code || '')).toLowerCase().includes(q));
  const assigned = liveAll.filter(x => mine[x.id] && ok(x) && (s.catSt === 'All' || stOf(x) === s.catSt));
  const others = s.catSt === 'All' || s.catSt === 'Not assigned' ? liveAll.filter(x => !mine[x.id] && ok(x) && !(s.catRel === 'requested' && !reqOf(x.id))) : [];
  const list = s.catRel === 'assigned' ? assigned : s.catRel === 'available' ? others : s.catRel === 'requested' ? others : assigned.concat(s.catSt === 'Not assigned' ? [] : others);
  const finalList = s.catSt === 'Not assigned' ? others : list;
  const PG = Pager(this, s, 'catalog', finalList, CAT_SIZE);
  const fmtD = k => Fmt.medium(k);
  const card = x => { const isMine = !!mine[x.id], rq = reqOf(x.id);
    return { ...x, mineTag: isMine, reqTag: !isMine && !!rq, reqLabel: rq ? (rq.status === 'Pending' ? 'Requested · pending' : 'Request declined') : '', reqBg: rq && rq.status === 'Declined' ? '#FDECEC' : '#FEF3C7', reqFg: rq && rq.status === 'Declined' ? '#A63232' : '#92400E',
      canReq: !isMine && (!rq || rq.status === 'Declined') && ((s.platform || PLATFORM0).feat.accessReq !== false), showProg: isMine, lockNote: !isMine && !rq,
      due: isMine ? 'Due ' + fmtD(mine[x.id]) : '',
      request: e => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ reqModal: { courseId: x.id, reason:'', err:'' } }); },
      open: () => this.openCourse(x.id) }; };
  const RM = s.reqModal, rc = RM && liveAll.find(x => x.id === RM.courseId), meU = s.users.find(u => u.name === me) || {};
  return {
    catQuery: s.catQuery, setCatQuery: e => this.setState({ catQuery: e.target.value, pages: { ...s.pages, catalog:1 } }),
    catalogCount: liveAll.length.toLocaleString('en-US'), catalogMine: Object.keys(mine).length,
    catalogList: PG.rows.map(card), catalogEmpty: finalList.length === 0, catPager: PG.pager, catShown: finalList.length.toLocaleString('en-US') + (finalList.length === 1 ? ' course' : ' courses'),
    relChips: [['all', 'All courses'], ['assigned', 'Assigned to me · ' + Object.keys(mine).length], ['available', 'Not assigned' + ((s.platform || PLATFORM0).feat.accessReq !== false ? ' · request access' : '')]].concat((s.platform || PLATFORM0).feat.accessReq !== false ? [['requested', 'My requests · ' + s.accessReqs.filter(r => r.user === me && r.status === 'Pending').length]] : [])
      .map(([id, label]) => UI.chip(s.catRel, id, label, () => this.setState({ catRel: id, catSt:'All', pages: { ...s.pages, catalog:1 } }))),
    catLvl: s.catLvl, catSt: s.catSt, setCatLvl: e => this.setState({ catLvl: e.target.value, pages: { ...s.pages, catalog:1 } }), setCatSt: e => this.setState({ catSt: e.target.value, pages: { ...s.pages, catalog:1 } }),
    lvlOpts: [{ v:'All', l:'Any level' }, { v:'Foundational', l:'Foundational' }, { v:'Intermediate', l:'Intermediate' }, { v:'Advanced', l:'Advanced' }],
    stOpts: [{ v:'All', l:'Any status' }, { v:'Not started', l:'Not started' }, { v:'In progress', l:'In progress' }, { v:'Overdue', l:'Overdue' }, { v:'Completed', l:'Completed' }, { v:'Not assigned', l:'Not assigned to me' }],
    catChips: cats.map(x => UI.chip(s.catCat, x, x, () => this.setState({ catCat: x, pages: { ...s.pages, catalog:1 } }))),
    // request access pop-up
    reqOpen: !!rc, req: RM || {}, reqCourse: rc ? rc.title : '', reqTo: (meU.manager && meU.manager !== 'None' ? meU.manager + ' (your manager) and ' : '') + 'L&D', reqErr: !!(RM && RM.err),
    setReqReason: e => { const v = e.target.value; this.setState(st => ({ reqModal: { ...st.reqModal, reason: v, err:'' } })); },
    closeReq: () => this.setState({ reqModal:null }),
    sendReq: () => { const why = (RM.reason || '').trim();
      if (why.length < 10) return this.setState({ reqModal: { ...RM, err:'Tell your manager why you need this course (at least 10 characters).' } });
      if (why.length > 500) return this.setState({ reqModal: { ...RM, err:'Keep the reason under 500 characters.' } });
      if (Backend.on) { Backend.call('requestAccess', { courseId: rc.id, reason: why }).then(() => { this.setState({ reqModal:null }); this.toastMsg('Request sent to ' + (meU.manager && meU.manager !== 'None' ? meU.manager + ' and L&D' : 'L&D')); }).catch(e => this.setState({ reqModal: { ...RM, err: e.message } })); return; }
      this.setState(st => ({ reqModal:null, accessReqs: [{ id:'rq' + Date.now(), user: me, empId: meU.empId, dept: meU.dept, manager: meU.manager, courseId: rc.id, course: rc.title, reason: why, at: nowStamp(), status:'Pending' }].concat(st.accessReqs.filter(r => !(r.user === me && r.courseId === rc.id))) }));
      this.toastMsg('Request sent to ' + (meU.manager && meU.manager !== 'None' ? meU.manager + ' and L&D' : 'L&D')); },
  };
};
