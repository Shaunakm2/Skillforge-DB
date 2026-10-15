/* Skillforge LMS — learner home dashboard, My learning (XP, badges, certificates) and leaderboards. */
SkillforgeApp.prototype.vmDashboard = function (c) {
  const { all, liveAll, myEnroll, qsc, role, s } = c;
  // Every number on Home comes from one summary of the person's learning records.
  const S = Progress.summary(s, role.name), live = new Set(liveAll.map(x => x.id)), byId = id => all.find(x => x.id === id);
  // XP and leaderboards from everyone's learning records (v33: they were one shared number and a fixed sample list, so every
  // person saw the same XP and “Maya Okafor (you)”).
  const XPM = LearnXP.build(s), myXp = XPM.get(role.name) || 0;
  const level = Math.floor(myXp / 1000) + 1, nextLevelXp = (Math.floor(myXp / 1000) + 1) * 1000, levelFrac = (myXp % 1000) / 1000;
  const C = 2 * Math.PI * 32;
  // v41.22: streak, week ticks and level name come from the person's real learning records (js/core/badges.js), not fixed values.
  const myStreak = Badges.streakOf(s, role.name);
  const LEVEL_NAMES = ['Newcomer', 'Explorer', 'Achiever', 'Rising Leader', 'Champion', 'Master'];   // edit freely: one name per level; the last one is used for every higher level
  const levelName = LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1];
  // leaderboard
  // Team = people with my manager (or my department when I have none). People who switched the leaderboard off in Preferences are
  // left out of other people's boards (they still see their own place).
  const meU = s.users.find(u => u.name === role.name) || {}, optOut = n => n !== role.name && ((s.prefs || {})[n] || {}).leaderboard === false;
  const mgr = meU.manager && meU.manager !== 'None' ? meU.manager : null;
  const lbP = u => ({ name: u.name, team: u.dept || '', xp: XPM.get(u.name) || 0, you: u.name === role.name });
  const pool = s.users.filter(u => u.status !== 'Deactivated' && (XPM.has(u.name) || u.name === role.name) && !optOut(u.name));   // v35: I always appear, even with 0 XP
  const teamAll = pool.filter(u => u.name === role.name || (mgr ? u.manager === mgr : u.dept && u.dept === meU.dept)).map(lbP).sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
  const teamRank = teamAll.findIndex(m => m.you) + 1, teamSorted = teamAll.slice(0, 10);
  const compAll = pool.map(lbP).sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name)), compRank = compAll.findIndex(m => m.you);
  const medal = ['#F2C46B', '#DCD3C8', '#E8B48F'];
  const lbHidden = ((s.prefs || {})[role.name] || {}).leaderboard === false;
  const lbRow = (p, i, extra) => ({ name: p.you ? p.name + (lbHidden ? ' (you · hidden from teammates)' : ' (you)') : p.name, first:p.name.split(' ')[0], team:p.team, xpFmt: fmt(p.xp), rank: i + 1, initials: ini(p.name), av: AV[Math.floor(Progress.hash(p.name) * 5) % 5], rowBg: p.you ? '#E7F0F7' : 'transparent', weight: p.you ? 700 : 500, rankBg: i < 3 ? medal[i] : '#EAF1F6', gap:false, ...(extra || {}) });
  const teamRows = teamSorted.map((p, i) => lbRow(p, i)).concat(teamRank > 10 ? [lbRow(teamAll[teamRank - 1], teamRank - 1, { gap:true })] : []);
  const compRows = compAll.slice(0, 10).map((p, i) => lbRow(p, i)).concat(compRank >= 10 ? [lbRow(compAll[compRank], compRank, { gap:true })] : []);
  const lbRows = s.lb === 'team' ? teamRows : compRows;
  // v36: connected, a learner can read only their own records, so others' XP needs a server ranking job (not in this build). Say so.
  const lbNote = Backend.on && pool.length <= 1 ? 'Rankings with your colleagues need the server ranking job, which isn’t connected yet. You can see your own XP.' : '';
  const podiumSrc = lbRows.slice(0, 3);
  const podium = [podiumSrc[1], podiumSrc[0], podiumSrc[2]].map((p, i) => p && ({ ...p, medal: medal[[1, 0, 2][i]], h: ['64px', '88px', '48px'][i] })).filter(Boolean);   // v35: no empty places
  const lbTabs = [['team', 'Team'], ['company', 'Company']].map(([id, label]) => ({ label, bg: s.lb === id ? '#FFFFFF' : 'transparent', fg: s.lb === id ? '#16324F' : '#526B7A', shadow: s.lb === id ? '0 1px 3px rgba(22,50,79,.15)' : 'none', pick: () => this.setState({ lb:id }) }));
  // homepage announcements
  // v36: lighter style (Important = warm amber, not black) and Important ones first; the home page shows one, “Show all” the rest.
  const liveAnns = s.anns.filter(a => annStatus(a) === 'Live' && !s.annHidden[a.id]).sort((x, y) => (y.tone === 'Important') - (x.tone === 'Important')).map(a => ({ ...a, bg: a.tone === 'Important' ? '#FFFBEB' : '#FFFFFF', fg: '#16324F', sub: a.tone === 'Important' ? '#7A4A06' : '#526B7A', bd: a.tone === 'Important' ? '#F2C46B' : '#D7E3EC', dot: a.tone === 'Important' ? '#D64545' : '#007A4D', untilLabel: 'Until ' + fmtDateTime(a.until), hide: () => this.setState(st => ({ annHidden: { ...st.annHidden, [a.id]: true } })) }));
  const fmtDue = x => x.d.overdue ? 'Overdue · ' + shortDate(x.d.due) : 'Due ' + shortDate(x.d.due);
  const asCard = x => { const c0 = byId(x.a.id) || {}, days = daysUntil(x.d.due), soon = x.d.overdue || days <= 7;
    return { ...c0, pct: x.d.pct, pctStr: x.d.pct + '%', due: fmtDue(x), dueBg: soon ? '#FDECEC' : '#EAF1F6', dueFg: soon ? '#A63232' : '#334E68', open: () => this.openCourse(x.a.id) }; };
  const assigned = S.list.filter(x => live.has(x.a.id)).sort((x, y) => (x.d.due || '9').localeCompare(y.d.due || '9')).map(asCard);
  const soonList = S.dueSoon.filter(x => live.has(x.a.id));
  const first = soonList[0];
  const dueLine = !S.total ? 'Nothing is assigned to you yet. Browse the catalog to start learning.'
    : !soonList.length ? 'You have no learning activities due in the next two weeks.'
    : 'You have ' + soonList.length + ' learning ' + (soonList.length === 1 ? 'activity' : 'activities') + ' due soon. ' + first.a.title + (first.d.overdue ? ' is overdue.' : daysUntil(first.d.due) === 0 ? ' is due today.' : ' is due in ' + daysUntil(first.d.due) + (daysUntil(first.d.due) === 1 ? ' day.' : ' days.'));
  const hour = new Date().getHours();
  const goAssigned = st => () => this.go('catalog', { catRel:'assigned', catSt:st, catCat:'All', catLvl:'All', catQuery:'' });
  const dashStats = [
    { label:'Assigned courses', v: S.total, hint: S.dueWeek ? S.dueWeek + ' due in the next 7 days' : 'Nothing due in the next 7 days', icon:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5', color:'#16324F', tint:'#EAF1F6', go: goAssigned('All') },
    { label:'Not started', v: S.notStarted, hint:'Assigned, not opened yet', icon:'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', color:'#B7791F', tint:'#FEF3C7', go: goAssigned('Not started') },
    { label:'In progress', v: S.inProgress, hint:'Pick up where you left off', icon:'M5 12h14M13 6l6 6-6 6', color:'#2F4A7A', tint:'#E5ECF7', go: goAssigned('In progress') },
    { label:'Overdue', v: S.overdue, hint: S.overdue ? 'Past the due date, not finished' : 'Nothing overdue', icon:'M12 8v5M12 16.5h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', color:'#A63232', tint:'#FDECEC', go: goAssigned('Overdue') },
    { label:'Completed', v: S.done, hint: S.total ? Math.round(S.done / S.total * 100) + '% of assigned' : '—', icon:'M5 12l5 5 9-10', color:'#007A4D', tint:'#E3F1EE', go: goAssigned('Completed') },
  ];
  // Due soon: not completed, due within 14 days or overdue, soonest first.
  const dueOpen = soonList.map(asCard);
  const dueCompact = dueOpen.slice(0, 4), dueMore = dueOpen.length > 4 ? '+' + (dueOpen.length - 4) + ' more' : '';
  // Continue learning: the person's own in-progress (or most urgent) course.
  const CW = S.continueWith && live.has(S.continueWith.a.id) ? S.continueWith : null;
  let cont = null;
  if (CW) { const a = CW.a, st = Progress.itemStates(s, a, role.name), ni = Math.max(0, st.findIndex(x => !x.done)), it = a.items[ni] || {};
    const z = it.kind === 'quiz' ? s.quizzes.find(q => q.id === it.quizId) : null, m = it.moduleId ? s.lcms.find(x => x.id === it.moduleId) : null;
    const legacy = !Backend.on && COURSES.some(x => x.id === a.id), L = legacy ? FLAT[ni] : null;
    const leftMins = a.items.slice(ni).reduce((t, x, k) => t + (legacy ? (FLAT[ni + k] || {}).min || 5 : x.mins || 10), 0);
    const lastAt = st.map(x => x.at).filter(Boolean).sort().pop();
    cont = { id: a.id, legacy, idx: ni, title: a.title, pctStr: CW.d.pct + '%', next: z ? z.name : m ? m.title : L ? L.title : it.title || 'Next step', nextMin: legacy && L ? L.min : it.mins || 10,
      last: lastAt ? (lastAt === TODAY_KEY ? 'Today' : shortDate(lastAt)) : 'Not started', left: (leftMins >= 60 ? Math.floor(leftMins / 60) + 'h ' : '') + (leftMins % 60) + 'm', due: CW.d.due ? shortDate(CW.d.due) : 'No due date',
      label: CW.d.overdue ? 'OVERDUE · PICK THIS UP FIRST' : CW.d.status === 'In progress' ? 'Continue learning' : 'Start next', cta: CW.d.status === 'Not started' ? 'Start course' : 'Resume',
      // v39: the course's own cover (uploaded by an admin) fills the right of the card; none = plain navy card
      hasImg: !!(a.banner && a.banner.src), artImg: a.banner && a.banner.src ? 'url("' + a.banner.src + '")' : '' }; }
  const sat = s.lessonsToday > 0;
  const week = Badges.weekStrip(s, role.name).map(d => ({ l: d.label, mark: d.done ? '✓' : '', bg: d.done ? '#0066A1' : '#FFFFFF', border: d.done || d.today ? '#0066A1' : '#D7E3EC', fg: d.done ? '#FFFFFF' : '#16324F' }));
  const questsRaw = [{ t:'Complete 1 lesson', xp:50, done: sat }, { t:'Reply in a discussion', xp:20, done: s.quests.discuss }, { t:'Score 80%+ on a quiz', xp:100, done: s.qDone && qsc.pct >= 80 }];
  const quests = questsRaw.map(x => ({ ...x, bg: x.done ? '#E3F1EE' : '#F4F8FC', box: x.done ? '#007A4D' : '#BFCFDB', boxFill: x.done ? '#007A4D' : '#FFFFFF', fg: x.done ? '#245E52' : '#16324F' }));
  // Badges come from Settings › Master data › Badges; earned from this person's learning records.
  const BM = Badges.metrics(s, role.name);
  const badges = s.badges.filter(b => b.on).map(b => { const v = BM[b.metric] || 0, e = v >= b.n;
    return { glyph: b.glyph, name: b.name, desc: b.desc + (e ? '' : ' · ' + Math.min(v, b.n) + ' / ' + b.n), bg: e ? b.color + '22' : '#EAF1F6', ring: e ? b.color : '#C9D7E2', fg: e ? b.color : '#7F96A6', nameFg: e ? '#16324F' : '#526B7A', cardBg: e ? '#FFFFFF' : 'transparent', e }; });
  return {
    liveAnns, lbNote, lbHasNote: !!lbNote,
    hasAnns: liveAnns.length > 0 && ((s.platform || PLATFORM0).feat.anns !== false),
    annShow: s.annAll ? liveAnns : liveAnns.slice(0, 1), annMore: liveAnns.length > 1,
    annMoreLabel: s.annAll ? 'Show fewer announcements' : 'Show all ' + liveAnns.length + ' announcements', annToggle: () => this.setState({ annAll: !s.annAll }),
    isLearner: s.role === 'learner',
    streak: myStreak,
    xpFmt: fmt(myXp),
    level,
    levelName, levelNameUp: levelName.toUpperCase(),
    nextLevel: level + 1,
    xpToNext: fmt(nextLevelXp - myXp),
    nextLevelXpFmt: fmt(nextLevelXp),
    levelPct: Math.round(levelFrac * 100) + '%',
    ringDash: (C * levelFrac).toFixed(1) + ' ' + C.toFixed(1),
    teamRank, hasTeamRank: teamAll.length > 1,   // alone on the board (e.g. a learner who can only read their own records) is not a real rank
    cont: cont || {}, hasCont: !!cont, noCont: !cont,
    dashStats: Tiles.apply(s, 'home', dashStats.map(d => ({ ...d, key: d.label })), d => d.key, (d, l) => ({ ...d, label: l })),
    dueCompact,
    dueEmpty: dueOpen.length === 0, dueEmptyText: S.total ? 'Nothing due in the next two weeks.' : 'Nothing assigned yet.',
    dueMore,
    hasDueMore: !!dueMore,
    goDueAll: goAssigned('All'),
    dueLine,
    greeting: hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening',
    todayLabel: TODAY.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }),
    teamSizeLabel: TEAM.length + ' people',
    resumeCourse: () => { if (!cont) return; if (cont.legacy) this.setState({ courseId: cont.id }, () => this.openLesson(this.firstOpen(cont.id))); else this.go('item', { courseId: cont.id, itemIdx: cont.idx, scormOn:false, from:'home' }); },
    openContCourse: () => { if (cont) this.openCourse(cont.id); },
    assigned,
    // v41: the course cover fills the card when one was uploaded; otherwise the tinted art as before
    recommended: liveAll.filter(c => ['coaching', 'eq', 'inclusive'].includes(c.id)).map(c => ({ ...c, hasArt: !!c.iconSrc || /url\(/.test(c.artBg || ''), noArt: !(/url\(/.test(c.artBg || '')), art: c.artBg || c.tint })),
    goCatalog: () => this.go('catalog'),
    goProgress: () => this.go('progress'),
    week,
    quests,
    teamTop5: teamRows.slice(0, 5),
    statCards: [{ v: S.done, l:'Courses completed', tint:'#E3F1EE', color:'#007A4D' }, { v:'26.5h', l:'Time learning', tint:'#F1E7F4', color:'#8C5A9E' }, { v:'2', l:'Certificates', tint:'#FDECEC', color:'#D64545' }],
    badges,
    badgesEarned: badges.filter(b => b.e).length, badgesTotal: badges.length,
    skills: [['Change leadership', 72, '#0066A1'], ['Giving feedback', 58, '#007A4D'], ['Coaching', 40, '#8C5A9E'], ['Communication', 81, '#007A4D'], ['Self-management', 35, '#D64545']].map(([name, v, color]) => ({ name, v, pct: v + '%', color })),
    certs: [{ title:'Running Effective 1:1s', date:'Sep 12, 2026', id:'SF-48213', tint:'#F1E7F4', color:'#8C5A9E' }, { title:'Foundations of Management', date:'Jun 3, 2026', id:'SF-30977', tint:'#E7F0F7', color:'#0066A1' }].map(c => ({ ...c, download: () => this.toastMsg('Certificate downloaded') })),
    lbTabs,
    lbRows,
    podium,
  };
};
