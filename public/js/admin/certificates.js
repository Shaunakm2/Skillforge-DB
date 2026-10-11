/* Skillforge LMS — Settings › Certificates.
 * Upload a PNG or JPG background (or keep the default), then place the fields that fill in automatically:
 * learner name, course name, completion date and score %. Drag a field on the preview or use the controls.
 * Saving creates a new version; learners download certificates using the current version. */
const Certificate = {
  values: (name, course, date, score) => ({ name, course, date: date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '', score: score == null || score === '' ? '' : 'Score ' + score + '%' }),
  /* Draw the certificate onto a canvas and download it as PNG. */
  download(tpl, vals, file) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const draw = ok => { const W = ok ? img.naturalWidth || 1600 : 1600, H = ok ? img.naturalHeight || 1131 : 1131, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); g.fillStyle = '#FBFDFF'; g.fillRect(0, 0, W, H); if (ok) g.drawImage(img, 0, 0, W, H);
      CERT_FIELDS.forEach(([k]) => { const f = tpl.fields[k]; if (!f || !f.on || !vals[k]) return; g.fillStyle = f.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (f.bold ? '700 ' : '500 ') + Math.round(f.size / 100 * W) + 'px Poppins, Arial, sans-serif'; g.fillText(vals[k], f.x / 100 * W, f.y / 100 * H, W * 0.9); });   // long names and titles shrink to fit instead of running off the page
      if (vals.id) { g.fillStyle = '#526B7A'; g.textAlign = 'right'; g.font = '500 ' + Math.round(W * 0.011) + 'px Poppins, Arial, sans-serif'; g.fillText('Certificate ID ' + vals.id, W * 0.97, H * 0.97); }
      cv.toBlob(b => { const url = URL.createObjectURL(b), a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }, 'image/png'); };
    img.onload = () => draw(true); img.onerror = () => draw(false); img.src = tpl.bg ? tpl.bg.src : '';
    if (!tpl.bg) draw(false);
  },
};
SkillforgeApp.prototype.amCerts = function (c) {
  const { s, role, INK, W } = c;
  if (this._scrV !== 'certs') return { isCerts:false };
  const T = s.certDraft || s.certTpl, dirty = !!s.certDraft;
  const setT = fn => this.setState(st => { const d = JSON.parse(JSON.stringify(st.certDraft || st.certTpl)); fn(d); return { certDraft: d }; });
  const sel = s.certSel, F = T.fields[sel];
  const sample = Object.fromEntries(CERT_FIELDS.map(([k, , v]) => [k, v]));
  const fmtT = t => new Date(t).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  const clamp = v => Math.max(2, Math.min(98, Math.round(v * 10) / 10));
  const at = e => { const r = e.currentTarget.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width * 100), y: clamp((e.clientY - r.top) / r.height * 100) }; };
  return {
    isCerts:true, ctDirty: dirty, ctClean: !dirty, ctVersion: 'Version ' + T.version + (dirty ? ' · unsaved changes' : ' · in use'),
    ctBg: T.bg ? T.bg.src : '', ctHasBg: !!T.bg, ctBgName: T.bg ? T.bg.name : 'No background (plain)',
    ctPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/^image\/(png|jpe?g)$/.test(f.type)) { e.target.value = ''; return this.toastMsg('Upload a PNG or JPG image'); }
      const src = Files.local(f, 'certificates'); setT(d => { d.bg = { src, name: f.name }; }); this.toastMsg('Background uploaded. Place the fields, then save.'); },
    ctDefaultBg: () => setT(d => { d.bg = { src:'assets/certificate-default.svg', name:'certificate-default.svg' }; }),
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
