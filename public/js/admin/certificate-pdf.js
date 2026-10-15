/* Skillforge LMS — certificate download as an A4 landscape PDF (v41.22).
 * Loaded right after js/admin/certificates.js. It replaces only Certificate.download():
 *   - the certificate is drawn on a fixed 3508 x 2480 px canvas (A4 landscape at 300 DPI), whatever size the background image is
 *   - the canvas is saved as one full-page picture inside a PDF built here (no outside library, so the Content-Security-Policy is unchanged)
 *   - the file name ends in .pdf (callers still pass .png names; the extension is swapped)
 * The learner name, course, date, score and certificate ID are printed into the picture, so they are not selectable text. */
(function () {
  const PW = 841.89, PH = 595.28;                    // A4 landscape in PDF points
  const CW = 3508, CH = Math.round(CW * 1131 / 1600);  // same shape as the 1600 x 1131 template, 300 DPI

  const enc = s => new TextEncoder().encode(s);
  const cat = parts => { let n = 0; parts.forEach(p => { n += p.length; }); const out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };
  const ascii = s => String(s || '').replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, ' ').slice(0, 120);

  /* One page, one JPEG picture. Returns the PDF as bytes. */
  function pdfFromJpeg(jpeg, w, h, title) {
    const objs = [];                                  // each item = array of byte chunks for "N 0 obj ... endobj"
    const add = chunks => { objs.push(chunks); return objs.length; };
    add([enc('<< /Type /Catalog /Pages 2 0 R >>')]);
    add([enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
    add([enc('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>')]);
    const content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
    add([enc('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream')]);
    add([enc('<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n'), jpeg, enc('\nendstream')]);
    add([enc('<< /Title (' + ascii(title) + ') /Producer (Skillforge) >>')]);
    const out = [enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], offs = []; let pos = out[0].length;
    objs.forEach((chunks, i) => {
      offs.push(pos);
      const head = enc((i + 1) + ' 0 obj\n'), tail = enc('\nendobj\n');
      [head].concat(chunks, [tail]).forEach(c => { out.push(c); pos += c.length; });
    });
    let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(o => { xref += String(o).padStart(10, '0') + ' 00000 n \n'; });
    xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + pos + '\n%%EOF\n';
    out.push(enc(xref));
    return cat(out);
  }

  const save = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };

  Certificate.pdfFromJpeg = pdfFromJpeg;   // exposed so tests can check it

  Certificate.download = function (tpl, vals, file) {
    const name = String(file || 'certificate.pdf').replace(/\.(png|jpe?g|pdf)$/i, '') + '.pdf';
    const img = new Image(); img.crossOrigin = 'anonymous';
    const draw = ok => {
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
      const g = cv.getContext('2d'); g.fillStyle = '#FBFDFF'; g.fillRect(0, 0, CW, CH);
      if (ok) { try { g.drawImage(img, 0, 0, CW, CH); } catch (e) { /* unreadable background: keep the plain page */ } }
      CERT_FIELDS.forEach(([k]) => { const f = tpl.fields[k]; if (!f || !f.on || !vals[k]) return;
        g.fillStyle = f.color; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = (f.bold ? '700 ' : '500 ') + Math.round(f.size / 100 * CW) + 'px Poppins, Arial, sans-serif';
        g.fillText(vals[k], f.x / 100 * CW, f.y / 100 * CH, CW * 0.9); });   // long names shrink to fit
      if (vals.id) { g.fillStyle = '#526B7A'; g.textAlign = 'right'; g.font = '500 ' + Math.round(CW * 0.011) + 'px Poppins, Arial, sans-serif'; g.fillText('Certificate ID ' + vals.id, CW * 0.97, CH * 0.97); }
      cv.toBlob(b => {
        if (!b) return;
        b.arrayBuffer().then(buf => save(new Blob([pdfFromJpeg(new Uint8Array(buf), CW, CH, (vals.course || 'Certificate'))], { type: 'application/pdf' }), name));
      }, 'image/jpeg', 0.92);
    };
    const go = () => { img.onload = () => draw(true); img.onerror = () => draw(false); if (tpl.bg && tpl.bg.src) img.src = tpl.bg.src; else draw(false); };
    // make sure the certificate font is ready before drawing, but never wait long
    if (document.fonts && document.fonts.load) Promise.race([Promise.all([document.fonts.load('700 40px Poppins'), document.fonts.load('500 40px Poppins')]), new Promise(r => setTimeout(r, 1500))]).then(go, go); else go();
  };
})();
