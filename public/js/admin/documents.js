/* Skillforge LMS — Documents library: SOPs, policies, handbooks, forms.
 *
 *  Everyone      Documents (menu): the documents published for their role, search, categories, required reading,
 *                open / download, "I have read and understood" on required documents.
 *  Managers      Settings › Communication › Documents library (permission "documents"): upload, edit, new versions
 *                (old ones kept), audience, required reading, effective / review / expiry dates, archive, delete,
 *                acknowledgement tracking with CSV, categories.
 *
 *  Visibility    A non-manager sees a document when it is Published, its audience is All or their user type, and today
 *                is within its effective … expiry dates. The same rule is enforced by the database policy and the
 *                Edge Function (learning-core.js docVisible); this copy only decides what the screen shows.
 *  Records       Viewed / acknowledged are written by the server when connected (action docSeen, server clock).
 *  Files         PDF, Word, PowerPoint, Excel, PNG, JPG up to 25 MB; content must match the type; SVG and archives are
 *                refused. "View only" hides the download button: anyone who can open a file can still save it.
 */
const DOC_TYPES = { pdf:['application/pdf', 'PDF'], docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word'], pptx:['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'PowerPoint'],
  xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'], png:['image/png', 'Image'], jpg:['image/jpeg', 'Image'], jpeg:['image/jpeg', 'Image'] };
const DOC_MAX_MB = 25;
const DOC_AUD = ['All', 'Learner', 'Trainer', 'Admin'];
const DOC_CFG0 = { cats: ['Policies', 'SOPs', 'Handbooks', 'Forms & templates', 'Compliance', 'HR documents', 'Training material', 'General reference'] };
const docFile = (name, path) => ({ name, size: 0, type: 'application/pdf', path: '', src: path });
const DOCS0 = [
  { id:'d1', code:'DOC-001', title:'Information Security Policy', desc:'How we protect company and customer information: passwords, devices, phishing and where to store files.', cat:'Policies', tags:['security', 'IT'],
    status:'Published', audience:['All'], mandatory:true, download:true, effective:'2026-04-01', review:'2027-03-31', expiry:'', owner:'Lena Fischer', cur:2, ackFrom:2, updated:'2026-09-01',
    versions:[{ v:1, file: docFile('information-security-policy-v1.pdf', 'assets/docs/information-security-policy.pdf'), at:'2026-04-01', by:'Lena Fischer', note:'First version' },
      { v:2, file: docFile('information-security-policy.pdf', 'assets/docs/information-security-policy.pdf'), at:'2026-09-01', by:'Lena Fischer', note:'Phishing reporting added; everyone acknowledges again.' }] },
  { id:'d2', code:'DOC-002', title:'Code of Conduct', desc:'The standard we hold ourselves to, conflicts of interest and how to speak up.', cat:'Policies', tags:['ethics', 'HR'],
    status:'Published', audience:['All'], mandatory:true, download:true, effective:'2026-01-01', review:'2026-12-31', expiry:'', owner:'Lena Fischer', cur:1, ackFrom:1, updated:'2026-01-01',
    versions:[{ v:1, file: docFile('code-of-conduct.pdf', 'assets/docs/code-of-conduct.pdf'), at:'2026-01-01', by:'Lena Fischer', note:'First version' }] },
  { id:'d3', code:'DOC-003', title:'Induction Day-1 SOP', desc:'What trainers do before and on day 1 of an induction batch: HRMS check, attendance by 10:30, EWS.', cat:'SOPs', tags:['induction', 'attendance'],
    status:'Published', audience:['Trainer', 'Admin'], mandatory:false, download:true, effective:'2026-06-01', review:'2026-09-30', expiry:'', owner:'Lena Fischer', cur:1, ackFrom:1, updated:'2026-06-01',
    versions:[{ v:1, file: docFile('induction-day1-sop.pdf', 'assets/docs/induction-day1-sop.pdf'), at:'2026-06-01', by:'Lena Fischer', note:'First version' }] },
  { id:'d4', code:'DOC-004', title:'Workplace Safety Handbook', desc:'Fire exits, first aid, reporting incidents and ergonomics.', cat:'Handbooks', tags:['safety'],
    status:'Published', audience:['All'], mandatory:false, download:false, effective:'2026-02-15', review:'2027-02-14', expiry:'', owner:'Lena Fischer', cur:1, ackFrom:1, updated:'2026-02-15',
    versions:[{ v:1, file: docFile('workplace-safety-handbook.pdf', 'assets/media/workplace-safety-handbook.pdf'), at:'2026-02-15', by:'Lena Fischer', note:'First version' }] },
];
/* Sample acknowledgements so the tracking screen has something to show offline (never generated when connected). */
const docAckSeed = users => { const out = {}; users.forEach(u => { if (u.status !== 'Active') return; const h = Progress.hash(u.name + 'docs'), o = {};
  if (h < 0.72) o.d2 = { viewedAt:'2026-02-03T10:00:00Z', viewedV:1, ackAt:'2026-02-03T10:05:00Z', ackV:1 }; else if (h < 0.8) o.d2 = { viewedAt:'2026-02-03T10:00:00Z', viewedV:1 };
  if (h < 0.41) o.d1 = { viewedAt:'2026-09-05T09:00:00Z', viewedV:2, ackAt:'2026-09-05T09:03:00Z', ackV:2 }; else if (h < 0.6) o.d1 = { viewedAt:'2026-04-10T09:00:00Z', viewedV:1, ackAt:'2026-04-10T09:02:00Z', ackV:1 };
  if (Object.keys(o).length) out[u.name] = o; }); return out; };

