# Skillforge — Supabase and free hosting setup (v26)

| Mode | When | Data |
|---|---|---|
| **Offline** | `public/js/config.js` left empty (default) | Generated sample organisation, in the browser tab only |
| **Connected** | `config.js` filled in **and** `public/vendor/supabase.js` present | Supabase Postgres + Storage, shared, saved automatically |

## What runs where

| Piece | Where | Free tier |
|---|---|---|
| App (`dist/`, built from `public/`) | Cloudflare Pages project **1**, e.g. `lms.example.com` | Unlimited static requests |
| SCORM content (`content-site/`) | Cloudflare Pages project **2** on its **own origin**, e.g. `content.example.com` | 100,000 Function requests/day |
| Database, sign-in, Realtime (staff only) | Supabase | 500 MB DB, 50,000 MAU, **200 Realtime connections** |
| Files (`lms-files`), SCORM (`lms-scorm`) | Supabase Storage | 1 GB, 50 MB per file |
| Edge Functions `learning`, `admin-users` | Supabase | 500,000 invocations/month |
| Encrypted backups | GitHub Actions artifacts (`backup.yml`) | kept 30 days, free |

**Free plan limits:**
- **Pausing:** the Supabase project pauses after 7 days of inactivity (`.github/workflows/supabase-keepalive.yml` prevents it once its two secrets are set).
- **Backups:** there are no automatic backups (`.github/workflows/backup.yml` makes a nightly encrypted backup, kept 30 days; see `scripts/restore-backup.md`).

---

## 1. Database

1. Create a Supabase project (region Mumbai).
2. Run **all** migrations in order: `001` to `009` (`scripts/deploy-supabase.sh` does this and steps 4 and 2 below; see `docs/DEPLOY.md`).
3. Add your admin login:
   - **Authentication › Users › Add user** (Auto confirm).
   - Then run:
     ```sql
     insert into public.sf_member (org_id, user_id, email, emp_id, app_name, role)
     select 'northwind', id, email, 'NW-1007', 'Lena Fischer', 'Admin' from auth.users where email = 'you@company.com';
     ```
4. **Apply the Auth security settings (required).** They are in `supabase/config.toml`; push them with `supabase link --project-ref <ref>` then `supabase config push`. Or set them by hand in the dashboard (Authentication › Sign In / Providers › Email, and Authentication › Sessions):
   - sign-ups **off** (`enable_signup = false`);
   - **minimum password length 8** (v41.19: so the default first password `Pass@123` is accepted; people still choose 10+ characters in the app), requirement **lowercase + uppercase + digits** (`minimum_password_length = 8`, `password_requirements = "lower_upper_letters_digits"`). This is the same rule the app enforces. It matters because a signed-in person can call the Auth API directly and bypass the app's own check; only these settings stop that;
   - **JWT expiry 1800 s** or less.

   Deactivating or resetting a login now also deletes that person's sessions (`sf_revoke_sessions`), so the refresh token stops working and the database refuses the old access token at once. JWT expiry no longer decides how long a removed person keeps access.
6. Enable **pg_cron** (Database › Extensions), then run the migration again. It schedules the hourly clean-up of old sign-in attempts. Without pg_cron, the clean-up still runs now and then during sign-ins.
7. **Check the client IP once** (this is what the sign-in throttle uses). From a browser console on any page, run:
   ```js
   fetch('https://<ref>.supabase.co/rest/v1/rpc/sf_client_ip', { method: 'POST', headers: { apikey: '<anon key>', 'content-type': 'application/json' }, body: '{}' }).then(r => r.json()).then(console.log)
   ```
   It must print **your own public IP**. If it prints `""`, the `CF-Connecting-IP` header isn't reaching the database. The throttle then works per employee ID only, so one person's failures can pause that ID for everyone (email sign-in still works). Fix the header before go-live. `node scripts/check-deploy.mjs` (see the end of this guide) makes this check for you.
8. **Sign-in throttle (v34).** Five wrong passwords pause an employee ID **on that address**, with a growing wait. Thirty failures from many addresses pause the ID only for addresses that have not signed that person in before (last 60 days); the person's usual network is never locked out by strangers, and e-mail sign-in always works. If many staff share one office address, raise the per-address limit (default 50 failures per 15 minutes, across all IDs):
   ```sql
   insert into sf_setting (k, v) values ('ip_fail_limit', '300') on conflict (k) do update set v = excluded.v;
   ```

