/* Skillforge LMS — course overview, lesson player, step player and the assessment (quiz) player. */
// v41.2: a fresh database has no quizzes yet; this placeholder keeps every screen (incl. sign-in) rendering.
const NO_QUIZ = Object.freeze({ id: null, name: 'No quiz', title: 'No quiz', ids: [], dynamic: false, drawCount: 0, pass: 0, attempts: '1' });
SkillforgeApp.prototype.vmPlayer = function (c) {
  const { IK, course, firstOpenItem, icA, icIsItem, icSt, itemRows, markItem, myEnroll, role, s } = c;
  // curriculum
  const curriculum = MODS.map((m, mi) => {
    const ls = FLAT.filter(l => l.mi === mi).map(l => { const d = this.lessonDone(s.courseId, l.key); const cur = s.screen === 'lesson' && l.key === s.lessonKey; return { ...l, done:d, dotBg: d ? '#007A4D' : '#FFFFFF', dotBorder: d ? '#007A4D' : cur ? '#0066A1' : '#C9D7E2', rowBg: cur ? '#E7F0F7' : 'transparent', rowBar: cur ? '#0066A1' : 'transparent', weight: cur ? 700 : 500, open: () => this.openLesson(l.key) }; });
    const mins = ls.reduce((a, l) => a + l.min, 0);
    return { n: mi + 1, title: m.title, lessons: ls, summary: ls.filter(l => l.done).length + '/' + ls.length + ' · ' + mins + ' min' };
  });
  const L = FLAT.find(l => l.key === s.lessonKey);
  const lDone = this.lessonDone(s.courseId, L.key);
  const isQuizL = L.type === 'Quiz';
  const _ml = FLAT.filter(l => l.mi === L.mi), _dn = l => this.lessonDone(s.courseId, l.key), _ix = FLAT.indexOf(L);
  const pl = { module:'Module ' + (L.mi + 1) + ': ' + L.module, modDone:_ml.filter(_dn).length, modTotal:_ml.length, overall:Math.round(100 * FLAT.filter(_dn).length / FLAT.length) + '% complete', left:FLAT.filter(l => !_dn(l)).reduce((a, l) => a + l.min, 0), hasPrev:_ix > 0, nextLabel:_ix === FLAT.length - 1 ? 'Finish course' : 'Next →' };
  // Learners may only mark content complete when the course allows it (Settings › Course catalog › Learning rules).
  const legacyA = s.adminCourses.find(x => x.id === s.courseId), legacySelf = !!(legacyA && legacyA.features.selfComplete);
  const lesson = { ...L, num: FLAT.indexOf(L) + 1, isQuiz:isQuizL, isMedia:!isQuizL, done:lDone, canComplete: !lDone && !isQuizL && legacySelf };
  const total = L.min * 60, mmss = x => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
  const lc = LESSON_COPY[L.title] || { body:'This ' + L.type.toLowerCase() + ' is part of “' + L.module + '”. Work through it at your own pace, then mark it complete to earn XP and unlock the next step.', points:['Connect the idea to a situation on your team this month.', 'Note one thing you will try before the next lesson.', 'Share a question in Discussions if anything is unclear.'] };
  // quiz — the attempt is drawn from the quiz attached to this course (js/assessment.js)
  const crsQuiz = (() => { const ac = s.adminCourses.find(c => c.id === s.courseId); const cur = icIsItem && ac && ac.items[s.itemIdx] && ac.items[s.itemIdx].kind === 'quiz' ? ac.items[s.itemIdx] : null; const it = cur || (ac && ac.items.find(x => x.kind === 'quiz')); return (s.quizzes || []).find(z => z.id === (it ? it.quizId : 1)) || (s.quizzes || [])[0] || NO_QUIZ; })();
  const me = role.name;
  const myAtt = Assessment.attemptsInfo(crsQuiz, (s.attemptsUsed[me] || {})[crsQuiz.id], (s.extraAttempts[me] || {})[crsQuiz.id]);
  const att = s.attempt, qN = att.length;
  const curA = att[Math.min(s.qi, Math.max(0, qN - 1))];
  // Connected: questions come from the server without answer keys; grading happens on the server.
  const remote = Backend.on && !!s.rAttemptId, rG = remote ? (s.rGrades || {})[s.qi] || null : null;
  const QQ = !curA ? null : remote ? { ...(s.rq || {})[curA.qid], ...(rG ? rG.rev : {}) } : s.qs.find(x => x.id === curA.qid);
  const hasKey = !remote || !!(rG && rG.rev && ('ans' in rG.rev || 'answers' in rG.rev || 'accept' in rG.rev || 'matchKey' in rG.rev || 'orderKey' in rG.rev));
  const qType = QQ ? QQ.type : '';
  const isWrittenQ = qType === 'Written answer';
  const isSingle = ['Multiple choice', 'True / False', 'Image options'].includes(qType);
  const okC = '#007A4D', badC = '#D64545';
  const optStyle = (sel, right, wrong) => ({ border: right ? okC : wrong ? badC : sel ? '#0066A1' : '#D7E3EC', bg: right ? '#E3F1EE' : wrong ? '#FDECEC' : sel ? '#EDF5FA' : '#FFFFFF', keyBg: right ? okC : wrong ? badC : sel ? '#0066A1' : '#EAF1F6', keyFg: right || wrong ? '#FFFFFF' : '#16324F' });
  // single answer + multiple select share the option list
  const quizOpts = QQ && (isSingle || qType === 'Multiple select') ? curA.order.map((oi, pos) => {
    const multi = qType === 'Multiple select';
    const sel = multi ? !!s.qMulti[oi] : s.qSel === oi;
    const isAns = !hasKey ? (sel && rG && rG.g === 1) : multi ? (QQ.answers || []).includes(oi) : oi === QQ.ans;
    const o = QQ.opts[oi];
    return { t: typeof o === 'string' ? o : o.label, src: typeof o === 'string' ? '' : o.src, key: 'ABCDEF'[pos], ...optStyle(sel, s.qChecked && isAns, s.qChecked && sel && !isAns), pick: () => { if (s.qChecked) return; if (multi) this.setState(st => ({ qMulti: { ...st.qMulti, [oi]: !st.qMulti[oi] } })); else this.setState({ qSel:oi }); } };
  }) : [];
  const likertOpts = qType === 'Likert scale' ? Assessment.LIKERT.map((label, i) => { const on = s.qSel === i; return { label, n: i + 1, bg: on ? '#16324F' : '#FFFFFF', fg: on ? '#F8FBFD' : '#16324F', border: on ? '#16324F' : '#D7E3EC', pick: () => { if (!s.qChecked) this.setState({ qSel:i }); } }; }) : [];
  const matchRows = qType === 'Match the following' ? QQ.pairs.map(([left], li) => {
    const key = remote ? (QQ.matchKey ? QQ.matchKey[li] : null) : li, v = s.qMatch[li], ok = s.qChecked && (key == null ? !!(rG && rG.g === 1) : v === key), bad = s.qChecked && key != null && v !== key;
    return { left, value: v === undefined ? '' : String(v), opts: [{ v:'', l:'Choose a match…' }].concat(curA.order.map(ri => ({ v:String(ri), l: QQ.pairs[ri][1] }))), set: e => { if (!s.qChecked) { const x = e.target.value; this.setState(st => ({ qMatch: { ...st.qMatch, [li]: x === '' ? undefined : Number(x) } })); } }, ok, bad, correct: QQ.pairs[li][1], border: ok ? okC : bad ? badC : '#C9D7E2' };
  }) : [];
  const orderNow = qType === 'Ordering' ? (s.qOrder || curA.order) : [];
  const moveOrd = (i, d) => { const o = orderNow.slice(), j = i + d; if (s.qChecked || j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; this.setState({ qOrder:o }); };
  const okAt = (ii, pos) => remote ? (QQ.orderKey ? QQ.orderKey[pos] === ii : !!(rG && rG.g === 1)) : ii === pos;
  const orderRows = orderNow.map((ii, pos) => ({ n: pos + 1, t: QQ.items[ii], up: () => moveOrd(pos, -1), down: () => moveOrd(pos, 1), border: s.qChecked ? (okAt(ii, pos) ? okC : badC) : '#D7E3EC', bg: s.qChecked ? (okAt(ii, pos) ? '#E3F1EE' : '#FDECEC') : '#FFFFFF' }));
  const quizSegs = att.map((_, i) => ({ bg: i < s.qi ? '#007A4D' : i === s.qi ? '#0066A1' : '#D7E3EC' }));
  const curAns = () => {
    if (isWrittenQ || qType === 'Fill in the blank') return { text: s.qText.trim() };
    if (qType === 'Multiple select') return { multi: Object.keys(s.qMulti).filter(k => s.qMulti[k]).map(Number) };
    if (qType === 'Match the following') return { match: { ...s.qMatch } };
    if (qType === 'Ordering') return { order: orderNow.slice() };
    return { sel: s.qSel };
  };
  const canAnswer = !QQ ? false : isWrittenQ || qType === 'Fill in the blank' ? !!s.qText.trim() : qType === 'Multiple select' ? Object.values(s.qMulti).some(Boolean) : qType === 'Match the following' ? QQ.pairs.every((_, i) => s.qMatch[i] !== undefined) : qType === 'Ordering' ? true : s.qSel !== null;
  const gradeNow = QQ && s.qChecked ? (remote ? (rG ? rG.g : null) : Assessment.grade(QQ, s.answers[s.qi])) : null;
  const isRight = gradeNow === 1;
  const freshQ = { qSel:null, qChecked:false, qText:'', qMulti:{}, qMatch:{}, qOrder:null };
  const quizAction = () => {
    if (!QQ || (!s.qChecked && !canAnswer)) return;
    if (remote && !s.qChecked) {
      if (s.rBusy) return; const ans = curAns(), qi = s.qi; this.setState({ rBusy:true });
      Backend.call('answer', { attemptId: s.rAttemptId, index: qi, answer: ans }).then(r => { const { g, _touched, feedbackIncorrect, ...rev } = r;
        this.setState(st => ({ rBusy:false, qChecked:true, qCorrect: st.qCorrect + (g === 1 ? 1 : 0), answers: { ...st.answers, [qi]: ans }, rGrades: { ...(st.rGrades || {}), [qi]: { g, rev } } })); })
        .catch(e => { this.setState({ rBusy:false }); this.toastMsg(e.message); });
      return;
    }
    if (remote && s.qi === qN - 1) {
      if (s.rBusy) return; this.setState({ rBusy:true });
      Backend.call('submit', { attemptId: s.rAttemptId }).then(r => { this.setState(st => ({ rBusy:false, qDone:true, rResult: r, xp: st.xp + st.qCorrect * 30 }));
        if (r.passed) this.toastMsg('Assessment passed'); }).catch(e => { this.setState({ rBusy:false }); this.toastMsg(e.message); });
      return;
    }
    if (!s.qChecked) {
      const ans = curAns(), g = Assessment.grade(QQ, ans);
      this.setState({ qChecked:true, qCorrect: s.qCorrect + (g === 1 ? 1 : 0), answers: { ...s.answers, [s.qi]: ans } });
      return;
    }
    if (s.qi === qN - 1) {
      // Written answers go to the trainer's review queue.
      const z = s.quizzes.find(x => x.id === s.attemptQuiz) || crsQuiz;
      const answers = { ...s.answers }, newReviews = [];
      att.forEach((a, i) => { const q = s.qs.find(x => x.id === a.qid); if (q && Assessment.isWritten(q) && answers[i]) { const id = 'r' + Date.now() + '-' + i; answers[i] = { ...answers[i], reviewId:id }; newReviews.push({ id, learner: role.name, quiz: z.name, qid: q.id, answer: answers[i].text, submitted:'Just now', rating:null, feedback:'' }); } });
      const allReviews = newReviews.concat(s.reviews), sc = Assessment.score(att, answers, s.qs, allReviews), passed = sc.final && sc.pct >= z.pass;
      // Keep a dated record of every attempt for the assessment reports.
      const uMe = s.users.find(u => u.name === role.name) || {}, crs = s.adminCourses.find(x => x.id === s.courseId) || {}, now = nowStamp();
      const rec = { id:'ar' + Date.now(), user: role.name, empId: uMe.empId || '', quizId: z.id, quizName: z.name, courseId: s.courseId, courseCode: crs.code || '', courseTitle: crs.title || course.title, attemptNo: ((s.attemptsUsed[role.name] || {})[z.id] || 1),
        startedAt: s.attemptStartedAt || now, submittedAt: now, mins: Math.max(1, Math.round((Date.now() - (s.attemptStartedMs || Date.now())) / 60000)), correct: sc.autoRight, total: sc.auto + sc.written, score: sc.pct, pass: passed,
        res: att.map((a, i) => { const q = s.qs.find(x => x.id === a.qid); const g = q ? Assessment.grade(q, answers[i]) : 0; return { qid: a.qid, ok: g === 1 }; }) };
      this.setState(st => ({ attemptRecs: st.attemptRecs.concat([rec]) }));
      if (icIsItem) {
        // Keep every attempt: the step passes as soon as one attempt passes (including after a trainer rates written answers).
        const u = role.name, uq = { ...(s.itemQuiz[u] || {}) }, cq = { ...(uq[s.courseId] || {}) }; cq[s.itemIdx] = (cq[s.itemIdx] || []).concat([{ attempt: att, answers }]); uq[s.courseId] = cq;
        this.setState({ qDone:true, answers, reviews: allReviews, xp: s.xp + s.qCorrect * 30, itemQuiz: { ...s.itemQuiz, [u]: uq } }, () => this.syncQuizDone(u, [s.courseId]));
        if (passed) this.toastMsg(icSt.filter((x, k) => !x.done && k !== s.itemIdx).length ? 'Assessment passed' : course.title + ' complete');
      } else {
        // Course lessons: the assessment step only counts as done when the learner passes.
        this.setState({ qDone:true, answers, reviews: allReviews, xp: s.xp + s.qCorrect * 30 }); if (passed) this.markLesson(s.courseId, s.lessonKey, { at: TODAY_KEY, score: sc.pct });
      }
      return;
    }
    this.setState({ qi:s.qi + 1, ...freshQ });
  };
  // Starting an attempt uses one of the learner's allowed attempts.
  const newAttempt = () => {
    if (!myAtt.canStart) { this.toastMsg('You have used all ' + myAtt.allowed + ' attempts. Ask your admin for another attempt.'); return null; }
    const attempt = Assessment.buildAttempt(crsQuiz, s.qs);
    if (!attempt.length) { this.toastMsg('This quiz has no questions yet'); return null; }
    return { attemptStartedAt: nowStamp(), attemptStartedMs: Date.now(), qi:0, qCorrect:0, qDone:false, attempt, answers:{}, attemptQuiz: crsQuiz.id, ...freshQ, attemptsUsed: { ...s.attemptsUsed, [me]: { ...(s.attemptsUsed[me] || {}), [crsQuiz.id]: myAtt.used + 1 } } };
  };
  const qsc = remote ? (s.rResult ? s.rResult.score : { auto: qN, autoRight: Object.values(s.rGrades || {}).filter(x => x.g === 1).length, pending: 0, final: false, pct: 0, written: 0 })
    : Assessment.score(att, s.answers, s.qs, s.reviews);
  // Connected: start an attempt on the server (it checks the attempt limit and draws the questions).
  const startRemote = () => { const step = icIsItem ? s.itemIdx : FLAT.findIndex(l => l.key === s.lessonKey);
    Backend.call('startAttempt', { courseId: s.courseId, step }).then(r => this.go('quiz', { rAttemptId: r.attemptId, rq: Object.fromEntries(r.questions.map(q => [q.id, q])), rGrades:{}, rResult:null, rBusy:false,
      attempt: r.questions.map(q => ({ qid: q.id, order: Array.from({ length: (q.opts || q.pairs || q.items || []).length }, (_, i) => i) })), attemptStartedAt: nowStamp(), attemptStartedMs: Date.now(),
      qi:0, qCorrect:0, qDone:false, answers:{}, attemptQuiz: r.quiz.id, ...freshQ })).catch(e => this.toastMsg(e.message)); };
  const qMedia = QQ && QQ.media ? { ...QQ.media, isImage: QQ.media.kind === 'image', isAudio: QQ.media.kind === 'audio', isVideo: QQ.media.kind === 'video' } : {};
  const fbText = !QQ ? '' : isWrittenQ ? 'Your trainer will rate this answer. Your score updates once it is rated.'
    : qType === 'Likert scale' ? 'Thanks. This question is not scored.'
    : [qType === 'Fill in the blank' && !isRight && (QQ.accept || []).length ? 'Accepted answer: ' + QQ.accept[0] + '.' : '', qType === 'Ordering' && !isRight && (!remote || QQ.orderKey) ? 'Correct order: ' + (remote ? QQ.orderKey.map(i => QQ.items[i]) : QQ.items).map((t, i) => (i + 1) + '. ' + t).join('  ') : '', QQ.why || ''].filter(Boolean).join(' ');
  const attLabel = myAtt.unlimited ? 'Unlimited attempts' : myAtt.left + ' of ' + myAtt.allowed + (myAtt.allowed === 1 ? ' attempt' : ' attempts') + ' left' + (myAtt.extra ? ' (includes ' + myAtt.extra + ' extra)' : '');
  const qWords = s.qText.trim() ? s.qText.trim().split(/\s+/).length : 0;
  // step player
  const curIt = icIsItem ? icA.items[Math.min(s.itemIdx, icA.items.length - 1)] : null;
  const curSt = icIsItem ? icSt[Math.min(s.itemIdx, icSt.length - 1)] || {} : {};
  const curQz = curIt && curIt.kind === 'quiz' ? s.quizzes.find(x => x.id === curIt.quizId) : null;
  this._scormDone = curIt && curIt.kind === 'scorm' && !curSt.done ? () => markItem(course.id, s.itemIdx, 'SCORM package complete') : null;
  // SCORM 1.2 / 2004 runtime for the package in the player: completion, score and resume point.
  // Connected: a launch session belongs to one step; moving elsewhere ends it (its link stops working).
  if (Backend.on && !(curIt && ['scorm', 'html', 'xapi'].includes(curIt.kind) && s.screen === 'item' && Backend.scormActive(course.id, s.itemIdx))) Backend.scormLeave();
  this._scormServerDone = () => this.toastMsg('SCORM package complete');
  if (curIt && curIt.kind === 'scorm' && s.screen === 'item') { const meU = s.users.find(u => u.name === role.name) || {};
    ScormRT.bind({ user: role.name, empId: meU.empId, courseId: course.id, item: s.itemIdx,
      onComplete: () => { if (this._scormDone) this._scormDone(); },
      onBookmark: (loc, suspend) => this.setState(st => { const cur = (st.bookmarks[role.name] || {})[course.id] || {}; return { bookmarks: { ...st.bookmarks, [role.name]: { ...(st.bookmarks[role.name] || {}), [course.id]: { item: s.itemIdx, location: loc != null ? loc : cur.location || '', suspend: suspend != null ? suspend : cur.suspend || '', savedAt: nowStamp() } } } }; }) }); }
  else ScormRT.clear();
  // Completion without a button: minimum viewing time for documents, images, links and lessons.
  const itSelf = icIsItem && !!icA.features.selfComplete;
  const VIEW_KINDS = ['pdf', 'doc', 'image', 'link', 'lesson', 'html', 'xapi', 'embed', 'youtube'], viewNeed = mins => Math.min(60, Math.max(15, Math.round((mins || 5) * 6)));
  let viewTarget = null;
  if (s.screen === 'item' && curIt && !curSt.done && !curSt.locked && !itSelf && VIEW_KINDS.includes(curIt.kind) && (curIt.kind === 'lesson' || (curIt.file && (curIt.file.src || curIt.file.path))))
    viewTarget = { key: course.id + ':' + s.itemIdx, need: viewNeed(curIt.mins), done: () => markItem(course.id, s.itemIdx, 'Viewed') };
  if (s.screen === 'lesson' && !lDone && !isQuizL && L.type !== 'Video' && !legacySelf)
    viewTarget = { key: 'L:' + s.courseId + ':' + L.key, need: viewNeed(L.min), done: () => this.complete() };
  this._viewTarget = viewTarget;
  if (Backend.on && s.screen === 'item' && curIt && !curSt.done && !curSt.locked) { const k = course.id + ':' + s.itemIdx; this._opened = this._opened || new Set();
    if (!this._opened.has(k)) { this._opened.add(k); Backend.call('openStep', { courseId: course.id, step: s.itemIdx }).catch(() => this._opened.delete(k)); } }
  if (Backend.on && s.screen === 'lesson' && !lDone) { const k = s.courseId + ':L' + L.key; this._opened = this._opened || new Set();
    if (!this._opened.has(k)) { this._opened.add(k); Backend.call('openStep', { courseId: s.courseId, step: FLAT.findIndex(l => l.key === L.key) }).catch(() => this._opened.delete(k)); } }
  this._lessonVideoEnd = s.screen === 'lesson' && !lDone && L.type === 'Video' && !legacySelf ? () => this.complete() : null;
  const vSec = viewTarget ? Math.min(viewTarget.need, s.viewSec[viewTarget.key] || 0) : 0, vLeft = viewTarget ? viewTarget.need - vSec : 0;
  const viewVals = { vwOn: !!viewTarget, vwPct: viewTarget ? Math.round(vSec / viewTarget.need * 100) + '%' : '0%',
    vwLabel: viewTarget ? (vLeft > 0 ? 'Take your time. This step is marked complete in ' + vLeft + 's, and then you can continue.' : 'Marked complete. You can continue.') : '',   // v36: friendlier wording, same rule
    lessonAutoNote: !lDone && !isQuizL && !legacySelf ? (L.type === 'Video' ? 'Completes when the video finishes' : 'Marked complete after ' + viewNeed(L.min) + 's of reading') : '', lessonHasAuto: !lDone && !isQuizL && !legacySelf };
  // v41.11: competency level, embeds (YouTube / Vimeo / H5P / external content), checklist and assignment steps
  const compLine = pct => { const lv = (curIt.levels || []).filter(l => pct >= l.min).slice(-1)[0]; return lv ? curIt.comp + ': ' + lv.n + ' (' + pct + '%).' : ''; };
  const extraKinds = () => {
    const k = curIt.kind, src = curIt.file ? curIt.file.src : '', embedSrc = k === 'youtube' ? (curIt.embedUrl || Embed.video(src) || '') : (k === 'embed' || k === 'link') ? src : '';
    const ckKey = course.id + ':' + s.itemIdx, ckSaved = (((s.surveyResp[role.name] || {})[ckKey] || {}).ticks) || [], ckDraft = (s.ckDraft || {})[ckKey] || ckSaved;
    const meU = s.users.find(u => u.name === role.name) || {}, mine = x => (x.learnerEmp && meU.empId ? x.learnerEmp === meU.empId : x.learner === role.name) && x.courseId === course.id && x.step === s.itemIdx;
    const sub = (s.asgSub || []).find(mine) || null, ad = (s.asgDraft || {})[ckKey] || {}, canSubmit = k === 'assignment' && !curSt.done && (!sub || sub.status === 'Returned');
    return {
      itIsEmbed: (k === 'embed' || k === 'youtube' || k === 'link') && !!embedSrc && Embed.ok(embedSrc), itEmbedSrc: embedSrc,
      itIsLinkOut: (k === 'link' || k === 'embed') && !!src && !Embed.ok(embedSrc), itLinkOutNote: k === 'embed' ? 'This H5P activity opens on its own site.' : 'This page opens in a new tab.',
      itIsChecklist: k === 'checklist',
      ckRows: k === 'checklist' ? (curIt.list || []).map((r, i) => { const on = !!ckDraft[i] || !!curSt.done; return { n: i + 1, t: r.t, on, mark: on ? '✓' : '', locked: !!curSt.done,
        toggle: () => { if (curSt.done) return; this.setState(st => { const d = ((st.ckDraft || {})[ckKey] || ckSaved).slice(); d[i] = !d[i]; return { ckDraft: { ...(st.ckDraft || {}), [ckKey]: d } }; }); } }; }) : [],
      ckLine: k === 'checklist' ? (curIt.list || []).filter((_, i) => ckDraft[i] || curSt.done).length + ' of ' + (curIt.list || []).length + ' ticked' : '',
      ckCanSubmit: k === 'checklist' && !curSt.done,
      ckSubmit: () => { const n = (curIt.list || []).length, t = Array.from({ length: n }, (_, i) => !!ckDraft[i]); if (t.some(x => !x)) return this.toastMsg('Tick every item first');
        if (Backend.on) return Backend.call('submitChecklist', { courseId: course.id, step: s.itemIdx, ticks: t }).then(() => this.toastMsg('Checklist complete')).catch(e => this.toastMsg(e.message));
        this.setState(st => { const me = { ...(st.surveyResp[role.name] || {}) }; me[ckKey] = { ticks: t, at: nowStamp() }; return { surveyResp: { ...st.surveyResp, [role.name]: me } }; });
        markItem(course.id, s.itemIdx, 'Checklist complete'); },
      itIsAsg: k === 'assignment', asgBrief: curIt.brief || '', asgAllowLink: curIt.allowLink !== false,
      asgHasSub: !!sub, asgStatus: !sub ? '' : sub.status === 'Submitted' ? 'Submitted ' + Fmt.dt(sub.at) + '. Waiting for a trainer to review it.' : sub.status === 'Accepted' ? 'Accepted by the trainer. This step is complete.' : 'Returned for changes. Update your work and submit again.',
      asgStBg: !sub ? '' : sub.status === 'Accepted' ? '#DCFCE7' : sub.status === 'Returned' ? '#FEF3C7' : '#EAF1F6', asgStFg: !sub ? '' : sub.status === 'Accepted' ? '#166534' : sub.status === 'Returned' ? '#92400E' : '#16324F',
      asgComment: sub && sub.comment ? sub.comment : '', asgHasComment: !!(sub && sub.comment), asgMyText: sub ? sub.text : '', asgMyLink: sub ? sub.link : '', asgShowMine: !!sub && !canSubmit,
      asgCan: canSubmit, asgText: ad.text != null ? ad.text : (sub && sub.status === 'Returned' ? sub.text : ''), asgLink: ad.link != null ? ad.link : (sub && sub.status === 'Returned' ? sub.link : ''),
      setAsgText: e => { const v = e.target.value; this.setState(st => ({ asgDraft: { ...(st.asgDraft || {}), [ckKey]: { ...((st.asgDraft || {})[ckKey] || {}), text: v } } })); },
      setAsgLink: e => { const v = e.target.value; this.setState(st => ({ asgDraft: { ...(st.asgDraft || {}), [ckKey]: { ...((st.asgDraft || {})[ckKey] || {}), link: v } } })); },
      asgSubmit: () => { const text = (ad.text != null ? ad.text : (sub ? sub.text : '') || '').trim(), link = (ad.link != null ? ad.link : (sub ? sub.link : '') || '').trim();
        if (!text && !link) return this.toastMsg('Write your answer or add a link to your work');
        if (link && !/^https:\/\/\S+\.\S+/.test(link)) return this.toastMsg('The link must start with https://');
        const clear = () => this.setState(st => ({ asgDraft: { ...(st.asgDraft || {}), [ckKey]: undefined } }));
        if (Backend.on) return Backend.call('submitAssignment', { courseId: course.id, step: s.itemIdx, text, link }).then(() => { clear(); this.toastMsg('Assignment submitted for review'); }).catch(e => this.toastMsg(e.message));
        const id = (meU.empId || role.name) + '|' + course.id + '|' + s.itemIdx, now = new Date().toISOString();
        this.setState(st => ({ asgSub: [{ id, learner: role.name, learnerEmp: meU.empId || '', courseId: course.id, step: s.itemIdx, title: curIt.title || 'Assignment', text, link, status:'Submitted', at: now,
          history: sub ? (sub.history || []).concat([{ text: sub.text, link: sub.link, at: sub.at, status: sub.status, comment: sub.comment || '' }]) : [] }].concat((st.asgSub || []).filter(x => x.id !== id)) }));
        clear(); this.toastMsg('Assignment submitted for review'); },
    }; };
  const nextIdx = icIsItem ? icSt.findIndex((x, k) => k > s.itemIdx && !x.done) : -1;
  const itemPlayer = !curIt ? {} : {
    it: { n: s.itemIdx + 1, of: icA.items.length, title: curQz ? curQz.name : curIt.title, kind: curIt.comp ? 'Competency test' : (IK[curIt.kind] || IK.lesson)[3], src: curIt.kind === 'scorm' && Backend.on ? (s.scormUrl || 'about:blank') : curIt.file ? curIt.file.src : '', fileName: curIt.file ? curIt.file.name : '', done: !!curSt.done, notDone: !curSt.done, locked: !!curSt.locked },
    // Survey step: answer every rating question, then submit. Responses are kept per person, course and step.
    itIsSurvey: curIt.kind === 'survey',
    svQs: curIt.kind === 'survey' ? (curIt.qs || []).map((q, i) => { const k = course.id + ':' + s.itemIdx, ans = (((s.surveyResp[role.name] || {})[k] || {}).draft || {})[i], done = !!curSt.done, saved = (((s.surveyResp[role.name] || {})[k] || {}).answers || [])[i];
      const setA = v => this.setState(st => { const me = { ...(st.surveyResp[role.name] || {}) }, cur = me[k] || {}; me[k] = { ...cur, draft: { ...(cur.draft || {}), [i]: v } }; return { surveyResp: { ...st.surveyResp, [role.name]: me } }; });
      return { n: i + 1, t: q.t, isRating: q.kind === 'rating', isText: q.kind !== 'rating', val: done ? (saved || '') : (ans || ''), locked: done,
        opts: [1, 2, 3, 4, 5].map(v => UI.chip(done ? saved : ans, v, String(v), () => { if (!done) setA(v); })), set: e => setA(e.target.value) }; }) : [],
    svSubmit: () => { const k = course.id + ':' + s.itemIdx, cur = (s.surveyResp[role.name] || {})[k] || {}, d = cur.draft || {}, qs = curIt.qs || [];
      const miss = qs.findIndex((q, i) => q.kind === 'rating' && !d[i]); if (miss >= 0) return this.toastMsg('Answer question ' + (miss + 1));
      this.setState(st => { const me = { ...(st.surveyResp[role.name] || {}) }; me[k] = { answers: qs.map((q, i) => d[i] || ''), at: nowStamp() }; return { surveyResp: { ...st.surveyResp, [role.name]: me } }; });
      if (Backend.on) { Backend.call('submitSurvey', { courseId: course.id, step: s.itemIdx, answers: qs.map((q, i) => d[i] || '') }).then(() => this.toastMsg('Survey submitted')).catch(e => this.toastMsg(e.message)); return; }
      markItem(course.id, s.itemIdx, 'Survey submitted'); },
    itIsPdf: curIt.kind === 'pdf', itIsVideo: curIt.kind === 'video', itIsScorm: curIt.kind === 'scorm', itIsQuiz: curIt.kind === 'quiz', itIsText: curIt.kind === 'lesson', itIsAck: curIt.kind === 'ack', itIsAudio: curIt.kind === 'audio', itIsImage: curIt.kind === 'image', itIsDoc: curIt.kind === 'doc', itIsLink: false, itLinkLegacy: false, itAckText: curIt.text || curIt.title,
    itMarkListened: () => markItem(course.id, s.itemIdx, 'Audio complete'), itMarkViewed: () => markItem(course.id, s.itemIdx, 'Image viewed'), itMarkDoc: () => markItem(course.id, s.itemIdx, 'Document read'), itMarkLink: () => markItem(course.id, s.itemIdx, 'Link visited'),
    // v41.11: connected packages have a storage path and no direct link, so "no file" checks both
    itNoFile: ['pdf', 'video', 'scorm', 'html', 'xapi', 'audio', 'image', 'doc', 'link', 'embed', 'youtube'].includes(curIt.kind) && !(curIt.file && (curIt.file.src || curIt.file.path)),
    itScormLaunch: ['scorm', 'html', 'xapi'].includes(curIt.kind) && !!(curIt.file && curIt.file.launch), itScormSim: ['scorm', 'html', 'xapi'].includes(curIt.kind) && !!(curIt.file && curIt.file.src && !curIt.file.launch),
    itPkgNote: curIt.kind === 'scorm' ? 'Interactive package. It reports your completion automatically.' : curIt.kind === 'xapi' ? 'xAPI / cmi5 package. It is marked complete after the minimum time in the package.' : 'Interactive HTML5 package. It is marked complete after the minimum time in the package.',
    ...extraKinds(),
    scormOn: s.scormOn, scormOff: !s.scormOn,
    // SCORM bookmark: where the package resumes. An admin can clear it (Settings › Clear SCORM bookmarking).
    itBookmark: ((s.bookmarks[role.name] || {})[course.id] || {}).location || '', itHasBookmark: !!(s.bookmarks[role.name] || {})[course.id],
    // Connected: the package runs on the separate content site; launch with a short-lived token and the resume point.
    launchScorm: () => { if (Backend.on && curIt.file && curIt.file.path) { const bm = ((s.bookmarks[role.name] || {})[course.id]) || {};
        const cmi = bm.item === s.itemIdx ? { 'cmi.core.lesson_location': bm.location || '', 'cmi.suspend_data': bm.suspend || '', 'cmi.core.student_name': role.name } : { 'cmi.core.student_name': role.name };
        return Backend.scormLaunch(course.id, s.itemIdx, cmi).then(url => this.setState({ scormOn:true, scormUrl:url })).catch(e => this.toastMsg(e.message)); }
      this.setState(st => ({ scormOn:true, bookmarks: (st.bookmarks[role.name] || {})[course.id] ? st.bookmarks : { ...st.bookmarks, [role.name]: { ...(st.bookmarks[role.name] || {}), [course.id]: { item: s.itemIdx, location:'Scenario 1 · screen 1 of 7', savedAt: nowStamp() } } } })); },
    itMarkRead: () => markItem(course.id, s.itemIdx, 'Document read'), itVideoEnded: () => { if (!curSt.done) markItem(course.id, s.itemIdx, 'Video watched'); },
    itShowMark: !curSt.done && itSelf, itAckOpen: !curSt.done,
    itMarkDone: () => markItem(course.id, s.itemIdx), itSimFinish: () => { if (this._scormDone) this._scormDone(); },
    itQuizLine: curQz ? (curQz.dynamic ? Assessment.shownCount(curQz, s.qs) : Assessment.pool(curQz, s.qs).length) + ' questions · pass mark ' + curQz.pass + '% · ' + attLabel : '',
    itQuizStatus: (curIt.comp && curSt.best ? compLine(curSt.best.pct) + ' ' : '') + (curQz ? (curSt.done ? 'Passed' + (curSt.best ? ' with ' + curSt.best.pct + '%' : '') + '. This course is complete.' : curSt.pendingQ ? 'Your last attempt is waiting for a trainer to rate written answers.' : curSt.best ? 'Best score so far: ' + curSt.best.pct + '%. You need ' + curQz.pass + '% to complete the course.' : 'Pass this assessment to complete the course.') : ''),
    itQuizCan: !!curQz && !curSt.done && myAtt.canStart, itQuizBtn: curSt.done ? 'Passed' : myAtt.canStart ? 'Start assessment' : 'No attempts left',
    itStartQuiz: () => { const st = newAttempt(); if (st) this.go('quiz', st); },
    itPrev: () => { if (s.itemIdx > 0) itemRows[s.itemIdx - 1].open(); }, itHasPrev: s.itemIdx > 0,
    itNext: () => { if (!curSt.done && icA.features.linear) return this.toastMsg('Finish this step to unlock the next one'); if (s.itemIdx < icA.items.length - 1) this.go('item', { itemIdx: s.itemIdx + 1, scormOn:false }); else this.go('course'); },
    itNextLabel: s.itemIdx < icA.items.length - 1 ? 'Next step →' : 'Back to course', itNextBg: curSt.done || !icA.features.linear ? '#16324F' : '#D7E3EC', itNextFg: curSt.done || !icA.features.linear ? '#F8FBFD' : '#526B7A',
    itProgress: icSt.filter(x => x.done).length + ' of ' + icA.items.length + ' steps done', itApproach: icA.features.linear ? 'Linear' : 'Non-linear',
    backToCourse: () => this.go('course'),
  };
  const R2 = 2 * Math.PI * 64;
  const qzNow = s.quizzes.find(x => x.id === s.attemptQuiz) || crsQuiz, qPassed = qsc.final && qsc.pct >= qzNow.pass;
  const tabsL = [['overview', 'Overview'], ['notes', 'Notes'], ['transcript', 'Transcript'], ['resources', 'Resources']].map(([id, label]) => ({ label, bg: s.tab === id ? '#E7F0F7' : 'transparent', fg: s.tab === id ? '#7A4A06' : '#526B7A', pick: () => this.setState({ tab:id }) }));
  Object.assign(c, { qsc });
  return {
    crsInfo: icIsItem ? (() => { const z = icA.items.filter(x => x.kind === 'quiz').map(x => s.quizzes.find(q => q.id === x.quizId)).filter(Boolean)[0]; return [{ l:'Course author', v: icA.author || '—' }, { l:'Course director', v: icA.director || '—' }, { l:'Learning approach', v: icA.features.linear ? 'Linear · steps unlock in order' : 'Non-linear · any order' }, { l:'Due date', v: myEnroll[course.id] ? shortDate(myEnroll[course.id]) : 'No due date' }, { l:'Completion', v: (() => { const zs = icA.items.filter(x => x.kind === 'quiz').length; return zs > 1 ? 'Finish every step and pass all ' + zs + ' assessments' : z ? 'Finish every step and pass “' + z.name + '” (' + z.pass + '%)' : 'Finish every step'; })() }, { l:'Certificate', v: icA.features.cert ? 'Issued on completion' + (icA.recert !== 'Never' ? ', valid ' + icA.recert : '') : 'None' }]; })() : (() => { const D = Object.fromEntries(Object.entries({ ...DUE_DATES, ...myEnroll }).map(([id, k]) => [id, shortDate(k)])), req = !!myEnroll[course.id] || course.id === 'change'; return [{ l:'Level', v:course.level }, { l:'Required / optional', v: req ? 'Required' : 'Optional' }, { l:'Due date', v: D[course.id] || 'No due date' }, { l:'Passing score', v:'80% on the final assessment' }, { l:'Certificate', v:'Issued on completion, valid 12 months' }, { l:'Prerequisites', v:'None' }]; })(),
    isItemCourse: icIsItem,
    notItemCourse: !icIsItem,
    itemRows,
    unitLabel: icIsItem ? 'steps' : 'lessons',
    aboutText: icIsItem ? (icA.about || icA.desc || '') : '',
    hasAbout: icIsItem && !!(icA.about || icA.desc),
    instructorRole: icIsItem ? 'Course author' + (icA.director ? ' · Director: ' + icA.director : '') : 'Instructor · Leadership coach',
    ...itemPlayer, ...viewVals,
    course,
    totalLessons: icIsItem ? icA.items.length : FLAT.length,
    curriculum,
    outcomes: icIsItem ? [] : ['Explain the reason for a change in two minutes or less', 'Spot passive and active resistance early', 'Respond to pushback without getting defensive', 'Measure whether a change has actually stuck'],
    teamFaces: TEAM.slice(1, 5).map((m, i) => ({ initials: ini(m.name), av: AV[i % 5] })),
    goBackFromCourse: () => this.go(s.from === 'course' || s.from === 'lesson' || s.from === 'quiz' ? 'catalog' : s.from || 'catalog'),
    startCourse: () => icIsItem ? this.go('item', { itemIdx: firstOpenItem(), scormOn:false }) : this.openLesson(this.firstOpen(s.courseId)),
    openCourse: () => this.go('course'),
    lesson,
    playing: s.playing,
    paused: !s.playing,
    togglePlay: () => this.togglePlay(),
    timeNow: mmss(s.t),
    timeTotal: mmss(total),
    playPct: (s.t / total * 100).toFixed(1) + '%',
    seek: e => { const r = e.currentTarget.getBoundingClientRect(); this.setState({ t: Math.round((e.clientX - r.left) / r.width * total) }); },
    pl,
    prevLesson: () => { const i = FLAT.findIndex(l => l.key === s.lessonKey); if (i > 0) this.openLesson(FLAT[i - 1].key); },
    completeLesson: () => this.complete(),
    nextLesson: () => this.next(),
    lessonTabs: tabsL,
    tabOverview: s.tab === 'overview',
    tabNotes: s.tab === 'notes',
    tabTranscript: s.tab === 'transcript',
    tabResources: s.tab === 'resources',
    lessonCopy: { body: lc.body, points: lc.points.map((t, i) => ({ n: i + 1, t })) },
    notes: s.notes,
    setNotes: e => this.setState({ notes: e.target.value }),
    transcript: TRANSCRIPT,
    startQuiz: () => { if (Backend.on) return startRemote(); const st = newAttempt(); if (st) this.go('quiz', st); },
    quizAttLabel: attLabel,
    quizNoAttempts: !myAtt.canStart,
    quizInfoLine: (Backend.on ? (crsQuiz.dynamic ? crsQuiz.drawCount : crsQuiz.ids.length) : crsQuiz.dynamic ? Assessment.shownCount(crsQuiz, s.qs) : Assessment.pool(crsQuiz, s.qs).length) + ' questions · pass mark ' + crsQuiz.pass + '% · ' + attLabel,
    exitQuiz: () => this.go(icIsItem ? 'item' : 'lesson'),
    quizHeader: course.title + ' · ' + (icIsItem ? qzNow.name : lesson.title),
    quizActive: !s.qDone,
    quizDone: s.qDone,
    quizSegs,
    quizNum: s.qi + 1,
    quizTotal: qN,
    q: { q: QQ ? QQ.text : '', why: fbText, opts: quizOpts },
    quizChecked: s.qChecked,
    quizWritten: isWrittenQ,
    quizHasOpts: isSingle && qType !== 'Image options' || qType === 'Multiple select',
    quizImgOpts: qType === 'Image options',
    quizMulti: qType === 'Multiple select',
    quizLikert: qType === 'Likert scale',
    likertOpts,
    quizMatch: qType === 'Match the following',
    matchRows,
    quizFill: qType === 'Fill in the blank',
    quizOrder: qType === 'Ordering',
    orderRows,
    orderLocked: s.qChecked,
    quizQXp: isWrittenQ ? 'Rated by trainer' : qType === 'Likert scale' ? 'Not scored' : '+30 XP',
    qTypeLabel: qType,
    qMedia,
    qText: s.qText,
    qTextLocked: s.qChecked,
    qWordsLabel: qWords + (qWords === 1 ? ' word' : ' words'),
    setQText: e => this.setState({ qText: e.target.value }),
    feedback: isWrittenQ ? { bg:'#EAF1F6', fg:'#334E68', title:'Answer submitted' } : qType === 'Likert scale' ? { bg:'#EAF1F6', fg:'#334E68', title:'Response saved' } : gradeNow > 0 && gradeNow < 1 ? { bg:'#E7F0F7', fg:'#7A4A06', title:'Partly right · ' + Math.round(gradeNow * 100) + '%' } : isRight ? { bg:'#E3F1EE', fg:'#245E52', title:'Correct · +30 XP' } : { bg:'#FDECEC', fg:'#A63232', title:'Not quite' },
    quizAction,
    quizBtnLabel: !s.qChecked ? (isWrittenQ || qType === 'Likert scale' ? 'Submit answer' : 'Check answer') : s.qi === qN - 1 ? 'See results' : 'Next question',
    quizBtnBg: !s.qChecked && !canAnswer ? '#D7E3EC' : '#16324F',
    quizBtnFg: !s.qChecked && !canAnswer ? '#526B7A' : '#F8FBFD',
    quizCorrect: qsc.autoRight,
    quizScore: qsc.pct + '%',
    quizRing: (R2 * qsc.pct / 100).toFixed(1) + ' ' + R2.toFixed(1),
    quizXp: qsc.autoRight * 30,
    quizPerfect: qsc.final && qsc.pct === 100,
    quizHeadline: qsc.pending ? 'Answers submitted' : qsc.pct >= 80 ? 'Nicely done' : qsc.pct >= 60 ? 'Good effort' : 'Worth another look',
    quizResultLine: qsc.auto ? 'You answered ' + qsc.autoRight + ' of ' + qsc.auto + ' auto-graded questions correctly.' : 'All your answers are written answers.',
    quizPending: qsc.pending > 0,
    quizPendingLine: qsc.pending + (qsc.pending === 1 ? ' written answer is' : ' written answers are') + ' with your trainer. This score is provisional until they are rated.',
    quizRatedLine: qsc.written && !qsc.pending ? 'Your trainer has rated your written ' + (qsc.written === 1 ? 'answer' : 'answers') + '. This is your final score.' : '',
    quizRated: qsc.written > 0 && !qsc.pending,
    retryQuiz: () => { const st = newAttempt(); if (st) this.setState(st); },
    retryLabel: myAtt.canStart ? 'Try again' + (myAtt.unlimited ? '' : ' · ' + myAtt.left + ' left') : 'No attempts left',
    finishQuiz: () => { if (!icIsItem) return this.next(); const nxt = icSt.findIndex((x, k) => k > s.itemIdx && !x.done); if (qPassed && nxt < 0) this.go('course'); else this.go('item', { itemIdx: qPassed && nxt >= 0 ? nxt : s.itemIdx, scormOn:false }); },
    quizPassNote: qsc.pending ? 'You need ' + qzNow.pass + '% to pass. Your result is final once your trainer rates the written answers.' : qPassed ? 'Passed · pass mark ' + qzNow.pass + '%' : 'Not passed · you need ' + qzNow.pass + '% to complete this course.',
    quizPassBg: qsc.pending ? '#E7F0F7' : qPassed ? '#E3F1EE' : '#FDECEC',
    quizPassFg: qsc.pending ? '#7A4A06' : qPassed ? '#245E52' : '#A63232',
  };
};
