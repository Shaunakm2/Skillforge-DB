/* Skillforge view engine
 * Compiles the declarative <template id="app-template"> markup into render
 * functions and patches the live DOM in place on every state change.
 *
 * Template syntax
 *   {{ path }}                    text / attribute interpolation (dot paths)
 *   <sf-if value="{{ x }}">       render children when x is truthy
 *   <sf-for list="{{ xs }}" as="x">  repeat children for each item
 *   <sf-select>                   a <select> (kept raw so the parser keeps loops inside)
 *   on-click / on-input / on-change / on-keydown="{{ handler }}"   event bindings
 *   value="{{ x }}"               controlled value for input / textarea / select
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const EXPR = /\{\{([\s\S]+?)\}\}/g;

  function resolve(vals, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    let cur = vals;
    for (const part of path.split('.')) {
      if (cur == null || part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function compileValue(raw) {
    const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
    if (whole) { const f = vals => resolve(vals, whole[1]); f.bound = true; return f; }
    if (raw.includes('{{')) {
      const parts = raw.split(EXPR);
      const f = vals => parts.map((p, i) => (i & 1 ? (resolve(vals, p) ?? '') : p)).join(''); f.bound = true; return f;
    }
    return () => raw;
  }

  /* ---------- compile: template DOM -> builder functions ---------- */

  function compileChildren(node, flat) {
    const out = [];
    for (const child of node.childNodes) {
      const b = compileNode(child, flat);
      if (b) out.push(b);
    }
    return out;
  }

  function compileNode(node, flat) {
    if (node.nodeType === Node.TEXT_NODE) return compileText(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.localName;
    if (tag === 'sf-if') return compileIf(node, flat);
    if (tag === 'sf-for') return compileFor(node, flat);
    return compileElement(node);
  }

  function compileText(node) {
    const txt = node.nodeValue || '';
    if (!txt.trim() && !txt.includes(' ')) return null;
    if (!txt.includes('{{')) return () => [txt];
    const parts = txt.split(EXPR);
    return vals => {
      const out = [];
      parts.forEach((p, i) => {
        if (!(i & 1)) { if (p) out.push(p); return; }
        const v = resolve(vals, p);
        if (v == null || typeof v === 'boolean') return;
        out.push({ tag: 'span', ns: null, attrs: {}, props: {}, on: {}, kids: [String(v)] });
      });
      return out;
    };
  }

  // sf-if / sf-for render as display:contents wrappers so sibling positions
  // stay stable while patching. Inside <select> and <svg> they are flattened.
  function wrap(tag, kids, flat) {
    if (flat) return kids;
    return [{ tag, ns: null, attrs: {}, props: {}, on: {}, kids }];
  }

  function compileIf(el, flat) {
    const get = compileValue(el.getAttribute('value') || '');
    const kids = compileChildren(el, flat);
    return vals => wrap('sf-if', get(vals) ? kids.flatMap(b => b(vals)) : [], flat);
  }

  function compileFor(el, flat) {
    const get = compileValue(el.getAttribute('list') || '');
    const as = el.getAttribute('as') || 'item';
    const kids = compileChildren(el, flat);
    return vals => {
      const list = get(vals);
      const out = [];
      if (Array.isArray(list)) {
        list.forEach((item, i) => {
          const scope = Object.assign({}, vals, { [as]: item, $index: i });
          kids.forEach(b => out.push(...b(scope)));
        });
      }
      return wrap('sf-for', out, flat);
    };
  }

  /* Input guard (applies to every field in the app): trims control characters, strips angle brackets that could
   inject markup, keeps number fields inside their min/max, and enforces maxlength even for pasted text. */
// v35: the person is told why the text changed, and the minimum is applied when they leave the field (not while typing)
const guardInput = (el, type) => {
  if (!el || !('value' in el) || el.type === 'file' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'color') return;
  let v = el.value, o = v, why = '';
  if (typeof v === 'string' && el.type !== 'password') { const c = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''), a = c.replace(/[<>]/g, '');
    if (a !== c) why = 'The characters < and > are not allowed here.'; v = a; }
  const ml = +el.getAttribute('maxlength'); if (ml > 0 && v.length > ml) { v = v.slice(0, ml); why = why || 'This field allows up to ' + ml + ' characters.'; }
  if (el.type === 'number' && v !== '') { const n = +v, mn = el.getAttribute('min'), mx = el.getAttribute('max');
    if (isNaN(n)) v = ''; else if (mx !== null && n > +mx) { v = String(+mx); why = 'The highest value allowed is ' + (+mx) + '.'; }
    else if (type === 'change' && mn !== null && n < +mn) { v = String(+mn); why = 'The lowest value allowed is ' + (+mn) + '.'; } }
  if (v !== o) { el.value = v; el.classList.add('sf-guarded'); setTimeout(() => el.classList.remove('sf-guarded'), 700);
    if (why) window.dispatchEvent(new CustomEvent('sf-toast', { detail: why })); }
};
/* Output guards (v30): every bound value passes through here, whatever the screen and wherever the data came from
   (typed, imported, synced from the database). Text is always set as text, never as HTML. URL attributes accept only
   https:, http:, blob:, data:image/…, mailto:, about:blank, # and relative paths — so javascript:, vbscript: and data:text/html
   links can never be rendered even if stored. Bound styles may not use expression(), @import, behavior or unsafe url(). */
