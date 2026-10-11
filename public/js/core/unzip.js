/* Skillforge LMS — minimal ZIP reader for SCORM packages (browser and Node 18+; uses DecompressionStream).
 * Unzip.read(arrayBuffer) -> [{ name, data: Uint8Array }]   (stored and deflated entries; no encryption, no ZIP64)
 * Unzip.scormLaunch(files) -> { launch, version, title } from imsmanifest.xml, or throws if it isn't a SCORM package.
 */
(() => {
  const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true);
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function read(buf) {
    const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(v, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a ZIP file');
    const n = u16(v, e + 10), cdOff = u32(v, e + 16), out = [], dec = new TextDecoder();
    let p = cdOff;
    for (let k = 0; k < n; k++) {
      if (u32(v, p) !== 0x02014b50) throw new Error('Damaged ZIP (central directory)');
      const method = u16(v, p + 10), csize = u32(v, p + 20), flags = u16(v, p + 8), nlen = u16(v, p + 28), xlen = u16(v, p + 30), clen = u16(v, p + 32), loff = u32(v, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (flags & 1) throw new Error('Encrypted ZIP files are not supported');
      if (name.endsWith('/')) continue;
      if (name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error('Unsafe path in ZIP: ' + name);
      const lnlen = u16(v, loff + 26), lxlen = u16(v, loff + 28), start = loff + 30 + lnlen + lxlen, raw = b.subarray(start, start + csize);
      if (method === 0) out.push({ name, data: raw.slice() });
      else if (method === 8) out.push({ name, data: await inflate(raw) });
      else throw new Error('Unsupported compression in ' + name);
    }
    return out;
  }
  function scormLaunch(files) {
    const m = files.find(f => f.name.toLowerCase() === 'imsmanifest.xml');
    if (!m) throw new Error('This ZIP has no imsmanifest.xml at its top level, so it is not a SCORM package');
    const xml = new TextDecoder().decode(m.data);
    const version = /adlcp_v1p3|2004/i.test(xml) ? '2004' : '1.2';
    const title = ((xml.match(/<title>\s*([^<]+?)\s*<\/title>/i) || [])[1] || '').trim();
    const org = (xml.match(/<organizations[^>]*default="([^"]+)"/i) || [])[1];
    // first item's identifierref in the default organisation -> resource href
    let ref = null;
    const orgBlock = org ? (xml.match(new RegExp('<organization[^>]*identifier="' + org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[\\s\\S]*?</organization>', 'i')) || [])[0] : xml;
    const it = (orgBlock || xml).match(/<item[^>]*identifierref="([^"]+)"/i); if (it) ref = it[1];
    const resRe = /<resource\b([^>]*)>/gi; let r, href = null;
    while ((r = resRe.exec(xml))) { const a = r[1], id = (a.match(/identifier="([^"]+)"/i) || [])[1], h = (a.match(/href="([^"]+)"/i) || [])[1];
      if (h && (!ref || id === ref)) { href = h; if (id === ref) break; } }
    if (!href) throw new Error('imsmanifest.xml has no launch file');
    if (!files.some(f => f.name === href.split('?')[0])) throw new Error('The launch file ' + href + ' is missing from the ZIP');
    return { launch: href, version, title };
  }
  const MIME = { html:'text/html', htm:'text/html', js:'text/javascript', css:'text/css', json:'application/json', xml:'application/xml', xsd:'application/xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml', webp:'image/webp',
    mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', pdf:'application/pdf', txt:'text/plain', swf:'application/x-shockwave-flash' };
  const mimeOf = name => MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  globalThis.Unzip = { read, scormLaunch, mimeOf };
})();
