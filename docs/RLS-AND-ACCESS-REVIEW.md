# Skillforge V36 — RLS, SQL and access review

Scope: `supabase/migrations/001_skillforge.sql` (policies, functions, grants, storage) and the new `002_v36_hardening.sql`, read line by line. The SQL tests (`tests/db/test_rls.py`) run every migration twice on a real PostgreSQL in CI. They could not run in the review sandbox (no PostgreSQL), so the new database checks are **to be confirmed by CI**.

## How access works
Every request is identified by `sf_ctx()`: the caller's member row, only if the account is active, the session is live, no forced password change is pending, the account has not expired, and the `x-sf-org` header matches. It returns the organisation, employee ID, role, custom-role permissions and the trainees of the caller's batches. Every read and write on `sf_doc` goes through `sf_read_ok` / `sf_write_ok`. Results (assessments, completions, SCORM, surveys) are written **only** by the `learning` Edge Function; learners never write their own results.

## Verdict per object
| Object | Verdict |
|---|---|
| `sf_member` (own row; admins of the org) | **OK.** No write policy: only the `admin-users` function changes members. |
| `sf_doc` read (`sf_read_ok`) | **OK.** Personal rows owner-only; managers/trainers through permissions + trainee scope; answer keys only for question authors; viewers see only shared dashboards. |
| `sf_doc` write (`sf_write_ok`) | **OK.** Server-only collections and `roles` not writable by non-admins (no self-granted permissions); trainers write only their batches and their trainees' enrolments. |
| `sf_doc` delete | **OK.** Admins only; never attempts, step opens or SCORM sessions. |
| `sf_audit` | **OK.** Admin read only; written by trigger. **Fixed in 002** (see below). |
| `sf_trainee`, `sf_login_attempt`, `sf_known_ip`, `sf_setting` | **OK.** RLS on, deny by default. |
| `sf_save`, `sf_delete` | **OK** (security invoker, RLS per row). **Fixed in 002:** max 500 rows per call. |
| `sf_directory` | **Accepted by design:** names, department, designation, role, manager of active users for leaderboards, pickers and forum. No IDs, e-mails or phones. Confirm with HR. |
| `sf_survey_summary` | **OK.** Aggregates only, minimum 3 responses, needs feedback/reports/analytics permission. |
| `sf_login_lookup` | **OK.** Constant-time bcrypt, progressive per-ID/IP throttling, IP spraying limit. Relies on `CF-Connecting-IP`; the deploy smoke check verifies it. |
| `sf_session_ok`, `sf_revoke_sessions`, `sf_auth_user_id`, `sf_audit_purge` | **OK.** Service role only. |
| Storage `lms-files` / `lms-scorm` | **OK.** Authoring permissions only; learners get short signed links through the function; SCORM through the content site with 60-second tokens; 50 MB limit; MIME allow-list; no SVG. |
| Realtime on `sf_doc` | **OK.** RLS applies to every event. |

## Fixed in V36 (`002_v36_hardening.sql`)
1. **Audit rows for changes that never happened.** The audit insert ran in the BEFORE trigger, so `insert … on conflict do nothing` was logged although nothing was stored. Now an AFTER trigger writes the audit row.
2. **Unbounded payload.** `sf_save` / `sf_delete` accepted any number of rows per call. Now max 500 (the app sends at most 200).
3. **Audit lookups and growth.** Index on `(org_id, actor, at)`; `sf_audit_purge(days)` for retention (service role only, refuses under one year, default 7 years).

## Remaining items (decisions or later work, not defects)
| Item | Recommendation |
|---|---|
| Audit records who / which row / when, not before→after values | Add old/new values for users, roles and results in a separate table with retention. |
| Leaderboards need everyone's XP, which learners can't read | Server function returning only name, XP, rank (same pattern as `sf_survey_summary`). |
| E-mail delivery not connected | Edge Function + SMTP/SES + scheduled job. The app now says "not connected" instead of "sent". |
| MFA for admins | Supabase Auth TOTP, required for the Admin base role. |
| Audit log screen reads the latest 500 rows | Server-side paging and date filters before go-live. |

## Access matrix (default roles)
| Area | Learner | Trainer | Admin |
|---|---|---|---|
| Own courses, progress, certificates, documents | ✓ | ✓ | ✓ |
| Other people's records | — | trainees of own batches | everyone |
| Batches | — | own | all |
| Course assignment, attempts, gradebook | — | own trainees | all |
| Reports | — | course completion + progress | all, incl. Kirkpatrick L1–L4 analysis |
| Kirkpatrick analysis | — | with "Training feedback" permission | ✓ |
| Users, roles, settings, audit log | — | — | ✓ |
| Answer keys (question bank) | — | with Question bank / Assessments permission | ✓ |
