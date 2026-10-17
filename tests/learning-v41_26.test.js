// v41.26: resumable submit, pass follows re-rating, server-counted seat time, < and > refused.
// Uses a small in-memory database and a minimal stand-in for Assessment (the real one is not needed for these rules).
const test = require('node:test'), assert = require('node:assert/strict');
globalThis.Assessment = {
  isWritten: q => q.type === 'Written answer',
  grade: (q, a) => (q.type === 'Written answer' ? null : (a && a.sel === q.ans ? 1 : 0)),
  attemptsInfo: (z, used, extra) => ({ allowed: (z.attempts || 3) + (extra || 0), canStart: used < (z.attempts || 3) + (extra || 0) }),
  buildAttempt: (z, bank) => bank.map(q => ({ qid: q.id, order: (q.opts || []).map((_, i) => i) })),
  score: (items, answers, bank, reviews) => { let right = 0, auto = 0, written = 0, pend = 0;
    items.forEach((a, i) => { const q = bank.find(x => String(x.id) === String(a.qid));
      if (q.type === 'Written answer') { written++; const rv = (reviews || []).find(r => r.id === (answers[i] || {}).reviewId); if (!rv || rv.rating == null) pend++; else right += rv.rating / (q.points || 1); }
      else { auto++; if (answers[i] && answers[i].sel === q.ans) right++; } });
    const n = auto + written; return { pct: n ? Math.round(right / n * 100) : 0, final: pend === 0, pending: pend, auto, written, autoRight: right }; },
};
require('../supabase/functions/_shared/learning-core.js');
const L = globalThis.LearningCore;

function mem(failOn) {            // in-memory sf_doc; failOn = { coll, times } makes put fail that many times
  const m = new Map(), k = (c, key) => c + '\u0000' + key; let boom = failOn ? { ...failOn } : null;
  return { m,
    async get(c, key) { const r = m.get(k(c, key)); return r ? { data: JSON.parse(JSON.stringify(r.data)), version: r.version } : null; },
    async getMany(c, keys) { const o = new Map(); for (const key of keys) { const r = await this.get(c, key); if (r) o.set(key, r); } return o; },
    async put(c, key, data, version) { if (boom && boom.coll === c && boom.times > 0) { boom.times--; throw new Error('boom'); }
      const cur = m.get(k(c, key)); if (version == null) { if (cur) return false; m.set(k(c, key), { data: JSON.parse(JSON.stringify(data)), version: 1 }); return true; }
      if (!cur || cur.version !== version) return false; m.set(k(c, key), { data: JSON.parse(JSON.stringify(data)), version: version + 1 }); return true; },
    async del(c, key) { m.delete(k(c, key)); } };
}
const seed = async (db, items, quizIds) => {
  await db.put('adminCourses', 'c1', { id: 'c1', title: 'C', code: 'C1', status: 'Published', items, features: {} }, null);
  await db.put('enroll', 'E1', { c1: '2099-01-01' }, null);
  await db.put('quizzes', 'z1', { id: 'z1', name: 'Quiz', pass: 50, ids: quizIds || ['q1'], attempts: 3 }, null);
  await db.put('qs', 'q1', { id: 'q1', type: 'Multiple choice', text: 'x', opts: ['a', 'b'], ans: 0 }, null);
  await db.put('qs', 'q2', { id: 'q2', type: 'Written answer', text: 'w', points: 4 }, null);
};
const ctx = (over) => ({ org: 'o', emp: 'E1', role: 'Learner', perms: [], now: new Date('2026-10-17T10:00:00Z'), tz: 'Asia/Kolkata', ...over });

