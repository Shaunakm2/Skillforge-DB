# CI/CD for Skillforge

## Pipeline
```
pull request ─► ci.yml: unit · SQL/RLS on PostgreSQL · load · browser E2E (source + built) · full sweep · Supabase stack
                codeql.yml (security analysis)
push to main ─► cd.yml: ci + security (gitleaks, no server secrets in public/, npm audit)
              ─► build (one artifact per environment, strict CSP with that environment's URLs)
              ─► deploy staging ─► smoke check
              ─► [waits for 2 approvers] ─► pre-deploy DB dump ─► deploy production ─► smoke check
tag v1.2.3   ─► same, production after approval
nightly      ─► backup.yml (encrypted DB + files to R2)     weekly ─► dependabot, codeql
```
Each deploy (`.github/actions/deploy/action.yml`), in order:
1. `supabase db push` — migrations are additive and idempotent, so a re-run is safe.
2. Edge Functions and their secrets (`content` with `--no-verify-jwt`; it checks its own signed tokens).
3. Content site (SCORM origin), then the app, to Cloudflare Pages.
4. `scripts/check-deploy.mjs`: sign-up disabled, real client IP seen, content function refuses bad tokens, security headers. Any FAIL stops the pipeline.

## One-time setup (GitHub)
1. Settings › Environments: `staging`, `production`, `staging-build`, `production-build`. `production`: Required reviewers (two people), branches `main` and tags `v*`.
2. Variables per environment (public values): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`, `CONTENT_URL`, `CF_PAGES_PROJECT`, `CF_CONTENT_PROJECT`.
3. Secrets per environment (different values): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL` (production), `CONTENT_SIGNING_KEY` (32+ random characters), `CLOUDFLARE_API_TOKEN` (Pages: Edit, this account only), `CLOUDFLARE_ACCOUNT_ID`.
4. Branch protection on `main`: require the `ci` checks and one review; no force-push.
5. Turn off the Cloudflare Pages Git integration, so nothing goes live without CI.

## Rollback
- App / content site: Cloudflare Pages › Deployments › previous › Rollback (instant).
- Edge Functions: run `cd.yml` on the previous tag (workflow_dispatch → production).
- Database: migrations only add. To undo data damage, restore the `pre-deploy-db-<run>` artifact (kept 7 days) or the nightly R2 backup (`scripts/restore-backup.md`). Practise a restore on staging every quarter.

## Moving to the organisation's own servers
Keep `ci.yml`. In the deploy action, replace step 3 with your target (Azure Static Web Apps, IIS or nginx upload of `dist/`) and step 1 with your migration runner against the organisation's PostgreSQL.
