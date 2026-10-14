# CI/CD for Skillforge (what is in this repository)

Everything listed here is a file in `.github/`. Nothing else runs automatically.

| Workflow | When | What it does | Needs |
|---|---|---|---|
| `workflows/ci.yml` | every push and pull request | clean install (`npm ci`, `requirements-test.txt`), unit + Edge Function + content-site tests, `npm audit` (fails on high), rebuilds `dist/` and fails if it differs from the committed one, database rules on a throw-away PostgreSQL, all browser tests with sample data | nothing |
| `workflows/deploy-functions.yml` | by hand (Actions › Run workflow) | deploys the Edge Functions `learning`, `admin-users`, `content` | secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` |
| `workflows/backup.yml` | nightly 02:00 IST, or by hand | database records + Storage files, encrypted, kept 30 days as an artifact (`scripts/restore-backup.md`) | secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE` |
| `workflows/supabase-keepalive.yml` | Monday and Thursday | stops a Free-plan project from pausing after 7 idle days | secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `dependabot.yml` | weekly | pull requests for outdated npm, Python and Actions versions | turn on Dependabot in Settings › Code security |

## Not included (add later if you need them)
- **Database migrations are not run by CI.** Run them with `scripts/deploy-supabase.sh` or paste them into the Supabase SQL editor (`001` → `008`, in order).
- **The app and the content site are deployed by Cloudflare** from this repository, not by a workflow.
- **No staging environment, approvals or CodeQL.** CodeQL is free only for public repositories (private ones need GitHub Advanced Security); turn on *secret scanning* in Settings › Code security if your plan offers it.
- No connected-mode test against a real Supabase project: connected behaviour is tested against a simulated Supabase (`tests/e2e/mock-supabase.js`) and the Edge Function source (`tests/edge-functions.test.mjs`).

## Settings in the repository
`public/js/config.js` holds this deployment's **public** values (Supabase URL, anon key, organisation id, content site),
because Cloudflare serves the files without a build step. They are not secrets: Row Level Security decides what each
signed-in person can do. Tests never use them: the offline browser tests force sample-data mode (`tests/e2e/hook.js`) and
the connected tests supply their own settings. To keep them out of the repository instead, leave `config.js` empty and
build with `SF_SUPABASE_URL`, `SF_SUPABASE_ANON_KEY`, `SF_ORG_ID`, `SF_CONTENT_ORIGIN` set (`scripts/build.mjs` then writes
`dist/js/config.js`). Server secrets (service role key, signing key) belong only in GitHub / Supabase secrets.

## dist/
`dist/` is committed on purpose (the hosting serves it as is). CI rebuilds it and fails if it is stale, so the committed
copy always matches `public/`. After changing anything in `public/`, run `npm run build` and commit `dist/` too.

## Rollback
- App / content site: Cloudflare › the project › Deployments › an earlier one › Rollback.
- Edge Functions: check out the earlier commit and run `deploy-functions`.
- Data: restore from a nightly backup (`scripts/restore-backup.md`).