const Docs = {
  /* Mirror of learning-core.js docVisible (the server and database decide when connected). */
  visible: (d, role, today) => !!d && d.status === 'Published' && Array.isArray(d.audience) && (d.audience.includes('All') || d.audience.includes(role)) && (!d.effective || d.effective <= today) && (!d.expiry || d.expiry >= today),
  cur: d => (d.versions || []).find(v => v.v === d.cur) || (d.versions || [])[d.versions.length - 1] || null,
  /* Acknowledged when the person acknowledged a version at or after ackFrom (a new version can ask everyone again). */
  ackState: (d, a) => { a = a || {}; if (d.mandatory && a.ackV != null && a.ackV >= (d.ackFrom || 1)) return 'ack'; if (a.viewedV === d.cur) return 'viewed'; return 'none'; },
  /* Links: only the ones this app made (signed https links, this tab's blob: links, files shipped with the app). */
  safeUrl: u => typeof u === 'string' && (/^https:\/\//i.test(u) || /^blob:/i.test(u) || (/^assets\/[A-Za-z0-9/_.-]+$/.test(u) && !/(^|\/)\.\.?(\/|$)/.test(u))) ? u : '',
  pendingFor: (s, name, role) => { if (!(s.docs || []).length) return []; const mine = (s.docAck || {})[name] || {};
    return s.docs.filter(d => d.mandatory && Docs.visible(d, role, TODAY_KEY) && Docs.ackState(d, mine[d.id]) !== 'ack'); },
};

SkillforgeApp.prototype.amDocs = function (c) {
  const { s, INK, W, perms } = c, scr = this._scrV;
  if (scr !== 'docs' && scr !== 'docAdmin') return { isDocs:false, isDocAdmin:false };
  const me = c.role.name, meU = s.users.find(u => u.name === me) || {}, myRole = meU.role || (c.role.admin ? 'Admin' : c.role.trainer ? 'Trainer' : 'Learner');
  const canManage = perms.has('documents'), DOCS = s.docs || [], CFG = s.docCfg || DOC_CFG0, cats = CFG.cats || [], mine = (s.docAck || {})[me] || {};
  const fmtD = k => k ? Fmt.medium(k) : '—', fmtT = t => t ? Fmt.dt(t) : '';
  const verOf = d => Docs.cur(d) || { v: d.cur, file: null };
  const kind = f => { const ext = String((f && f.name) || '').split('.').pop().toLowerCase(); return (DOC_TYPES[ext] || [null, 'File'])[1]; };
  const sizeOf = f => f && f.size ? (f.size >= 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB') : '';
  /* Viewed / acknowledged: server when connected, this tab otherwise. */
  const record = (d, ack) => {
    if (Backend.on) return Backend.call('docSeen', { docId: d.id, ack }).catch(e => { this.toastMsg(e.message); throw e; });
    this.setState(st => { const all = { ...(st.docAck || {}) }, p = { ...(all[me] || {}) }, e = { ...(p[d.id] || {}) }, now = new Date().toISOString();
      if (ack) { e.ackAt = now; e.ackV = d.cur; } else { e.viewedAt = e.viewedAt || now; e.lastViewAt = now; e.viewedV = d.cur; }
      p[d.id] = e; all[me] = p; return { docAck: all }; });
    return Promise.resolve();
  };
  const open = d => () => { const v = verOf(d), url = Docs.safeUrl(v.file && v.file.src);
    if (!url) return this.toastMsg(v.file && v.file.path ? 'The file link is not ready yet. Try again in a moment.' : 'This document has no file.');
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    // v35: only count the document as opened when the tab actually opened (a blocked pop-up is not a view)
    if (!w && !/^blob:/.test(url)) return this.toastMsg('Your browser blocked the new tab. Allow pop-ups for this site, then select Open again.');
    record(d, false).catch(() => {}); };
  // v35: the fallback file name takes its extension from the real file type (it was always .pdf)
  const DOC_MIME_EXT = { 'application/pdf':'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx', 'application/msword':'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx', 'application/vnd.ms-excel':'xls', 'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
    'application/vnd.ms-powerpoint':'ppt', 'text/plain':'txt', 'text/csv':'csv', 'image/png':'png', 'image/jpeg':'jpg', 'image/gif':'gif', 'image/webp':'webp', 'video/mp4':'mp4', 'audio/mpeg':'mp3' };
  const download = d => () => { const v = verOf(d), url = Docs.safeUrl(v.file && v.file.src); if (!url || !d.download) return;
    fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(b => { const u2 = URL.createObjectURL(b), a = document.createElement('a'); a.href = u2; a.download = (v.file.name || d.code + '.' + (DOC_MIME_EXT[(b.type || '').split(';')[0].trim().toLowerCase()] || 'bin')).replace(/[^A-Za-z0-9._ -]+/g, '-'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u2), 2000); })
      .catch(() => window.open(url, '_blank', 'noopener,noreferrer')); record(d, false).catch(() => {}); };
  const acknowledge = d => () => { if (Docs.ackState(d, mine[d.id]) === 'none' || mine[d.id].viewedV !== d.cur) return this.toastMsg('Open the document first, then acknowledge it.');
    record(d, true).then(() => this.toastMsg('Thank you. Your acknowledgement of “' + d.title + '” is recorded.')).catch(() => {}); };
  const reviewFlag = d => d.status === 'Archived' ? '' : d.expiry && d.expiry < TODAY_KEY ? 'Expired' : d.review && d.review < TODAY_KEY ? 'Review overdue' : d.expiry && d.expiry <= Progress.plus(TODAY_KEY, 30) ? 'Expires soon' : d.review && d.review <= Progress.plus(TODAY_KEY, 30) ? 'Review due soon' : '';
  const ST = { Published:['#DCFCE7', '#166534'], Draft:['#EAF1F6', '#526B7A'], Archived:['#E5ECF7', '#2F4A7A'] };
  const audLabel = d => (d.audience || []).includes('All') ? 'Everyone' : (d.audience || []).join(', ');

  // ======================================================== library (everyone) ========================================================
  if (scr === 'docs') {
    const F = s.docF || { q:'', cat:'All', show:'All' }, q = (F.q || '').trim().toLowerCase();
    const vis = DOCS.filter(d => Docs.visible(d, myRole, TODAY_KEY));   // managers see drafts and archived ones in Settings › Documents library
    const pend = vis.filter(d => d.mandatory && Docs.ackState(d, mine[d.id]) !== 'ack');
    const list = vis.filter(d => (F.cat === 'All' || d.cat === F.cat) && (F.show === 'All' || (F.show === 'Required' && d.mandatory) || (F.show === 'Pending' && pend.includes(d)))
      && (!q || (d.title + ' ' + d.code + ' ' + (d.desc || '') + ' ' + (d.tags || []).join(' ') + ' ' + d.cat).toLowerCase().includes(q)))
      .sort((a, b) => (pend.includes(b) - pend.includes(a)) || a.title.localeCompare(b.title));
    const setF = patch => this.setState(st => ({ docF: { ...(st.docF || { q:'', cat:'All', show:'All' }), ...patch } }));
    return { isDocs:true, isDocAdmin:false, docsQ: F.q || '', setDocsQ: e => setF({ q: e.target.value }),
      docsCats: ['All'].concat(cats.filter(x => vis.some(d => d.cat === x))).map(x => ({ ...UI.chip(F.cat, x, x === 'All' ? 'All categories' : x, () => setF({ cat: x })), n: x === 'All' ? vis.length : vis.filter(d => d.cat === x).length })),
      docsShow: [['All', 'All documents'], ['Required', 'Required reading'], ['Pending', 'To acknowledge (' + pend.length + ')']].map(([k, l]) => UI.chip(F.show, k, l, () => setF({ show: k }))),
      docsHasPending: pend.length > 0, docsPendingLine: pend.length === 1 ? '1 required document is waiting for your acknowledgement.' : pend.length + ' required documents are waiting for your acknowledgement.',
      docsShowPending: () => setF({ show:'Pending', cat:'All', q:'' }),
      docsCount: list.length + (list.length === 1 ? ' document' : ' documents'), docsEmpty: !list.length, docsManage: canManage, docsGoManage: () => this.go('docAdmin', { adminView:true }),
      docsRows: list.map(d => { const v = verOf(d), a = mine[d.id], st = Docs.ackState(d, a), hasFile = !!Docs.safeUrl(v.file && v.file.src);
        return { title: d.title, code: d.code, cat: d.cat, desc: d.desc || '', ver: 'v' + d.cur, eff: 'Effective ' + fmtD(d.effective), kind: kind(v.file) + (sizeOf(v.file) ? ' · ' + sizeOf(v.file) : ''),
          req: !!d.mandatory, tags: (d.tags || []).join(' · '),
          stT: st === 'ack' ? 'Acknowledged ' + fmtT(a.ackAt) : d.mandatory ? (st === 'viewed' ? 'Opened — please acknowledge' : 'Not opened yet') : (a && a.viewedAt ? 'Opened ' + fmtT(a.lastViewAt || a.viewedAt) : ''),
          stBg: st === 'ack' ? '#DCFCE7' : d.mandatory ? '#FEF3C7' : '#EAF1F6', stFg: st === 'ack' ? '#166534' : d.mandatory ? '#92400E' : '#526B7A', hasSt: st === 'ack' || d.mandatory || !!(a && a.viewedAt),
          canOpen: hasFile, open: open(d), canDl: hasFile && !!d.download, dl: download(d), viewOnly: hasFile && !d.download,
          canAck: d.mandatory && st !== 'ack', ackReady: st === 'viewed', ack: acknowledge(d) }; }) };
  }

  // ======================================================== management (permission "documents") ========================================================
  if (!canManage) return { isDocs:false, isDocAdmin:false };
  const tab = s.docTab || 'library', E = s.docEd;
  const setDocs = fn => this.setState(st => ({ docs: fn((st.docs || []).slice()) }));
  const nextCode = () => { const n = Math.max(0, ...DOCS.map(d => +String(d.code).replace(/\D/g, '') || 0)) + 1; return 'DOC-' + String(n).padStart(3, '0'); };
  const MF = s.docMF || { q:'', st:'All' }, mq = (MF.q || '').trim().toLowerCase();
  const libRows = DOCS.filter(d => (MF.st === 'All' || d.status === MF.st || (MF.st === 'Attention' && reviewFlag(d))) && (!mq || (d.title + ' ' + d.code + ' ' + d.cat + ' ' + (d.tags || []).join(' ')).toLowerCase().includes(mq)))
    .sort((a, b) => a.code.localeCompare(b.code)).map(d => { const v = verOf(d), fl = reviewFlag(d);
      return { code: d.code, title: d.title, cat: d.cat, aud: audLabel(d), ver: 'v' + d.cur + ' · ' + (d.versions || []).length + (d.versions.length === 1 ? ' version' : ' versions'), file: (v.file && v.file.name) || 'No file',
        st: d.status, stBg: ST[d.status][0], stFg: ST[d.status][1], req: !!d.mandatory, dl: d.download ? 'Download allowed' : 'View only', dates: 'Effective ' + fmtD(d.effective) + ' · review ' + fmtD(d.review) + (d.expiry ? ' · expires ' + fmtD(d.expiry) : ''),
        flag: fl, hasFlag: !!fl, open: open(d),
        edit: () => this.setState({ docEd: { ...JSON.parse(JSON.stringify(d)), mode:'edit', file:null, note:'', reAck:true, err:'' } }),
        newVer: () => this.setState({ docEd: { ...JSON.parse(JSON.stringify(d)), mode:'version', file:null, note:'', reAck: !!d.mandatory, err:'' } }),
        hist: () => this.setState({ docHist: s.docHist === d.id ? null : d.id }), histOpen: s.docHist === d.id,
        versions: (d.versions || []).slice().reverse().map(x => ({ t: 'v' + x.v + (x.v === d.cur ? ' (current)' : ''), by: fmtD(x.at) + ' · ' + x.by, note: x.note || '', file: (x.file && x.file.name) || '', canOpen: !!Docs.safeUrl(x.file && x.file.src),
          open: () => { const u = Docs.safeUrl(x.file && x.file.src); if (u) window.open(u, '_blank', 'noopener,noreferrer'); } })),
        archive: () => { setDocs(l => l.map(x => x.id === d.id ? { ...x, status: x.status === 'Archived' ? 'Published' : 'Archived', updated: TODAY_KEY } : x)); this.toastMsg(d.status === 'Archived' ? '“' + d.title + '” published again' : '“' + d.title + '” archived: hidden from everyone but managers'); },
        archLabel: d.status === 'Archived' ? 'Restore' : 'Archive',
        del: () => { if (s.docDel !== d.id) return this.setState({ docDel: d.id }); setDocs(l => l.filter(x => x.id !== d.id)); this.setState({ docDel:null }); this.toastMsg('“' + d.title + '” deleted'); },
        delAsk: s.docDel === d.id, delNo: () => this.setState({ docDel:null }) }; });
  // ---- acknowledgements ----
  const reqDocs = DOCS.filter(d => d.mandatory && d.status === 'Published'), ackDoc = reqDocs.find(d => d.id === s.docAckSel) || reqDocs[0];
  let ackV = { docAckHas:false };
  if (tab === 'acks' && ackDoc) {
    const AF = s.docAckF || 'All', aud = s.users.filter(u => u.status === 'Active' && ((ackDoc.audience || []).includes('All') || (ackDoc.audience || []).includes(u.role)));
    const all = aud.map(u => { const a = ((s.docAck || {})[u.name] || {})[ackDoc.id], st = Docs.ackState(ackDoc, a); return { u, a, st }; });
    const n = k => all.filter(x => x.st === k).length, rows = all.filter(x => AF === 'All' || (AF === 'Acknowledged' && x.st === 'ack') || (AF === 'Opened, not acknowledged' && x.st === 'viewed') || (AF === 'Not opened' && x.st === 'none'));
    const PG = Pager(this, s, 'doc-acks', rows, 50), stL = x => x.st === 'ack' ? 'Acknowledged' : x.st === 'viewed' ? 'Opened, not acknowledged' : 'Not opened';
    ackV = { docAckHas:true, docAckOpts: reqDocs.map(d => ({ v: d.id, l: d.code + ' · ' + d.title + ' (v' + d.cur + ')' })), docAckSel: ackDoc.id, setDocAckSel: e => this.setState({ docAckSel: e.target.value }),
      docAckKpis: [['People who must read it', aud.length], ['Acknowledged', n('ack')], ['Opened, not acknowledged', n('viewed')], ['Not opened', n('none')]].map(([l, v], i) => ({ l, v: v.toLocaleString('en-US'), sub: i && aud.length ? Math.round(v / aud.length * 100) + '%' : 'Active people in the audience', c: ['#16324F', '#007A4D', '#0066A1', '#D64545'][i] })),
      docAckNote: (ackDoc.ackFrom || 1) > 1 ? 'Acknowledgements of versions before v' + ackDoc.ackFrom + ' no longer count: everyone was asked to acknowledge again.' : '',
      docAckF: ['All', 'Acknowledged', 'Opened, not acknowledged', 'Not opened'].map(k => UI.chip(AF, k, k, () => this.setState({ docAckF: k, pages: { ...s.pages, 'doc-acks': 1 } }))),
      docAckRows: PG.rows.map(x => ({ name: x.u.name, emp: x.u.empId || '', div: x.u.division || x.u.dept || '', st: stL(x), when: x.st === 'ack' ? fmtT(x.a.ackAt) + ' (v' + x.a.ackV + ')' : x.st === 'viewed' ? 'Opened ' + fmtT(x.a.lastViewAt || x.a.viewedAt) : '',
        bg: x.st === 'ack' ? '#DCFCE7' : x.st === 'viewed' ? '#FEF3C7' : '#FDECEC', fg: x.st === 'ack' ? '#166534' : x.st === 'viewed' ? '#92400E' : '#A63232' })), docAckPager: PG.pager, docAckEmpty: !rows.length,
      docAckCsv: () => { csvDownload('acknowledgements-' + ackDoc.code + '-' + TODAY_KEY + '.csv', [['Document', 'Version', 'Person', 'Employee ID', 'Division', 'Status', 'Acknowledged at', 'Acknowledged version', 'Last opened']]
        .concat(rows.map(x => [ackDoc.code + ' · ' + ackDoc.title, 'v' + ackDoc.cur, x.u.name, x.u.empId || '', x.u.division || '', stL(x), (x.a && x.a.ackAt) || '', (x.a && x.a.ackV) || '', (x.a && (x.a.lastViewAt || x.a.viewedAt)) || ''])));
        this.toastMsg(rows.length.toLocaleString('en-US') + ' rows exported'); } };
  }
  // ---- categories ----
  const catRows = cats.map((x, i) => { const n = DOCS.filter(d => d.cat === x).length; return { name: x, n: n + (n === 1 ? ' document' : ' documents'),
    up: () => this.setState(st => { const l = [...(st.docCfg || DOC_CFG0).cats]; if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; return { docCfg: { ...(st.docCfg || DOC_CFG0), cats: l } }; }),
    del: () => { if (n) return this.toastMsg('“' + x + '” has ' + n + ' document' + (n === 1 ? '' : 's') + '. Move them to another category first.'); this.setState(st => ({ docCfg: { ...(st.docCfg || DOC_CFG0), cats: (st.docCfg || DOC_CFG0).cats.filter(y => y !== x) } })); } }; });
  // ---- editor (new / edit / new version) ----
  let edV = { docEdOpen:false };
  if (E) {
    const set = k => e => { const x = e.target.value; this.setState(st => ({ docEd: { ...st.docEd, [k]: x, err:'' } })); };
    const tog = k => () => this.setState(st => ({ docEd: { ...st.docEd, [k]: !st.docEd[k], err:'' } }));
    const isVer = E.mode === 'version', isNew = E.mode === 'new';
    edV = { docEdOpen:true, dE: E, dETitle: isNew ? 'Upload a document' : isVer ? 'New version of ' + E.code : 'Edit ' + E.code, dEIsVer: isVer, dENotVer: !isVer, dEErr: !!E.err, dENeedsFile: isNew || isVer,
      dEBusy: !!E.busy, dESaveLabel: E.busy ? 'Uploading…' : 'Save',
      dEFileLine: E.file ? E.file.name + ' · ' + sizeOf(E.file) + (E.file.checking ? ' · checking…' : '') : isNew || isVer ? 'No file chosen yet' : 'Current file: ' + ((verOf(E).file || {}).name || 'none') + ' (upload a new version to replace it)',
      setDETitle: set('title'), setDEDesc: set('desc'), setDETags: set('tagsTxt'), setDECat: set('cat'), setDEEff: set('effective'), setDERev: set('review'), setDEExp: set('expiry'), setDENote: set('note'),
      dECatOpts: cats.map(x => ({ v: x, l: x })), dETagsVal: E.tagsTxt != null ? E.tagsTxt : (E.tags || []).join(', '),
      dEAud: DOC_AUD.map(k => { const on = (E.audience || []).includes(k); return { label: k === 'All' ? 'Everyone' : k + 's', bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2',
        pick: () => this.setState(st => { const a = st.docEd.audience || []; let nx = k === 'All' ? ['All'] : (on ? a.filter(x => x !== k) : a.filter(x => x !== 'All').concat(k)); return { docEd: { ...st.docEd, audience: nx, err:'' } }; }) }; }),
      dEStatus: ['Draft', 'Published'].map(k => UI.chip(E.status === 'Archived' ? 'Published' : E.status, k, k, () => this.setState(st => ({ docEd: { ...st.docEd, status: k } })))),
      dEReq: UI.toggle(!!E.mandatory, tog('mandatory')), dEDl: UI.toggle(!!E.download, tog('download')), dEReAck: UI.toggle(!!E.reAck, tog('reAck')), dEShowReAck: isVer && !!E.mandatory,
      dEPick: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase(), T = DOC_TYPES[ext], bad = m => this.setState(st => ({ docEd: { ...st.docEd, file: null, err: m } }));
        if (!T) return bad('Upload a PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), PNG or JPG file.');
        if (f.size > DOC_MAX_MB * 1048576) return bad('That file is ' + (f.size / 1048576).toFixed(1) + ' MB. The limit is ' + DOC_MAX_MB + ' MB.');
        if (f.type && f.type !== T[0]) return bad('The file type (' + f.type + ') does not match its .' + ext + ' name.');
        const typed = f.type ? f : new File([f], f.name, { type: T[0] });
        this.setState(st => ({ docEd: { ...st.docEd, file: { name: f.name, size: f.size, type: T[0], checking: true }, err:'' } }));
        Backend._sniff(typed).then(ok => { if (!ok) return bad('The content of “' + f.name + '” does not match a real ' + T[1] + ' file, so it was not accepted.');
          this._docBlob = typed; this.setState(st => ({ docEd: { ...st.docEd, file: { name: f.name, size: f.size, type: T[0] }, err:'' } })); }).catch(() => bad('The file could not be read.')); },
      dECancel: () => { this._docBlob = null; this.setState({ docEd:null }); },
      dESave: () => { const err = m => this.setState({ docEd: { ...E, err: m } }), title = String(E.title || '').trim();
        if (title.length < 3 || title.length > 120) return err('Give the document a title (3–120 characters).');
        if (DOCS.some(d => d.id !== E.id && d.title.trim().toLowerCase() === title.toLowerCase())) return err('Another document is already called “' + title + '”.');
        if (!cats.includes(E.cat)) return err('Pick a category.');
        if (!(E.audience || []).length) return err('Choose who can see it.');
        const tags = String(E.tagsTxt != null ? E.tagsTxt : (E.tags || []).join(',')).split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).map(x => x.slice(0, 30));
        const dd = ['effective', 'review', 'expiry'].map(k => E[k] || ''); if (!dd[0]) return err('Set the effective date.');
        if (dd[1] && dd[1] < dd[0]) return err('The review date is before the effective date.'); if (dd[2] && dd[2] < dd[0]) return err('The expiry date is before the effective date.');
        if ((isNew || isVer) && !(E.file && this._docBlob)) return err(E.file && E.file.checking ? 'The file is still being checked.' : 'Choose the file to upload.');
        if (isVer && String(E.note || '').trim().length < 3) return err('Say what changed in this version (shown in the version history).');
        const base = { title, desc: String(E.desc || '').trim().slice(0, 500), cat: E.cat, tags, audience: E.audience.includes('All') ? ['All'] : E.audience.filter(x => DOC_AUD.includes(x)),
          mandatory: !!E.mandatory, download: !!E.download, effective: dd[0], review: dd[1], expiry: dd[2], status: E.status === 'Archived' ? 'Archived' : E.status === 'Draft' ? 'Draft' : 'Published', updated: TODAY_KEY };
        if (E.busy) return;
        const finish = fileRec => {
        if (isNew) { const id = 'd' + Date.now().toString(36), rec = { id, code: nextCode(), ...base, owner: me, cur: 1, ackFrom: 1, versions: [{ v: 1, file: fileRec, at: TODAY_KEY, by: me, note: String(E.note || '').trim().slice(0, 200) || 'First version' }] };
          setDocs(l => l.concat([rec])); this.toastMsg('“' + title + '” ' + (base.status === 'Published' ? 'published' : 'saved as a draft')); }
        else setDocs(l => l.map(d => { if (d.id !== E.id) return d; if (!isVer) return { ...d, ...base };
          const v = Math.max(...d.versions.map(x => x.v)) + 1; return { ...d, ...base, cur: v, ackFrom: E.mandatory && E.reAck ? v : (d.ackFrom || 1), versions: d.versions.concat([{ v, file: fileRec, at: TODAY_KEY, by: me, note: String(E.note).trim().slice(0, 200) }]) }; }));
        if (!isNew) this.toastMsg(isVer ? 'Version saved. Older versions stay in the history.' : 'Changes saved');
        this.setState({ docEd:null }); };
        if (!(isNew || isVer)) return finish(null);
        // The record is saved only once its file is stored (connected: uploaded to Storage; a failed upload saves nothing).
        const blob = this._docBlob; this.setState({ docEd: { ...E, busy: true, err:'' } });
        Files.put(blob, 'docs').then(r => { this._docBlob = null; finish({ name: blob.name, size: blob.size, type: blob.type, path: r.path, src: r.src }); })
          .catch(e2 => this.setState(st => ({ docEd: st.docEd && { ...st.docEd, busy: false, err: e2.message + '. Nothing was saved; try again.' } }))); } };
  }
  return { isDocs:false, isDocAdmin:true,
    docTabs: [['library', 'Library'], ['acks', 'Acknowledgements'], ['cats', 'Categories']].map(([k, l]) => ({ on: tab === k, label: l, pick: () => this.setState({ docTab: k }) })),
    docIsLib: tab === 'library', docIsAcks: tab === 'acks', docIsCats: tab === 'cats', docNoReq: tab === 'acks' && !ackDoc,
    docMQ: MF.q || '', setDocMQ: e => { const x = e.target.value; this.setState(st => ({ docMF: { ...(st.docMF || { q:'', st:'All' }), q: x } })); },
    docMSt: ['All', 'Published', 'Draft', 'Archived', 'Attention'].map(k => ({ ...UI.chip(MF.st, k, k === 'Attention' ? 'Needs attention (' + DOCS.filter(reviewFlag).length + ')' : k, () => this.setState(st => ({ docMF: { ...(st.docMF || { q:'', st:'All' }), st: k } }))) })),
    docLib: libRows, docLibEmpty: !libRows.length, docLibCount: DOCS.length + (DOCS.length === 1 ? ' document' : ' documents') + ' · ' + DOCS.filter(d => d.status === 'Published').length + ' published',
    docNew: () => { this._docBlob = null; this.setState({ docEd: { mode:'new', title:'', desc:'', cat: cats[0] || '', tags:[], audience:['All'], mandatory:false, download:true, effective: TODAY_KEY, review: Progress.plus(TODAY_KEY, 365), expiry:'', status:'Published', file:null, note:'', err:'' } }); },
    docCats: catRows, docCatNew: s.docCatNew || '', setDocCatNew: e => this.setState({ docCatNew: e.target.value }),
    docCatAdd: () => { const x = String(s.docCatNew || '').trim(); if (x.length < 2 || x.length > 40) return this.toastMsg('Category names are 2–40 characters'); if (cats.some(y => y.toLowerCase() === x.toLowerCase())) return this.toastMsg('That category already exists');
      this.setState(st => ({ docCatNew:'', docCfg: { ...(st.docCfg || DOC_CFG0), cats: (st.docCfg || DOC_CFG0).cats.concat(x) } })); },
    docGoLibrary: () => this.go('docs', { adminView:false }),
    ...ackV, ...edV };
};
