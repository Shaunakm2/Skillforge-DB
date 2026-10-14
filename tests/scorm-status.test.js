/* v41.18: SCORM 2004 completion_status and success_status are separate; one LMS status is derived from both. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
global.window = global.window || {};
eval(fs.readFileSync(path.join(__dirname, '../public/js/core/scorm.js'), 'utf8') + ';global.ScormRT = ScormRT;');
const fresh = () => { ScormRT.reset('u', 'c', 0); const st = { done: 0 }; ScormRT.bind({ user: 'u', courseId: 'c', item: 0, onComplete: () => st.done++ }); return st; };
test('2004: completed then success "unknown" still counts as completed', () => {
  const st = fresh(), A = window.API_1484_11; A.SetValue('cmi.completion_status', 'completed'); A.SetValue('cmi.success_status', 'unknown'); A.Commit('');
  assert.strictEqual(ScormRT.status(), 'completed'); assert.strictEqual(st.done, 1);
  assert.strictEqual(A.GetValue('cmi.completion_status'), 'completed'); assert.strictEqual(A.GetValue('cmi.success_status'), 'unknown');
});
test('2004: passed wins, failed is not complete, incomplete is not complete', () => {
  const A = window.API_1484_11;
  fresh(); A.SetValue('cmi.success_status', 'passed'); A.SetValue('cmi.completion_status', 'incomplete'); assert.strictEqual(ScormRT.status(), 'passed');
  const st = fresh(); A.SetValue('cmi.completion_status', 'completed'); A.SetValue('cmi.success_status', 'failed'); A.Commit(''); assert.strictEqual(ScormRT.status(), 'failed'); assert.strictEqual(st.done, 0);
  fresh(); A.SetValue('cmi.completion_status', 'incomplete'); assert.strictEqual(ScormRT.status(), 'incomplete');
});
test('1.2 unchanged', () => {
  const st = fresh(); window.API.LMSSetValue('cmi.core.lesson_status', 'incomplete'); assert.strictEqual(ScormRT.status(), 'incomplete');
  window.API.LMSSetValue('cmi.core.lesson_status', 'passed'); assert.strictEqual(ScormRT.status(), 'passed'); assert.strictEqual(st.done, 1);
  fresh(); assert.strictEqual(ScormRT.status(), 'not attempted');
});
test('content-site bridge keeps the two 2004 fields apart', () => {
  const src = fs.readFileSync(path.join(__dirname, '../content-site/public/bridge.js'), 'utf8');
  assert.ok(!/'cmi\.(completion|success)_status'\s*:/.test(src));
});
