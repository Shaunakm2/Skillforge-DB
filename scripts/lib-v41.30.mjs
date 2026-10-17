/* Helpers shared by the v41.30 scripts: a small JavaScript scanner that finds where an object-literal property ends. */
export function skipString(t, i) {            // t[i] is ' or " : returns the index after the closing quote
  const q = t[i]; i++;
  while (i < t.length) { if (t[i] === '\\') i += 2; else if (t[i] === q) return i + 1; else i++; }
  return i;
}
export function skipTemplate(t, i) {          // t[i] is ` : handles ${ ... } nesting
  i++;
  while (i < t.length) {
    if (t[i] === '\\') { i += 2; continue; }
    if (t[i] === '`') return i + 1;
    if (t[i] === '$' && t[i + 1] === '{') { i = skipBalanced(t, i + 1); continue; }
    i++;
  }
  return i;
}
export function skipBalanced(t, i) {          // t[i] is { ( or [ : returns the index after the matching closer
  let d = 0;
  for (; i < t.length;) {
    const c = t[i];
    if (c === '"' || c === "'") { i = skipString(t, i); continue; }
    if (c === '`') { i = skipTemplate(t, i); continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && regexAllowed(t, i)) { i = skipRegex(t, i); continue; }
    if (c === '{' || c === '(' || c === '[') d++;
    else if (c === '}' || c === ')' || c === ']') { d--; if (d === 0) return i + 1; }
    i++;
  }
  return i;
}
function prevSig(t, i) { i--; while (i >= 0 && /\s/.test(t[i])) i--; return i; }
export function regexAllowed(t, i) {
  const j = prevSig(t, i); if (j < 0) return true;
  const c = t[j];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
  const w = /[A-Za-z_$][\w$]*$/.exec(t.slice(Math.max(0, j - 12), j + 1));
  return !!w && ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do'].includes(w[0]);
}
export function skipRegex(t, i) {
  i++; let cls = false;
  while (i < t.length) {
    const c = t[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '\n') return i;                 // not a regex after all: stop at the line end
    if (c === '[') cls = true; else if (c === ']') cls = false;
    else if (c === '/' && !cls) { i++; while (/[a-z]/i.test(t[i] || '')) i++; return i; }
    i++;
  }
  return i;
}
/* End of the expression that starts at `i` (just after the colon): index of the top-level `,` or of the closing `}` of the object. */
export function exprEnd(t, i) {
  while (i < t.length) {
    const c = t[i];
    if (c === '"' || c === "'") { i = skipString(t, i); continue; }
    if (c === '`') { i = skipTemplate(t, i); continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && regexAllowed(t, i)) { i = skipRegex(t, i); continue; }
    if (c === '{' || c === '(' || c === '[') { i = skipBalanced(t, i); continue; }
    if (c === ',' || c === '}' || c === ')' || c === ']') return i;
    i++;
  }
  return i;
}
/* Removes the property `name: <expr>` that starts at index `at`. Returns the new text.
 *  - a property that has its line to itself (and maybe a trailing // comment) takes the whole line with it;
 *  - otherwise only the property, its comma and the spaces after it go;
 *  - a LAST property (no comma after it) also takes the comma in front of it when that comma is right there; if a comment is in the way the
 *    comma stays, which is still valid JavaScript (a trailing comma in an object literal). */
export function removeProp(t, at) {
  const colon = t.indexOf(':', at); let end = exprEnd(t, colon + 1);
  const hasComma = t[end] === ',';
  let to = hasComma ? end + 1 : end;
  if (!hasComma) while (to > at && /\s/.test(t[to - 1])) to--;
  const ls = t.lastIndexOf('\n', at - 1) + 1, own = /^[ \t]*$/.test(t.slice(ls, at));
  let k = to; while (t[k] === ' ' || t[k] === '\t') k++;
  let k2 = k; if (t.startsWith('//', k2)) { const nl = t.indexOf('\n', k2); k2 = nl < 0 ? t.length : nl; }
  const atEol = t[k2] === '\n' || k2 >= t.length;
  if (own && atEol) {                                   // the property had the line(s) to itself
    let r = t.slice(0, ls) + t.slice(k2 + (t[k2] === '\n' ? 1 : 0));
    if (!hasComma) { let j = ls - 1; while (j >= 0 && /\s/.test(r[j])) j--; if (r[j] === ',') r = r.slice(0, j) + r.slice(j + 1); }
    return r;
  }
  if (hasComma) return t.slice(0, at) + t.slice(k);
  let j = at - 1; while (j >= 0 && /\s/.test(t[j])) j--;
  return t[j] === ',' ? t.slice(0, j) + t.slice(to) : t.slice(0, at) + t.slice(to);
}
