# Deploy Skillforge V41: Supabase first, then Cloudflare R2

You run these steps on your own machine. Keep every key and password out of chat, email and git.

## 0. Before you start (one time)
- Accounts: Supabase, Cloudflare, GitHub, each with **MFA on**.
- Install: Supabase CLI (`npm i -g supabase` or the installer), `psql`, `openssl`, Node 20+.
- Decide:
  - **ORG_ID**, for example `ims`. It is lowercase and permanent, and every row is stored under it.
  - **App address**, for example `https://lms.imspeople.com`.
  - **Content address**, for example `https://lmscontent.imspeople.com`. It must be a different hostname from the app.

## 1. Create the Supabase project
1. Go to supabase.com › New project › region **Mumbai (ap-south-1)**, and set a strong database password.
2. Note these values. Do not share them.
   - **Reference ID:** Settings › General.
   - **Project URL** and **anon key:** Settings › API. The anon key is meant to be public.
   - **Database connection string:** Connect › Session pooler.
   - The **service_role key** is for GitHub backups only. Never put it in the app.

## 2. Database, Auth settings, functions and secrets (one script)
```bash
supabase login
export SB_REF=<reference id>
export SUPABASE_DB_URL='<session pooler connection string>'
export ORG_ID=ims
export APP_ORIGIN=https://lms.imspeople.com
export CONTENT_ORIGIN=https://lmscontent.imspeople.com
export ORG_TIMEZONE=Asia/Kolkata
bash scripts/deploy-supabase.sh
```
The script:
- runs migrations **001 → 002 → 003 → 004** in order, stopping at the first error;
- sets the organisation time zone;
- pushes the Auth rules: sign-ups off, 10-character passwords with lower, upper and digit, 30-minute tokens;
- deploys `learning`, `admin-users` and `content` (`content` with `--no-verify-jwt`, on purpose);
- sets the function secrets;
- prints three checks.

**Expected result:** RLS on for every `sf_` table, both buckets `(private)`, and today's date in IST.

## 3. Your admin login
1. In Supabase, go to Authentication › Users › **Add user**: your email, a strong password, **Auto confirm** on.
2. In the SQL Editor, run this (fill in your employee ID):
```sql
insert into public.sf_member (org_id, user_id, email, emp_id, app_name, role)
select 'ims', id, email, '<YOUR EMP ID>', 'Shaunak Mistry', 'Admin' from auth.users where email = '<your email>';
```
3. In Database › Extensions, enable **pg_cron**. Then run `supabase/migrations/001_skillforge.sql` once more; this schedules the hourly sign-in clean-up.

## 4. App (Cloudflare Pages project 1)
1. In `public/js/config.js`, fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORG_ID: 'ims'` and `CONTENT_ORIGIN`. The build refuses to run with an empty ORG_ID.
2. Push the repo to GitHub (private).
3. In Cloudflare, go to Pages › Create › connect the repo:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Add the custom domain `lms.imspeople.com`.

## 5. SCORM content site (Cloudflare Pages project 2)
1. Use the same repo, with root directory `content-site` and output directory `public`.
2. Set the variables `SUPABASE_URL` and `APP_ORIGIN=https://lms.imspeople.com`. **Do not add** the service_role key or `CONTENT_SIGNING_KEY` here.
3. Add the custom domain `lmscontent.imspeople.com`.

## 6. Check the live deployment
```bash
SB_URL=https://<ref>.supabase.co SB_ANON_KEY=<anon> APP_URL=https://lms.imspeople.com \
CONTENT_URL=https://lmscontent.imspeople.com node scripts/check-deploy.mjs
```
Every line must say PASS. If it reports that the database receives **no client IP**, fix that before go-live: the per-address sign-in limit is off until you do (see SECURITY.md).

Then sign in as admin, go to Settings › Platform › Database & storage, and choose **Save the data shown**. Only use the demo data on a test project; for production, load your real users.

## 7. Cloudflare R2 (encrypted nightly backups)
1. Create a backup key: `age-keygen -o skillforge-backup.key`. Keep this file **offline**.
2. In Cloudflare, go to R2 › Create bucket `skillforge-backups`. Add a lifecycle rule that deletes objects after 35 days, and create an API token limited to this bucket (Object Read & Write).
3. In GitHub, go to repo › Settings › Secrets › Actions and add:
   - `SUPABASE_DB_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `BACKUP_AGE_RECIPIENT` (the public key line from step 1)
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
4. In GitHub Actions, run **backup** by hand once and confirm a file appears in the bucket. Then test a restore with `scripts/restore-backup.md`.

The **supabase-keepalive** workflow needs `SUPABASE_URL` and `SUPABASE_ANON_KEY`. It stops a free project from pausing after 7 days.
