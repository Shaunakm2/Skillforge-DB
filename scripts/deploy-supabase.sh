#!/usr/bin/env bash
# Skillforge V41 — first deployment to Supabase (database, Auth settings, Edge Functions, secrets).
# Run from the repo root on YOUR machine. Nothing here is sent anywhere except your own Supabase project.
#
# Needs: Supabase CLI (logged in: `supabase login`), psql, openssl.
# Set these first (do not commit them):
#   export SB_REF=abcdefghijkl                       # Project Settings > General > Reference ID
#   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<db-password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
#   export ORG_ID=ims                                # your organisation id (lowercase, no spaces); the same value goes in public/js/config.js
#   export APP_ORIGIN=https://lms.example.com        # where the app will be served (Cloudflare Pages project 1)
#   export CONTENT_ORIGIN=https://content.example.com # SCORM content site (Pages project 2); must differ from APP_ORIGIN
#   export ORG_TIMEZONE=Asia/Kolkata
set -euo pipefail
cd "$(dirname "$0")/.."
need() { command -v "$1" >/dev/null || { echo "Missing: $1"; exit 1; }; }
need supabase; need psql; need openssl
for v in SB_REF SUPABASE_DB_URL ORG_ID APP_ORIGIN CONTENT_ORIGIN; do [ -n "${!v:-}" ] || { echo "Set $v first (see the top of this file)"; exit 1; }; done
ORG_TIMEZONE="${ORG_TIMEZONE:-Asia/Kolkata}"
[[ "$ORG_ID" =~ ^[a-z0-9-]{2,40}$ ]] || { echo "ORG_ID must be 2-40 lowercase letters, digits or dashes"; exit 1; }
[ "$APP_ORIGIN" != "$CONTENT_ORIGIN" ] || { echo "CONTENT_ORIGIN must be a different site from APP_ORIGIN"; exit 1; }

echo "== 1/5 Database: all migrations (001, 002 …), in order (each stops on the first error)"
for f in supabase/migrations/0*.sql; do
  echo "   $f"; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "insert into public.sf_setting (k, v) values ('org_timezone', '$ORG_TIMEZONE') on conflict (k) do update set v = excluded.v;"

echo "== 2/5 Link the project and push Auth settings (sign-ups off, password rules, 30-minute tokens)"
supabase link --project-ref "$SB_REF"
supabase config push

echo "== 3/5 Edge Functions"
supabase functions deploy learning
supabase functions deploy admin-users
supabase functions deploy content --no-verify-jwt     # checks its own signed token; must NOT verify JWTs

echo "== 4/5 Function secrets"
supabase secrets set ALLOWED_ORIGIN="$APP_ORIGIN" CONTENT_ORIGIN="$CONTENT_ORIGIN" \
  CONTENT_SIGNING_KEY="$(openssl rand -hex 32)" SIGNED_URL_TTL_SECONDS=600 ORG_TIMEZONE="$ORG_TIMEZONE"

echo "== 5/5 Checks"
psql "$SUPABASE_DB_URL" -At -c "select 'tables with RLS: ' || count(*) from pg_tables where schemaname='public' and tablename like 'sf_%' and rowsecurity;"
psql "$SUPABASE_DB_URL" -At -c "select 'buckets: ' || coalesce(string_agg(id || case when public then ' (PUBLIC!)' else ' (private)' end, ', '), 'none') from storage.buckets where id in ('lms-files','lms-scorm');"
psql "$SUPABASE_DB_URL" -At -c "select 'sf_today(): ' || public.sf_today();"
cat <<EOF

Done. Next (by hand, see docs/DEPLOY.md):
  - Authentication > Users > Add user (your admin email, Auto confirm), then run the sf_member insert in DEPLOY-V41.md step 3.
  - Database > Extensions: enable pg_cron, then re-run supabase/migrations/001_skillforge.sql.
  - Fill public/js/config.js (SUPABASE_URL, SUPABASE_ANON_KEY, ORG_ID=$ORG_ID, CONTENT_ORIGIN) and deploy the app.
EOF
