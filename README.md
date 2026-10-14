# Skillforge LMS

A learning management system: vanilla JavaScript front end (`public/`), Supabase backend (PostgreSQL with Row Level Security, Storage, Edge Functions), and a separate content site for SCORM packages (`content-site/`).

## Layout

```
public/                 Front-end source (index.html, css/, js/, assets/, vendor/, _headers)
  js/core/              View engine, backend client (backend.js), formulas, shared assessment logic
  js/learner|staff|admin/  Screens by audience
  js/data/              Sample data for the offline demo
  js/config.js          Connection settings (SUPABASE_URL, SUPABASE_ANON_KEY, ORG_ID, ...)
dist/                   Build output: committed on purpose (served as is); CI fails if it is out of date
scripts/                build.mjs, check-deploy.mjs, backups, vendoring the Supabase client
supabase/migrations/    001_skillforge.sql, 002_v36_hardening.sql, 003_v37_audit_tz_limits.sql (run in order)
supabase/functions/     learning, admin-users, content (+ _shared: learning-core.js, assessment.js)
content-site/           SCORM content origin (Cloudflare Pages function + headers)
tests/                  Unit (node --test), db (PostgreSQL), e2e (Playwright), stack (Edge runtime)
docs/                   CI/CD, RLS review, bucketization; docs/archive/ holds superseded notes
```

## Run the offline demo

Leave `SUPABASE_URL` empty in `public/js/config.js` and open `public/index.html`, or build and serve `dist/`. The demo uses sample data in the browser only. (The automated browser tests always use sample data, whatever `config.js` says.)

## Build

```
npm run build        # public/ -> dist/, writes a Content-Security-Policy that names only your project and content site
```

A connected build (SUPABASE_URL set) requires `ORG_ID`; the build stops without it.

## Connect Supabase

Follow `SETUP-SUPABASE.md`. Apply the migrations in order, deploy the three functions, set their secrets, then run `node scripts/check-deploy.mjs`.

## Tests

```
npm test             # unit + Edge Function logic (Node)
npm run test:db      # policies and SQL functions on PostgreSQL ($PGURL, or a throwaway cluster via pgserver)
npm run test:load    # 3,500 people / ~20,000 rows timing
npm run test:e2e     # browser suites (Playwright)
npm run test:stack   # real Supabase stack and Edge runtime (needs the Supabase CLI and Deno)
```

## More

- `CHANGELOG.md`: history by version
- `SECURITY.md`: deployment security dependencies and the security review
- `docs/DEPLOY.md`: first deployment (Supabase, Cloudflare Pages, nightly backups) with `scripts/deploy-supabase.sh`
- `docs/CICD.md`, `docs/RLS-AND-ACCESS-REVIEW.md`, `docs/BUCKETIZATION.md`

## Running the tests from a clean checkout
```
npm ci                                   # Node packages (TypeScript, for the Edge Function tests)
python3 -m pip install -r requirements-test.txt
python3 -m playwright install chromium   # once
npm test                                 # unit, Edge Function, content site
npm run test:db                          # database rules (starts a throw-away PostgreSQL, or set PGURL)
npm run test:e2e                         # browser tests with sample data
```
