// Saves the Skillforge database records as JSON files (used by .github/workflows/backup.yml).
// node scripts/backup-db.mjs <outDir>   with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
// Tables: sf_doc (all LMS data), sf_member (logins ↔ people, roles), sf_audit (audit trail). 1,000 rows per request.
import fs from 'node:fs/promises'; import path from 'node:path';
const URL_ = String(process.env.SUPABASE_URL || '').replace(/\/$/, ''), KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, OUT = process.argv[2] || 'db';
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, authorization: 'Bearer ' + KEY, 'accept-profile': 'public' };
await fs.mkdir(OUT, { recursive: true });
for (const [table, order] of [['sf_doc', 'org_id,coll,key'], ['sf_member', 'org_id,user_id'], ['sf_audit', 'id']]) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=*&order=${order}`, { headers: { ...H, range: `${from}-${from + 999}`, 'range-unit': 'items' } });
    if (!r.ok && r.status !== 416) throw new Error(table + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const part = r.status === 416 ? [] : await r.json(); rows.push(...part); if (part.length < 1000) break;
  }
  await fs.writeFile(path.join(OUT, table + '.json'), JSON.stringify(rows));
  console.log(table, rows.length, 'rows');
}
