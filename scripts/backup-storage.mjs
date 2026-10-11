// Downloads every object of the Skillforge buckets into a folder (used by .github/workflows/backup.yml).
// node scripts/backup-storage.mjs <outDir>   with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import fs from 'node:fs/promises'; import path from 'node:path';
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, OUT = process.argv[2] || 'storage';
const H = { apikey: KEY, authorization: 'Bearer ' + KEY };
async function list(bucket, prefix) {
  const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0 }) });
  if (!r.ok) throw new Error(bucket + ' list ' + r.status); const items = await r.json(), files = [];
  for (const it of items) { const p = prefix ? prefix + '/' + it.name : it.name; if (it.id === null) files.push(...await list(bucket, p)); else files.push(p); }
  return files;
}
let n = 0;
for (const bucket of ['lms-files', 'lms-scorm']) {
  for (const p of await list(bucket, '')) {
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${p.split('/').map(encodeURIComponent).join('/')}`, { headers: H });
    if (!r.ok) { console.error('skip', bucket, p, r.status); continue; }
    const dest = path.join(OUT, bucket, p); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, Buffer.from(await r.arrayBuffer())); n++;
  }
}
console.log('saved', n, 'files to', OUT);
