/* Skillforge LMS — Settings › Reports › KPI builder (custom KPIs) and the datasets they are built from.
 * A KPI is a formula over one dataset's fields (js/core/formula.js: parsed, never executed as code). Saved KPIs appear as
 * ★ measures in every dashboard visual of that dataset. Stored with the dashboards (s.dash.kpis), so the same people who
 * may change dashboards may change KPIs (permission "dashboard"; the database enforces it when connected). */
SkillforgeApp.prototype.amKpis = function (c) {
  const { s, INK, W, perms } = c;
  if (this._scrV !== 'kpis') return { isKpis:false };
  const D = s.dash, KPIS = D.kpis || [], ED = s.kpiEd, tab = s.kpiTab || 'kpis', canEdit = perms.has('dashboard');
  const SRC = Object.keys(DB_SRC), SL = D.slicers;
  Dash.useKpis(KPIS);
  const cube = src => src === 'train' ? Dash.train(s, SL) : src === 'hr' ? Dash.hr(s, SL) : Dash.learn(s, SL, SL.course);
  const fmtK = (k, v) => { if (v == null || !Number.isFinite(v)) return '—'; const dp = k.dp != null && k.dp !== '' ? Math.max(0, Math.min(4, +k.dp)) : (k.fmt === 'n' ? 0 : 1);
    return k.fmt === 'pct' ? v.toFixed(dp) + '%' : k.fmt === 'dec' ? v.toFixed(dp) : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); };
  const valOf = (k, row, list) => { const defs = {}; (list || KPIS).filter(x => x.src === k.src).forEach(x => { defs[x.code] = x; });
    try { return Formula.evalKpi(k.code, defs, Dash.fields[k.src], f => Dash.fieldValue(k.src, row, f), (m, n) => Dash.dayValue(k.src, row, m, n)); } catch (e) { return null; } };
  // Where a KPI is used: dashboard visuals, templates and other KPIs' formulas.
  const usedIn = k => { const key = 'k:' + k.id, hit = v => [v.measure, v.measure2].concat(v.axes || [], v.cols || []).includes(key); const where = [];
    D.boards.forEach(b => { const n = b.visuals.filter(hit).length; if (n) where.push(b.name + ' (' + n + ')'); });
    (D.templates || []).forEach(t => { if (t.visuals.some(hit)) where.push('template ' + t.name); });
    DB_TEMPLATES.forEach(t => { if ((t.visuals || []).some(hit)) where.push('built-in template ' + t.name); });
    KPIS.forEach(o => { if (o.id !== k.id && o.src === k.src) { const cc = Formula.compile(o.formula, Dash.fields[o.src], Object.fromEntries(KPIS.filter(x => x.src === o.src).map(x => [x.code, x])), o.code); if (cc.ok && cc.refs.includes(k.code)) where.push('KPI ' + o.name); } });
    return where; };
  const rows = KPIS.map(k => { const C = cube(k.src), v = valOf(k, C.tot), use = usedIn(k), g = k.green !== '' && k.green != null && k.amber !== '' && k.amber != null;
    const lvl = !g || v == null ? null : k.dir === 'down' ? (v <= +k.green ? 0 : v <= +k.amber ? 1 : 2) : (v >= +k.green ? 0 : v >= +k.amber ? 1 : 2);
    // A formula can break later (a KPI it used was deleted or changed): show it instead of a silent —.
    const defsK = Object.fromEntries(KPIS.filter(x => x.src === k.src).map(x => [x.code, x])), chk = Formula.compile(k.formula, Dash.fields[k.src], defsK, k.code);
    return { broken: !chk.ok, brokenT: chk.ok ? '' : 'Formula error: ' + chk.error, name: k.name, code: k.code, src: DB_SRC[k.src], formula: k.formula, now: fmtK(k, v), use: use.length ? use.join(' · ') : 'Not used yet',
      rag: lvl != null, ragT: ['On target', 'Watch', 'Off target'][lvl] || '', ragBg: ['#DCFCE7', '#FEF3C7', '#FDECEC'][lvl] || '', ragFg: ['#166534', '#92400E', '#A63232'][lvl] || '',
      target: g ? (k.dir === 'down' ? 'Green ≤ ' : 'Green ≥ ') + k.green + ' · amber ' + (k.dir === 'down' ? '≤ ' : '≥ ') + k.amber : 'No target',
      edit: () => this.setState({ kpiEd: { ...k, err:'' } }), dup: () => { let code = k.code + '_2', i = 3; while (KPIS.some(x => x.code === code)) code = k.code + '_' + i++; this.setState({ kpiEd: { ...k, id: null, name: k.name + ' (copy)', code, err:'' } }); },
      del: () => { if (use.length) return this.toastMsg('“' + k.name + '” is used in ' + use.join(', ') + '. Remove it there first.'); if (s.kpiDel !== k.id) return this.setState({ kpiDel: k.id });
        this.setState(st => ({ kpiDel:null, dash: { ...st.dash, kpis: (st.dash.kpis || []).filter(x => x.id !== k.id) } })); this.toastMsg('KPI deleted'); },
      delAsk: s.kpiDel === k.id, delNo: () => this.setState({ kpiDel:null }) }; });
  // ---- editor ----
  let ev = { kpiEdOpen:false };
  if (ED) {
    const src = SRC.includes(ED.src) ? ED.src : 'train', fields = Dash.fields[src], others = KPIS.filter(x => x.src === src && x.id !== ED.id);
    const defs = Object.fromEntries(others.map(x => [x.code, x])), code = (ED.code || '').trim();
    const cc = Formula.compile(ED.formula || '', fields, defs, code);
    let usesDay = false; if (cc.ok) { const w = n => { if (n.k === 'day') usesDay = true; [n.a, n.b].concat(n.args || []).forEach(x => x && w(x)); }; w(cc.ast); }
    const check = !String(ED.formula || '').trim() ? '' : !cc.ok ? cc.error + (cc.pos >= 0 ? ' (at character ' + (cc.pos + 1) + ')' : '') : usesDay && src !== 'train' ? 'The attendance functions (ABSENT_DAY…) work with the Training dataset only.' : '';
    let preview = '—', byDim = [];
    if (cc.ok && !check && code && !Formula.codeProblem(code, fields)) { const tmp = { ...ED, code, src }, list = others.concat([tmp]), C = cube(src);
      preview = fmtK(tmp, valOf(tmp, C.tot, list));
      const dk = src === 'train' ? 'training' : src === 'hr' ? 'division' : 'division', map = C.T[dk];
      if (map) byDim = [...map.entries()].map(([k, row]) => ({ k, v: valOf(tmp, row, list) })).sort((a, b) => (b.v == null ? -Infinity : b.v) - (a.v == null ? -Infinity : a.v)).slice(0, 6).map(x => ({ l: x.k, v: fmtK(tmp, x.v) })); }
    const set = k => e => { const x = e.target.value; this.setState(st => ({ kpiEd: { ...st.kpiEd, [k]: x, err:'' } })); };
    const ins = t => () => this.setState(st => { const f = String(st.kpiEd.formula || ''); return { kpiEd: { ...st.kpiEd, formula: (f && !/[\s(,]$/.test(f) ? f + ' ' : f) + t, err:'' } }; });
    ev = { kpiEdOpen:true, kE: ED, kEIsNew: !ED.id, kETitle: ED.id ? 'Edit KPI' : 'New KPI', kECheck: check, kEHasCheck: !!check, kEOk: cc.ok && !check && !!String(ED.formula || '').trim(), kEPreview: preview, kEByDim: byDim, kEHasBy: byDim.length > 0,
      kEByLabel: 'By ' + (src === 'train' ? 'training' : 'division') + ' (top 6)', kEErr: !!ED.err,
      setKEName: e => { const x = e.target.value; this.setState(st => ({ kpiEd: { ...st.kpiEd, name: x, code: st.kpiEd.codeTouched || st.kpiEd.id ? st.kpiEd.code : x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'k_$1').slice(0, 32), err:'' } })); },
      setKECode: e => { const x = e.target.value.toLowerCase(); this.setState(st => ({ kpiEd: { ...st.kpiEd, code: x, codeTouched: true, err:'' } })); },
      setKEFormula: set('formula'), setKEDesc: set('desc'), setKEGreen: set('green'), setKEAmber: set('amber'), setKEDp: set('dp'),
      kESrc: SRC.map(k => UI.chip(src, k, DB_SRC[k], () => this.setState(st => ({ kpiEd: { ...st.kpiEd, src: k, err:'' } })))),
      kEFmt: [['n', 'Number'], ['pct', 'Percent'], ['dec', 'Decimal']].map(([k, l]) => UI.chip(ED.fmt || 'n', k, l, () => this.setState(st => ({ kpiEd: { ...st.kpiEd, fmt: k } })))),
      kEDir: [['up', 'Higher is better'], ['down', 'Lower is better']].map(([k, l]) => UI.chip(ED.dir || 'up', k, l, () => this.setState(st => ({ kpiEd: { ...st.kpiEd, dir: k } })))),
      kEFields: Object.entries(fields).map(([k, l]) => ({ k, l, add: ins(k) })).concat(others.map(x => ({ k: x.code, l: 'KPI · ' + x.name, add: ins(x.code) }))),
      kEFuncs: (src === 'train' ? [['ABSENT_DAY(1)', 'Absent on training day 1 (any day 1–30); no value when nobody was marked that day'], ['PRESENT_DAY(1)', 'Present or late on day 1'], ['LATE_DAY(1)', 'Late on day 1'], ['MARKED_DAY(1)', 'Attendance marked on day 1']] : [])
        .concat([['PCT(a, b)', 'a ÷ b × 100 (no value when b is 0)'], ['DIV(a, b)', 'a ÷ b (no value when b is 0)'], ['NZ(a, 0)', 'a, or 0 when a has no value'], ['ROUND(a, 1)', 'Round to 1 decimal'], ['IF(GT(a, b), x, y)', 'x when a > b, otherwise y'], ['MIN(a, b)', 'Smaller'], ['MAX(a, b)', 'Larger'], ['ABS(a)', 'Without sign']])
        .map(([k, l]) => ({ k, l, add: ins(k) })),
      kECancel: () => this.setState({ kpiEd:null }),
      kESave: () => { if (!canEdit) return; const E = ED, err = m => this.setState({ kpiEd: { ...E, err: m } }), name = String(E.name || '').trim();
        if (name.length < 3 || name.length > 60) return err('Give the KPI a name (3–60 characters).');
        if (KPIS.some(x => x.id !== E.id && x.name.trim().toLowerCase() === name.toLowerCase())) return err('Another KPI is already called “' + name + '”.');
        const cp = Formula.codeProblem(code, fields); if (cp) return err('Code: ' + cp + '.');
        if (KPIS.some(x => x.id !== E.id && x.code === code)) return err('Another KPI already uses the code “' + code + '”.');
        if (!cc.ok || check) return err(check || cc.error);
        const g = String(E.green ?? '').trim(), a = String(E.amber ?? '').trim();
        if ((g === '') !== (a === '')) return err('Fill in both thresholds, or neither.');
        if (g !== '' && (!Number.isFinite(+g) || !Number.isFinite(+a))) return err('Thresholds must be numbers.');
        if (g !== '' && ((E.dir || 'up') === 'up' ? +g < +a : +g > +a)) return err((E.dir || 'up') === 'up' ? 'Higher is better: green must be at least amber.' : 'Lower is better: green must be at most amber.');
        const dp = E.dp === '' || E.dp == null ? '' : Math.max(0, Math.min(4, Math.round(+E.dp) || 0));
        const old = KPIS.find(x => x.id === E.id);
        if (old && (old.src !== src || old.code !== code) && usedIn(old).length) return err('This KPI is in use (' + usedIn(old).join(', ') + '): its dataset and code can’t change. Duplicate it instead.');
        const rec = { id: E.id || 'kp' + Date.now().toString(36), code, name, src, formula: String(E.formula).trim(), fmt: ['n', 'pct', 'dec'].includes(E.fmt) ? E.fmt : 'n', dp, dir: E.dir === 'down' ? 'down' : 'up', green: g, amber: a, desc: String(E.desc || '').trim().slice(0, 200), by: c.role.name, at: TODAY_KEY };
        // loops between KPIs are refused
        const list = KPIS.filter(x => x.id !== rec.id).concat([rec]), dd = Object.fromEntries(list.filter(x => x.src === src).map(x => [x.code, x]));
        try { Formula.evalKpi(code, dd, fields, f => Dash.fieldValue(src, cube(src).tot, f), (m, n) => Dash.dayValue(src, cube(src).tot, m, n)); } catch (e2) { return err(e2.message); }
        this.setState(st => ({ kpiEd:null, dash: { ...st.dash, kpis: E.id ? (st.dash.kpis || []).map(x => x.id === E.id ? rec : x) : (st.dash.kpis || []).concat([rec]) } }));
        this.toastMsg('“' + name + '” saved. It is now a ★ measure in the ' + DB_SRC[src].split(' (')[0] + ' visuals.'); } };
  }
  return { isKpis:true, kpiRows: rows, kpiEmpty: !rows.length, kpiCanEdit: canEdit, kpiCount: rows.length + (rows.length === 1 ? ' KPI' : ' KPIs'),
    kpiTabs: [['kpis', 'Custom KPIs'], ['data', 'Datasets & fields']].map(([k, l]) => ({ on: tab === k, label: l, pick: () => this.setState({ kpiTab: k }) })), kpiIsList: tab === 'kpis', kpiIsData: tab === 'data',
    kpiNew: () => this.setState({ kpiEd: { name:'', code:'', src:'train', formula:'', fmt:'n', dp:'', dir:'up', green:'', amber:'', desc:'', err:'' } }),
    kpiBack: () => this.go('dashboard', { adminView:true }),
    kpiFilterNote: 'Values use the filters currently set on the dashboards' + (Object.entries(SL).some(([k, x]) => x && x !== 'All') ? ' (some filters are on).' : ' (no filters: everything).'),
    kpiDatasets: SRC.map(src => ({ name: DB_SRC[src], fields: Object.entries(Dash.fields[src]).map(([k, l]) => ({ k, l })), dims: Object.values(DB_DIMS[src]).join(' · '),
      days: src === 'train', count: Object.keys(Dash.fields[src]).length + ' fields · ' + Object.keys(DB_DIMS[src]).length + ' dimensions' })),
    ...ev };
};
