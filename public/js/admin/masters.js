/* Skillforge LMS — Settings › Master data.
 * One place to maintain everything the old MIS workbook kept on its "Validation" sheet, plus holidays and badges:
 *   Lists        Training segment, type of trainee, training name, division, sub division, division head, location,
 *                brand, WFO/WFH, attrition category / responsibility / reason, education. Add, rename (renames every
 *                record that uses the value), delete (blocked while in use), sort, CSV upload and download.
 *   Holidays     Standard holiday list: add one, or upload a CSV (Date, Holiday). Batch end dates move automatically.
 *   Badges       What learners can earn: icon, name, colour, rule (metric + threshold), on/off.
 *   Training types and trainee statuses live in Batch management; the tabs here link to them.
 */
const MASTER_USE = { segments:['batches', 'segment'], traineeTypes:['batches', 'traineeType'], trainingNames:['batches', 'trainingName'], divisions:['users', 'division'], subDivisions:['users', 'subDivision'],
  divisionHeads:['users', 'divisionHead'], locations:['users', 'site'], brands:['users', 'brand'], workModes:['users', 'wfo'], education:['users', 'education'] };
SkillforgeApp.prototype.amMasters = function (c) {
  const { s, role, INK, W } = c;
  if (this._scrV !== 'masters') return { isMasters:false };
  const tab = s.mdTab || 'lists', key = s.mdList || 'trainingNames', M = s.masters, list = M[key] || [];
  const def = MASTER_DEFS.find(d => d[0] === key);
  const use = MASTER_USE[key], usage = new Map();
  if (use) (use[0] === 'users' ? s.users : s.batches).forEach(r => { const v = r[use[1]]; if (v) usage.set(v, (usage.get(v) || 0) + 1); });
  if (key === 'attritionReasons' || key === 'attritionCats' || key === 'attritionResp') { const f = key === 'attritionReasons' ? 'reason' : key === 'attritionCats' ? 'attType' : 'resp';
    s.batches.forEach(b => Object.values(b.st || {}).forEach(l => l.forEach(e => { if (e[f]) usage.set(e[f], (usage.get(e[f]) || 0) + 1); }))); }
  const setList = (fn, msg) => { this.setState(st => ({ masters: { ...st.masters, [key]: fn(st.masters[key].slice()) } })); if (msg) this.toastMsg(msg); };
  const valid = (v, except) => { v = (v || '').trim().replace(/\s+/g, ' ');
    if (!v) return [null, 'Type a value']; if (v.length > 60) return [null, 'Keep it under 60 characters']; if (/[<>]/.test(v)) return [null, '< and > aren’t allowed'];
    if (list.some(x => x.toLowerCase() === v.toLowerCase() && x !== except)) return [null, '“' + v + '” is already in the list']; return [v, '']; };
  const renameEverywhere = (from, to) => { if (!use) return {};
    if (use[0] === 'users') return { users: s.users.map(u => u[use[1]] === from ? { ...u, [use[1]]: to } : u) };
    return { batches: s.batches.map(b => b[use[1]] === from ? { ...b, [use[1]]: to } : b) }; };
  const q = (s.mdQ || '').trim().toLowerCase(), E = s.mdEdit || {};
  const listVals = {
    mdLists: MASTER_DEFS.map(([k, l]) => ({ k, l, n: (M[k] || []).length, on: k === key, bg: k === key ? '#EDF5FA' : W, bd: k === key ? '#0066A1' : 'transparent', pick: () => this.setState({ mdList: k, mdQ:'', mdEdit:null, mdNew:'' }) })),
    mdDef: { label: def[1], usedBy: def[2], desc: def[3] }, mdQ: s.mdQ || '', setMdQ: e => this.setState({ mdQ: e.target.value }),
    mdItems: list.map((v, i) => ({ v, i, n: usage.get(v) || 0, used: (usage.get(v) || 0) > 0, usedLabel: usage.get(v) ? (usage.get(v)).toLocaleString('en-US') + ' in use' : 'Not used',
      editing: E.i === i, notEditing: E.i !== i, draft: E.i === i ? E.v : v,
      edit: () => this.setState({ mdEdit: { i, v } }), setDraft: e => this.setState({ mdEdit: { i, v: e.target.value } }), cancel: () => this.setState({ mdEdit:null }),
      save: () => { const [nv, err] = valid(E.v, v); if (err) return this.toastMsg(err); if (nv === v) return this.setState({ mdEdit:null });
        this.setState(st => ({ masters: { ...st.masters, [key]: st.masters[key].map(x => x === v ? nv : x) }, mdEdit:null, ...renameEverywhere(v, nv) }));
        this.toastMsg('Renamed to “' + nv + '”' + (usage.get(v) ? ' · ' + usage.get(v) + ' records updated' : '')); },
      up: () => setList(l => { if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; return l; }), isFirst: i === 0,
      del: () => { if (usage.get(v)) return this.toastMsg('“' + v + '” is used by ' + usage.get(v) + ' records. Rename it instead, or change those records first.'); setList(l => l.filter(x => x !== v), '“' + v + '” removed'); } }))
      .filter(x => !q || x.v.toLowerCase().includes(q)),
    mdNew: s.mdNew || '', setMdNew: e => this.setState({ mdNew: e.target.value }),
    mdAdd: () => { const [nv, err] = valid(s.mdNew); if (err) return this.toastMsg(err); setList(l => l.concat([nv]), '“' + nv + '” added'); this.setState({ mdNew:'' }); },
    mdSort: () => setList(l => l.sort((a, b) => a.localeCompare(b)), 'Sorted A–Z'),
    mdDownload: () => { csvDownload('master-' + key + '.csv', [[def[1]]].concat(list.map(v => [v]))); this.toastMsg(def[1] + ' list downloaded'); },
    mdPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; e.target.value = '';
      if (!/\.csv$/i.test(f.name)) return this.toastMsg('Upload a .csv file with one value per row');
      f.text().then(t => { const rows = parseCsv(t).map(r => (r[0] || '').trim()).filter(Boolean); if (rows.length && rows[0].toLowerCase() === def[1].toLowerCase()) rows.shift();
        const add = [], bad = []; const seen = new Set(list.map(x => x.toLowerCase()));
        rows.forEach(v => { const nv = v.replace(/\s+/g, ' '); if (nv.length > 60 || /[<>]/.test(nv)) bad.push(v); else if (!seen.has(nv.toLowerCase())) { seen.add(nv.toLowerCase()); add.push(nv); } });
        setList(l => l.concat(add)); this.toastMsg(add.length + ' added · ' + (rows.length - add.length - bad.length) + ' already there' + (bad.length ? ' · ' + bad.length + ' rejected (too long or < >)' : '')); }); },
  };
  // ---- holidays ----
  const H = s.holidays.slice().sort((a, b) => a.date.localeCompare(b.date));
  const logged = s.batches.map(b => [b, lastLogged(b)]).filter(x => x[1]);
  const blocked = d => logged.filter(([b, l]) => d >= b.start && d <= l).map(([b]) => b.code);
  const applyHolidays = hols => s.batches.map(b => { if (b.closed) return b; const tt = s.ttypes.find(t => t.id === b.type); if (!tt) return b;
    const dts = trainDays(b.start, tt.days.length, holSetFor(hols, b)); return dts.length ? { ...b, end: dts[dts.length - 1] } : b; });
  const hy = s.mdYear || TODAY_KEY.slice(0, 4), years = [...new Set(H.map(h => h.date.slice(0, 4)).concat([TODAY_KEY.slice(0, 4), String(+TODAY_KEY.slice(0, 4) + 1)]))].sort();
  const HN = s.mdHol || { date:'', name:'' };
  const holVals = {
    mdYears: years.map(y => UI.chip(hy, y, y + ' · ' + H.filter(h => h.date.startsWith(y)).length, () => this.setState({ mdYear: y }))),
    mdHols: H.filter(h => h.date.startsWith(hy)).map(h => ({ ...h, label: new Date(h.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'short', year:'numeric' }), past: h.date < TODAY_KEY,
      del: () => { const bl = blocked(h.date); if (bl.length) return this.toastMsg(bl.join(', ') + ' already logged attendance after ' + h.date + '.'); const hols = s.holidays.filter(x => x.id !== h.id); this.setState({ holidays: hols, batches: applyHolidays(hols) }); this.toastMsg(h.name + ' removed'); } })),
    mdHolEmpty: !H.some(h => h.date.startsWith(hy)), mdHol: HN,
    setMdHolDate: e => this.setState({ mdHol: { ...HN, date: e.target.value } }), setMdHolName: e => this.setState({ mdHol: { ...HN, name: e.target.value } }),
    mdHolAdd: () => { const nm = (HN.name || '').trim(); if (!HN.date) return this.toastMsg('Pick a date'); if (!nm || nm.length > 60 || /[<>]/.test(nm)) return this.toastMsg('Give the holiday a name (up to 60 characters)');
      if (isWeekend(HN.date)) return this.toastMsg('That date is already a weekend'); if (s.holidays.some(h => h.date === HN.date)) return this.toastMsg('There is already a holiday on that date');
      const bl = blocked(HN.date); if (bl.length) return this.toastMsg(bl.join(', ') + ' already logged attendance on or after that date');
      const hols = s.holidays.concat([{ id:'h' + Date.now(), date: HN.date, name: nm }]); this.setState({ holidays: hols, batches: applyHolidays(hols), mdHol:{ date:'', name:'' } }); this.toastMsg(nm + ' added'); },
    mdHolTemplate: () => { csvDownload('holiday-list-template.csv', [['Date', 'Holiday'], ['26-01-2027', 'Republic Day'], ['2027-03-04', 'Holi'], ['15-08-2027', 'Independence Day']]); this.toastMsg('Template downloaded'); },
    mdHolPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; e.target.value = '';
      if (!/\.csv$/i.test(f.name)) return this.toastMsg('Upload a .csv file: Date, Holiday');
      f.text().then(t => { const rows = parseCsv(t); if (rows.length && /date/i.test(rows[0][0] || '')) rows.shift();
        const hols = s.holidays.slice(), bad = []; let added = 0;
        rows.forEach((r, i) => { const d = umDate(r[0]), nm = (r[1] || '').trim(), n = i + 2;
          if (!d) return bad.push([n, r[0], nm, 'Date must be DD-MM-YYYY or YYYY-MM-DD']); if (!nm) return bad.push([n, r[0], nm, 'Holiday name is missing']);
          if (nm.length > 60 || /[<>]/.test(nm)) return bad.push([n, r[0], nm, 'Name too long or contains < >']); if (isWeekend(d)) return bad.push([n, r[0], nm, 'Falls on a weekend']);
          if (hols.some(h => h.date === d)) return bad.push([n, r[0], nm, 'Already a holiday on ' + d]); const bl = blocked(d); if (bl.length) return bad.push([n, r[0], nm, bl.join(', ') + ' already logged attendance after this date']);
          hols.push({ id:'h' + Date.now() + i, date: d, name: nm }); added++; });
        this.setState({ holidays: hols, batches: applyHolidays(hols), mdHolBad: bad }); this.toastMsg(added + ' holidays added' + (bad.length ? ' · ' + bad.length + ' rejected' : '')); }); },
    mdHolHasBad: !!(s.mdHolBad && s.mdHolBad.length), mdHolBadN: (s.mdHolBad || []).length,
    mdHolRejects: () => csvDownload('holiday-upload-rejected.csv', [['Row', 'Date', 'Holiday', 'Reason']].concat(s.mdHolBad)),
    mdHolExport: () => csvDownload('holidays-' + hy + '.csv', [['Date', 'Day', 'Holiday']].concat(H.filter(h => h.date.startsWith(hy)).map(h => [h.date, new Date(h.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long' }), h.name]))),
  };
  // ---- badges ----
  const BE = s.bdEdit;
  const setBE = patch => this.setState(st => ({ bdEdit: { ...st.bdEdit, err:'', ...patch } }));
  const earned = b => Badges.earnedCount(s, b);
  const badgeVals = {
    bdRows: s.badges.map(b => ({ ...b, rule: BADGE_METRICS[b.metric] + ' ≥ ' + b.n, earnedBy: earned(b).toLocaleString('en-US') + ' learners earned it', op: b.on ? 1 : .5, ...UI.toggle(b.on, () => this.setState(st => ({ badges: st.badges.map(x => x.id === b.id ? { ...x, on: !x.on } : x) }))),
      edit: () => this.setState({ bdEdit: { ...b, err:'' } }) })),
    bdNew: () => this.setState({ bdEdit: { id:null, glyph:'★', name:'', desc:'', metric:'courses', n:3, color:'#0066A1', on:true, err:'' } }),
    bdOpen: !!BE, bd: BE || {}, bdErr: !!(BE && BE.err),
    bdMetricOpts: Object.keys(BADGE_METRICS).map(k => ({ v:k, l: BADGE_METRICS[k] })), bdColors: ['#0066A1', '#007A4D', '#8C5A9E', '#D64545', '#5B7DB8', '#08AE6E', '#CA8A04', '#DB2777'].map(cc => ({ cc, ring: BE && BE.color === cc ? INK : 'transparent', pick: () => setBE({ color: cc }) })),
    setBdGlyph: e => setBE({ glyph: e.target.value }), setBdName: e => setBE({ name: e.target.value }), setBdDesc: e => setBE({ desc: e.target.value }), setBdMetric: e => setBE({ metric: e.target.value }), setBdN: e => setBE({ n: e.target.value === '' ? '' : parseInt(e.target.value, 10) }),
    bdClose: () => this.setState({ bdEdit:null }),
    bdSave: () => { const nm = (BE.name || '').trim(), g = (BE.glyph || '').trim();
      if (!g || [...g].length > 2) return setBE({ err:'Icon: one or two characters (a letter, number or symbol like ★).' });
      if (!nm || nm.length > 30) return setBE({ err:'Name: 1–30 characters.' }); if (s.badges.some(b => b.id !== BE.id && b.name.toLowerCase() === nm.toLowerCase())) return setBE({ err:'Another badge already has this name.' });
      if ((BE.desc || '').length > 80) return setBE({ err:'Description: up to 80 characters.' }); if (!(BE.n >= 1 && BE.n <= 365)) return setBE({ err:'Threshold must be 1 to 365.' });
      const rec = { ...BE, name: nm, glyph: g, desc: (BE.desc || '').trim() || BADGE_METRICS[BE.metric] + ' ≥ ' + BE.n }; delete rec.err;
      this.setState({ badges: BE.id ? s.badges.map(b => b.id === BE.id ? rec : b) : s.badges.concat([{ ...rec, id:'bd' + Date.now() }]), bdEdit:null }); this.toastMsg('Badge “' + nm + '” saved'); },
    bdDelete: () => { this.setState({ badges: s.badges.filter(b => b.id !== BE.id), bdEdit:null }); this.toastMsg('Badge deleted'); }, bdCanDelete: !!(BE && BE.id),
  };
  // ---- Kirkpatrick feedback question library ----
  const KL = s.kpLib, klv = s.kqLevel || 'L1', KQ = KL[klv];
  const setK = fn => this.setState(st => { const l = JSON.parse(JSON.stringify(st.kpLib)); fn(l[klv], l); return { kpLib: l }; });
  const kqVals = {
    kqLevels: KP_LEVELS.map(([lv, name, q]) => ({ lv, name, q, n: KL[lv].qs.length, ...UI.chip(klv, lv, lv + ' · ' + name, () => this.setState({ kqLevel: lv })) })),
    kqDesc: (KP_LEVELS.find(x => x[0] === klv) || [])[2], kqLv: klv, kqL: KQ,
    kqAud: ['Learner', 'Manager', 'Learner & manager'].map(v => UI.chip(KQ.audience, v, v, () => setK(L => { L.audience = v; }))),
    kqDays: [0, 30, 60, 90].map(v => UI.chip(KQ.days, v, v ? v + ' days after' : 'On completion', () => setK(L => { L.days = v; }))),
    kqOn: UI.toggle(KQ.on, () => setK(L => { L.on = !L.on; })),
    kqQs: KQ.qs.map((q, i) => ({ n: i + 1, t: q.t, kind: q.kind, kindOpts: [{ v:'rating', l:'Rating 1–5' }, { v:'text', l:'Free text' }], bad: !q.t.trim(),
      setT: e => { const v = e.target.value; setK(L => { L.qs[i].t = v; }); }, setKind: e => { const v = e.target.value; setK(L => { L.qs[i].kind = v; }); },
      up: () => setK(L => { if (i > 0) [L.qs[i - 1], L.qs[i]] = [L.qs[i], L.qs[i - 1]]; }), isFirst: i === 0,
      del: () => { if (KQ.qs.length === 1) return this.toastMsg('Keep at least one question'); setK(L => { L.qs.splice(i, 1); }); } })),
    kqAdd: () => { if (KQ.qs.length >= 12) return this.toastMsg('Up to 12 questions per level'); if (KQ.qs.some(q => !q.t.trim())) return this.toastMsg('Fill in the empty question first'); setK(L => { L.qs.push({ t:'', kind:'rating' }); }); },
    kqApply: () => { const blank = Object.keys(KL).find(lv => KL[lv].qs.some(q => !q.t.trim() || q.t.length > 200)); if (blank) return this.toastMsg(blank + ' has an empty or too long question (200 characters max)');
      const n = Object.keys(s.kp).length; this.setState(st => { const kp = {}; Object.keys(st.kp).forEach(cid => { kp[cid] = { ...JSON.parse(JSON.stringify(st.kpLib)), auto: st.kp[cid].auto }; }); return { kp }; });
      this.toastMsg('Standard questions applied to all ' + n + ' courses with feedback set up'); },
    kqCourses: Object.keys(s.kp).length,
  };
  // ---- tile management ----
  const tg = s.tileGroup || 'home', TC = (s.tiles || {})[tg] || { order:[], hide:{}, label:{} };
  const CATALOG = {
    home: ['Assigned courses', 'Not started', 'In progress', 'Overdue', 'Completed'].map(k => ({ key:k, sec:'Home' })),
    settings: tab === 'tiles' && tg === 'settings' ? this.amSettings(c).setAllTiles : [],
    batchcard: ['In training', 'Attrited', 'Handed over', 'Other', 'Throughput', 'Joined', 'Attendance', 'Open EWS'].map(k => ({ key:k, sec:'Batch card' })),
    training: TRAIN_KPIS.map(k => ({ key: k[0], sec:'Training overview' })),
    nav: ROLES[0].nav.map(([id, l]) => ({ key: l, sec: 'Menu item' + (id === 'discussions' || id === 'calendar' ? ' (can also be switched off in App settings)' : '') })),
  };
  const cat = CATALOG[tg] || [], pos = k => { const i = (TC.order || []).indexOf(k); return i < 0 ? 1e6 : i; };
  const ordered = cat.map((x, i) => [x, i]).sort((a, b) => pos(a[0].key) - pos(b[0].key) || a[1] - b[1]).map(x => x[0]);
  const setTC = fn => this.setState(st => { const all = { ...(st.tiles || {}) }, g = JSON.parse(JSON.stringify(all[tg] || { order:[], hide:{}, label:{} })); fn(g); all[tg] = g; return { tiles: all }; });
  const tileVals = {
    mdIsTiles: tab === 'tiles', tgChips: Object.keys(TILE_GROUPS).map(k => UI.chip(tg, k, TILE_GROUPS[k][0], () => this.setState({ tileGroup: k }))), tgDesc: TILE_GROUPS[tg][1],
    tgNote: tg === 'batchcard' ? 'Batch cards show the first five visible figures.' : tg === 'settings' ? 'Order applies within each Settings section.' : '',
    tgRows: ordered.map((x, i) => { const off = !!(TC.hide || {})[x.key], lab = (TC.label || {})[x.key] || '';
      return { key: x.key, sec: x.sec, n: i + 1, lab, ph: x.key, op: off ? .5 : 1, ...UI.toggle(!off, () => setTC(g => { g.hide = g.hide || {}; g.hide[x.key] = !off; })),
        setLab: e => { const v = e.target.value.slice(0, 40); setTC(g => { g.label = g.label || {}; if (v.trim()) g.label[x.key] = v; else delete g.label[x.key]; }); },
        up: () => setTC(g => { const o = ordered.map(y => y.key); if (i > 0) [o[i - 1], o[i]] = [o[i], o[i - 1]]; g.order = o; }), down: () => setTC(g => { const o = ordered.map(y => y.key); if (i < o.length - 1) [o[i + 1], o[i]] = [o[i], o[i + 1]]; g.order = o; }),
        isFirst: i === 0, isLast: i === ordered.length - 1 }; }),
    tgReset: () => { this.setState(st => { const all = { ...(st.tiles || {}) }; delete all[tg]; return { tiles: all }; }); this.toastMsg('Tiles reset to default'); },
  };
  // ---- App settings: feature switches and defaults ----
  const PF = s.platform || PLATFORM0, setPF = fn => this.setState(st => { const p = JSON.parse(JSON.stringify(st.platform || PLATFORM0)); fn(p); return { platform: p }; });
  const DF = s.pfDraft || PF.defaults;
  const appVals = {
    mdIsApp: tab === 'app',
    pfFeats: PLATFORM_FEATS.map(([k, l, d]) => ({ l, d, ...UI.toggle(PF.feat[k] !== false, () => setPF(p => { p.feat[k] = p.feat[k] === false; })) })),
    pfD: DF, setPfPw: e => this.setState({ pfDraft: { ...DF, password: e.target.value } }), setPfDue: e => this.setState({ pfDraft: { ...DF, dueDays: e.target.value } }), setPfEss: e => this.setState({ pfDraft: { ...DF, essDays: e.target.value } }), setPfIdle: e => this.setState({ pfDraft: { ...DF, idleMins: e.target.value } }), pfIdle: DF.idleMins == null ? 30 : DF.idleMins,
    pfDirty: !!s.pfDraft, pfDiscard: () => this.setState({ pfDraft:null }),
    pfSave: () => { const pw = String(DF.password || ''), due = parseInt(DF.dueDays, 10), ess = parseInt(DF.essDays, 10), idle = DF.idleMins == null || DF.idleMins === '' ? 30 : parseInt(DF.idleMins, 10);
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return this.toastMsg('Default password: at least 8 characters with a letter and a number');
      if (!(due >= 1 && due <= 365)) return this.toastMsg('Default due date: 1 to 365 days'); if (!(ess >= 1 && ess <= 365)) return this.toastMsg('Essential-training window: 1 to 365 working days');
      if (!(idle === 0 || (idle >= 5 && idle <= 480))) return this.toastMsg('Sign out after inactivity: 5 to 480 minutes, or 0 for never');
      setPF(p => { p.defaults = { password: pw, dueDays: due, essDays: ess, idleMins: idle }; }); this.setState({ pfDraft:null }); this.toastMsg('App settings saved'); },
    pfWhere: [['Branding', 'Portal name, accent colour, sign-in message', 'branding'], ['Tile management', 'Home, Settings, batch-card, Training KPI tiles and the learner menu', 'masters'], ['MIS lists', 'Every drop-down list behind batches, users and MIS', 'masters'],
      ['Training types & statuses', 'Duration, day plan, pass mark, weights, batch IDs, trainee statuses and groups', 'batches'], ['Holiday list', 'Working days for batches and essential training', 'masters'], ['Badges', 'What learners earn and the rules', 'masters'],
      ['Roles & permissions', 'Who can open which Settings module, default courses per role', 'perms'], ['Categories', 'Course categories, three levels', 'categories'], ['Certificates', 'Template, fields and layout', 'certs'],
      ['Report columns', 'Add, remove and reorder the columns of every report (Columns button)', 'reports'], ['Dashboards', 'Every visual, measure, dimension and filter', 'dashboard'], ['Feedback & surveys', 'Kirkpatrick forms and surveys in LCMS', 'lcms'],
      ['Notifications & automations', 'Reminder and escalation rules', 'automations'], ['Announcements', 'Homepage banners', 'announcements'], ['ZingHR sync', 'Field mapping, rules, schedule', 'zinghr']]
      .map(([t, d, scr]) => ({ t, d, go: () => this.go(scr, { adminView:true, ...(t === 'Tile management' ? { mdTab:'tiles' } : t === 'MIS lists' ? { mdTab:'lists' } : t === 'Holiday list' ? { mdTab:'holidays' } : t === 'Badges' ? { mdTab:'badges' } : t === 'Training types & statuses' ? { bView:'types' } : {}) }) })),
  };
  return {
    ...appVals,
    ...tileVals,
    ...kqVals, mdIsKq: tab === 'kq',
    isMasters:true, mdTabs: [['lists', 'MIS lists'], ['types', 'Training types'], ['statuses', 'Trainee statuses'], ['holidays', 'Holiday list'], ['badges', 'Badges'], ['tiles', 'Tile management'], ['app', 'App settings']].map(([k, l]) => UI.chip(tab, k, l, () => {
      if (k === 'types' || k === 'statuses') return this.go('batches', { adminView:true, bView: k });
      this.setState({ mdTab: k }); })),
    mdIsLists: tab === 'lists', mdIsHols: tab === 'holidays', mdIsBadges: tab === 'badges',
    ...listVals, ...holVals, ...badgeVals,
  };
};
