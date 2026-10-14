/* GET /health — setup check for the SCORM content site (v41.15). Shows NO secrets.
 *   /health                     settings present? does the "content" function answer like it should?
 *   /health?t=<token>&f=a/b.html  runs ONE real file request exactly like the player does and says which step failed
 *                                 (the token is a short-lived launch token from Skillforge's own check; no content is returned)
 * The Skillforge app (APP_ORIGIN) may read the answer (CORS), so Settings › Migration › SCORM setup check can show it. */
const VERSION = 'v41.20';
export async function onRequest({ request, env }) {
  const cors = { 'access-control-allow-origin': String(env.APP_ORIGIN || '').replace(/\/$/, '') || 'null', 'vary': 'Origin' };
  const out = { site: 'Skillforge content site', version: VERSION, ok: true, checks: [] };
  const add = (name, ok, detail) => { out.checks.push({ name, ok, detail }); if (!ok) out.ok = false; };
  let base = null; try { base = new URL(String(env.SUPABASE_URL || '')); } catch (e) {}
  add('SUPABASE_URL is set', !!base, base ? base.origin : 'missing or not a web address');
  if (base) add('SUPABASE_URL has nothing after .supabase.co', base.pathname === '/' && !base.search, base.pathname === '/' ? 'ok' : 'remove "' + base.pathname + '" from the end');
  let app = null; try { app = new URL(String(env.APP_ORIGIN || '')); } catch (e) {}
  add('APP_ORIGIN is set', !!app, app ? app.origin : 'missing: set it to the LMS address');
  if (app) add('APP_ORIGIN has nothing after the address', app.pathname === '/' && !app.search, app.pathname === '/' ? 'ok' : 'remove "' + app.pathname + '"');
  const fnUrl = env.CONTENT_FN_URL || (base ? base.origin + '/functions/v1/content' : '');
  const hdr = { 'content-type': 'application/json', ...(env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY } : {}) };
  const q = new URL(request.url).searchParams, t = q.get('t'), f = (q.get('f') || '').split('/').filter(Boolean);
  if (fnUrl && !t) {
    try { const r = await fetch(fnUrl, { method: 'POST', headers: hdr, body: JSON.stringify({ token: 'health.check', file: ['index.html'] }) });
      const expl = { 403: 'ok: deployed, and checks launch links', 401: 'Verify JWT is ON for "content": turn it off in Supabase › Edge Functions › content', 404: 'the "content" function was not found at this address: deploy it, or fix SUPABASE_URL', 500: 'the function crashed: check CONTENT_SIGNING_KEY in Supabase › Edge Functions › Secrets' };
      add('"content" function answers', r.status === 403, r.status + ' · ' + (expl[r.status] || 'unexpected answer'));
    } catch (e) { add('"content" function answers', false, 'could not reach ' + fnUrl); }
  }
  if (fnUrl && t) {   // one real request, step by step
    let r, a = null, txt = '';
    try { r = await fetch(fnUrl, { method: 'POST', headers: hdr, body: JSON.stringify({ token: t, file: f }) }); txt = await r.text(); try { a = JSON.parse(txt); } catch (e) {} }
    catch (e) { add('1. content function', false, 'could not reach it'); r = null; }
    if (r) {
      const why = { 403: 'the launch link was refused: CONTENT_SIGNING_KEY differs between the "learning" and "content" functions, or the launch session ended',
        404: 'the file is not in storage at the folder the module points to (re-upload the package, then put the NEW module in the course)', 401: 'Verify JWT is ON for "content": turn it off' };
      add('1. content function signs the file', r.status === 200, r.status + (r.status === 200 ? ' · ok' : ' · ' + (why[r.status] || ((a && a.error) || txt).slice(0, 160))));
      if (r.status === 200) {
        let u = null; try { u = new URL(a.url); } catch (e) {}
        add('2. signed address is for this project', !!u && !!base && u.pathname.startsWith('/storage/v1/object/sign/'), u ? u.host + u.pathname.slice(0, 60) + '…' : 'no address returned');
        if (u && base) { const s = await fetch(base.origin + u.pathname + u.search); add('3. storage hands over the file', s.ok, s.status + (s.ok ? ' · ok, ' + (s.headers.get('content-length') || '?') + ' bytes' : ' · storage refused it'));
          if (!s.ok && u.host !== base.host) add('   hint', false, 'the function signed it for ' + u.host + ' but this site uses ' + base.host); }
      }
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors } });
}
