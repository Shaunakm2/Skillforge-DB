/* Skillforge LMS — certificate download as a PDF (v41.22; any shape since v41.23).
 * Loaded right after js/admin/certificates.js. It replaces only Certificate.download():
 *   - the certificate is drawn by Certificate.render() on a canvas of the design's own shape (longest side 3508 px = A4 at 300 DPI)
 *   - the canvas is saved as one full-page picture inside a PDF built here (no outside library, so the Content-Security-Policy is unchanged)
 *   - the PDF page has the same shape: A4 landscape, A4 portrait or the size of the design (300 DPI)
 *   - the file name ends in .pdf (callers still pass .png names; the extension is swapped)
 * The learner name, course, date, score and certificate ID are printed into the picture, so they are not selectable text. */
(function () {
  const enc = s => new TextEncoder().encode(s);
  const cat = parts => { let n = 0; parts.forEach(p => { n += p.length; }); const out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };
  const ascii = s => String(s || '').replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, ' ').slice(0, 120);

  /* One page, one JPEG picture. w x h = pixels of the picture; the page has the same shape. Returns the PDF as bytes. */
  function pdfFromJpeg(jpeg, w, h, title) {
    const [PW, PH] = Certificate.pageSize(w, h);
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
    Certificate.render(tpl, vals, (cv, S) => cv.toBlob(b => {
      if (!b) return;
      b.arrayBuffer().then(buf => save(new Blob([pdfFromJpeg(new Uint8Array(buf), S.W, S.H, vals.course || 'Certificate')], { type: 'application/pdf' }), name));
    }, 'image/jpeg', 0.92));
  };
})();
