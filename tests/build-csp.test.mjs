/* v34: the build writes a Content-Security-Policy that names only this deployment's own origins. */
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function build(env) { const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sfbuild-')); const r = spawnSync('node', ['scripts/build.mjs'], { cwd: ROOT, env: { ...process.env, SF_ALLOW_NO_VENDOR: '1', SF_OUT: out, SF_SUPABASE_URL: '', SF_CONTENT_ORIGIN: '', SF_ORG_ID: 'acme', ...env }, encoding: 'utf8' });
  const headers = fs.existsSync(out + '/_headers') ? fs.readFileSync(out + '/_headers', 'utf8') : '', html = fs.existsSync(out + '/index.html') ? fs.readFileSync(out + '/index.html', 'utf8') : '';
  const csp = (headers.match(/Content-Security-Policy: (.*)/) || [])[1] || '', meta = (html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  fs.rmSync(out, { recursive: true, force: true }); return { status: r.status, err: r.stderr, csp, meta }; }
const dir = (csp, name) => (csp.split('; ').find(d => d.startsWith(name + ' ')) || '');

test('connected build: only the project and the content site, no wildcards, no "any https" frames', () => {
  const b = build({ SF_SUPABASE_URL: 'https://abcd.supabase.co', SF_CONTENT_ORIGIN: 'https://content.example.com' });
  assert.strictEqual(b.status, 0, b.err);
  for (const c of [b.csp, b.meta]) {
    assert.ok(!/\*\.supabase\.co/.test(c) && !/frame-src[^;]*\bhttps:(\s|;|$)/.test(c), c);
    assert.strictEqual(dir(c, 'connect-src'), "connect-src 'self' https://abcd.supabase.co wss://abcd.supabase.co https://content.example.com");
    // v41.11: + the fixed video / H5P embed hosts (no general https: wildcard; *.h5p.com is one named service)
    assert.strictEqual(dir(c, 'frame-src'), "frame-src 'self' blob: https://abcd.supabase.co https://content.example.com https://www.youtube-nocookie.com https://player.vimeo.com https://h5p.org https://*.h5p.com");
    assert.strictEqual(dir(c, 'img-src'), "img-src 'self' data: blob: https://abcd.supabase.co");
    assert.strictEqual(dir(c, 'style-src-elem'), "style-src-elem 'self' https://fonts.googleapis.com", 'no injected <style>');
    assert.strictEqual(dir(c, 'style-src-attr'), "style-src-attr 'unsafe-inline'"); assert.strictEqual(dir(c, 'script-src'), "script-src 'self'");
    assert.ok(dir(c, 'object-src') === "object-src 'none'" && dir(c, 'base-uri') && dir(c, 'form-action'));
  }
  assert.ok(b.csp.includes("frame-ancestors 'self'") && !b.meta.includes('frame-ancestors'), 'frame-ancestors only works as a header');
});
test('offline demo build allows no external origin at all', () => {
  const b = build({}); assert.strictEqual(b.status, 0, b.err);
  assert.strictEqual(dir(b.csp, 'connect-src'), "connect-src 'self'"); assert.strictEqual(dir(b.csp, 'frame-src'), "frame-src 'self' blob:"); assert.ok(!/supabase/.test(b.csp));
});
test('bad origins stop the build instead of widening the policy', () => {
  for (const env of [{ SF_SUPABASE_URL: 'http://abcd.supabase.co' }, { SF_SUPABASE_URL: 'https://a.co; script-src *' }, { SF_SUPABASE_URL: 'nonsense' }, { SF_SUPABASE_URL: 'https://a.supabase.co', SF_CONTENT_ORIGIN: 'https://a.supabase.co' }])
    assert.notStrictEqual(build(env).status, 0, JSON.stringify(env));
  assert.strictEqual(build({ SF_SUPABASE_URL: 'http://localhost:54321' }).status, 0, 'local development is allowed over http');
});

// v37: admin-users and learning decode JWTs without verifying them (claims()); that is only safe behind the gateway check.
test('verify_jwt stays on for learning and admin-users', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  for (const fn of ['learning', 'admin-users']) {
    const m = toml.match(new RegExp('\\[functions\\.' + fn + '\\][^\\[]*?verify_jwt\\s*=\\s*(\\w+)'));
    assert.equal(m && m[1], 'true', fn + ' must keep verify_jwt = true');
  }
});