test('submit failing halfway is finished by a retry (no lost attempt, pass recorded once)', async () => {
  const db = mem(); await seed(db, [{ kind: 'quiz', quizId: 'z1' }]);
  const st = await L.handle(db, ctx(), 'startAttempt', { courseId: 'c1', step: 0 });
  await L.handle(db, ctx(), 'answer', { attemptId: st.attemptId, index: 0, answer: { sel: 0 } });
  const flaky = mem(); flaky.m = db.m;                       // same data, but the attemptRecs write fails once
  const fdb = { ...db, put: async (c, key, d, v) => { if (c === 'attemptRecs' && !fdb.tried) { fdb.tried = true; throw new Error('network'); } return db.put(c, key, d, v); } };
  await assert.rejects(() => L.handle(fdb, ctx(), 'submit', { attemptId: st.attemptId }), /network/);
  const stuck = (await db.get('attempt', st.attemptId)).data; assert.ok(stuck.submittedAt); assert.equal(stuck.finalised, false);
  assert.equal(await db.get('itemDone', 'E1'), null, 'no pass yet');
  const out = await L.handle(db, ctx({ now: new Date('2026-10-17T10:01:00Z') }), 'submit', { attemptId: st.attemptId });
  assert.equal(out.passed, true);
  assert.equal((await db.get('attempt', st.attemptId)).data.finalised, true);
  assert.equal((await db.get('itemDone', 'E1')).data.c1[0].attemptId, st.attemptId);
  assert.equal((await db.get('attemptRecs', st.attemptId)).data.pass, true);
  assert.equal((await db.get('itemQuiz', 'E1')).data.c1[0].length, 1, 'recorded once');
  await assert.rejects(() => L.handle(db, ctx(), 'submit', { attemptId: st.attemptId }), /already submitted/);
});

test('a lower re-rating undoes a pass', async () => {
  const db = mem(); await seed(db, [{ kind: 'quiz', quizId: 'z1' }], ['q2']);
  const st = await L.handle(db, ctx(), 'startAttempt', { courseId: 'c1', step: 0 });
  await L.handle(db, ctx(), 'answer', { attemptId: st.attemptId, index: 0, answer: { text: 'my answer' } });
  const sub = await L.handle(db, ctx(), 'submit', { attemptId: st.attemptId }); assert.equal(sub.pending, true);
  const rid = (await db.get('attempt', st.attemptId)).data.answers[0].reviewId, rater = ctx({ emp: 'T1', role: 'Admin' });
  const done = async () => { const d = await db.get('itemDone', 'E1'); return d && d.data.c1 && d.data.c1[0]; };
  await L.handle(db, rater, 'rescore', { reviewId: rid, rating: 4 });
  assert.ok(await done(), 'passed with 4/4');
  await L.handle(db, rater, 'rescore', { reviewId: rid, rating: 1 });
  assert.equal(await done(), undefined, 'pass undone');
  await L.handle(db, rater, 'rescore', { reviewId: rid, rating: 3 });
  assert.ok(await done(), 'passes again');
});

test('if another attempt still passes, a lower re-rating moves the mark to it', async () => {
  const db = mem(); await seed(db, [{ kind: 'quiz', quizId: 'z1' }], ['q2']);
  const run = async (text, at) => { const st = await L.handle(db, ctx({ now: new Date(at) }), 'startAttempt', { courseId: 'c1', step: 0 });
    await L.handle(db, ctx({ now: new Date(at) }), 'answer', { attemptId: st.attemptId, index: 0, answer: { text } });
    await L.handle(db, ctx({ now: new Date(at) }), 'submit', { attemptId: st.attemptId });
    return { id: st.attemptId, rid: (await db.get('attempt', st.attemptId)).data.answers[0].reviewId }; };
  const rater = ctx({ emp: 'T1', role: 'Admin' }), a = await run('first', '2026-10-17T10:00:00Z'), b = await run('second', '2026-10-17T11:00:00Z');
  await L.handle(db, rater, 'rescore', { reviewId: a.rid, rating: 3 });
  await L.handle(db, rater, 'rescore', { reviewId: b.rid, rating: 4 });
  assert.equal((await db.get('itemDone', 'E1')).data.c1[0].attemptId, a.id, 'the first pass is kept');
  await L.handle(db, rater, 'rescore', { reviewId: a.rid, rating: 0 });
  assert.equal((await db.get('itemDone', 'E1')).data.c1[0].attemptId, b.id, 'moved to the attempt that still passes');
});

test('a step finished another way is never undone by a rating', async () => {
  const db = mem(); await seed(db, [{ kind: 'pdf', mins: 1 }]);
  await db.put('itemDone', 'E1', { c1: { 0: { at: '2026-10-01', src: 'viewed' } } }, null);
  await L.syncQuizDone(db, 'E1', 'Asia/Kolkata', 'c1', 0);
  assert.equal((await db.get('itemDone', 'E1')).data.c1[0].src, 'viewed');
});

