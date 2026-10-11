/* Skillforge LMS — custom KPI formulas (Analytics › KPI builder).
 *
 * A small, closed formula language. It is parsed and evaluated here; nothing is ever passed to eval() or
 * new Function() (the Content-Security-Policy forbids both, and a formula typed by an admin must never run as code).
 *
 *   Numbers        12   3.5
 *   Fields         joined   hrms_joined_day0   completion_rate      (the dataset's field list; case-insensitive)
 *   Other KPIs     their code, e.g.  day1_loss                         (cycles are refused)
 *   Operators      +  -  *  /  ( )                                    (x / 0 gives "no value", shown as —)
 *   Functions      ABSENT_DAY(n) PRESENT_DAY(n) LATE_DAY(n) MARKED_DAY(n)   n = training day 1–30 (a number)
 *                  IF(test, then, else)  GT LT GE LE EQ NE (a, b)  AND OR (a, b)  NOT(a)
 *                  MIN MAX (a, b, …)  ABS(a)  ROUND(a [, decimals])  DIV(a, b)  PCT(a, b) (a ÷ b × 100)  NZ(a, b) (a, or b when a has no value)
 *
 * No value (shown as —): any division by 0 (/, DIV, PCT), attendance for a day nobody was marked on, or anything built from those.
 * NZ() turns “no value” into a number when that is what you want, e.g. NZ(ABSENT_DAY(1), 0).
 *
 * Comparison is written as functions (GT(a, b) rather than a > b): every text box in the app strips < and >.
 * Limits: 500 characters, 200 tokens, nesting depth 24, KPI references 8 deep.
 */
