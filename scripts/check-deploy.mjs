// Post-deploy check:  SB_URL=https://<ref>.supabase.co SB_ANON_KEY=... APP_URL=https://lms.example.com CONTENT_URL=https://content.example.com node scripts/check-deploy.mjs
// Reads only public endpoints (no secrets). Prints PASS / FAIL / WARN per line; exit code 1 on any FAIL.
const { SB_URL, SB_ANON_KEY, APP_URL, CONTENT_URL } = process.env;
if (!SB_URL || !SB_ANON_KEY) { console.error('Set SB_URL and SB_ANON_KEY (and, to check the sites, APP_URL and CONTENT_URL)'); process.exit(2); }
let bad = 0; const out = (k, name, extra = '') => { if (k === 'FAIL') bad++; console.log(k.padEnd(5), name, extra); };
const get = (u, init) => fetch(u, init).then(async r => ({ r, t: await r.text() })).catch(e => ({ r: { status: 0, headers: new Headers() }, t: String(e) }));
// 1 sign-ups off
{ const { r, t } = await get(SB_URL + '/auth/v1/settings', { headers: { apikey: SB_ANON_KEY } }); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  out(r.status === 200 && j.disable_signup === true ? 'PASS' : 'FAIL', 'self sign-up is disabled (Authentication > Sign In / Providers > Email)', r.status === 200 ? '' : 'HTTP ' + r.status); }
// 2 the database sees the visitor's real IP (login throttle depends on it)
{ const { r, t } = await get(SB_URL + '/rest/v1/rpc/sf_client_ip', { method: 'POST', headers: { apikey: SB_ANON_KEY, 'content-type': 'application/json' }, body: '{}' }); const seen = t.replace(/"/g, '').trim();
  const mine = (await get('https://api.ipify.org')).t.trim();
  if (r.status !== 200) out('FAIL', 'sf_client_ip() is callable (run the migration)', 'HTTP ' + r.status);
  else if (!seen) out('FAIL', 'the database receives no client IP (CF-Connecting-IP): the per-IP login limits are OFF and per-person limits become global. Put the project behind Cloudflare or see SETUP-SUPABASE.md');
  else out(seen === mine ? 'PASS' : 'WARN', 'database sees client IP ' + seen, seen === mine ? '' : '(your public IP is ' + mine + '; fine if you are behind a VPN or proxy)'); }
// 3 content function is up and refuses a bad token, no login needed
{ const { r } = await get(SB_URL + '/functions/v1/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'x.y', file: ['index.html'] }) });
  out(r.status === 403 ? 'PASS' : 'FAIL', 'content function deployed with --no-verify-jwt and refusing bad tokens', 'HTTP ' + r.status + (r.status === 401 ? ' (deploy it with --no-verify-jwt)' : '')); }
// 4 headers of the two sites
const need = (h, name, re) => re.test(h.get(name) || '');
if (APP_URL) { const { r } = await get(APP_URL); const csp = r.headers.get('content-security-policy') || '';
  out(csp && !/\*\.supabase\.co/.test(csp) && !/frame-src[^;]*\bhttps:(\s|;|$)/.test(csp) && /frame-ancestors 'self'/.test(csp) ? 'PASS' : 'FAIL', 'app: Content-Security-Policy names only your own origins', csp ? '' : 'no header'); }
if (CONTENT_URL) { const { r, t } = await get(CONTENT_URL + '/c/bad/x.html');
  out(r.status === 403 ? 'PASS' : 'FAIL', 'content site refuses a bad token', 'HTTP ' + r.status);
  out(need(r.headers, 'x-content-type-options', /nosniff/) ? 'PASS' : 'FAIL', 'content site sends X-Content-Type-Options: nosniff'); }
console.log('\nNot checkable from outside - confirm in the Supabase dashboard (or run `supabase config push`): Auth minimum password length 10, password requirements "lower, upper, digits", JWT expiry <= 1800 s.');
console.log('And on the content site (Cloudflare Pages) there must be NO SUPABASE_SERVICE_ROLE_KEY and NO CONTENT_SIGNING_KEY variable.');
process.exit(bad ? 1 : 0);