test('seat time is counted by the server from pings; waiting alone is not enough when seatStrict', async () => {
  const db = mem(); await seed(db, [{ kind: 'pdf', mins: 3 }]);              // needs viewNeed(3) = 18 s
  const t = s => ctx({ seatStrict: true, now: new Date(Date.parse('2026-10-17T10:00:00Z') + s * 1000) });
  await L.handle(db, t(0), 'openStep', { courseId: 'c1', step: 0, hb: true });
  await assert.rejects(() => L.handle(db, t(300), 'completeStep', { courseId: 'c1', step: 0 }), /Spend at least 18 seconds/, '5 minutes of wall-clock with no pings');
  await L.handle(db, t(20), 'stepPing', { courseId: 'c1', step: 0 });
  assert.equal((await db.get('stepOpen', 'E1|c1|0')).data.secs, 20);
  await L.handle(db, t(21), 'stepPing', { courseId: 'c1', step: 0 });         // 1 s later: ignored (min gap)
  assert.equal((await db.get('stepOpen', 'E1|c1|0')).data.secs, 20);
  const out = await L.handle(db, t(400), 'completeStep', { courseId: 'c1', step: 0 }); assert.equal(out.done, true);
});

test('a ping after a long gap adds at most 45 s; a resume ping adds nothing; no ping without opening', async () => {
  const db = mem(); await seed(db, [{ kind: 'pdf', mins: 10 }]);
  const t = s => ctx({ seatStrict: true, now: new Date(Date.parse('2026-10-17T10:00:00Z') + s * 1000) });
  await assert.rejects(() => L.handle(db, t(5), 'stepPing', { courseId: 'c1', step: 0 }), /Open this step first/);
  await L.handle(db, t(0), 'openStep', { courseId: 'c1', step: 0, hb: true });
  await L.handle(db, t(1000), 'stepPing', { courseId: 'c1', step: 0 });
  assert.equal((await db.get('stepOpen', 'E1|c1|0')).data.secs, 45);
  await L.handle(db, t(2000), 'stepPing', { courseId: 'c1', step: 0, resume: true });
  assert.equal((await db.get('stepOpen', 'E1|c1|0')).data.secs, 45);
});

test('without seatStrict the old wall-clock rule still applies', async () => {
  const db = mem(); await seed(db, [{ kind: 'pdf', mins: 3 }]);
  await L.handle(db, ctx(), 'openStep', { courseId: 'c1', step: 0 });
  const out = await L.handle(db, ctx({ now: new Date('2026-10-17T10:05:00Z') }), 'completeStep', { courseId: 'c1', step: 0 }); assert.equal(out.done, true);
});

test('< and > are refused with a message, not removed', async () => {
  const db = mem(); await db.put('users', 'u1', { id: 'u1', empId: 'E1' }, null);
  await assert.rejects(() => L.handle(db, ctx({ userKey: 'u1' }), 'updateProfile', { bio: 'a<b' }), /< and > are not allowed/);
  const ok = await L.handle(db, ctx({ userKey: 'u1' }), 'updateProfile', { bio: 'hello' }); assert.equal(ok.patch.bio, 'hello');
});

test('deploy order: a page that does not send heartbeats (hb) keeps the wall-clock rule even when the server is strict', async () => {
  const db = mem(); await seed(db, [{ kind: 'pdf', mins: 3 }]);               // needs 18 s
  const t = s => ctx({ seatStrict: true, now: new Date(Date.parse('2026-10-17T10:00:00Z') + s * 1000) });
  await L.handle(db, t(0), 'openStep', { courseId: 'c1', step: 0 });            // old page: no hb
  assert.equal((await db.get('stepOpen', 'E1|c1|0')).data.secs, undefined);
  await assert.rejects(() => L.handle(db, t(5), 'completeStep', { courseId: 'c1', step: 0 }), /Spend at least 18 seconds/);
  assert.equal((await L.handle(db, t(30), 'completeStep', { courseId: 'c1', step: 0 })).done, true);
});