const URL_ATTRS = { href:1, src:1, action:1, formaction:1, poster:1, data:1, cite:1, background:1, 'xlink:href':1 };
const safeUrl = v => { const t = String(v).trim(), low = t.replace(/[\u0000-\u0020\u007F-\u009F]/g, '').toLowerCase();
  if (!low || low === 'about:blank' || low[0] === '#') return t;
  const m = /^([a-z][a-z0-9+.-]*):/.exec(low); if (!m) return /^(\/\/|\\)/.test(low) ? null : t;   // relative paths only (no protocol-relative)
  if (m[1] === 'https' || m[1] === 'http' || m[1] === 'blob' || m[1] === 'mailto') return t;
  if (m[1] === 'data' && /^data:image\/(png|jpe?g|gif|webp);/.test(low)) return t;
  return null; };
const safeStyle = v => { const t = String(v); if (t.includes('\\') || /[\u0000-\u001F]/.test(t)) return null;   // CSS escapes could spell url( or expression(
  const low = t.toLowerCase();
  if (/expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:/.test(low)) return null;
  const urls = low.match(/url\(\s*(['"]?)(.*?)\1\s*\)/g) || [];
  return urls.every(u => { const inner = u.replace(/^url\(\s*(['"]?)/, '').replace(/(['"]?)\s*\)$/, '').trim(); return cssUrlOk(inner); }) ? t : null; };
/* Images in styles (course banners) only from this site, blob:/data:image, or the Supabase storage host: the same places
   the Content-Security-Policy allows, so an injected url() cannot be used as a tracking pixel. */
const cssUrlOk = u => { if (safeUrl(u) === null) return false; const low = u.toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*:/.test(low) || /^(blob:|data:image\/)/.test(low)) return true;
  try { const h = new URL(u).hostname; return (low.startsWith('https:') && /\.supabase\.co$/.test(h)) || h === location.hostname; } catch (e) { return false; } };
/* A value bound INTO a style (style="background:{{ x }}") is one value: it may not add declarations or rules. */
const stylePartOk = v => !/[;{}]/.test(String(v));
const CSV_MAX = 10 * 1048576;
const EVENT_ATTR = { 'on-click': 'click', 'on-input': 'input', 'on-change': 'change', 'on-keydown': 'keydown', 'on-ended': 'ended', 'on-pointerdown': 'pointerdown', 'on-pointermove': 'pointermove', 'on-pointerup': 'pointerup', 'on-pointerleave': 'pointerleave', 'on-drop': 'drop', 'on-dragover': 'dragover', 'on-dragleave': 'dragleave' };

  function compileElement(el) {
    let tag = el.localName;
    if (tag === 'sf-select') tag = 'select';
    const isSvg = el.namespaceURI === SVG_NS;
    const attrs = [], events = [], props = [];
    for (const { name, value } of el.attributes) {
      let getter = compileValue(value);
      if (name === 'style' && value.includes('{{') && !/^\s*\{\{[\s\S]+?\}\}\s*$/.test(value)) {
        const parts = value.split(EXPR);
        getter = vals => { let out = ''; for (let i = 0; i < parts.length; i++) { if (!(i & 1)) { out += parts[i]; continue; } const x = resolve(vals, parts[i]) ?? '';
          if (!stylePartOk(x)) { console.warn('Skillforge blocked an unsafe style value', String(x).slice(0, 80)); return null; } out += x; } return out; };
        getter.bound = true; }
      if (EVENT_ATTR[name]) events.push([EVENT_ATTR[name], getter]);
      else if (name === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) props.push(['value', getter]);
      else attrs.push([name, getter]);
    }
    const flatKids = tag === 'select' || isSvg;
    const kids = compileChildren(el.localName === 'template' ? el.content : el, flatKids);
    return vals => {
      const v = { tag, ns: isSvg ? SVG_NS : null, attrs: {}, props: {}, on: {}, kids: [] };
      for (const [k, g] of attrs) { let x = g(vals); if (x == null || (x === false && !/^aria-/.test(k))) continue; x = String(x);   // v35: aria-checked="false" is kept
      if (g.bound) { const x0 = x; if (URL_ATTRS[k]) x = safeUrl(x); else if (k === 'style') x = safeStyle(x); else if (k === 'srcdoc' || /^on/i.test(k)) x = null;
        if (x == null) { console.warn('Skillforge blocked an unsafe ' + k + ' value on <' + tag + '>', x0.slice(0, 80)); continue; } }
      v.attrs[k] = x; }
      for (const [k, g] of props) { const x = g(vals); v.props[k] = x == null ? '' : x; }
      for (const [k, g] of events) { const fn = g(vals); if (typeof fn === 'function') v.on[k] = fn; }
      for (const b of kids) v.kids.push(...b(vals));
      return [v];
    };
  }

  /* ---------- patch: vnodes -> live DOM ---------- */

  function create(v) {
    if (typeof v === 'string') return document.createTextNode(v);
    const el = v.ns ? document.createElementNS(v.ns, v.tag) : document.createElement(v.tag);
    update(el, v, true);
    return el;
  }

  function dispatch(e) {
    const el0 = e.currentTarget;
    if (e.type === 'change' && el0 && el0.type === 'file' && el0.files && [...el0.files].some(f => /\.(csv|txt)$/i.test(f.name) && f.size > CSV_MAX)) {
      el0.value = ''; window.dispatchEvent(new CustomEvent('sf-toast', { detail: 'That file is larger than 10 MB. Split it into smaller files.' })); return; }
    if (e.type === 'input' || e.type === 'change') guardInput(e.currentTarget, e.type);
    const fn = e.currentTarget.__sf && e.currentTarget.__sf.on[e.type];
    if (fn) fn(e);
  }

  function update(el, v, fresh) {
    const prev = el.__sf || { attrs: {}, on: {} };
    for (const k in prev.attrs) if (!(k in v.attrs)) el.removeAttribute(k);
    for (const k in v.attrs) if (fresh || prev.attrs[k] !== v.attrs[k]) el.setAttribute(k, v.attrs[k]);
    for (const type in v.on) if (!prev.on[type]) el.addEventListener(type, dispatch);
    for (const type in prev.on) if (!v.on[type]) el.removeEventListener(type, dispatch);
    el.__sf = { attrs: v.attrs, on: v.on };
    patchChildren(el, v.kids);
    // Controlled values are applied after children so <select> options exist.
    if ('value' in v.props) {
      const next = String(v.props.value);
      if (el.value !== next) el.value = next;
    }
  }

  function sameKind(node, v) {
    if (typeof v === 'string') return node.nodeType === Node.TEXT_NODE;
    return node.nodeType === Node.ELEMENT_NODE && node.localName === v.tag && (node.namespaceURI === SVG_NS) === (v.ns === SVG_NS);
  }

  function patchChildren(parent, kids) {
    const nodes = parent.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const v = kids[i];
      const node = nodes[i];
      if (!node) { parent.appendChild(create(v)); continue; }
      if (!sameKind(node, v)) { parent.replaceChild(create(v), node); continue; }
      if (typeof v === 'string') { if (node.nodeValue !== v) node.nodeValue = v; }
      else update(node, v, false);
    }
    while (nodes.length > kids.length) parent.removeChild(parent.lastChild);
  }

  /* ---------- Store: state container used by the app ---------- */

  class Store {
    constructor() { this.state = {}; this.__pending = []; this.__scheduled = false; }
    setState(update, cb) {
      const patch = typeof update === 'function' ? update(this.state) : update;
      if (patch) this.state = Object.assign({}, this.state, patch);
      if (cb) this.__pending.push(cb);
      this.__schedule();
    }
    __schedule() {
      if (this.__scheduled || !this.__render) return;
      this.__scheduled = true;
      queueMicrotask(() => {
        this.__scheduled = false;
        this.__render();
        const cbs = this.__pending.splice(0);
        cbs.forEach(fn => fn());
      });
    }
    renderVals() { return {}; }
  }

  function mount(app, templateEl, root) {
    const builders = compileChildren(templateEl.content, false);
    app.__render = () => {
      const vals = app.renderVals();
      const tree = builders.flatMap(b => b(vals));
      patchChildren(root, tree);
    };
    app.__render();
    if (typeof app.componentDidMount === 'function') app.componentDidMount();
    return app;
  }

  window.Skillforge = { Store, mount, safeUrl, safeStyle, stylePartOk };
})();
