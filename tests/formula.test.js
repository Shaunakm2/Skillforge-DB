/* Custom KPI formulas: parsing, evaluation, and refusal of anything that is not a formula. */
const test = require('node:test'), assert = require('node:assert');
require('../public/js/core/formula.js');
const F = globalThis.Formula;
const FIELDS = { joined: 'Joined', hrms_joined_day0: 'Joined as per HRMS', participants: 'Participants', handover: 'Handed over' };
const row = { joined: 90, hrms_joined_day0: 100, participants: 104, handover: 70 };
const day = { A: { 1: 7, 2: 3 }, P: { 1: 93 }, L: { 1: 4 }, M: { 1: 100 } };
const run = (src, defs) => { const c = F.compile(src, FIELDS, defs || {}); assert.ok(c.ok, c.error); return F.evaluate(c.ast, { ref: k => row[k], day: (m, n) => (day[m] || {})[n] || 0 }); };

test('the example KPI: joined on day 0 as per HRMS minus absent on day 1', () => {
  assert.strictEqual(run('hrms_joined_day0 - ABSENT_DAY(1)'), 93);
});
test('arithmetic, precedence, brackets, unary minus, case-insensitive names', () => {
  assert.strictEqual(run('2 + 3 * 4'), 14); assert.strictEqual(run('(2 + 3) * 4'), 20); assert.strictEqual(run('-joined + 100'), 10);
  assert.strictEqual(run('JOINED / Participants * 100').toFixed(4), (90 / 104 * 100).toFixed(4));
});
test('functions: IF, comparisons, PCT, DIV, ROUND, MIN/MAX', () => {
  assert.strictEqual(run('IF(GT(joined, 80), 1, 0)'), 1); assert.strictEqual(run('IF(LT(joined, 80), 1, 0)'), 0);
  assert.strictEqual(run('ROUND(PCT(handover, joined), 1)'), 77.8); assert.strictEqual(run('DIV(5, 0)'), null); assert.strictEqual(run('PCT(5, 0)'), null); assert.strictEqual(run('NZ(DIV(5, 0), 0)'), 0); assert.strictEqual(run('NZ(joined, 0)'), 90); assert.strictEqual(run('MAX(1, joined, 3)'), 90);
  assert.strictEqual(run('AND(GE(joined, 90), LE(joined, 90))'), 1); assert.strictEqual(run('NOT(EQ(joined, 90))'), 0);
});
test('division by zero gives no value (shown as —), not Infinity', () => {
  assert.strictEqual(run('joined / 0'), null); assert.strictEqual(run('1 + joined / (handover - 70)'), null);
});
test('code, markup and anything outside the language are refused', () => {
  for (const bad of ['alert(1)', 'constructor.constructor("x")()', 'joined; fetch("//x")', '__proto__', 'this', 'window.location', '[1]', '`x`', '"text"', 'joined = 1', '1 ** 2 ^ 3', 'a.b', '{}'])
    assert.ok(!F.compile(bad, FIELDS, {}).ok, bad);
  // identifiers are looked up as own properties only, never on the prototype chain
  for (const bad of ['constructor', 'tostring', 'hasownproperty', 'valueof', '__proto__']) assert.ok(!F.compile(bad, FIELDS, {}).ok, bad);
});
test('unknown fields and wrong argument counts are reported with a position', () => {
  const c = F.compile('joined - absent', FIELDS, {}); assert.ok(!c.ok); assert.match(c.error, /Unknown field “absent”/); assert.strictEqual(c.pos, 9);
  assert.match(F.compile('IF(1, 2)', FIELDS, {}).error, /IF\(\) takes 3/); assert.match(F.compile('ABSENT_DAY(31)', FIELDS, {}).error, /1 to 30/);
  assert.match(F.compile('ABSENT_DAY(joined)', FIELDS, {}).error, /day number/); assert.match(F.compile('nope(1)', FIELDS, {}).error, /Unknown function/);
});
test('limits: length, tokens and nesting depth', () => {
  assert.ok(!F.compile('1+'.repeat(300) + '1', FIELDS, {}).ok); assert.ok(!F.compile('('.repeat(40) + '1' + ')'.repeat(40), FIELDS, {}).ok);
  assert.ok(!F.compile('-'.repeat(60) + '1', FIELDS, {}).ok);
});
test('KPIs can use other KPIs; loops are refused', () => {
  const defs = { day1_loss: { formula: 'hrms_joined_day0 - ABSENT_DAY(1)' }, day1_pct: { formula: 'PCT(day1_loss, hrms_joined_day0)' }, a: { formula: 'b + 1' }, b: { formula: 'a + 1' } };
  const fo = k => row[k], dy = (m, n) => (day[m] || {})[n] || 0;
  assert.strictEqual(F.evalKpi('day1_pct', defs, FIELDS, fo, dy), 93);
  assert.throws(() => F.evalKpi('a', defs, FIELDS, fo, dy), /loop/);
  assert.match(F.compile('day1_pct', FIELDS, defs, 'day1_pct').error, /itself/);
  assert.ok(!Object.keys(defs.day1_loss).some(k => k !== 'formula'), 'nothing is added to the saved KPI object');
});
test('KPI codes', () => {
  assert.strictEqual(F.codeProblem('day1_loss', FIELDS), ''); assert.ok(F.codeProblem('Day1', FIELDS)); assert.ok(F.codeProblem('joined', FIELDS)); assert.ok(F.codeProblem('if', FIELDS)); assert.ok(F.codeProblem('x', FIELDS));
});
