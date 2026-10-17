/* Run: node --test tests/ */
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
require('../public/js/core/assessment.js'); require('../supabase/functions/_shared/learning-core.js');
const memdb = require('./memdb');
const L = globalThis.LearningCore;
function world() {
  const db = memdb();
  db.seed('qs', '1', { id: 1, type: 'Multiple choice', text: 'Q1', opts: ['a', 'b', 'c', 'd'], ans: 2, why: 'because' });
  db.seed('qs', '2', { id: 2, type: 'Multiple select', text: 'Q2', opts: ['a', 'b', 'c'], answers: [0, 2] });
  db.seed('qs', '3', { id: 3, type: 'Ordering', text: 'Q3', items: ['x', 'y', 'z'] });
  db.seed('qs', '4', { id: 4, type: 'Match the following', text: 'Q4', pairs: [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']] });
  db.seed('qs', '5', { id: 5, type: 'Written answer', text: 'Q5', points: 10 });
  db.seed('quizzes', '7', { id: 7, name: 'Safety check', ids: [1, 2, 3, 4], pass: 75, attempts: '2', shuffle: true, shuffleOpts: true });
  db.seed('quizzes', '8', { id: 8, name: 'Written', ids: [1, 5], pass: 50, attempts: 'Unlimited' });
  db.seed('adminCourses', 'safety', { id: 'safety', code: 'CRS-1', title: 'Safety', status: 'Published', features: { linear: true, correct: true, incorrect: true },
    items: [{ kind: 'pdf', mins: 3 }, { kind: 'quiz', quizId: 7 }, { kind: 'survey', qs: [{ t: 'How useful?', kind: 'rating' }, { t: 'Why?', kind: 'text' }] }] });
  db.seed('adminCourses', 'w', { id: 'w', code: 'CRS-2', title: 'W', status: 'Published', features: {}, items: [{ kind: 'quiz', quizId: 8 }] });
  db.seed('enroll', 'E1', { safety: '2026-12-01', w: '2026-12-01' });
  return db;
}
const ctx = (over) => ({ org: 'o', emp: 'E1', role: 'Learner', perms: [], now: new Date('2026-10-04T10:00:00Z'), userKey: 'u1', ...over });
const solve = (q) => {   // answer correctly from a sanitized question + the original (test only)
  return null;
};
test('shared assessment file is identical to the browser copy', () => {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '../public/js/core/assessment.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/assessment.js'), 'utf8'));
});
test('not enrolled / locked steps are refused', async () => {
  const db = world();
  await assert.rejects(L.handle(db, ctx({ emp: 'E2' }), 'openStep', { courseId: 'safety', step: 0 }), /not assigned/);
  await assert.rejects(L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 }), /earlier steps/);
});
test('view time is checked on the server clock', async () => {
  const db = world();
  await L.handle(db, ctx(), 'openStep', { courseId: 'safety', step: 0 });
  await assert.rejects(L.handle(db, ctx({ now: new Date('2026-10-04T10:00:05Z') }), 'completeStep', { courseId: 'safety', step: 0 }), /seconds/);
  await L.handle(db, ctx({ now: new Date('2026-10-04T10:00:30Z') }), 'completeStep', { courseId: 'safety', step: 0 });
  assert.ok(db.peek('itemDone', 'E1').safety[0]);
});
test('sanitized questions carry no answer key', async () => {
  const db = world(); db.seed('itemDone', 'E1', { safety: { 0: '2026-10-01' } });
  const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 });
  const s = JSON.stringify(r.questions);
  assert.ok(!/"ans"|"answers"|"accept"|"why"/.test(s), s);
  assert.strictEqual(r.questions.length, 4);
});
test('grading, attempt limit and completion happen on the server', async () => {
  const db = world(); db.seed('itemDone', 'E1', { safety: { 0: '2026-10-01' } });
  for (let round = 0; round < 2; round++) {
    const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 });
    const at = db.peek('attempt', r.attemptId);
    for (let k = 0; k < at.items.length; k++) {
      const it = at.items[k], q = db.peek('qs', String(it.qid)), inv = i => it.order.indexOf(i);
      let a;
      if (round === 0) a = { sel: 0, multi: [0], order: [0, 1, 2], match: { 0: 0, 1: 1, 2: 2 } };   // probably wrong
      else if (q.type === 'Multiple choice') a = { sel: inv(q.ans) };
      else if (q.type === 'Multiple select') a = { multi: q.answers.map(inv) };
      else if (q.type === 'Ordering') a = { order: q.items.map((_, p) => inv(p)) };
      else a = { match: Object.fromEntries(q.pairs.map((_, li) => [li, inv(li)])) };
      const g = await L.handle(db, ctx(), 'answer', { attemptId: r.attemptId, index: k, answer: a });
      if (round === 1) { assert.strictEqual(g.g, 1, q.type); }
      await assert.rejects(L.handle(db, ctx(), 'answer', { attemptId: r.attemptId, index: k, answer: a }), /already answered/);
    }
    const res = await L.handle(db, ctx(), 'submit', { attemptId: r.attemptId });
    if (round === 1) { assert.strictEqual(res.passed, true); assert.strictEqual(res.score.pct, 100); }
  }
  assert.ok(db.peek('itemDone', 'E1').safety[1].score === 100);
  await assert.rejects(L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 }), /used all/);
  assert.strictEqual(db.peek('attemptsUsed', 'E1')[7], 2);
});
test('parallel starts cannot exceed the attempt limit', async () => {
  const db = world(); db.seed('itemDone', 'E1', { safety: { 0: '2026-10-01' } });
  const rs = await Promise.allSettled([0, 1, 2, 3, 4].map(() => L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 })));
  assert.strictEqual(rs.filter(r => r.status === 'fulfilled').length, 2);
});
test('someone else’s attempt cannot be answered', async () => {
  const db = world(); db.seed('itemDone', 'E1', { safety: { 0: '2026-10-01' } }); db.seed('enroll', 'E2', { safety: 'x' }); db.seed('itemDone', 'E2', { safety: { 0: 'x' } });
  const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'safety', step: 1 });
  await assert.rejects(L.handle(db, ctx({ emp: 'E2' }), 'answer', { attemptId: r.attemptId, index: 0, answer: { sel: 0 } }), /not found/);
});
test('written answers wait for a trainer; rescore passes the step', async () => {
  const db = world();
  const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'w', step: 0 });
  const at = db.peek('attempt', r.attemptId);
  for (let k = 0; k < at.items.length; k++) { const it = at.items[k], q = db.peek('qs', String(it.qid));
    await L.handle(db, ctx(), 'answer', { attemptId: r.attemptId, index: k, answer: q.type === 'Written answer' ? { text: 'my essay' } : { sel: it.order.indexOf(q.ans) } }); }
  const res = await L.handle(db, ctx(), 'submit', { attemptId: r.attemptId });
  assert.strictEqual(res.pending, true); assert.ok(!(db.peek('itemDone', 'E1') || {}).w);
  const rid = [...db.rows.entries()].find(([k]) => k.startsWith('reviews'))[1].data.id;
  await assert.rejects(L.handle(db, ctx(), 'rescore', { reviewId: rid, rating: 10 }), /Gradebook/);
  await assert.rejects(L.handle(db, ctx({ emp: 'T9', role: 'Trainer', perms: ['batches'] }), 'rescore', { reviewId: rid, rating: 8 }), /Gradebook/);
  const rs = await L.handle(db, ctx({ emp: 'Q1', role: 'Learner', perms: ['gradebook', 'gradeAll'] }), 'rescore', { reviewId: rid, rating: 8 });
  assert.strictEqual(rs.passed, true); assert.ok(db.peek('itemDone', 'E1').w[0]);
});
test('survey validates and completes; feedback only by its recipient', async () => {
  const db = world(); db.seed('itemDone', 'E1', { safety: { 0: 'x', 1: 'x' } });
  await assert.rejects(L.handle(db, ctx(), 'submitSurvey', { courseId: 'safety', step: 2, answers: [9, 'ok'] }), /Answer question 1/);
  // v41.26: < and > are refused with a message instead of being removed silently ('fine <b>x</b>' used to be stored as 'fine bx/b')
  await assert.rejects(L.handle(db, ctx(), 'submitSurvey', { courseId: 'safety', step: 2, answers: [4, 'fine <b>x</b>'] }), /< and >/);
  assert.ok(!db.peek('surveyResp', 'E1') && !db.peek('itemDone', 'E1').safety[2], 'a refused answer saves nothing and does not complete the step');
  await L.handle(db, ctx(), 'submitSurvey', { courseId: 'safety', step: 2, answers: [4, 'fine bold'] });
  assert.strictEqual(db.peek('surveyResp', 'E1')['safety:2'].answers[1], 'fine bold');
  db.seed('lcms', 'f1', { id: 'f1', type: 'Feedback form', level: 'L1', qs: [{ t: 'r', kind: 'rating' }] });
  await assert.rejects(L.handle(db, ctx(), 'answerFeedback', { key: 'safety|E9|L1|E9', formId: 'f1', answers: [5] }), /not addressed/);
  await L.handle(db, ctx(), 'answerFeedback', { key: 'safety|E1|L1|E1', formId: 'f1', answers: [5] });
});
test('access requests: learner asks, only manager/admin decides', async () => {
  const db = world(); db.seed('users', 'u1', { id: 'u1', empId: 'E1', managerKey: 'uM' }); db.seed('adminCourses', 'neg', { id: 'neg', title: 'Neg', status: 'Published', items: [], features: {} });
  const { id } = await L.handle(db, ctx(), 'requestAccess', { courseId: 'neg', reason: 'Need it for renewals' });
  await assert.rejects(L.handle(db, ctx({ emp: 'E3', userKey: 'u3' }), 'decideRequest', { id, approve: true }), /manager/);
  await L.handle(db, ctx({ emp: 'M1', userKey: 'uM' }), 'decideRequest', { id, approve: true });
  assert.ok(db.peek('enroll', 'E1').neg);
});
test('profile edits are limited to safe fields; forum posts carry the author', async () => {
  const db = world(); db.seed('users', 'u1', { id: 'u1', empId: 'E1', role: 'Learner', name: 'A' });
  await L.handle(db, ctx(), 'updateProfile', { phone: '+91 98765 43210', role: 'Admin', roleId: 'r_admin' });
  assert.strictEqual(db.peek('users', 'u1').role, 'Learner');
  const { id } = await L.handle(db, ctx(), 'post', { title: 'Hi', body: 'Hello' });
  await L.handle(db, ctx({ emp: 'E2', userKey: 'u2' }), 'post', { threadId: id, body: 'Reply' });
  const t = db.peek('threads', id); assert.strictEqual(t.authorKey, 'u1'); assert.ok(!JSON.stringify(t).includes('E1') && !JSON.stringify(t).includes('E2'), 'no employee IDs in threads');
});
/* ---------- SCORM: launch sessions and server-checked completion ---------- */
function scormWorld() {
  const db = world();
  db.seed('lcms', 'pk', { id: 'pk', type: 'SCORM', file: { path: 'o/scorm/pk1/', launch: 'index.html' } });
  db.seed('adminCourses', 'sc', { id: 'sc', title: 'S', status: 'Published', features: {}, items: [{ kind: 'scorm', moduleId: 'pk', mins: 5 }] });
  db.seed('enroll', 'E1', { safety: '2026-12-01', w: '2026-12-01', sc: '2026-12-01' });
  return db;
}
const sctx = (sec, over) => ctx({ now: new Date(Date.parse('2026-10-04T10:00:00Z') + sec * 1000), contentOrigin: 'https://content.example', signKey: 'k', ...over });
test('SCORM: completeStep is refused; the package has to run', async () => {
  const db = scormWorld();
  await assert.rejects(L.handle(db, sctx(0), 'completeStep', { courseId: 'sc', step: 0 }), /package reports completion/);
  await assert.rejects(L.handle(db, sctx(0), 'scormCommit', { courseId: 'sc', step: 0, sid: 'x'.repeat(48), status: 'completed' }), /session has ended/);
  assert.ok(!db.peek('itemDone', 'E1'));
});
test('SCORM: completion counts only after the minimum time on the server clock', async () => {
  const db = scormWorld();
  const r = await L.handle(db, sctx(0), 'scormLaunch', { courseId: 'sc', step: 0 });
  assert.ok(r.sid && r.url.includes('/c/') && r.pingSecs > 0);
  const need = L.scormNeed({ mins: 5 });
  const early = await L.handle(db, sctx(5), 'scormCommit', { courseId: 'sc', step: 0, sid: r.sid, status: 'completed', score: 90 });
  assert.strictEqual(early.done, false); assert.ok(early.wait > 0 && early.wait <= need, JSON.stringify(early));
  const inc = await L.handle(db, sctx(need + 5), 'scormCommit', { courseId: 'sc', step: 0, sid: r.sid, status: 'incomplete' });
  assert.strictEqual(inc.done, false, 'incomplete is not completion');
  const ok = await L.handle(db, sctx(need + 6), 'scormCommit', { courseId: 'sc', step: 0, sid: r.sid, status: 'passed', score: 88 });
  assert.strictEqual(ok.done, true); assert.deepStrictEqual(db.peek('itemDone', 'E1').sc[0], { at: '2026-10-04', src: 'scorm', score: 88 });
  assert.ok(!ok._touched.some(t => t.coll === 'scormSess'), 'launch sessions are never sent to the browser');
});
test('SCORM: someone else’s session, a superseded session or an idle one is refused', async () => {
  const db = scormWorld();
  const a = await L.handle(db, sctx(0), 'scormLaunch', { courseId: 'sc', step: 0 });
  await assert.rejects(L.handle(db, sctx(100, { emp: 'E2' }), 'scormCommit', { courseId: 'sc', step: 0, sid: a.sid, status: 'completed' }), /not assigned|session/);
  const b = await L.handle(db, sctx(10), 'scormLaunch', { courseId: 'sc', step: 0 });
  assert.notStrictEqual(a.sid, b.sid);
  await assert.rejects(L.handle(db, sctx(100), 'scormCommit', { courseId: 'sc', step: 0, sid: a.sid, status: 'completed' }), /ended/);
  assert.strictEqual(db.peek('scormSess', 'E1|sc|0').firstAt, '2026-10-04T10:00:00.000Z', 'minimum time counts from the FIRST launch');
  await L.handle(db, sctx(25 * 60), 'scormPing', { courseId: 'sc', step: 0, sid: b.sid });          // renewed at 25 min
  await L.handle(db, sctx(50 * 60), 'scormCommit', { courseId: 'sc', step: 0, sid: b.sid, status: 'incomplete' });
  await assert.rejects(L.handle(db, sctx(90 * 60), 'scormPing', { courseId: 'sc', step: 0, sid: b.sid }), /timed out/);
  const c = await L.handle(db, sctx(91 * 60), 'scormLaunch', { courseId: 'sc', step: 0 });
  await L.handle(db, sctx(92 * 60), 'scormEnd', { courseId: 'sc', step: 0, sid: c.sid });
  await assert.rejects(L.handle(db, sctx(93 * 60), 'scormCommit', { courseId: 'sc', step: 0, sid: c.sid, status: 'completed' }), /ended/);
  assert.strictEqual(db.peek('scormSess', 'E1|sc|0').ended, true);
});
test('SCORM: launch files with traversal or encoded characters are refused', async () => {
  for (const launch of ['../x.html', 'a/../../b.html', 'a\\b.html', '%2e%2e/x.html']) {
    const db = scormWorld(); db.seed('lcms', 'pk', { id: 'pk', type: 'SCORM', file: { path: 'o/scorm/pk1/', launch } });
    await assert.rejects(L.handle(db, sctx(0), 'scormLaunch', { courseId: 'sc', step: 0 }), /Invalid launch/, launch);
  }
});
test('answer keys: attempts by people who can read them are marked; raters get the question in the review', async () => {
  const db = world();
  const r1 = await L.handle(db, ctx(), 'startAttempt', { courseId: 'w', step: 0 });
  assert.strictEqual(db.peek('attempt', r1.attemptId).keyAccess, false);
  const r2 = await L.handle(db, ctx({ emp: 'E1', role: 'Trainer', perms: ['gradebook', 'batches'] }), 'startAttempt', { courseId: 'w', step: 0 });
  assert.strictEqual(db.peek('attempt', r2.attemptId).keyAccess, false, 'Gradebook alone has no key access');
  const r3 = await L.handle(db, ctx({ perms: ['qbank'] }), 'startAttempt', { courseId: 'w', step: 0 });
  const at = db.peek('attempt', r3.attemptId); assert.strictEqual(at.keyAccess, true);
  for (let k = 0; k < at.items.length; k++) await L.handle(db, ctx({ perms: ['qbank'] }), 'answer', { attemptId: r3.attemptId, index: k, answer: { sel: 0, text: 'my answer here' } });
  await L.handle(db, ctx({ perms: ['qbank'] }), 'submit', { attemptId: r3.attemptId });
  assert.strictEqual(db.peek('attemptRecs', r3.attemptId).keyAccess, true);
  const rv = [...db.rows.values()].map(x => x.data).find(d => d && d.attemptId === r3.attemptId && d.qid === 5);
  assert.strictEqual(rv.qText, 'Q5'); assert.strictEqual(rv.points, 10);
});
test('documents: viewed then acknowledged, server clock, audience and dates enforced', async () => {
  const db = memdb();
  await db.put('docs', 'd1', { status:'Published', audience:['All'], mandatory:true, cur:2, effective:'2026-01-01', expiry:'', versions:[{ v:2, file:{ path:'o/docs/a.pdf' } }] }, null);
  await db.put('docs', 'd2', { status:'Published', audience:['Trainer'], mandatory:true, cur:1, effective:'2026-01-01', versions:[] }, null);
  await db.put('docs', 'd3', { status:'Draft', audience:['All'], mandatory:true, cur:1, versions:[] }, null);
  const c = ctx({});
  await assert.rejects(L.handle(db, c, 'docSeen', { docId:'d1', ack:true }), /Open the document/);
  await L.handle(db, c, 'docSeen', { docId:'d1' });
  await L.handle(db, c, 'docSeen', { docId:'d1', ack:true });
  const r = (await db.get('docAck', 'E1')).data.d1; assert.strictEqual(r.ackV, 2); assert.ok(r.ackAt && r.viewedAt);
  await assert.rejects(L.handle(db, c, 'docSeen', { docId:'d2' }), /not available/);
  await assert.rejects(L.handle(db, c, 'docSeen', { docId:'d3' }), /not available/);
  assert.strictEqual(L.docCurPath({ cur:2, versions:[{ v:1, file:{ path:'x' } }, { v:2, file:{ path:'y' } }] }), 'y');
});
test('sign-ins are recorded by the server; dates use the organisation time zone, not UTC', async () => {
  const db = memdb();
  await L.handle(db, ctx({}), 'signedIn', { method:'emp' }); await L.handle(db, ctx({}), 'signedIn', { method:'email' });
  const r = (await db.get('loginLog', 'E1')).data; assert.strictEqual(r.n, 2); assert.deepStrictEqual(r.by, { emp:1, email:1 });
  // 00:30 IST on Oct 5 is Oct 4 in UTC: the completion date must be Oct 5
  assert.strictEqual(L.day(new Date('2026-10-04T19:00:00Z'), 'Asia/Kolkata'), '2026-10-05');
  assert.strictEqual(L.day(new Date('2026-10-04T19:00:00Z'), 'UTC'), '2026-10-04');
});
test('access requests: no past or far-future due dates, no self-approval, only published courses', async () => {
  const db = world();
  db.seed('users', 'u1', { empId: 'E1', managerKey: 'u2' }); db.seed('adminCourses', 'x', { id: 'x', code: 'CRS-9', title: 'X', status: 'Published', features: {}, items: [{ kind: 'pdf' }] });
  const req = await L.handle(db, ctx({}), 'requestAccess', { courseId: 'x', reason: 'Needed for my new role' });
  const mgr = ctx({ emp: 'E2', userKey: 'u2' });
  await assert.rejects(L.handle(db, mgr, 'decideRequest', { id: req.id, approve: true, due: '2020-01-01' }), /today to two years/);
  await assert.rejects(L.handle(db, mgr, 'decideRequest', { id: req.id, approve: true, due: '2099-01-01' }), /today to two years/);
  await assert.rejects(L.handle(db, ctx({ perms: ['assignments'] }), 'decideRequest', { id: req.id, approve: true }), /own request/);
  db.seed('adminCourses', 'x', { id: 'x', code: 'CRS-9', title: 'X', status: 'Draft', features: {}, items: [{ kind: 'pdf' }] });
  await assert.rejects(L.handle(db, mgr, 'decideRequest', { id: req.id, approve: true }), /no longer published/);
  db.seed('adminCourses', 'x', { id: 'x', code: 'CRS-9', title: 'X', status: 'Published', features: {}, items: [{ kind: 'pdf' }] });
  await L.handle(db, mgr, 'decideRequest', { id: req.id, approve: true, due: '2026-11-15' });
  assert.strictEqual((await db.get('enroll', 'E1')).data.x, '2026-11-15');
});
// v41.18: Quizzes › Time limit is enforced on the server clock (it used to be saved but never applied)
test('time limit: answers after the limit are refused, submitting still works', async () => {
  const db = world(); db.seed('quizzes', '8', { id: 8, name: 'Written', ids: [1, 5], pass: 50, attempts: 'Unlimited', time: 10 });
  const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'w', step: 0 });
  assert.strictEqual(r.quiz.timeLimit, 10); assert.strictEqual(r.quiz.endsAt, '2026-10-04T10:10:00.000Z');
  await L.handle(db, ctx({ now: new Date('2026-10-04T10:05:00Z') }), 'answer', { attemptId: r.attemptId, index: 0, answer: { sel: 0 } });
  await L.handle(db, ctx({ now: new Date('2026-10-04T10:10:20Z') }), 'answer', { attemptId: r.attemptId, index: 1, answer: { text: 'within grace' } });
  const r2 = await L.handle(db, ctx({ now: new Date('2026-10-04T11:00:00Z') }), 'startAttempt', { courseId: 'w', step: 0 });
  await assert.rejects(L.handle(db, ctx({ now: new Date('2026-10-04T11:10:31Z') }), 'answer', { attemptId: r2.attemptId, index: 0, answer: { sel: 0 } }), /Time is up/);
  const sub = await L.handle(db, ctx({ now: new Date('2026-10-04T11:11:00Z') }), 'submit', { attemptId: r2.attemptId });
  assert.strictEqual(sub.passed, false);
});
test('no time limit: endsAt is null and late answers are accepted', async () => {
  const db = world();
  const r = await L.handle(db, ctx(), 'startAttempt', { courseId: 'w', step: 0 });
  assert.strictEqual(r.quiz.timeLimit, null); assert.strictEqual(r.quiz.endsAt, null);
  await L.handle(db, ctx({ now: new Date('2026-10-05T10:00:00Z') }), 'answer', { attemptId: r.attemptId, index: 0, answer: { sel: 0 } });
});
// v41.18: nobody rates their own written answer or accepts their own assignment; the rater's note is kept
test('raters cannot grade themselves, and their feedback is stored', async () => {
  const db = world(); db.seed('enroll', 'T1', { w: '2026-12-01' });
  const T = ctx({ emp: 'T1', role: 'Trainer', perms: ['gradebook'] });
  const r = await L.handle(db, T, 'startAttempt', { courseId: 'w', step: 0 }), at = db.peek('attempt', r.attemptId);
  for (let k = 0; k < at.items.length; k++) await L.handle(db, T, 'answer', { attemptId: r.attemptId, index: k, answer: { sel: 0, text: 'my own answer' } });
  await L.handle(db, T, 'submit', { attemptId: r.attemptId });
  const rid = Object.values(db.peek('attempt', r.attemptId).answers).map(a => a && a.reviewId).find(Boolean);
  await assert.rejects(L.handle(db, T, 'rescore', { reviewId: rid, rating: 10 }), /own answer/);
  // v41.21: T2 trains T1 (train-the-trainer: T1 is a trainer elsewhere and a trainee here). T3 does not: refused.
  await assert.rejects(L.handle(db, ctx({ emp: 'T3', role: 'Trainer', perms: ['gradebook'], trainees: ['E7'] }), 'rescore', { reviewId: rid, rating: 7 }), /trainees of the batches you train/);
  await L.handle(db, ctx({ emp: 'T2', role: 'Trainer', perms: ['gradebook'], trainees: ['T1'] }), 'rescore', { reviewId: rid, rating: 7, feedback: 'Good start' });
  assert.strictEqual(db.peek('reviews', rid).feedback, 'Good start'); assert.strictEqual(db.peek('reviews', rid).rating, 7);
  db.seed('asgSub', 'T1|w|0', { id: 'T1|w|0', learnerEmp: 'T1', courseId: 'w', step: 0, status: 'Submitted', text: 'x' });
  await assert.rejects(L.handle(db, T, 'reviewAssignment', { id: 'T1|w|0', decision: 'accept' }), /own assignment/);
});
