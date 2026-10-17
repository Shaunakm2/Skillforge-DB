// v41.26: weekend days are a setting, an unknown assignment date stays unknown, "today" follows the organisation's time zone.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { TODAY_KEY: '2026-10-17', Assessment: { score: () => ({ final: true, pct: 0 }) }, daysUntil: () => 0, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/core/progress.js'), 'utf8') + '\n;globalThis.Progress = Progress;', ctx);
const P = ctx.Progress, S = x => JSON.parse(JSON.stringify(x));
// 2026-10-16 is a Friday.
test('default weekend is Saturday + Sunday', () => {
  P.configure({});
  assert.equal(P.workingDeadline('2026-10-16', 5, []), '2026-10-22');
  assert.equal(P.workingDaysBetween('2026-10-16', '2026-10-23', []), 5);
});
test('weekend days come from platform.defaults.weekendDays; all seven off is refused', () => {
  P.configure({ platform: { defaults: { weekendDays: [5, 6] } } });
  assert.equal(P.workingDeadline('2026-10-16', 1, []), '2026-10-18');           // Friday and Saturday are off: Sunday is the first working day
  P.configure({ platform: { defaults: { weekendDays: [0, 1, 2, 3, 4, 5, 6] } } });
  assert.equal(P.workingDeadline('2026-10-16', 1, []), '2026-10-16');
  P.configure({ platform: { defaults: { weekendDays: [6] } } });
  assert.equal(P.workingDaysBetween('2026-10-16', '2026-10-19', []), 2);        // Sunday 18 and Monday 19
  P.configure({});
  assert.equal(P.workingDaysBetween('2026-10-16', '2026-10-19', []), 1);
});
test('unknown dates give no value, not 0 and not an invented date', () => {
  assert.equal(P.workingDaysBetween('', '2026-10-23', []), null);
  assert.equal(P.workingDaysBetween('2026-10-16', '', []), null);
  assert.equal(P.workingDeadline('', 5, []), '');
  assert.equal(P.plus('', 3), '');
  assert.equal(P.assignedOn({ assignedOn: {}, enroll: { u: { c: '2026-11-01' } } }, 'u', 'c'), '');
  assert.equal(P.assignedOn({ assignedOn: { 'u|c': '2026-10-01' }, enroll: {} }, 'u', 'c'), '2026-10-01');
  const s = { itemDone: {}, itemQuiz: {}, extHistory: [], enroll: { u: { c: '2026-11-01' } }, assignedOn: {}, adminCourses: [{ id: 'c', items: [{ kind: 'pdf' }], features: {}, title: 't', code: 'C' }], quizzes: [], reviews: [], attemptsUsed: {}, qs: [] };
  const d = S(P.detail(s, 'u', s.adminCourses[0])); assert.equal(d.assignedOn, ''); assert.equal(d.assignedKnown, false);
});
test('orgToday uses the organisation time zone', () => {
  assert.equal(P.orgToday('Asia/Kolkata', new Date('2026-10-16T20:00:00Z')), '2026-10-17');
  assert.equal(P.orgToday('UTC', new Date('2026-10-16T20:00:00Z')), '2026-10-16');
});