## 2. Edge Functions

```bash
supabase link --project-ref <ref>
supabase functions deploy learning
supabase functions deploy admin-users
supabase functions deploy content --no-verify-jwt      # v34: checks its own signed token; the content site calls it
supabase secrets set ALLOWED_ORIGIN=https://lms.example.com \
  CONTENT_ORIGIN=https://content.example.com \
  CONTENT_SIGNING_KEY=$(openssl rand -hex 32) \
 SIGNED_URL_TTL_SECONDS=600
# optional: SCORM_IDLE_MINUTES=30 (a launch link dies after this long without a heartbeat), SCORM_MAX_HOURS=8 (hard cap)
```

- **`ALLOWED_ORIGIN` is required:** without it, browsers are refused (no `*`).
- **`content` has no JWT check on purpose** (`verify_jwt = false`): it is called by the content site with the signed launch token, and it verifies signature, expiry, the live launch session and that the person is still active before it signs a 60-second URL. Do not deploy it without `--no-verify-jwt`, or every package file will fail with 401. It needs `CONTENT_SIGNING_KEY` (the same secret as `learning`).
- **Cost note:** each package file is one `content` invocation. A SCORM package typically loads 20–100 files, and the content site reuses a signed URL for 30 s for repeated non-page files. Check your plan's Edge Function invocation allowance against (learners × packages × files); the free plan's 500,000 a month can run out in one training cycle.
- **Identity:** `learning` and `admin-users` read the caller from the JWT the gateway already verified (`verify_jwt = true` in `supabase/config.toml`). They make no `/auth/v1/user` call, so there is no shared-IP Auth rate limit.

## 3. App (Cloudflare Pages project 1)

1. Run `npm run vendor` once, then **commit `public/vendor/supabase.js` and `public/vendor/supabase.js.sha384`**. This is the pinned `@supabase/supabase-js@2.45.4`. The `.sha384` file records the file's hash, and CI fails if the client is missing or doesn't match it.
2. Fill in `public/js/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORG_ID`.
3. Create Pages project 1:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`

   The build joins the ~57 app scripts into one hashed file (`js/app.<hash>.js`, cached for a year). Only `dist/` is served, so SQL, tests and docs stay private. The build stops if the vendored client is missing.
4. Also fill in `CONTENT_ORIGIN` (the content site's address, e.g. `https://content.example.com`) in `public/js/config.js`. **The build writes the Content-Security-Policy from `SUPABASE_URL` and `CONTENT_ORIGIN`**, into both `dist/_headers` and the page's `<meta>` tag: scripts only from this site, connections / images / media only to your own Supabase project, frames only to your project (stored documents) and your content site. No wildcard for all of supabase.co and no "any https page" frames. A wrong value stops the build. Empty values (demo build) allow no outside address at all.
5. **Sign-in storage (v34).** The sign-in is kept in `sessionStorage`: it ends when the tab or browser closes and is not left behind on a shared PC. A link opened in a new tab asks for sign-in again. `SESSION_STORAGE: 'local'` in `config.js` brings back "stay signed in"; the 30-minute inactivity sign-out works either way.

## 4. SCORM content site (Cloudflare Pages project 2)

- **Root directory:** `content-site`
- **Output directory:** `public`
- **Environment variables (none of them secret):**
  - `SUPABASE_URL`
  - `APP_ORIGIN=https://lms.example.com`
  - optional `CONTENT_FN_URL` (default `SUPABASE_URL/functions/v1/content`), optional `SUPABASE_ANON_KEY`

  **This project must NOT have `SUPABASE_SERVICE_ROLE_KEY` or `CONTENT_SIGNING_KEY`** (v34). If an older deployment has them, delete them. The site asks the `content` Edge Function for a short signed URL per file, so a bug or a leaked setting here exposes no database access and no other storage.

It must be a **different hostname** from the app, not a sub-path. Packages run here and cannot read the app's storage, cookies or session.

Each launch link is tied to one launch session in the database. The link stops working when:
- the learner relaunches the package;
- the learner leaves the step or signs out;
- no heartbeat arrives for 30 minutes (the app sends one every 10 minutes while the package is open);
- the 8-hour cap is reached.

Pages are checked on every request (always through the `content` function). Other files (scripts, images) reuse a signed URL for up to 30 seconds. Deactivating a person ends their open packages at once.

