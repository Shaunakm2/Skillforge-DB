/* Skillforge LMS — calendar and discussions. */
/* Calendar entries for one person: organisation sessions (sample org events), their own due dates and their batches. */
const calEvents = (s, me) => {
  const ev = {}, add = (k, e) => { (ev[k] = ev[k] || []).push(e); };
    Object.keys(EVENTS).forEach(k => EVENTS[k].forEach((e, i) => { if (e.kind !== 'due') add(k, { ...e, key: k + '|' + i }); }));
    const en = s.enroll[me] || {}; Object.keys(en).forEach(cid => { const a = Progress.courseOf(s, cid); if (a && en[cid] && !Progress.courseDone(s, me, a)) add(en[cid], { t:'Due: ' + a.title, time:'End of day', kind:'due', key:'due|' + cid }); });
    (s.batches || []).forEach(b => { const tr = b.trainer === me, tn = (b.trainees || []).includes(me); if (!tr && !tn) return;
      add(b.start, { t: (tr ? 'You train: ' : 'Your batch starts: ') + b.code, time:'Day 1', kind:'live', key:'b|' + b.id + '|s' });
      if (b.end && b.end !== b.start) add(b.end, { t:'Classroom ends: ' + b.code, time:'Last training day', kind:'live', key:'b|' + b.id + '|e' }); });
  return ev;
};

SkillforgeApp.prototype.vmCommunity = function (c) {
  const { role, s } = c, me = role.name;
  // Calendar (v33): the organisation's sessions plus MY due dates and MY batches (it used to show the same sample due dates to
  // everyone). Sign-ups are kept per person in their preferences (saved; owner-only when connected).
  const EV = calEvents(s, me);
  const myReg = (((s.prefs || {})[me] || {}).reg) || {};
  const first = new Date(s.calY, s.calM, 1), startDow = (first.getDay() + 6) % 7, dim = new Date(s.calY, s.calM + 1, 0).getDate();
  const rows = Math.ceil((startDow + dim) / 7), cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(s.calY, s.calM, i - startDow + 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const inM = d.getMonth() === s.calM, today = key === TODAY_KEY, sel = key === s.calSel;
    cells.push({ day:d.getDate(), op: inM ? 1 : 0.4, border: sel ? '#0066A1' : 'transparent', bg: sel ? '#EDF5FA' : '#F4F8FC', numBg: today ? '#16324F' : 'transparent', numFg: today ? '#F8FBFD' : '#16324F', events:(EV[key] || []).map(e => ({ t:e.t, bg:KIND[e.kind].bg, fg:KIND[e.kind].fg })), pick: () => this.setState({ calSel:key }) });
  }
  const selD = new Date(s.calSel + 'T12:00:00');
  const selEvents = (EV[s.calSel] || []).map(e => ({ full:e.t, time:e.time, kindLabel:KIND[e.kind].label, bg:KIND[e.kind].bg, fg:KIND[e.kind].fg }));
  const upcoming = Object.keys(EV).filter(k => k >= TODAY_KEY).sort().slice(0, 5).map(k => { const e = EV[k][0]; const d = new Date(k + 'T12:00:00'); return { mon: MONTHS[d.getMonth()].slice(0, 3).toUpperCase(), d: d.getDate(), t:e.t, dot:KIND[e.kind].dot }; });
  const shiftM = n => { const d = new Date(s.calY, s.calM + n, 1); this.setState({ calY:d.getFullYear(), calM:d.getMonth() }); };
  // discussions
  // A deleted or missing thread used to crash every screen (this runs on every render). Fall back to the first one, or none.
  const myVotes = (((s.prefs || {})[me] || {}).voted) || {};
  const thread0 = s.threads.find(t => t.id === s.threadId) || s.threads[0] || { id: null, title:'No discussions yet', text:'', author:'', when:'', votes:0, replies:[], none:true };
  const thread = { ...thread0, votes: (thread0.votes || 0) + (myVotes[thread0.id] ? 1 : 0), initials: ini(thread0.author), replyCount: thread0.replies.length, replies: thread0.replies.map((r, i) => ({ ...r, initials: ini(r.author), av: AV[(i + 1) % 5], isInstructor: !!r.instructor })) };
  const threadList = s.threads.map(t => ({ ...t, votes: (t.votes || 0) + (myVotes[t.id] ? 1 : 0), replyCount: t.replies.length, border: t.id === s.threadId ? '#0066A1' : '#D7E3EC', pick: () => this.setState({ threadId:t.id, reply:'' }) }));
  return {
    calTitle: MONTHS[s.calM] + ' ' + s.calY,
    dow: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    calCells: cells,
    calPrev: () => shiftM(-1),
    calNext: () => shiftM(1),
    calToday: () => this.setState({ calY:TODAY.getFullYear(), calM:TODAY.getMonth(), calSel:TODAY_KEY }),
    calSelLabel: selD.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }),
    selEvents,
    selHasEvents: selEvents.length > 0,
    selNoEvents: selEvents.length === 0,
    upcoming,
    threadList,
    thread,
    voteBorder: myVotes[thread0.id] ? '#0066A1' : '#D7E3EC',
    voteBg: myVotes[thread0.id] ? '#E7F0F7' : '#FFFFFF',
    upvote: () => { if (thread0.id == null) return; this.setState(st => { const p0 = (st.prefs || {})[me] || {}, v = { ...(p0.voted || {}) }; if (v[thread0.id]) delete v[thread0.id]; else v[thread0.id] = true; return { prefs: { ...st.prefs, [me]: { ...p0, voted: v } } }; }); },
    noThreads: !s.threads.length,
    reply: s.reply,
    setReply: e => this.setState({ reply: e.target.value }),
    replyBtnBg: s.reply.trim() ? '#0066A1' : '#D7E3EC', replyBtnFg: s.reply.trim() ? '#FFFFFF' : '#526B7A',
    postReply: () => { if (!s.reply.trim() || thread0.id == null) return;
      if (Backend.on) { Backend.call('post', { threadId: s.threadId, body: s.reply.trim() }).then(() => { this.setState({ reply:'' }); this.toastMsg('Reply posted'); }).catch(e => this.toastMsg(e.message)); return; } const firstReply = !s.quests.discuss && s.role === 'learner'; this.setState({ threads: s.threads.map(t => t.id !== s.threadId ? t : { ...t, replies: [...t.replies, { author: role.name, instructor: s.role === 'instructor', time:'Just now', body: s.reply.trim() }] }), reply:'', quests: { discuss:true }, xp: s.xp + (s.role === 'learner' ? 20 : 0) }); this.toastMsg(s.role === 'learner' ? 'Reply posted · +20 XP' : 'Reply posted'); },
  };
};