(function () {
  'use strict';
  const MAX_LEN = 500, MAX_TOKENS = 200, MAX_DEPTH = 24, MAX_REF_DEPTH = 8, MAX_DAY = 30;
  class FormulaError extends Error { constructor(msg, pos) { super(msg); this.pos = pos == null ? -1 : pos; } }
  const err = (m, p) => { throw new FormulaError(m, p); };

  // name -> [min args, max args]
  const FUNCS = {
    IF: [3, 3], GT: [2, 2], LT: [2, 2], GE: [2, 2], LE: [2, 2], EQ: [2, 2], NE: [2, 2], AND: [2, 8], OR: [2, 8], NOT: [1, 1],
    MIN: [1, 12], MAX: [1, 12], ABS: [1, 1], ROUND: [1, 2], DIV: [2, 2], PCT: [2, 2], NZ: [2, 2],
    ABSENT_DAY: [1, 1], PRESENT_DAY: [1, 1], LATE_DAY: [1, 1], MARKED_DAY: [1, 1],
  };
  const DAY_FUNCS = { ABSENT_DAY: 'A', PRESENT_DAY: 'P', LATE_DAY: 'L', MARKED_DAY: 'M' };

  function tokenize(src) {
    if (typeof src !== 'string') err('The formula is empty');
    if (src.length > MAX_LEN) err('Keep the formula under ' + MAX_LEN + ' characters');
    const out = []; let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) { const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i)); if (!m) err('Number not understood', i); out.push({ t: 'num', v: Number(m[0]), p: i }); i += m[0].length; continue; }
      if (/[A-Za-z_]/.test(ch)) { const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); out.push({ t: 'id', v: m[0].toLowerCase(), raw: m[0], p: i }); i += m[0].length; continue; }
      if ('+-*/(),'.includes(ch)) { out.push({ t: ch, p: i }); i++; continue; }
      err('“' + ch + '” is not allowed here. Use + − × ÷ ( ) , and the functions listed.', i);
    }
    if (out.length > MAX_TOKENS) err('The formula is too long (' + MAX_TOKENS + ' parts max)');
    if (!out.length) err('The formula is empty');
    return out;
  }

  /* Recursive-descent parser -> AST. Identifiers are checked later against the dataset (compile). */
  function parse(src) {
    const tk = tokenize(src); let k = 0, depth = 0;
    const peek = () => tk[k], take = t => { const x = tk[k]; if (!x || (t && x.t !== t)) err(t ? 'Expected “' + t + '”' : 'Unexpected end', x ? x.p : src.length); k++; return x; };
    const enter = p => { if (++depth > MAX_DEPTH) err('Too many nested brackets', p); };
    function expr() { let a = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = take().t; a = { k: 'bin', op, a, b: term() }; } return a; }
    function term() { let a = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = take().t; a = { k: 'bin', op, a, b: unary() }; } return a; }
    function unary() { const x = peek(); if (x && x.t === '-') { take(); enter(x.p); const v = { k: 'neg', a: unary() }; depth--; return v; } if (x && x.t === '+') { take(); return unary(); } return primary(); }
    function primary() {
      const x = peek(); if (!x) err('The formula ends too early', src.length);
      if (x.t === 'num') { take(); return { k: 'num', v: x.v }; }
      if (x.t === '(') { take(); enter(x.p); const v = expr(); take(')'); depth--; return v; }
      if (x.t === 'id') { take();
        if (peek() && peek().t === '(') { const name = x.v.toUpperCase(); if (!FUNCS[name]) err('Unknown function ' + x.raw + '()', x.p);
          take('('); enter(x.p); const args = []; if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { take(); args.push(expr()); } } take(')'); depth--;
          const [mn, mx] = FUNCS[name]; if (args.length < mn || args.length > mx) err(name + '() takes ' + (mn === mx ? mn : mn + '–' + mx) + ' value' + (mx === 1 ? '' : 's'), x.p);
          if (DAY_FUNCS[name]) { const a = args[0]; if (a.k !== 'num' || !Number.isInteger(a.v) || a.v < 1 || a.v > MAX_DAY) err(name + '() needs a training day number from 1 to ' + MAX_DAY, x.p); return { k: 'day', mark: DAY_FUNCS[name], day: a.v }; }
          return { k: 'fn', name, args }; }
        return { k: 'ref', name: x.v, raw: x.raw, p: x.p }; }
      err('Unexpected “' + x.t + '”', x.p);
    }
    const ast = expr(); if (k < tk.length) err('Unexpected “' + (tk[k].raw || tk[k].v || tk[k].t) + '”', tk[k].p);
    return ast;
  }

  const walk = (n, fn) => { fn(n); if (n.a) walk(n.a, fn); if (n.b) walk(n.b, fn); (n.args || []).forEach(x => walk(x, fn)); };

  /* Check a formula against a dataset. fields: { key: label }, kpis: { code: kpiDef }. Returns { ok, ast, refs, error, pos }. */
  function compile(src, fields, kpis, selfCode) {
    try {
      const ast = parse(src), refs = new Set(), unknown = [];
      walk(ast, n => { if (n.k !== 'ref') return; if (Object.prototype.hasOwnProperty.call(fields, n.name)) return;
        if (kpis && Object.prototype.hasOwnProperty.call(kpis, n.name)) { if (n.name === selfCode) err('A KPI cannot use itself', n.p); refs.add(n.name); return; }
        unknown.push(n); });
      if (unknown.length) err('Unknown field “' + unknown[0].raw + '”. Pick one from the field list.', unknown[0].p);
      return { ok: true, ast, refs: [...refs] };
    } catch (e) { if (e instanceof FormulaError) return { ok: false, error: e.message, pos: e.pos }; throw e; }
  }

  const CACHE = new WeakMap();   // compiled formulas, kept off the KPI objects so nothing extra is ever saved
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  /* Evaluate. env.field(key) and env.day(mark, n) return numbers; env.kpi(code) evaluates another KPI. null = no value. */
  function evaluate(ast, env) {
    const ev = n => {
      switch (n.k) {
        case 'num': return n.v;
        case 'ref': return num(env.ref(n.name));
        case 'day': return num(env.day(n.mark, n.day));
        case 'neg': { const a = ev(n.a); return a == null ? null : -a; }
        case 'bin': { const a = ev(n.a), b = ev(n.b); if (a == null || b == null) return null;
          if (n.op === '+') return a + b; if (n.op === '-') return a - b; if (n.op === '*') return a * b; return b === 0 ? null : a / b; }
        case 'fn': {
          const A = n.args;
          if (n.name === 'IF') { const t = ev(A[0]); return t == null ? null : t ? ev(A[1]) : ev(A[2]); }
          if (n.name === 'NZ') { const a = ev(A[0]); return a == null ? ev(A[1]) : a; }
          const v = A.map(ev);
          switch (n.name) {
            case 'GT': return v[0] == null || v[1] == null ? null : +(v[0] > v[1]); case 'LT': return v[0] == null || v[1] == null ? null : +(v[0] < v[1]);
            case 'GE': return v[0] == null || v[1] == null ? null : +(v[0] >= v[1]); case 'LE': return v[0] == null || v[1] == null ? null : +(v[0] <= v[1]);
            case 'EQ': return v[0] == null || v[1] == null ? null : +(v[0] === v[1]); case 'NE': return v[0] == null || v[1] == null ? null : +(v[0] !== v[1]);
            case 'AND': return v.some(x => x == null) ? null : +v.every(Boolean); case 'OR': return v.some(x => x == null) ? null : +v.some(Boolean);
            case 'NOT': return v[0] == null ? null : +!v[0];
            case 'MIN': return v.some(x => x == null) ? null : Math.min(...v); case 'MAX': return v.some(x => x == null) ? null : Math.max(...v);
            case 'ABS': return v[0] == null ? null : Math.abs(v[0]);
            case 'ROUND': { if (v[0] == null) return null; const d = v.length > 1 && v[1] != null ? Math.max(0, Math.min(6, Math.round(v[1]))) : 0, f = Math.pow(10, d); return Math.round(v[0] * f) / f; }
            case 'DIV': return v[0] == null || v[1] == null || v[1] === 0 ? null : v[0] / v[1];
            case 'PCT': return v[0] == null || v[1] == null || v[1] === 0 ? null : v[0] / v[1] * 100;
          }
          return null;
        }
      }
      return null;
    };
    const r = ev(ast); return num(r);
  }

  /* Evaluate KPI `code` from a set of KPI definitions against one aggregate row.
   * defs: { code: { formula, src } }, fieldOf(key) -> number, dayOf(mark, n) -> number. Memoised per call. */
  function evalKpi(code, defs, fields, fieldOf, dayOf, memo, stack) {
    memo = memo || new Map(); stack = stack || [];
    if (memo.has(code)) return memo.get(code);
    if (stack.includes(code)) err('These KPIs use each other in a loop: ' + stack.concat(code).join(' → '));
    if (stack.length >= MAX_REF_DEPTH) err('KPIs refer to each other too deeply (' + MAX_REF_DEPTH + ' levels max)');
    const d = defs[code]; if (!d) return null;
    let c = CACHE.get(d); if (!c || c.src !== d.formula || c.fields !== fields) { c = { src: d.formula, fields, ...compile(d.formula, fields, defs, code) }; CACHE.set(d, c); }
    if (!c.ok) return null;
    const env = { ref: k => Object.prototype.hasOwnProperty.call(fields, k) ? fieldOf(k) : evalKpi(k, defs, fields, fieldOf, dayOf, memo, stack.concat(code)), day: dayOf };
    const v = evaluate(c.ast, env); memo.set(code, v); return v;
  }

  /* Codes are what formulas use to refer to a KPI: lower case letters, digits and _ (2–32), not a field or function name. */
  const codeProblem = (code, fields) => !/^[a-z][a-z0-9_]{1,31}$/.test(code) ? 'Use 2–32 lower-case letters, digits or _ (start with a letter)'
    : Object.prototype.hasOwnProperty.call(fields || {}, code) ? 'That is already a field name' : FUNCS[code.toUpperCase()] ? 'That is a function name' : '';

  const api = { tokenize, parse, compile, evaluate, evalKpi, codeProblem, FormulaError, FUNCS: Object.keys(FUNCS), MAX_DAY };
  if (typeof window !== 'undefined') window.Formula = api;
  globalThis.Formula = api;
})();
