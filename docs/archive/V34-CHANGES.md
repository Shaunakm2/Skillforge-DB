# v34 — security fixes (from the v33 review)

Scope: single-organisation deployment. The cross-organisation password reset in `admin-users` was reviewed and left as is,
because there is only one organisation in the project; do not host a second organisation or share the Supabase Auth with
another app without changing it first (see "Not changed").

| # | Finding | Fix | Where |
|---|---|---|---|
| 2 | A signed-in person could set a weak password by calling Supabase Auth directly (only the Edge Functions enforced the 10-character rule) | Auth now enforces the same rule: `minimum_password_length = 10`, `password_requirements = "lower_upper_letters_digits"`, sign-ups off, 30-minute JWT. `supabase config push` applies it; SETUP step 1.4 lists the dashboard equivalents. A CI smoke check tries a weak password through the Auth API. | `supabase/config.toml`, `tests/stack/edge_smoke.mjs` |
| 3 | The public content site held the service-role key | New Edge Function `content` (no JWT; the signed token is verified inside) checks signature, expiry, the live launch session and that the person is active, then returns a 60-second signed URL for that one file. The content site keeps no key at all (a test fails if its source mentions one) and accepts a signed URL only if it names exactly the requested folder + file, rewriting the host to its own `SUPABASE_URL`. | `supabase/functions/content/`, `content-site/functions/c/[[path]].js` |
| 4 | 30 failures from anywhere paused one person's employee-ID sign-in (targeted lock-out) | An address that has already signed that person in (last 60 days, table `sf_known_ip`) is not paused by strangers' failures. Its own 5-failure pause still applies. The per-address limit is now a setting (`ip_fail_limit`, default 50) for shared office addresses. `scripts/check-deploy.mjs` checks the database sees the client IP. | migration, `scripts/check-deploy.mjs` |
| 5 | Deactivated / reset people kept working until their token expired | `sf_revoke_sessions()` deletes the person's rows in `auth.sessions` on reset, create-over-existing and deactivate; the policies (`sf_me`, `sf_ctx`, `sf_member_self`) require the token's session to exist, so the old token is refused at once and the refresh token stops working. Both functions check `sf_session_ok` first and fail closed. Changing your own password ends your other sessions. `content` also checks the person is active. | migration, `learning`, `admin-users`, `content` |
| CSP | Inline `<style>` allowed, `frame-src https:`, images/connections to any `*.supabase.co` | The build writes the policy from `js/config.js` (`SUPABASE_URL`, `CONTENT_ORIGIN`): your project and your content site only, `style-src-elem` without `unsafe-inline` (style attributes still allowed), no "any https" frames. Bad values stop the build. | `scripts/build.mjs`, `tests/build-csp.test.mjs` |
| Token | Sign-in token in `localStorage` | Kept in `sessionStorage` (ends with the tab/browser); `SESSION_STORAGE: 'local'` restores the old behaviour; an unusable store falls back to memory, never to `localStorage`. | `public/js/core/backend.js`, `config.js` |

## Also in this build
- `public/vendor/supabase.js` (supabase-js 2.45.4) and its `.sha384` are now included, so `npm run build` works without `npm run vendor`.
- The "reset password" dialog no longer promises `Pass@123` when connected (the server issues a random one-time password, shown after confirming).
- Load test (20,772 rows, 3,520 people) after the extra session lookup: learner 42 ms, trainer 88 ms, admin 279 ms, directory 19 ms.

## Verified here
- `npm test`: 52/52 (content site + `content` function run together; sessions; CSP build).
- `npm run test:db` on PostgreSQL 16: 95/95, including known-address throttle, `ip_fail_limit`, revoked / foreign / malformed session ids, revoke-all-but-one.
- Browser suites (source and bundled build): see the final message.

## Not verified here (needs your Supabase / Cloudflare)
- `deno check` of the three functions and the Edge Functions on the real runtime (CI job `supabase-stack`; its new checks are written but not run).
- That GoTrue puts `session_id` in access tokens and that `postgres` may delete from `auth.sessions` on your project (both are standard on current Supabase; the migration treats a token without `session_id` as unchecked).
- Auth password rules and `config push` on the hosted project: confirm in the dashboard.
- Edge Function invocation volume of `content` against your plan.

## Not changed
- Cross-organisation password reset in `admin-users` (single organisation).
- SCORM completion is still reported by the package's own browser (server only enforces open step + minimum time).
- Realtime fan-out, MFA, penetration test.
- An insider on the same office address can still pause a colleague's employee-ID sign-in from that address (5 failures, growing wait). E-mail sign-in is unaffected.
