/* Skillforge LMS — calendar and discussions. */
/* Calendar entries for one person: organisation sessions (sample org events), their own due dates and their batches. */
const calEvents = (s, me) => {
  const ev = {}, add = (k, e) => { (ev[k] = ev[k] || []).push(e); };
    // v41.19: the sample organisation's sessions are shown only offline (they are demo data, not stored in the database)
    if (!Backend.on) Object.keys(EVENTS).forEach(k => EVENTS[k].forEach((e, i) => { if (e.kind !== 'due') add(k, { ...e, key: k + '|' + i }); }));
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
  // v41.19: learners have no live updates, so the discussions are re-read from the database when the page opens (at most every 30 s).
  if (Backend.on && s.screen === 'discussions' && s.authed && (!this._thrAt || Date.now() - this._thrAt > 30000)) { this._thrAt = Date.now(); Promise.resolve().then(() => Backend.reloadColl('threads')).catch(() => {}); }
  // v41.19: threads that came from the database carry "tag" / "when"; sample threads carry "course" / "time". Both are shown.
  const threads = s.threads || [];
  const thread0 = threads.find(t => t.id === s.threadId) || threads[0] || { id: null, title:'No discussions yet', body:'', author:'', time:'', votes:0, replies:[], none:true };
  const tLabel = t => t.course || t.tag || 'General', tTime = t => t.time || t.when || '';
  const replies0 = thread0.replies || [];
  const thread = { ...thread0, course: tLabel(thread0), time: tTime(thread0), body: thread0.body || thread0.text || '', votes: (thread0.votes || 0) + (myVotes[thread0.id] ? 1 : 0), initials: thread0.author ? ini(thread0.author) : '', replyCount: replies0.length,
    replies: replies0.map((r, i) => ({ ...r, body: r.body || r.text || '', time: r.time || '', initials: ini(r.author || 'Member'), av: AV[(i + 1) % 5], isInstructor: !!r.instructor })) };
  const threadList = threads.map(t => ({ ...t, course: tLabel(t), time: tTime(t), votes: (t.votes || 0) + (myVotes[t.id] ? 1 : 0), replyCount: (t.replies || []).length, border: t.id === thread0.id ? '#0066A1' : '#D7E3EC', pick: () => this.setState({ threadId:t.id, reply:'', dNew:null }) }));
  // v41.19: start a new discussion (there was no way to create one; with no threads the Post button did nothing).
  const dn = s.dNew || null, setDn = k => e => this.setState(st => ({ dNew: { ...(st.dNew || {}), [k]: e.target.value } }));
  const busy = !!s.dBusy;
  const postNew = () => { if (busy || !dn) return; const title = (dn.title || '').trim(), body = (dn.body || '').trim(), tag = (dn.tag || '').trim() || 'General';
    if (!title) return this.toastMsg('Add a title'); if (title.length > 140) return this.toastMsg('Title is too long (140 characters max)'); if (!body) return this.toastMsg('Write your question or idea');
    if (Backend.on) { this.setState({ dBusy:true });
      Backend.call('post', { title, body, tag }).then(r => { this.setState({ dBusy:false, dNew:null, threadId: (r && r.id) || s.threadId }); this.toastMsg('Discussion posted'); })
        .catch(e => { this.setState({ dBusy:false }); this.toastMsg('Not posted: ' + e.message); }); return; }
    const id = 't' + Date.now().toString(36);
    this.setState(st => ({ threads: [{ id, course: tag, title, body, author: role.name, time:'Just now', votes:0, replies:[] }].concat(st.threads || []), threadId:id, dNew:null }));
    this.toastMsg('Discussion posted'); };
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
    noThreads: !threads.length, hasThreads: threads.length > 0,
    dNewOpen: !!dn, dNew: dn || {}, dNewStart: () => this.setState({ dNew: { title:'', body:'', tag:'' } }), dNewCancel: () => this.setState({ dNew:null }),
    setDnTitle: setDn('title'), setDnBody: setDn('body'), setDnTag: setDn('tag'), dNewPost: postNew, dNewLabel: busy ? 'Posting…' : 'Post discussion', dBusy: busy,
    showThread: threads.length > 0 && !dn, dEmptyRight: !threads.length && !dn, replyLabel: busy ? 'Posting…' : 'Post',
    reply: s.reply,
    setReply: e => this.setState({ reply: e.target.value }),
    replyBtnBg: s.reply.trim() ? '#0066A1' : '#D7E3EC', replyBtnFg: s.reply.trim() ? '#FFFFFF' : '#526B7A',
    postReply: () => { const text = (s.reply || '').trim(); if (busy) return; if (!text) return this.toastMsg('Write a reply first'); if (thread0.id == null) return this.toastMsg('Start a discussion first');
      // v41.19: the reply goes to the thread on screen (thread0). It used to go to s.threadId, which pointed at a sample thread
      // that does not exist in the database, so the server answered "Thread not found" and nothing appeared.
      if (Backend.on) { this.setState({ dBusy:true });
        Backend.call('post', { threadId: thread0.id, body: text }).then(() => { this.setState({ reply:'', dBusy:false, threadId: thread0.id }); this.toastMsg('Reply posted'); })
          .catch(e => { this.setState({ dBusy:false }); this.toastMsg('Not posted: ' + e.message); }); return; }
      const learner = s.role === 'learner';
      this.setState(st => ({ threads: (st.threads || []).map(t => t.id !== thread0.id ? t : { ...t, replies: [...(t.replies || []), { author: role.name, instructor: st.role === 'instructor', time:'Just now', body: text }] }), threadId: thread0.id, reply:'', quests: { ...(st.quests || {}), discuss:true }, xp: st.xp + (learner ? 20 : 0) }));
      this.toastMsg(learner ? 'Reply posted · +20 XP' : 'Reply posted'); },
  };
};
