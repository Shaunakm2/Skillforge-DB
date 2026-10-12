/* v41.11: checklist, assignment, HTML5 / xAPI packages and embeds on the server. Run: node --test tests/ */
const test = require('node:test'), assert = require('node:assert');
require('../public/js/core/assessment.js'); require('../supabase/functions/_shared/learning-core.js');
const memdb = require('./memdb'); const L = globalThis.LearningCore;
function world() {
  const db = memdb();
  db.seed('lcms', 'mh', { id: 'mh', type: 'Non-SCORM', file: { path: 'o/scorm/pkg1/', launch: 'story.html' } });
  db.seed('adminCourses', 'k', { id: 'k', code: 'CRS-9', title: 'Kinds', status: 'Published', features: { linear: false },
    items: [{ kind: 'checklist', list: [{ t: 'Badge collected' }, { t: 'Desk set up' }] }, { kind: 'assignment', title: 'Write a call script', allowLink: true },
            { kind: 'html', moduleId: 'mh', mins: 2 }, { kind: 'youtube', mins: 2, file: { src: 'https://youtu.be/abcdefghijk' } }] });
  db.seed('enroll', 'E1', { k: '2026-12-01' });
  return db;
}
const at = sec => new Date(Date.parse('2026-10-04T10:00:00Z') + sec * 1000);
const ctx = o => ({ org: 'o', emp: 'E1', role: 'Learner', perms: [], now: at(0), userKey: 'u1', contentOrigin: 'https://content.example', signKey: 'k', ...o });
const done = (db, i) => !!(((db.peek('itemDone', 'E1') || {}).k || {})[i]);

test('checklist: every item must be ticked, completeStep is refused', async () => {
  const db = world();
  await assert.rejects(L.handle(db, ctx(), 'completeStep', { courseId: 'k', step: 0 }), /Tick every item/);
  await assert.rejects(L.handle(db, ctx(), 'submitChecklist', { courseId: 'k', step: 0, ticks: [true, false] }), /Tick every item/);
  await assert.rejects(L.handle(db, ctx(), 'submitChecklist', { courseId: 'k', step: 0, ticks: [true] }), /Tick every item/);
  await L.handle(db, ctx(), 'submitChecklist', { courseId: 'k', step: 0, ticks: [true, true] });
  assert.ok(done(db, 0));
});
test('assignment: learner submits, only Gradebook can review, accept completes the step for the learner', async () => {
  const db = world();
  await assert.rejects(L.handle(db, ctx(), 'completeStep', { courseId: 'k', step: 1 }), /trainer accepts/);
  await assert.rejects(L.handle(db, ctx(), 'submitAssignment', { courseId: 'k', step: 1, text: '', link: '' }), /Write your answer/);
  await assert.rejects(L.handle(db, ctx(), 'submitAssignment', { courseId: 'k', step: 1, text: 'x', link: 'http://evil' }), /https/);
  await L.handle(db, ctx(), 'submitAssignment', { courseId: 'k', step: 1, text: 'My script', link: 'https://contoso.sharepoint.com/x' });
  await assert.rejects(L.handle(db, ctx(), 'submitAssignment', { courseId: 'k', step: 1, text: 'again' }), /Already submitted/);
  const id = 'E1|k|1';
  await assert.rejects(L.handle(db, ctx(), 'reviewAssignment', { id, decision: 'accept' }), /Gradebook/);
  const tr = ctx({ emp: 'T1', role: 'Trainer', perms: ['gradebook'] });
  await assert.rejects(L.handle(db, tr, 'reviewAssignment', { id, decision: 'return', comment: '' }), /what to change/);
  await L.handle(db, tr, 'reviewAssignment', { id, decision: 'return', comment: 'Add a closing line' });
  assert.strictEqual(db.peek('asgSub', id).status, 'Returned'); assert.ok(!done(db, 1));
  await L.handle(db, ctx(), 'submitAssignment', { courseId: 'k', step: 1, text: 'Better script' });
  assert.strictEqual(db.peek('asgSub', id).history.length, 1);
  await L.handle(db, tr, 'reviewAssignment', { id, decision: 'accept' });
  assert.strictEqual(db.peek('asgSub', id).status, 'Accepted'); assert.ok(done(db, 1));
  await assert.rejects(L.handle(db, tr, 'reviewAssignment', { id, decision: 'accept' }), /already reviewed/);
});
test('HTML5 package: launches on the content site, completes after the minimum time', async () => {
  const db = world();
  const r = await L.handle(db, ctx(), 'scormLaunch', { courseId: 'k', step: 2 });
  assert.match(r.url, /^https:\/\/content\.example\/c\/[^/]+\/story\.html$/);
  await assert.rejects(L.handle(db, ctx({ now: at(3) }), 'completeStep', { courseId: 'k', step: 2 }), /Spend at least/);
  await L.handle(db, ctx({ now: at(20) }), 'completeStep', { courseId: 'k', step: 2 });
  assert.ok(done(db, 2));
});
test('YouTube step needs the step opened and the minimum time', async () => {
  const db = world();
  await assert.rejects(L.handle(db, ctx(), 'completeStep', { courseId: 'k', step: 3 }), /Open this step first/);
  await L.handle(db, ctx(), 'openStep', { courseId: 'k', step: 3 });
  await L.handle(db, ctx({ now: at(20) }), 'completeStep', { courseId: 'k', step: 3 });
  assert.ok(done(db, 3));
});
