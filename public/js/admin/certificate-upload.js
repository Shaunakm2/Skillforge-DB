/* Skillforge LMS — Settings › Certificates: upload the certificate design as PNG, JPG, SVG or PDF (v41.22; any shape since v41.23).
 *
 * The admin picks (or drops) a file; it is turned into ONE picture and used as the background of the existing editor, where the fields
 * (name, course, date, score, certificate ID) are dragged into place as before. The picture keeps the SHAPE of the design: A4 landscape,
 * A4 portrait, US Letter, square or your own size (between 1:4 and 4:1). Its longest side is 3508 px (A4 at 300 DPI); designs within 1.5 %
 * of A4 become exactly A4 (3508 x 2480 or 2480 x 3508). Nothing is cropped and nothing gets white margins.
 *   PNG / JPG   drawn onto the page.
 *   SVG         drawn as a picture. Nothing inside it runs, scripts and outside links are removed first, and the SVG itself is never
 *               stored (storage refuses SVG on purpose): only the PNG made from it is saved.
 *   PDF         page 1 is drawn with the PDF reader in vendor/pdfjs/ (loaded only when a PDF is chosen).
 * Loaded after js/admin/certificates.js and js/admin/certificate-pdf.js. */
(function () {
  const MAX_FILE = 25 * 1024 * 1024, MAX_SVG = 5 * 1024 * 1024, MAX_PIXELS = 120e6, MAX_PNG = 6 * 1024 * 1024;
  const PDF_DIR = 'vendor/pdfjs/', SVGNS = 'http://www.w3.org/2000/svg';
  const abs = p => new URL(p, document.baseURI).href;

  const kindOf = f => { const n = String((f && f.name) || '').toLowerCase(), t = String((f && f.type) || '').toLowerCase();
    if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (t === 'image/svg+xml' || /\.svg$/.test(n)) return 'svg';
    if (t === 'image/png' || /\.png$/.test(n)) return 'png';
    if (t === 'image/jpeg' || /\.jpe?g$/.test(n)) return 'jpg';
    return ''; };
  const fail = code => { const e = new Error(code); e.code = code; return e; };
  const loadImg = (url, code) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(fail(code)); i.src = url; });

  /* A page of the design's own shape (longest side 3508 px). */
  function blankPage(S) {
    const cv = document.createElement('canvas'); cv.width = S.W; cv.height = S.H;
    const g = cv.getContext('2d'); g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, S.W, S.H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    return { cv, g };
  }
  const shapeOk = (w, h) => w > 0 && h > 0 && w / h <= 4 && w / h >= 0.25;

  async function fromRaster(f) {
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImg(url, 'decode'), w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw fail('decode');
      if (w * h > MAX_PIXELS) throw fail('big');
      if (!shapeOk(w, h)) throw fail('shape');
      const S = Certificate.size(w, h), { cv, g } = blankPage(S); g.drawImage(img, 0, 0, S.W, S.H);
      return { cv, S, w, h, low: Math.max(w, h) < 1600 };
    } finally { URL.revokeObjectURL(url); }
  }

  const num = v => { const s = String(v == null ? '' : v).trim(), n = parseFloat(s); return isFinite(n) && !/%$/.test(s) ? n : 0; };
  async function fromSvg(f) {
    if (f.size > MAX_SVG) throw fail('big');
    let text = await f.text();
    if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(text)) text = text.replace(/<svg\b/i, '<svg xmlns="' + SVGNS + '"');
    // check it is well formed with the browser's own image decoder first: parsing a broken SVG as a document makes the browser build an error page
    { const pre = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); try { await loadImg(pre, 'svg'); } finally { URL.revokeObjectURL(pre); } }
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (!root || root.localName !== 'svg' || root.namespaceURI !== SVGNS || doc.getElementsByTagName('parsererror').length) throw fail('svg');
    // an SVG is only ever drawn as a picture (nothing in it runs); scripts, embedded pages and outside links are removed anyway
    root.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(n => n.remove());
    root.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { const nm = a.name.toLowerCase();
      if (nm.indexOf('on') === 0) n.removeAttribute(a.name);
      else if ((nm === 'href' || nm === 'xlink:href') && !/^(#|data:image\/(png|jpe?g|gif|webp);)/i.test(a.value.trim())) n.removeAttribute(a.name); }));
    let w = num(root.getAttribute('width')), h = num(root.getAttribute('height'));
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number), hasVb = vb.length === 4 && vb.every(isFinite) && vb[2] > 0 && vb[3] > 0;
    if (!(w > 0 && h > 0)) { if (!hasVb) throw fail('svgsize'); w = vb[2]; h = vb[3]; }
    if (!hasVb) root.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    if (!shapeOk(w, h)) throw fail('shape');
    const S = Certificate.size(w, h);
    root.setAttribute('width', S.W); root.setAttribute('height', S.H);            // drawn at its final size, so lines and text stay sharp
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }));
    try { const img = await loadImg(url, 'svg'), { cv, g } = blankPage(S); g.drawImage(img, 0, 0, S.W, S.H); return { cv, S, w, h, low: false }; }
    finally { URL.revokeObjectURL(url); }
  }

  let lib = null;
  const pdfLib = () => lib || (lib = import(abs(PDF_DIR + 'pdf.min.mjs')).then(m => { m.GlobalWorkerOptions.workerSrc = abs(PDF_DIR + 'pdf.worker.min.mjs'); return m; }).catch(() => { lib = null; throw fail('pdflib'); }));
  async function fromPdf(f) {
    const m = await pdfLib(), data = new Uint8Array(await f.arrayBuffer());
    let pdf;
    try { pdf = await m.getDocument({ data, isEvalSupported: false, disableFontFace: true, standardFontDataUrl: abs(PDF_DIR + 'standard_fonts/') }).promise; }
    catch (e) { throw fail(e && e.name === 'PasswordException' ? 'pdfpass' : 'pdf'); }
    try {
      const pg = await pdf.getPage(1), v0 = pg.getViewport({ scale: 1 });
      if (!shapeOk(v0.width, v0.height)) throw fail('shape');
      const S = Certificate.size(v0.width, v0.height), vp = pg.getViewport({ scale: S.W / v0.width });
      const tmp = document.createElement('canvas'); tmp.width = Math.max(1, Math.round(vp.width)); tmp.height = Math.max(1, Math.round(vp.height));
      await pg.render({ canvasContext: tmp.getContext('2d'), viewport: vp, background: '#FFFFFF' }).promise;
      const { cv, g } = blankPage(S); g.drawImage(tmp, 0, 0, S.W, S.H);
      return { cv, S, w: Math.round(v0.width), h: Math.round(v0.height), low: false, pages: pdf.numPages };
    } catch (e) { throw e && e.code ? e : fail('pdf'); }
    finally { try { pdf.destroy(); } catch (e) { /* ignore */ } }
  }

  /* PNG for crisp artwork; JPEG only if the PNG would be very large (photographic backgrounds). */
  const encode = (cv, base) => new Promise((res, rej) => cv.toBlob(png => {
    if (!png) return rej(fail('encode'));
    if (png.size <= MAX_PNG) return res(new File([png], base + '.png', { type: 'image/png' }));
    cv.toBlob(jpg => jpg ? res(new File([jpg], base + '.jpg', { type: 'image/jpeg' })) : rej(fail('encode')), 'image/jpeg', 0.92);
  }, 'image/png'));

  const MSG = {
    big: 'That file is too large to use. Keep it under 25 MB.',
    decode: 'That image could not be read. Is it a real PNG or JPG?',
    svg: 'That SVG could not be read. Export it again from your design tool.',
    shape: 'That design is too long and narrow. Use a shape between 1:4 and 4:1.',
    svgsize: 'That SVG has no size. Export it with a width and height (or a viewBox).',
    pdf: 'That PDF could not be read.',
    pdfpass: 'That PDF is password protected. Remove the password and try again.',
    pdflib: 'The PDF reader did not load. Check that vendor/pdfjs is deployed with the app.',
    encode: 'The design could not be converted. Try a smaller file.',
  };

  const base = SkillforgeApp.prototype.amCerts;
  SkillforgeApp.prototype.amCerts = function (c) {
    const v = base.call(this, c);
    if (!v.isCerts) return v;
    const app = this, st = c.s;
    const setBg = (src, name, w, h) => app.setState(s2 => { const d = Certificate.withDefaults(s2.certDraft || s2.certTpl); d.bg = { src, name, w, h }; return { certDraft: d }; });
    const take = async f => {
      if (!f || app.state.certBusy) return;
      const kind = kindOf(f);
      if (!kind) return app.toastMsg('Upload a PNG, JPG, SVG or PDF file');
      if (f.size > MAX_FILE) return app.toastMsg(MSG.big);
      app.setState({ certBusy: true });
      try {
        const r = kind === 'pdf' ? await fromPdf(f) : kind === 'svg' ? await fromSvg(f) : await fromRaster(f);
        const out = await encode(r.cv, String(f.name).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'certificate');
        setBg(Files.local(out, 'certificates'), f.name, r.S.W, r.S.H);
        const notes = [Certificate.shapeLabel(r.S.W, r.S.H)];
        if (r.pages > 1) notes.push('page 1 of ' + r.pages + ' used');
        if (r.low) notes.push('only ' + r.w + ' × ' + r.h + ' px, so it may look blurry when printed (use at least 2000 px on the long side)');
        app.toastMsg('Design uploaded (' + notes.join('; ') + '). Place the fields, then save.');
      } catch (e) { app.toastMsg(MSG[e && e.code] || 'That file could not be read. Try another file.'); }
      finally { app.setState({ certBusy: false }); }
    };
    v.ctPick = e => { const f = e.target.files && e.target.files[0]; try { e.target.value = ''; } catch (x) { /* ignore */ } take(f); };
    v.ctDragOverFn = e => { e.preventDefault(); if (!st.certOver) app.setState({ certOver: true }); };
    v.ctDragLeave = () => { if (st.certOver) app.setState({ certOver: false }); };
    v.ctDrop = e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; app.setState({ certOver: false }); take(f); };
    v.ctDragOver = !!st.certOver; v.ctBusy = !!st.certBusy; v.ctBusyMsg = 'Reading your design…';
    return v;
  };
})();