Paths are checked on the raw URL. A file name containing `%` (for example `100%.png`) is refused, so rename such files before zipping the package.

## 5. Load data and create logins

1. Sign in as admin, then go to **Settings › Platform › Database & storage**.
2. Select **Save the data shown**.
3. Select **Create missing logins** and download the temporary passwords (shown once).

## 6. Backups and keep-alive

1. Add three GitHub secrets (Settings › Secrets and variables › Actions): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_PASSPHRASE` (a long random phrase; keep a copy outside GitHub).
2. Run **Actions › backup › Run workflow** once and check that the run has an artifact.
3. Backups are kept 30 days. To restore, follow `scripts/restore-backup.md`. No R2 or other paid storage is needed.

---

## Who can do what

**Where permissions come from:** the **custom role** (Settings › Roles & permissions) is enforced by the database and the Edge Functions, not only the UI. The base type (Learner / Trainer / Admin) sets defaults; Admin means everything.

| Data | Readable by | Writable by |
|---|---|---|
| Own records (assignments, results, preferences, bookmarks, survey answers) | the person | results: only the `learning` function; own preferences and SCORM resume point: the person |
| Other people's progress (assignments, step completion, attempts used, extra attempts) | `reports`/`analytics`/`dashboard` permission (everyone), or own trainees with `batches`/`assignments`/`attempts`/`gradebook` | assignments: `assignments` permission for own trainees; extra attempts: `attempts` permission for own trainees |
| Other people's **preferences and survey answers** | nobody except admins. Survey results come as aggregates (`sf_survey_summary`: counts, averages, 1–5 spread; fewer than 3 responses shows the count only) for `feedback`/`reports`/`analytics` | — |
| Other people's **SCORM bookmarks** | `bookmarks` permission (the clear-bookmark tool) | `bookmarks` permission |
| SCORM launch sessions | nobody (server only) | only the `learning` function |
| People | own row; `users` or `reports` permission; own trainees with `batches`. Everyone else sees names, departments and designations only (no employee IDs, emails, phones) | `users` permission (role changes only through `admin-users`, admins) |
| Question bank (answer keys) | `qbank` or `quizzes` only. **Gradebook no longer includes the keys**: each written answer to rate carries its question, points and guide. Attempts by people who can read the keys are marked "had answer-key access" in the assessment report. | `qbank` |
| Batches | `dashboard`/`reports`/`analytics`: all; `batches`: own | `batches`: own batch details only. **Who is in a batch and who trains it: admins only. Nobody can be a trainee in their own batch.** |
| Courses | Published: everyone; drafts: `courseAdmin`/`builder`/`assignments`/`lcms` | `courseAdmin`/`builder` |
| Roles and permissions | everyone (to show menus) | admins only |

**Sessions and limits:**
- **Temporary passwords:** a session with a temporary password (`must_change`) can do nothing except change it, including through PostgREST.
- **Employee-ID sign-in:** the browser asks the database to check the ID and password (`sf_login_lookup`). It then signs in to Supabase Auth from **its own IP**, so the Auth per-IP limit applies per user, not to one shared server. Failed attempts are throttled (failures in the last 15 minutes):
  - **One ID from one IP:** after 5 failures, a pause of 30 s, then 60 s, 120 s and so on, up to 15 minutes. A success clears it. Someone guessing IDs can't lock out the real person, who is on a different IP.
  - **One ID from many IPs:** after 30 failures, employee-ID sign-in for that ID pauses. Email sign-in still works.
  - **One IP across many IDs:** after 50 failures, that IP pauses.

  The IP comes from `CF-Connecting-IP`, never from the client-supplied `X-Forwarded-For`. Failures are not slowed with `pg_sleep`, so no pooled connection is held. Unknown IDs run the same bcrypt check as known ones, so the two take the same time and get the same answer.
- **Live updates:** staff only. Learners load fresh data when they sign in, which keeps Realtime under the Free plan's 200 connections.

## Tests

| Command | What it checks |
|---|---|
| `npm test` | 52 unit tests (v34): server rules (incl. SCORM sessions and completion), ZIP/SCORM reader, content-site Function and the `content` Edge Function tested together (incl. encoded-slash traversal, no key on the content site), the build's Content-Security-Policy, session revocation, the three Edge Function handlers (transpiled TypeScript, Deno shim). Needs `npm install` (TypeScript is a devDependency). |
| `npm run test:db` | 95 checks of the real SQL on PostgreSQL 16: every role × collection, private rows, answer keys, login throttle (incl. known addresses), live-session revocation, storage policies. Needs `PGURL` or `pip install pgserver`. |
| `npm run test:load` | Policy performance at 3,500 people / 20,000 rows |
| `python3 tests/e2e/backend_e2e.py` | 40 browser checks of connected mode (simulated Supabase mirroring the policies) |
| `python3 tests/e2e/scorm_isolation_e2e.py` | 18 browser checks with two real origins: package isolation, server-side completion, link revocation, traversal |
| `python3 tests/e2e/offline_e2e.py` | Offline mode |
| `SF_WEB=dist npm run test:e2e` | The same browser tests against the bundled build |
| `npm run test:stack` | Smoke test on a **real** local Supabase stack: Edge Functions on the Deno edge runtime behind the real gateway, bcrypt sign-in, policies, SVG refusal (CI job `supabase-stack`) |

CI (`.github/workflows/ci.yml`) runs the unit, database and browser tests on every push. It does **not** start a full Supabase stack or deploy anything (see `docs/CICD.md`).


## v26 go-live security gates

- Keep both Storage buckets private. Do not create public read policies.
- File signing is fail-closed: learners receive links only for exact storage paths referenced by modules in their assigned courses. Folder names alone never grant access.
- `SIGNED_URL_TTL_SECONDS` defaults to 600 seconds and is capped at 900 seconds.
- Production server errors return a correlation ID instead of database or provider details. Review full errors only in protected function logs.
- Offline mode is a review mock-up, not an authentication boundary. Use synthetic data only until Supabase, RLS, Storage policies and Edge Functions are deployed and tested.
- Require MFA on GitHub, Supabase, Cloudflare and privileged administrator accounts before production.
- Add malware scanning/CDR in the production upload pipeline. The built-in signature checks reject obvious mismatches but do not replace antivirus or sandboxing.

## v27 / v28 deployment
1. Re-run `supabase/migrations/001_skillforge.sql` (adds the documents and dashView rules and the storage rules for `org/docs/`).
2. `supabase functions deploy learning` (adds `docSeen` and document file signing).
3. In Roles & permissions, give the permission *documents* to whoever manages the library, and *dashView* to roles that only view dashboards.
4. Report delivery: schedules are stored in the `dash` settings row. If you want e-mails, they need a scheduled server job
   (for example a Supabase cron and an Edge Function that builds the CSV with the service role and sends it through your mail provider).
   That job is not included here.

## v29 deployment
1. Re-run `supabase/migrations/001_skillforge.sql` (dashboard rows and rules, schedule trigger, sign-in records, sf_today()).
2. `supabase secrets set ORG_TIMEZONE=Asia/Kolkata` (or your zone; also change it in `sf_today()`), then `supabase functions deploy learning`.
3. Open each dashboard as an editor and Save (or "Publish for viewers") so viewers have numbers to see.


## v34 deployment

Upgrading from v33 (in this order):
1. Run `supabase/migrations/001_skillforge.sql` again. It adds live-session checks (`sf_session_live`, `sf_session_ok`, `sf_revoke_sessions`), the table `sf_known_ip`, and the configurable per-address limit. **Deploy the Edge Functions straight afterwards**: the new `learning` and `admin-users` call `sf_session_ok`, and the old ones do not know about revocation.
2. `supabase functions deploy learning`, `supabase functions deploy admin-users`, `supabase functions deploy content --no-verify-jwt`.
3. `supabase config push` (Auth password rules, sign-ups off, 30-minute JWT).
4. Content site: deploy the new `content-site/`, then **delete** `SUPABASE_SERVICE_ROLE_KEY` and `CONTENT_SIGNING_KEY` from that Pages project.
5. App: add `CONTENT_ORIGIN` to `public/js/config.js`, rebuild and deploy.
6. Run the post-deploy check:
   ```bash
   SB_URL=https://<ref>.supabase.co SB_ANON_KEY=<anon> APP_URL=https://lms.example.com CONTENT_URL=https://content.example.com node scripts/check-deploy.mjs
   ```
   It checks sign-ups are off, the database sees the client IP, the `content` function refuses a bad token, the app's policy names only your origins, and the content site refuses a bad token. It cannot read the password rules: confirm those in the dashboard.
