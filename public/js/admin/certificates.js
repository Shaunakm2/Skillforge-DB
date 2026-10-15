/* Skillforge LMS — Settings › Certificates.
 * Upload your certificate design (PNG, JPG, SVG or PDF; see certificate-upload.js), then place the fields that fill in automatically:
 * learner name, course name, completion date, score % and certificate ID. Drag a field on the preview or use the controls.
 * Saving creates a new version; learners download certificates using the current version.
 * v41.23: a certificate can be ANY shape. It keeps the shape of the uploaded design (A4 landscape, A4 portrait, US Letter, square…); the
 * longest side is always 3508 px (A4 at 300 DPI) and the PDF page has the same shape. */
const Certificate = {
  values: (name, course, date, score) => ({ name, course, date: date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '', score: score == null || score === '' ? '' : 'Score ' + score + '%' }),
  LONG_SIDE: 3508,
  /* Pixel size of a certificate whose artwork is nw x nh: the shape is kept and the longest side is 3508 px. Shapes within 1.5 % of A4 snap to exact A4. */
  size(nw, nh) {
    if (!(nw > 0 && nh > 0)) return { W: 3508, H: 2480 };
    const r = nw / nh, A4 = 297 / 210;
    if (Math.abs(r / A4 - 1) <= 0.015) return { W: 3508, H: 2480 };
    if (Math.abs(r * A4 - 1) <= 0.015) return { W: 2480, H: 3508 };
    const k = Certificate.LONG_SIDE / Math.max(nw, nh);
    return { W: Math.max(1, Math.round(nw * k)), H: Math.max(1, Math.round(nh * k)) };
  },
  /* PDF page size in points for a W x H px certificate (300 DPI; exact A4 for A4). */
  pageSize(W, H) {
    const r = W / H, A4 = 297 / 210;
    if (Math.abs(r / A4 - 1) <= 0.015) return [841.89, 595.28];
    if (Math.abs(r * A4 - 1) <= 0.015) return [595.28, 841.89];
    return [Math.round(W * 24) / 100, Math.round(H * 24) / 100];
  },
  shapeLabel(w, h) { const S = Certificate.size(w, h), r = S.W / S.H, A4 = 297 / 210;
    return Math.abs(r / A4 - 1) <= 0.015 ? 'A4 landscape' : Math.abs(r * A4 - 1) <= 0.015 ? 'A4 portrait' : S.W + ' × ' + S.H + ' px'; },
  /* A template saved before the ID became a field has no "id" entry: it gets the default place. */
  withDefaults(t) {
    const d = JSON.parse(JSON.stringify(t || CERT_TPL0)); d.fields = d.fields || {};
    CERT_FIELDS.forEach(([k]) => { if (!d.fields[k]) d.fields[k] = { ...CERT_TPL0.fields[k] }; });
    return d;
  },
  idText: v => /^certificate id/i.test(String(v)) ? String(v) : 'Certificate ID ' + v,
  /* Draw the background and the filled-in fields on a canvas of the design's own shape; cb(canvas, { W, H }). */
  render(tpl, vals, cb) {
    const T = Certificate.withDefaults(tpl), img = new Image(); img.crossOrigin = 'anonymous';
    const draw = ok => {
      const S = ok ? Certificate.size(img.naturalWidth, img.naturalHeight) : Certificate.size(0, 0), W = S.W, H = S.H, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); g.fillStyle = '#FBFDFF'; g.fillRect(0, 0, W, H);
      if (ok) { try { g.drawImage(img, 0, 0, W, H); } catch (e) { /* unreadable background: keep the plain page */ } }
      CERT_FIELDS.forEach(([k]) => { const f = T.fields[k], text = k === 'id' ? (vals.id ? Certificate.idText(vals.id) : '') : vals[k]; if (!f || !f.on || !text) return;
        g.fillStyle = f.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (f.bold ? '700 ' : '500 ') + Math.round(f.size / 100 * W) + 'px Poppins, Arial, sans-serif';
        g.fillText(text, f.x / 100 * W, f.y / 100 * H, W * 0.9); });   // long names and titles shrink to fit instead of running off the page
      cb(cv, S);
    };
    const go = () => { img.onload = () => draw(true); img.onerror = () => draw(false); if (T.bg && T.bg.src) img.src = T.bg.src; else draw(false); };
    // the certificate font must be ready before drawing, but never wait long
    if (document.fonts && document.fonts.load) Promise.race([Promise.all([document.fonts.load('700 40px Poppins'), document.fonts.load('500 40px Poppins')]), new Promise(r => setTimeout(r, 1500))]).then(go, go); else go();
  },
  /* PNG download (certificate-pdf.js replaces this with the PDF download). */
  download(tpl, vals, file) {
    Certificate.render(tpl, vals, cv => cv.toBlob(b => { const url = URL.createObjectURL(b), a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }, 'image/png'));
  },
};
SkillforgeApp.prototype.amCerts = function (c) {
  const { s, role, INK, W } = c;
  if (this._scrV !== 'certs') return { isCerts:false };
  const T = Certificate.withDefaults(s.certDraft || s.certTpl), dirty = !!s.certDraft;
  const setT = fn => this.setState(st => { const d = Certificate.withDefaults(st.certDraft || st.certTpl); fn(d); return { certDraft: d }; });
  const sel = s.certSel, F = T.fields[sel];
  const sample = Object.fromEntries(CERT_FIELDS.map(([k, , v]) => [k, v]));
  const fmtT = t => new Date(t).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  const clamp = v => Math.max(2, Math.min(98, Math.round(v * 10) / 10));
  const at = e => { const r = e.currentTarget.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width * 100), y: clamp((e.clientY - r.top) / r.height * 100) }; };
  // The preview has the shape of the design. Designs saved by this version know their size; for older ones it is read from the picture once.
  const bg = T.bg, src = bg ? bg.src : '', known = bg && bg.w > 0 && bg.h > 0 ? { w: bg.w, h: bg.h } : (s.certDims || {})[src] || null;
  if (src && !known) { const P = Certificate._probe || (Certificate._probe = {}); if (!P[src]) { P[src] = 1; const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0 && im.naturalHeight > 0) this.setState(st => ({ certDims: { ...(st.certDims || {}), [src]: { w: im.naturalWidth, h: im.naturalHeight } } })); }; im.src = src; } }
  const ratio = known ? known.w / known.h : 297 / 210, portrait = ratio < 0.98;
  return {
    isCerts:true, ctDirty: dirty, ctClean: !dirty, ctVersion: 'Version ' + T.version + (dirty ? ' · unsaved changes' : ' · in use'),
    ctBg: src, ctHasBg: !!bg, ctBgName: bg ? bg.name + (known ? ' · ' + Certificate.shapeLabel(known.w, known.h) : '') : 'No background (plain A4 landscape)',
    ctAspect: ratio.toFixed(4), ctWidth: portrait ? 'min(100%, calc(70vh * ' + ratio.toFixed(4) + '))' : '100%',
    ctPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/^image\/(png|jpe?g)$/.test(f.type)) { e.target.value = ''; return this.toastMsg('Upload a PNG or JPG image'); }
      const src2 = Files.local(f, 'certificates'); setT(d => { d.bg = { src: src2, name: f.name }; }); this.toastMsg('Background uploaded. Place the fields, then save.'); },
    ctDefaultBg: () => setT(d => { d.bg = { src:'assets/certificate-default.svg', name:'certificate-default.svg', w:1600, h:1131 }; }),
    ctFields: CERT_FIELDS.map(([k, label, ex]) => { const f = T.fields[k], on = sel === k;
      return { k, label, text: sample[k], show: f.on, x: f.x + '%', y: f.y + '%', size: f.size + 'cqw', color: f.color, weight: f.bold ? 700 : 500, ring: on ? '2px dashed #7C5CFF' : '1px dashed transparent',
        pick: e => { e.stopPropagation(); this.setState({ certSel: k }); }, down: e => { e.stopPropagation(); this.setState({ certSel: k, certDrag: k }); },
        rowBg: on ? '#F4F1FF' : W, rowBd: on ? '#7C5CFF' : '#D7E3EC', choose: () => this.setState({ certSel: k }), ...UI.toggle(f.on, () => setT(d => { d.fields[k].on = !d.fields[k].on; })) }; }),
    ctMove: e => { if (!s.certDrag) return; const p = at(e); setT(d => { d.fields[s.certDrag].x = p.x; d.fields[s.certDrag].y = p.y; }); },
    ctUp: () => { if (s.certDrag) this.setState({ certDrag:null }); },
    ctPlace: e => { if (s.certDrag) return; const p = at(e); setT(d => { d.fields[sel].x = p.x; d.fields[sel].y = p.y; }); },
    ctSel: { label: CERT_FIELDS.find(x => x[0] === sel)[1], ...F },
    setCtSize: e => { const v = parseFloat(e.target.value); if (v >= 0.8 && v <= 12) setT(d => { d.fields[sel].size = v; }); },
    setCtColor: e => { const v = e.target.value; setT(d => { d.fields[sel].color = v; }); },
    setCtX: e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setT(d => { d.fields[sel].x = clamp(v); }); },
    setCtY: e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setT(d => { d.fields[sel].y = clamp(v); }); },
    ctBold: UI.toggle(F.bold, () => setT(d => { d.fields[sel].bold = !d.fields[sel].bold; })),
    ctNudge: [['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]].map(([l, dx, dy]) => ({ l, go: () => setT(d => { d.fields[sel].x = clamp(d.fields[sel].x + dx); d.fields[sel].y = clamp(d.fields[sel].y + dy); }) })),
    ctNote: s.ctNote || '', setCtNote: e => this.setState({ ctNote: e.target.value }),
    ctSave: () => { if (!dirty) return; if (!CERT_FIELDS.some(([k]) => T.fields[k].on)) return this.toastMsg('Show at least the learner name');
      const v = s.certTpl.version + 1, rec = { ...T, version: v, updatedBy: role.name, updatedAt: nowStamp(), history: s.certTpl.history.concat([{ version: v, at: nowStamp(), by: role.name, note: (s.ctNote || '').trim() || 'Updated layout' }]) };
      this.setState({ certTpl: rec, certDraft:null, ctNote:'' }); this.toastMsg('Certificate saved as version ' + v + '. New downloads use it.'); },
    ctDiscard: () => this.setState({ certDraft:null }),
    ctSample: () => { Certificate.download(T, sample, 'certificate-sample.png'); this.toastMsg('Sample certificate downloaded'); },
    ctHistory: s.certTpl.history.slice().reverse().map(h => ({ ...h, when: fmtT(h.at), cur: h.version === s.certTpl.version })),
  };
};
