# Changelog

Newest first. Entries before v38 are the original per-version files, kept verbatim; originals are in `docs/archive/`.

## v41.21 (assessments, Back button, Gradebook scope, App settings, training types, batch schedules, drop-off chart)
- **Long assessments are never cut off by the idle sign-out.** While an assessment is on screen and not handed in, it counts as activity (a 1-hour test with long thinking time is safe). Connected, each answer is also saved on the server as it is given. The server's own time limit still applies.
- **Browser Back with an editor.** Closing the account editor left its draft behind, so every Back press asked about "unsaved changes" and stayed on the page. Now: no changes = Back just closes the editor (or goes back); real changes = Back asks, Cancel stays, OK discards and goes back. The logo and closing the tab ask only when something really changed.
- **Gradebook scope (migration 009 + learning function).** Before, anyone with the Gradebook permission could read and grade the written answers and assignments of every learner. Now a grader sees and grades the trainees of the batches they train (a person can train one batch and be a trainee in another: train-the-trainer); nobody grades themselves. New permission **Gradebook: all learners** (gradeAll) for assessors / QA; admins see everyone.
- **App settings.** Every feature switch and default was checked in the app (Discussions, Calendar, XP, Badges, Learning path, Access requests, Announcements, Essential-training pop-up; default due days, essential window, idle sign-out). Fixed: **Default password** was ignored when connected (the server used only its secret); admin-users and the password change now read it. It must now have upper- and lower-case letters and a number (Supabase refused weaker ones).
- **Training types: optional fields.** Passing %, LMS weight, external assessments, day titles and day contents can be left empty. No passing % = trainees show "No rule" (no certified / not certified); no weights = LMS and external count 50 / 50. Filled-in values are still checked. Name, Batch ID code and level stay required (they make the batch IDs).
- **Per-batch schedule.** Batch editor › Schedule: Standard, Fast track (fewer days, plan compressed), Extended (extra days at the end), Custom end date, and "Saturdays are training days". Days already logged can't move. Changes go to the batch history; the MIS, dashboards and attendance follow the batch's own days.
- **"Where learners drop off" is real.** Built from learning records for the most-assigned course (or any course you pick): the share of assigned people who finished each step and the biggest drop. Shows as soon as one course with 2+ steps is assigned.
- Tests: `tests/e2e/v41_21_e2e.py` (40 checks), 1 new Edge Function test, grading-scope unit tests, database rule check in `tests/db/test_rls.py`.

## v41.20 (remember me, no demo courses, duplicate names, logo, SCORM full screen)
- **Remember me works.** Ticked: you stay signed in for 45 minutes after your last activity, even if you close the tab or the browser (REMEMBER_MINUTES in js/config.js). Every click, key press, playing video or open SCORM package moves the 45 minutes forward. The idle sign-out never logs a remembered person out sooner than 45 minutes. Not ticked: the sign-in ends when the tab closes (as before). Sign out removes the stored sign-in. Before, the box only remembered the username.
- **Demo courses no longer appear when connected.** The learner catalog always added the 9 built-in demo courses on top of the courses in the database; it now shows only database courses. Also: search no longer lists demo lessons, the report course filter and builder preview use real courses, the "Continue learning" card no longer uses demo lessons, and the Engagement trends "Where learners drop off" demo panel is hidden.
- **Same name allowed.** Two people can have the same name; only e-mail and employee ID must be unique (bulk upload, single account, ZingHR). The app tells them apart with an invisible marker, so nothing like "(employee ID)" is added to the name. CSV / Excel exports and certificates print the plain name; the edit form shows the plain name. Names created earlier as "Name (ID)" can be corrected with Edit details.
- **Skillforge logo opens the LMS home page** from everywhere, including Settings (it opened the Settings home there). Unsaved changes in an editor are confirmed first.
- **SCORM full screen.** A "Full screen" button above SCORM / HTML5 / xAPI packages. Real full screen where the browser allows it, otherwise the package fills the browser window; Escape or "Exit full screen" returns. The package is not reloaded, so the learner keeps their place. A package's own full-screen button is allowed too.
- Tests: `tests/e2e/v41_20_e2e.py` (39 checks); the test Supabase double now keeps the sign-in in the app's storage like supabase-js.

## v41.19 (discussions, accounts, sample data)
- **Discussions: Post did nothing.** Replies went to a sample thread that doesn't exist in the database ("Thread not found"). They now go to the thread on screen and are saved through the `learning` function (`post`), so they are in the database. **+ New discussion** added (there was no way to start one). The page re-reads discussions from the database when opened.
- **Supabase free plan usage** moved from the Settings home to **Settings › Database & storage** (also still on LCMS and Documents library, where uploads happen). The Database & storage tile shows the % used.
- **No sample data.** A new database starts empty (only you, plus roles, categories, badges, dashboards and settings). The "full sample organisation" button is gone. **Database & storage › Sample data › Find / Delete sample data** removes demo courses, people, modules, questions, batches, discussions and their records from an existing database; you, everyone with a login and anything you created are kept. Sample calendar sessions are no longer shown when connected.
- **Default first password Pass@123.** New accounts and password resets get `Pass@123` (Edge Function secret `DEFAULT_PASSWORD`; set it to `random` for random passwords). First sign-in always asks for a new password, and Pass@123 can't be kept. Auth minimum length set to 8 in `supabase/config.toml` so Pass@123 is accepted.
- **"Not linked to an active Skillforge account" after changing the password.** After the change the app now signs in again with the new password instead of relying on the old session. The error message also says what really went wrong.
- **Manage did nothing for a new person.** On a new database the admin's id is "me-<employee ID>", so the next id was NaN; the person was saved under the key "NaN". Ids are now always numbers (and NaN ids are repaired on load).
- **No "Invited" status.** Accounts are Active from creation until deactivated (by an admin or the HRMS). Old "Invited" records load as Active; reports, dashboards and counts no longer show Invited.
- **Account actions find the login by employee ID too** (and any letter case of the e-mail), with a clear message if the person has no login yet.
- **Back buttons** on Reset password, Check your email and Set your password; the browser Back button also returns to Sign in.
- Course builder module-type filter uses the same names as LCMS and no longer lists Feedback form (sent after a course, not a step).
- Tests: `tests/e2e/v41_19_e2e.py` (34 checks), 1 new Edge Function test; backend and SCORM tests load the sample data themselves.

## v41.18 (bug review and decluttering)
Second full check
- **SCORM 2004 completion could be lost.** completion_status and success_status overwrote each other, so a package that sent "completed" then success "unknown" never counted. Kept apart now (LMS and content-site bridge); passed wins, failed stays failed, a 2004 "completed" counts at Commit/Terminate.
- **Re-deploying undid an admin's Trainer settings.** Migration 004 now runs once per database (marker `m004_done`).
- **Forgot password with an employee ID failed silently** when connected. The reset screen asks for the work e-mail.
- **Course catalog CSV** now uses the shared export with the spreadsheet-formula guard.
- **Escape** closes the top-most pop-up like an outside click; open editors are never closed by it.
- Phones: messages appear at the top instead of covering Resume and similar buttons. Content site `/health` reports v41.18.

Independent review
- **Usage meter (migration 008):** `sf_usage()` answers only admins and people who can upload. With several organisations in one project it returns only the caller's organisation's files and no database size.
- **Tests no longer depend on the live config.** The offline browser tests force sample-data mode (`tests/e2e/hook.js`), so a fresh checkout passes with the committed `config.js`. `scripts/build.mjs` can also write `dist/js/config.js` from `SF_SUPABASE_URL`, `SF_SUPABASE_ANON_KEY`, `SF_ORG_ID`, `SF_CONTENT_ORIGIN`.
- **Removed the unused Node Playwright package** (high-severity advisory in 1.48.2; all browser tests use Python Playwright). `requirements-test.txt` pins Python Playwright ≥ 1.55.1, psycopg and pgserver, so `npm run test:db` runs from a clean checkout.
- **Workflows that the docs described are now real:** `ci.yml` (clean install, tests, `npm audit`, dist/ freshness, database rules, browser tests), `backup.yml` (free nightly encrypted backup, 30-day artifact, no R2), `supabase-keepalive.yml`, `dependabot.yml`. `docs/CICD.md`, `SETUP-SUPABASE.md`, `DEPLOY.md`, `SECURITY.md` and `restore-backup.md` describe only what is delivered.
- `.gitignore` added (dist/ stays committed on purpose; CI fails if it is stale). `content-site/functions/package.json` declares ES modules, ending the Node warning.
- Tests: `tests/scorm-status.test.js`, 3 Escape checks, 2 database checks (004 re-run, usage meter).

Bugs
- **Quiz time limit was never applied.** Quizzes › Time limit was saved but the player ignored it (and the server read the wrong field). Now a countdown shows in the quiz header, the attempt is handed in automatically at zero, and the server refuses answers after the limit (30 s grace).
- **People could grade themselves.** A trainer or admin could rate their own written answer or accept their own assignment. Blocked on the server and in the Gradebook.
- **Rater feedback was lost when connected.** The note typed with a rating was never sent to the server; it is now saved.
- **Account actions could reach other organisations.** Reset password / deactivate / change role / rename now act only on logins in the admin's own organisation; creating an account can't take over a login that belongs to another organisation. Admins can no longer deactivate or demote themselves.
- **Reports: filters showed demo data and hid rows.** The Manager list was hard-coded ("Priya Raman") and the Course list came from demo courses. Both now list your real managers and courses. Filters a report doesn't use are hidden and ignored, so a status left over from another report no longer empties the table silently. "No manager" now matches people without a manager.
- New accounts no longer default to the demo manager "Priya Raman".
- Demo "Northwind" text removed from Help, Admin Console, Analytics, course author and e-mail placeholders.
- Settings › Migration › SCORM setup check now warns if CONTENT_ORIGIN is the same address as the LMS (SCORM packages would run with access to the learner's session).
- Tests: the build test no longer fails because of your own config.js; the document test matches the in-app viewer (v41.7).

UI
- Reports: removed "Save report" and "Schedule email" (they only showed a "not available" message); clearer "Hours (est.)" column that no longer overlaps "Avg score"; wider person search.
- Question bank: the bulk-upload banner is replaced by Upload CSV / Template / Export next to "+ Add question"; 4 main filters, the other 7 under "More filters".
- Gradebook: the empty "Assignments to review" box is hidden until there is something to review.
- Training overview: From/To merged into one "Period" field, so the filters fit on fewer lines.
- Course assignment: shorter description.
- Roles & permissions: checkboxes next to long labels no longer shrink.
- Tests: `tests/e2e/v41_18_e2e.py` (18 checks), 3 new server tests, 1 new Edge Function test.

## v41.1 (deployment)
- `scripts/deploy-supabase.sh`: one command for migrations 001–004 (in order), org time zone, Auth settings, the three Edge Functions and their secrets, then checks.
- `docs/DEPLOY.md`: step-by-step first deployment: Supabase, admin login, Cloudflare Pages (app + content site), post-deploy check, R2 backups.
- SETUP-SUPABASE.md said to run only migration 001; it now says 001–004.

## v41 (Trainer access, course covers on Home)
- Default Trainer role: no LCMS (including the surveys/feedback-forms-only option) and no Assessment attempt management. Trainers keep Batches, Course assignment, Gradebook and completion reports.
- Admins can switch either permission back on (or off) for the Trainer role in Settings › Roles & permissions; the trainer's Settings tiles and screens follow. In a connected deployment the database and Edge Functions read the role on every request, and open trainer browsers update through Realtime.
- Migration `004_v41_trainer_defaults.sql` removes `attempts`, `lcms` and `lcmsForms` from the existing built-in Trainer role. Run once; re-running after an admin turns them back on would remove them again.
- Learner help text now says to ask the L&D admin for extra attempts.
- Home: "Recommended for your role" cards show the course cover; "My learning path" rows show the course thumbnail. All ten demo courses have covers, including drafts shown to learners (Coaching Conversations).
- Tests: `tests/e2e/v41_e2e.py` (13 checks); two DB checks for migration 004.

## v40 (Question bank: edit questions)
- Question bank: every row has **Edit**, and the question preview has **Edit**. Both open the same editor as "+ Add question", filled with the saved question; the title reads "Edit question · QB-xxxx" and the button "Save changes".
- Saving updates the question in place: id, reference, author, created date, usage and archived status are kept; the edit date and editor are recorded, and an audit entry "Edited question" is written.
- Pictures, audio and video that were not changed keep their stored file. All validation from Add applies.
- A question already used in quizzes shows a note in the editor ("Used in N quizzes across N courses…"): changes apply to new attempts; results already recorded are not re-marked.
- Test: `tests/e2e/v39_e2e.py` (25 checks), added to `npm run test:e2e`.

## v39 (UI: IMS colours, course covers, Users toolbar)
- IMS palette from the logo, as CSS tokens in `css/styles.css` (`--ims-*`). Navy kept for header, headings and dark cards. Buttons and links: `#0066A1`; success and Resume: `#007A4D`; logo blue/green (`#0B80C0`, `#08AE6E`) for fills and bars only. The pink "+ Create account" button is now IMS blue.
- Home: the Continue learning card shows the course's uploaded cover on the right (navy fades into it); no cover = plain navy card; on phones the cover is a strip on top. The play icon on Resume is white.
- Course covers for every published demo course (`assets/courses/`, `js/data/course-images.js`); drafts stay without one.
- Users & accounts: one toolbar row: search, Status and Role dropdowns, people count, Export ▾ (CSV) and + Create account ▾ (Single account / Bulk upload). Escape or clicking outside closes the menus. Wraps to two rows under 900 px.
- Tests: the three e2e flows that opened the create form now pick "Single account"; the v36 filter-label check reads the dropdown options.

## v38 (backend hardening, in progress)
- Migration `003_v37_audit_tz_limits.sql`: audit rows store a field-level before/after diff; `sf_today()` reads `sf_setting.org_timezone`; 512 KB cap per `sf_doc` row; per-user rate limit on `sf_save`/`sf_delete`; `sf_docs_by_paths` for `learning` `sign`.
- `admin-users`: bulkCreate max 100 per call (browser chunks, reports progress, can resume); 500 errors return a reference id instead of the internal message; `claims()` documents and tests its `verify_jwt` dependency.
- `learning` `sign`: no documents read when every path is course content; otherwise only matching documents.
- `ORG_ID` has no default; a connected app or build refuses to start without it.
- Removed dead code in `Identity.rename` (`backend.js`).

<!-- from V37-CHANGES.md -->
## Skillforge V37 changes

### IMS visual rebrand
- Replaced the warm orange/tan visual system with an IMS blue and green system.
- Primary interactive and focus colour: IMS blue `#1F4E79`.
- Dark navigation and headings: deep navy `#16324F`.
- Positive and secondary accents retain the established green family (`#3E8E7E`, `#14B8A6`, `#22C55E`).
- Warm cream surfaces, borders and muted text were converted to cool blue-grey equivalents.
- Destructive/error semantics remain red rather than being recoloured green.
- Updated certificate artwork and chart palettes along with the source UI.

### Scope control
- No LMS workflows, permissions, report calculations, SQL migrations, RLS policies, routes or role logic were intentionally changed.
- `dist/` is regenerated from `public/` by the existing build command.

### Verification
- Run `npm test`, `npm run test:e2e`, `npm run test:db`, `npm run test:load`, `npm run build`, and the repository CI/security workflows in an environment with their declared dependencies.

<!-- from V36-CHANGES.md -->
## Skillforge V36: UI/UX fixes, honest actions, Kirkpatrick in Reports, full sweep, DB hardening, CI/CD

Built on V35. Covered by `tests/e2e/v36_e2e.py` (47 checks) and the new full sweep `tests/e2e/sweep_e2e.py`.

### Users & accounts
- The Actions column no longer covers **Terms** and **Last active** (columns tightened; fits every desktop width).
- Six unlabelled icons per row replaced by one **Manage** button with labelled actions: View learning, Assign or unassign courses, Assessment attempts, Edit details, Reset password, Deactivate.
- **Deactivate and reactivate always ask first** (single and bulk), explaining what happens.
- Filter chips: **All statuses** and **All roles**. **View learning** opens Reports for that person (was a message only).
- "Reset password to Pass@123" tooltip removed; create button says **Create account** (no invite e-mail is sent).
- Long custom role names shorten with "…" and show in full on hover. Row tick-boxes are named checkboxes for screen readers.

### Learner home
- **Continue learning** in the first screen on laptop and phone; five tiles became one compact summary line.
- Feedback requests and announcements moved below Continue learning / Due soon.
- Announcements: lighter amber for Important (not black), Important first, one at a time with "Show all".
- Phone: the menu shows a soft edge and thin scrollbar when more tabs exist.

### Course player
- The menu highlights where you came from (Home, My learning or Catalog); it always said Catalog.
- Timer wording: "Take your time. This step is marked complete in 45s, and then you can continue." Same rule; not announced to screen readers every second.
- Phone: Previous / Next pinned at the bottom of every step; messages appear above it.

### Messages
- Stay up 2.6–7 s by length, can be closed with ✕, announced through a permanent live region.

### Fixed "it said it did something, but nothing happened"
- **Audit log Export** downloads a real CSV. Offline the screen shows sample history plus every admin action in the session (deactivate/reactivate, password reset, account create/edit, role change, course publish, dashboard delete, reminders); connected it reads the database audit trail.
- **Reminders** (Users, Feedback, Manager team): offline they reach the person's bell; connected the app says e-mail isn't connected and nothing was sent.
- **Gradebook** shows real results with paging and search; trainers see their batch trainees, admins everyone; **Export CSV** downloads a real file.
- **My progress**: time, certificates and skills come from the person's records (were fixed samples). Empty states added.
- **Leaderboard**: connected, a note explains rankings need the server ranking job.
- **Logo upload** and **Retry sync** no longer claim success; Integrations labelled **Sample data**.

### Kirkpatrick L1–L4 analysis is now in Reports
- First report card. Settings › "Kirkpatrick analysis" and any old link open it there.
- People with the *Training feedback* permission see it (plus the "Feedback responses (Kirkpatrick)" row report) without getting other reports. Trainers with only *course completion* see the same reports as before.

### Full sweep and the fixes it found
`tests/e2e/sweep_e2e.py` opens every screen as learner, trainer and admin, on laptop and phone, clicks every visible button, and checks script errors, sideways scroll, unnamed buttons, covered buttons, broken images, unsafe links, tap targets and untrue "sent" messages. Runs in CI and uploads a JSON report.
- Edit details from Manage left the menu open behind the edit window (also caught by the old backend test).
- Phones: Discussions reply box, lesson tabs, Gradebook header, batch trainer bar, Users role chips, Analytics bars, Branding preview and Learning paths widened the page.
- Phones: back links, "View all", "Show all", "Give feedback", ✕ buttons, question bank and certificate field names now 28–32px to tap.
- 30 on/off switches, the colour swatches and the Learning paths order switch now have names.

### Database (`supabase/migrations/002_v36_hardening.sql`)
Audit rows only for changes really stored (AFTER trigger); max 500 rows per save/delete call; audit index and retention function. See `docs/RLS-AND-ACCESS-REVIEW.md`.

### CI/CD
`cd.yml` (staging → approval → production, pre-deploy DB dump, smoke check), reusable deploy action, `codeql.yml`, `dependabot.yml`, secret scanning; CI also runs the sweep. See `docs/CICD.md`. Bucketization opinion: `docs/BUCKETIZATION.md`.

### Not in this build
E-mail delivery; server-side leaderboard; error monitoring (Sentry); MFA/SSO; verifiable certificates; server-side paging for 3,500+ users.

<!-- from V35-CHANGES.md -->
## Skillforge V35: UI/UX bug fixes only

No features, screens, wording or layouts changed apart from the fixes below.

### Bugs fixed
1. **Documents:** a blocked pop-up no longer counts as "Opened", so a mandatory document can't be acknowledged unseen. (`admin/documents.js`)
2. **Documents:** a download without a stored file name gets the correct extension from the real file type instead of always `.pdf`.
3. **Leaderboard:** the podium no longer shows empty places when fewer than 3 people are on the board. (`learner/dashboard.js`)
4. **Leaderboard:** you always appear on your own board, even with 0 XP.
5. **Leaderboard:** avatar colour comes from the person's name, not their rank.
6. **Dashboards:** the delete prompt says how many scheduled e-mails are removed with the dashboard. (`admin/dashboard.js`, `index.html`)
7. **Dashboards:** CSV export lists visuals it can't include (batch tables, plain heat maps, radar rows past 60) in the file and in the message.
8. **Dashboards:** Duplicate opens the copy in edit mode, so Cancel discards it (same as + New).
9. **Dashboards:** picking a division clears a sub-division that belongs to another division.

### Accessibility
- Visible keyboard focus ring (`:focus-visible`) on every control, including upload buttons.
- Login animations stop when the device asks for reduced motion.
- Dashboard source label darker and larger (meets 4.5:1 contrast).
- All on/off switches announce `role="switch"` and `aria-checked`. The view engine used to drop `aria-checked="false"`; it now keeps it.
- Messages (toasts) are announced to screen readers (`aria-live="polite"`).

### Forms
- When input is changed automatically (< or > removed, too long, above maximum), a message says why.
- The minimum number is applied when you leave the field, not while typing.
- CSV upload buttons show "CSV · up to 10 MB" before you pick a file.

### Layout
- Course assignment pop-up fits narrow screens.
- Two-column pages with a 400px side panel stack below 1000px.
- Feedback rows stack on phones.

### Tests
- `npm test`: 52/52. E2E: offline 6/6, backend 61/61, SCORM isolation 18/18, analytics/docs 59/59, numbers 28/28, v30 19/19, attack 16/16, v31 6/6, v32 16/16, v33 23/23, **new v35 11/11** (also run against the built `dist/`).
- Not run here: `test:db` (needs PostgreSQL), `test:stack` (needs Deno/Supabase), `test:load`.

<!-- from V34-CHANGES.md -->
## v34 — security fixes (from the v33 review)

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

### Also in this build
- `public/vendor/supabase.js` (supabase-js 2.45.4) and its `.sha384` are now included, so `npm run build` works without `npm run vendor`.
- The "reset password" dialog no longer promises `Pass@123` when connected (the server issues a random one-time password, shown after confirming).
- Load test (20,772 rows, 3,520 people) after the extra session lookup: learner 42 ms, trainer 88 ms, admin 279 ms, directory 19 ms.

### Verified here
- `npm test`: 52/52 (content site + `content` function run together; sessions; CSP build).
- `npm run test:db` on PostgreSQL 16: 95/95, including known-address throttle, `ip_fail_limit`, revoked / foreign / malformed session ids, revoke-all-but-one.
- Browser suites (source and bundled build): see the final message.

### Not verified here (needs your Supabase / Cloudflare)
- `deno check` of the three functions and the Edge Functions on the real runtime (CI job `supabase-stack`; its new checks are written but not run).
- That GoTrue puts `session_id` in access tokens and that `postgres` may delete from `auth.sessions` on your project (both are standard on current Supabase; the migration treats a token without `session_id` as unchecked).
- Auth password rules and `config push` on the hosted project: confirm in the dashboard.
- Edge Function invocation volume of `content` against your plan.

### Not changed
- Cross-organisation password reset in `admin-users` (single organisation).
- SCORM completion is still reported by the package's own browser (server only enforces open step + minimum time).
- Realtime fan-out, MFA, penetration test.
- An insider on the same office address can still pause a colleague's employee-ID sign-in from that address (5 failures, growing wait). E-mail sign-in is unaffected.

<!-- from V33-DETAILED-SCAN.md -->
## Skillforge v33: detailed scan of the areas no earlier round had reviewed

Baseline first: v32 as uploaded passed every suite (unit 44/44; offline 6, analytics & documents 59, numbers 28, Training/MIS 19,
v31 6, v32 16, attacks 16, database rules 59, SCORM 18).

This round covered gamification, notifications, calendar, discussions, bulk user upload, account settings, certificates, migration
import, room booking and account expiry. Every problem below was **proved on v32** (the new checks in `tests/e2e/v33_e2e.py` and
`backend_e2e.py` fail on v32) and is fixed in v33.

### Crash
1. **Deleting the open discussion froze the whole app.** The discussions code runs on every screen and crashed when the selected
   thread no longer existed, so no screen could open any more. With no discussions at all (a fresh database) the same happened.
   It now falls back to the first discussion, or shows an empty page.

### Everyone saw the same person's data (gamification, notifications, calendar)
2. **XP was one number for everyone (8,420), and every leaderboard said “Maya Okafor (you)”**, including for trainers and admins.
   The company board was a fixed sample list. XP now comes from each person's own records (50 per module, 100 per course, plus
   assessment scores, plus imported completions), so it is the same on every screen and device, survives a refresh and can't
   be farmed by retaking a quiz. The team board is people with the same manager (or department), the company board is everyone,
   and "you" is the signed-in person. People who switch the leaderboard off are now left out of other people's boards (before,
   the switch only changed their own label).
3. **The bell showed the same sample messages to everyone**, e.g. "Daniel Reyes replied to your discussion" shown to Daniel Reyes,
   and a certificate that doesn't exist. It now shows the person's own courses due within 7 days or overdue, their expiring or
   expired certifications, replies to their discussions, approvals and required reading. "Mark all read" is per person, and the
   In-app / Due-date switches in Preferences are honoured.
4. **The calendar showed sample due dates, not the person's.** It now shows their own due dates and the batches they train or attend,
   with the organisation's sessions.
5. **Calendar sign-ups and discussion votes were shared by everyone in the tab and lost on refresh**, and sign-up said "join link
   sent" / "calendar invite sent" when nothing is sent. Both are now per person, saved with their preferences, and the wording is honest.

### Bulk user upload
6. **A rejected row was applied anyway.** A row whose name didn't match the existing account was reported as rejected, but its other
   columns (designation…) had already been written.
7. **The Division column filled only the department**, so everyone uploaded showed as "Unassigned" on every division dashboard and in the MIS.
8. **A Reporting Manager given as an employee code** (as HR files usually have it) wasn't linked to the manager. It now is.

### Accounts and sign-in
9. **AccountExpiryDate was never enforced.** An expired account could sign in forever. Now it can't sign in offline, the server
   refuses it, and the database gives it no access (checked in `sf_ctx`).
10. **Changing your password in Account settings failed when connected.** It called a function that doesn't exist. The screen
    also accepted 8-character passwords that the server refuses (it needs 10+ with upper, lower and a number). Both are fixed.

### Data quality
11. **Impossible dates were accepted** (31 February) in migration imports and bulk course assignment; the browser silently turned
    them into 3 March. Real dates only now.
12. **Every learner got the same certificate ID for a course**, so IDs couldn't verify anyone. IDs are now unique per person, course
    and completion date and printed on the certificate. Expired re-certifications show in red (they always showed "Valid"), long names
    and titles shrink to fit instead of running off the page, and the printed name leaves out the "(employee ID)" added to tell
    two people with the same name apart.
13. **A training room could be double-booked**, or booked while under maintenance (warnings only). Both are now refused when the
    room or dates change. A trainer already running another batch on the same days is shown as a warning (co-training exists).

### Tests
Unit 44/44 · v33 23/23 (new) · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS 19/19 · v31 6/6 ·
v32 16/16 · attacks 16/16 · database rules 61/61 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16,
v32 16/16, v33 23/23. Dashboard numbers compared with v32: 18,925 values, all identical. Every screen opened for Learner,
Trainer and Admin (123 screen loads): no errors, nothing blocked.
Proof on v32: the v33 suite fails 19 of its checks there (the rest could not run because of the discussion crash, and were
proved separately), and the database-rules suite fails the 2 new checks ("Backend.changePassword is not a function"; an
expired account could still read 3 batches).

### Still open
Run `npm run test:db` on real PostgreSQL (the new expiry rule included), an independent penetration test, MFA, rate limiting and
the e-mail delivery job. Organisation sessions on the calendar are still sample events (there is no screen to create them yet).

<!-- from V32-RECHECK.md -->
## Skillforge v32: second full recheck (areas not covered by earlier audits)

All earlier suites were run again on v31 first: unit 43/43 and every browser suite passed (209 checks).
This round reviewed the areas no earlier audit had covered: course editing, due dates, how completions are stored,
assessments offline, essential training, learning paths, deactivation and access-request approval.
Every problem below was **proved on v31** by `tests/e2e/v32_e2e.py`, `backend_e2e.py` or `learning-core.test.js`
(those checks fail on v31) and is fixed in v32.

### Data integrity
1. **Editing a course moved people's progress onto the wrong steps.** Completions are stored by step position. Reordering,
   removing or inserting a step left them at the old positions: a quiz score could land on a document, and a removed first step
   shifted everyone. Steps now have a stable id, and saving moves every person's records with their steps (completions of
   removed steps stop counting, and the editor says how many). When connected, only admins can do this on a course that people
   have progress on, because only admins can rewrite learning records.
2. **959 of the 1,000 sample courses could not be edited.** They shared a title with another course, so Save always said
   "Another course already uses this title". Sample titles are now unique, and a title clash only blocks *changing* to a
   taken title (imported or migrated courses that already share a title can still be edited).
3. **A completed step was stored as `true`, not a date** (marking a document or lesson complete offline). Dashboards, reports
   and Engagement trends had no completion date for it, and the course page showed it as completed "today" every day.
4. **Passing an assessment offline didn't reach the dashboards.** My learning said Completed, while dashboards, reports and
   Power BI files said In progress. Passed assessment steps (including after a trainer rates written answers) are now
   recorded with date and score, as the server does when connected.

### Dates
5. **Due dates were fixed calendar dates in the code** (new course: 30 Nov 2026; assignments: 31 Oct 2026). After those dates
   every default would be in the past, and App settings › Default due date was ignored. Defaults are now today + the
   App settings value.
6. **A course could be published with a due date in the past.** Everyone in the audience was assigned already overdue
   (the test published to 3,322 people). This is now refused, and the team-assign pop-up checks it too.
7. **Extending an essential-training due date didn't stop the overdue pop-up.** The pop-up used the rule's deadline, not the
   person's own due date. It now uses the person's due date, and an unassigned essential course no longer triggers it.

### Learning paths (were mostly sample text)
8. **Every learner saw the same "Customer Success Essentials" path** (three fixed courses plus invented "Final assessment"
   and "Certificate" steps). The card now shows the path that covers the learner's own courses, or is hidden.
9. **Auto-enroll did nothing and "enrolled" was a fixed number.** Save now assigns the path's courses to the people the rule
   covers (Department, Role, or New hires in the last 30 days), keeping existing due dates. "Enrolled" counts the people who
   have every course of the path. A path containing a deleted course used to crash the screen.

### Security
10. **People deactivated in bulk (or by a ZingHR leaver sync) kept their database access.** Only the single-person switch
    disabled the login. The database now marks the login inactive whenever a person's row says Deactivated, whoever changed
    it (trigger `sf_user_active_sync`), so every rule refuses them at once. Bulk deactivation also disables each login on the
    server, and reactivating restores access.
11. **Access-request approval accepted any due date from the browser** (in the past, or decades ahead), could approve a
    course that had since been unpublished, and let someone with the assignment permission approve their own request.
    The server now refuses all three.

### Tests
Unit 44/44 (1 new) · v32 16/16 (new) · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS 19/19 ·
v31 6/6 · attacks 16/16 · database rules 59/59 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16,
v31 6/6, v32 16/16. Dashboard numbers compared with v31: 18,925 values, all identical (sample course titles changed, totals didn't).

One existing test was order-dependent: "step completion still enforces the server rules" tried to complete the assessment step,
which an earlier check sometimes passes, so it passed or failed by chance. It now picks an assessment or SCORM step that isn't done.

### Still open
Same list as v30/v31: run `npm run test:db` on real PostgreSQL (the new trigger included), get an independent penetration
test, switch on MFA, add rate limiting, and build the e-mail delivery job. SCORM completion is reported by the learner's browser.
When connected, saving a Learning path assigns courses only if the editor also has the Course assignment permission.

<!-- from V31-RECHECK.md -->
## Skillforge v31: full recheck of v30

### What was run (on the V30 zip, unchanged)
Unit 43/43 · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS & certificates 19/19 · attacks 16/16 ·
database rules 55/55 · SCORM 18/18. The shipped `dist/` (GitHub Pages build) was rebuilt from `public/` and is byte-identical.

### Logic traps found in the fresh review (all in V30, proved by tests/e2e/v31_e2e.py, fixed in V31)
1. **Idle sign-out interrupted learning.** A learner watching a video or working in a SCORM package without clicking was signed out
   after 30 minutes, in the middle of the module. Playing media and an open SCORM package now count as activity (only when the tab is visible).
2. **Idle sign-out left the previous person's data in memory (connected mode, shared PCs).** Manual sign-out reloaded the page; idle
   sign-out didn't, so settings the next person couldn't read (dashboards, KPIs, schedules) stayed in the tab. It now signs out
   and reloads, then shows why.
3. **Reset layout on a dashboard you created** replaced it with the Learning overview charts (on a Training board too). It now
   returns the board to the layout it was created with.

4. **Reports counted 2 fewer assignments than the dashboards** (124,570 vs 124,572): reports used Active people only, dashboards
   and statistics also counted Invited people, who already have courses due. Reports now use the same rule. Dashboards, statistics
   and the All course completion report agree on assignments, completed and overdue.

### Tests after the fixes
Unit 43/43 · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS & certificates 19/19 · attacks 16/16 ·
v31 6/6 (new) · database rules 57/57 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16, v31 6/6.
Dashboards, statistics and reports agree: assignments 124,572 · completed 40,096 · overdue 17,382 · certificates 15,698.

<!-- from V30-CHANGES-AND-SECURITY.md -->
## Skillforge v30: editable Training overview & MIS, certificates per course, attack-tested hardening

### Training overview & MIS: everything is editable
- **Bug fixed (it predates v27):** Customise on the Training overview changed whichever *Analytics* dashboard had been opened last.
  Removing a visual on Training overview removed it from Learning overview. Edits now always go to the board on screen.
- **The MIS tab is a dashboard.** Its handover pipeline and attrition trend are now visuals. You can add any visual (KPIs, ★ custom
  KPIs, heat maps, spider webs…), remove, reorder and resize them, and Save or Cancel.
- **+ New dashboard on the Training page.** New boards appear as their own tabs and can start from any template. They stay on the
  Training page (editors only), not among the Analytics dashboards.
- **KPI tiles** (Customise › Edit KPI tiles): show or hide, rename, reorder, and add a tile for any training measure or ★ custom KPI.
  These are part of the Customise session (Save keeps them, Cancel undoes them). Master data › Tile management still works.
- Built-in tabs (Overview, MIS, Attrition) can be reset but not deleted.

### Certificates are per course
- A certificate is issued only when the course has **Certificate** switched on. New courses start with it **off**.
- One rule (`Progress.hasCert`) is used everywhere: My learning certificates, reports, Engagement trends, dashboards (new measure:
  *Certificates issued*) and the Power BI learning file (new column: Certificate issued).
- The sample catalogue now has a realistic mix (about 40% of courses issue certificates).

### Security: attacks run against the app (tests/e2e/attack_e2e.py + backend_e2e.py)
| Attack | Result | Fix in v30 |
|---|---|---|
| Stored XSS: script/img/svg payloads in names, titles, posts, documents, KPIs, badges, batches, modules (18 screens) | Nothing runs; shown as text | Already safe (no HTML rendering); now tested |
| `javascript:` / `data:text/html` / `vbscript:` / protocol-relative links stored in module, meeting and file URLs | Never rendered | **Engine-level URL guard on every bound href/src/action/poster** |
| CSS injection through a colour field (`red;background:url(…)`) | **Was possible** (CSP blocked the request) | **Bound style values can't add declarations; url() only to this site, blob, data:image or Supabase storage; CSS escapes refused** |
| Prototype pollution: a person named `__proto__`, rows carrying `__proto__`, merges | Blocked | **Reserved names get the employee ID added; `__proto__` keys removed from all database rows and merges; template paths can't reach constructor/__proto__** |
| Server action named `constructor` / `toString` | **Was accepted** (passed the "unknown action" check) | **Own-property lookup; reserved values refused as ids** |
| Learner: grant own role permissions, change membership role, write KPIs/boards/schedules, forge acknowledgements or sign-ins, publish a document, edit an account, read others' sign-ins or KPI formulas | All refused | Database rules (and their test mirror) |
| CSV formula injection (`=HYPERLINK`, `+cmd`, `@SUM`) | Neutralised on export | (v28) now tested |
| 11 MB CSV upload / 100k-character or 3,000-deep formula | Refused instantly | **10 MB CSV limit on every picker** |
| Clickjacking: another site frames the app | **Was possible on GitHub Pages** (headers aren't sent there) | **The page hides itself when framed by another origin** |
| Session left open on a shared training-room PC | **No timeout** | **Idle sign-out (App settings, default 30 min, 0 = off), shared across tabs** |
| Reverse tabnabbing | All new-tab links use noopener | Tested on every screen |

The engine logs a console warning whenever it blocks a value. A crawl of about 60 screens and tabs with normal data produced none,
so nothing legitimate is lost.

### What is still open (an honest list for reviewers)
1. **SQL not executed in this environment** (no PostgreSQL here). The database rules are tested through a JavaScript mirror.
   Run `npm run test:db` (CI on real PostgreSQL) before deploying, and keep the mirror in step with the SQL.
2. **Independent penetration test** by a third party before production. Automated tests prove what was tested, nothing more.
3. **SCORM completion** still comes from code running in the learner's browser (inherent to SCORM). Use server-graded assessments for compliance.
4. **Offline demo mode is not a security boundary**: anyone can edit browser memory. Use it with sample data only.
5. **No rate limiting on the Edge Functions** beyond Supabase's platform limits; add it at the API gateway for production.
6. **MFA** must be enabled in Supabase Auth (and on GitHub, Supabase and Cloudflare accounts). The app doesn't enforce it itself.
7. **E-mail delivery** for schedules and reports needs a server job (not built).
8. `style-src 'unsafe-inline'` is required by the design (bound style attributes). It is mitigated by the engine's style guard.

<!-- from V29-AUDIT-FIXES.md -->
## Skillforge v29: audit fixes (data flows, numbers, loopholes)

Every number that was right in v28 is unchanged: 39,879 dashboard values were compared with v26, and the only
differences are the ones listed below, which were wrong before.

### Security
1. **Dashboards: one database row per board, custom KPI and schedule.** Viewers (dashView) receive only the boards shared with
   everyone or with their role. KPIs, schedules and templates go to dashboard editors only. Before this, the whole settings row,
   including other roles' boards and recipients' e-mails, was readable.
2. **Viewers see a published snapshot.** Saving a board (or "Publish for viewers") stores its aggregate numbers, computed for the
   whole organisation. It holds no learner records, employee IDs or option lists. Viewers' own access cannot read the records,
   so a live calculation used to come out empty or partial without saying so. Viewers have no filters, drill-through or export.
3. **Schedule recipients are checked by the database** (`sf_sched_guard` trigger: 1–20 recipients, organisation domains only),
   for every writer including admins. A refused row is now removed from the screen. Before this, refused **new** rows of any kind
   stayed on screen; that is fixed for all collections.
4. **No raw-data export for viewers.** The "Export data" button is hidden for them and refused if called.

### Numbers
5. **Attrition = left after joining ÷ joined.** "Did not join" is shown beside it, the same as on the batch page. This fixes 2.6% → 2.3%,
   and also rates that were **above 100%** (121–183%) when split by attrition reason, category, responsibility or month.
6. **Day-1 attendance functions return no value (—) when nobody was marked that day**, instead of 0 or "on target".
   **PCT, DIV and / by 0 also give no value.** `NZ(a, 0)` turns that into 0 when you want it. 17 of 152 batches showed perfect day-1 figures before.
7. **Completion month holds completed assignments only**, so rates and status counts on it show — (they always read 100%). A new
   **Due month** dimension covers every assignment.
8. **HRMS joined on day 0 counts New Hire batches only** (trainee type chosen at batch creation), only batches that have started,
   and only people with a date of joining on or before the start. New field: `day1_unmarked` (started batches with no day-1 mark).
9. **People (HRMS): joiners default to the last 30 days** when no dates are set (it used to count everyone).
10. **People = active + invited** (current headcount, like the learning data). A new measure, "All accounts", includes deactivated.
11. **Completions imported from another LMS count as completed** on the dashboards, Power BI files and reports, the same as on My
    learning. The dashboard cache now refreshes when imports arrive.
12. **Power BI files use exactly the dashboard's filters**, including the From–To dates for the learning facts.
13. **Six reports and Engagement trends now use real records** (they were generated by a formula):
    User learning, Course completion, User login, Course-wise, Quiz performance, Certification & compliance, Engagement trends,
    and the admin "needs attention" counts. Columns that had no data were replaced: rating became Overdue, session length
    became First recorded. Sign-ins are now recorded by the server from v29 on.
    The report buttons that claimed to e-mail, save or PDF but did nothing now say what really happens (Print / PDF opens the print dialog).

### Data flow
14. **Filters and edit mode are per person and per session**, not saved for everyone.
15. **Drill-through lists refresh** when enrolments, completions, imports or attendance change.
16. **A document is saved only after its file has uploaded.** A failed upload saves nothing, and the browser warns before you close a
    tab with an upload still running (documents and course files).
17. **One time zone (Asia/Kolkata, `ORG_TIMEZONE`)** for dates on the server and in the database. The server stamped completions in
    UTC, so a completion between 00:00 and 05:30 IST was dated the day before. This existed before v27.
18. Division by zero behaves the same everywhere (see 6).
19. **The dashboard cache is bounded** (32 entries), so memory no longer grows over a long session.
20. **A deleted KPI is reported on its visual**, instead of the visual silently showing another measure. The KPI builder flags
    formulas that no longer work.

### Tests
Unit 43/43 · offline 6/6 · analytics & documents 59/59 · **v29 numbers 28/28 (new; each fix checked against a recount)** ·
backend & access-rule mock 48/48 (8 new) · SCORM 18/18.
The SQL in `supabase/migrations/001_skillforge.sql` could not be run here (no PostgreSQL in this environment). The browser tests
use a JavaScript copy of the rules. Run `npm run test:db` (CI, real PostgreSQL) before deploying.

### Deploy
Re-run the migration, set `ORG_TIMEZONE` for the `learning` function (default Asia/Kolkata) and redeploy it. Existing v28
dashboards are split into the new rows automatically the first time an editor saves.

<!-- from V27-V28-CHANGES.md -->
## Skillforge v27 + v28: Analytics Studio and Documents library

Nothing that existed before was removed or changed in behaviour. Every number the v26 dashboards showed was re-checked
after the change: 3,619 values across three filter combinations, plus the Training overview KPI tiles. All of them were identical.

### v27: Analytics Studio
- **KPI builder** (Settings › Reports › KPI builder): your own KPIs as formulas, e.g.
  `hrms_joined_day0 - ABSENT_DAY(1)` (joined on day 0 as per HRMS minus absent on training day 1).
  Fields from three datasets, attendance functions for training days 1–30, + − × ÷, IF/GT/LT/…, PCT, DIV, ROUND, MIN/MAX.
  KPIs can use other KPIs (loops are refused). Live preview, total and top-6 breakdown. Number/percent/decimal, decimals,
  targets with green/amber/red, "higher/lower is better". Saved KPIs appear as ★ measures in every visual.
- **New dataset: People (HRMS employee master)**: status, division, location, designation, joining month.
- **New visuals**: spider web (radar), gauge, treemap. Heat maps now take **any two dimensions** and any measure, including custom KPIs.
  Tables can have any columns you choose, including KPIs.
- **Drill-through**: click a bar, slice, cell, point or row to see the records behind it (paged, CSV).
- **Templates**: Induction & day-1 attendance, Trainer effectiveness, Attendance heat map, Workforce (HRMS), Compliance watch,
  plus "Save as template" for your own.
- **Datasets & fields** tab: every field, dimension and attendance function.

### v28
- **Dashboard sharing**: each dashboard can be limited to chosen roles. A new permission, *dashView*, lets a role view the
  dashboards shared with it without being able to change, schedule or export raw data.
- **Schedules**: daily, weekly or monthly, with recipients restricted to your organisation's own e-mail domains (max 20).
  Schedules are saved. **E-mail sending needs a server job, and that job is not in this build.** "Run now" downloads the same CSV.
- **Power BI data**: flat CSV tables (training facts, learning facts, people, data dictionary) with page filters applied.
  This is a file export for Power BI's *Get data › Text/CSV*. It is not a live connector.

### Documents library (everyone)
- A **Documents** menu item for every role: search, categories, required-reading filter, open, download.
- **Management** (Settings › Communication › Documents library, permission *documents*): upload PDF/Word/PowerPoint/Excel/PNG/JPG
  (25 MB max), audience by user type, effective, review and expiry dates, Draft/Published/Archived, view-only, tags, categories.
- **Versions**: every version is kept with a change note. A new version can ask everyone to acknowledge again.
- **Required reading**: the reader must open the document before "I have read and understood" is accepted. Pending items appear in the bell.
  The acknowledgement report shows counts, a per-person list and a CSV.

### Security
| Area | Control |
|---|---|
| Formulas | Own parser and evaluator. No `eval`/`new Function` (CSP blocks them anyway). Field names are looked up as own properties only (no `constructor`/`__proto__`). Limits: 500 characters, 200 tokens, 24 levels of nesting, 8 levels of KPI references. |
| CSV exports (all, app-wide) | Formula-injection guard: cells starting with `= + - @` get a leading `'`. Numbers are kept. |
| Drill-through & Power BI files | No names, e-mails or phone numbers in Power BI files. Drill rows show work identity only. Viewers cannot export them. |
| Schedules | Recipients must be on the organisation's own domains. |
| Dashboard viewers | Can't edit, create, schedule or export. They can't open the KPI builder or Training MIS. RLS still limits the data they see. |
| Documents: visibility | Status, audience and dates are enforced in **3 places**: database policy (`sf_read_ok`), Edge Function (file signing), and the app. |
| Documents: files | File type and extension must match, and the content signature is checked. SVG and archives are refused. Storage write/read under `org/docs/` needs *documents*. Learners get signed links only for the **current version** of documents they may see. |
| Documents: links | Only `https:`, this tab's `blob:` and shipped `assets/` paths (no `..`). Opened with `noopener,noreferrer`. |
| Acknowledgements | Written by the server (`docSeen`, server clock). This is a server-only collection, so browsers cannot forge it. |
| "View only" | It hides the download button. Anyone who can open a file can still save it, and the screen says so. |

### Tests
- Unit: 42/42 (10 new: formula engine, hostile inputs, KPI loops, document rules on the server).
- New browser test `tests/e2e/analytics_docs_e2e.py`: 59 checks. KPI values are recounted independently from raw batches.
  The drill count is checked against the chart value. Viewer limits, uploads (fake PDF/SVG refused), versions, acknowledgements and visibility dates are all tested.
- Existing suites still pass (offline, backend/RLS mock, SCORM isolation).

### To do before production
- Deploy the updated `supabase/migrations/001_skillforge.sql` and the `learning` Edge Function.
- Report e-mail delivery (server job) if you want scheduled e-mails.
- The data-volume notes from v26 still apply: at full scale, build Power BI extracts on the server.

<!-- from V26-SECURITY-FIXES.md -->
## Skillforge v26 security fixes

### Implemented in code

1. **Closed signed-file authorization bypass.** Learners can receive signed links only for exact file paths referenced by LCMS modules in courses assigned to them. Generic `courses/` and `certificates/` prefixes no longer authorize a file.
2. **Reduced signed-link exposure.** Signed URLs default to 10 minutes and are capped at 15 minutes through `SIGNED_URL_TTL_SECONDS`.
3. **Sanitized unexpected server errors.** HTTP 5xx responses now return a generic message and correlation ID. Full details stay in protected Edge Function logs.
4. **Added regression coverage.** Tests verify that guessed course and certificate paths are denied to learners.
5. **Added go-live gates.** Setup documentation now states the required controls for private storage, MFA, malware scanning, RLS testing and offline demo limitations.

### Already present and retained

- Server-side assessment grading and attempt limits.
- Random temporary passwords for connected accounts with mandatory first-login change.
- RLS-oriented collection controls and server-only SCORM sessions.
- Separate-origin SCORM execution, signed launch tokens and traversal defenses.
- CSP, HSTS, `nosniff`, restrictive referrer policy and permissions policy.
- Upload type/signature checks and SVG blocking.

### Requires deployment or external infrastructure

These cannot be completed by static source code alone:

- Deploying and validating Supabase RLS and Storage policies.
- Enabling MFA for GitHub, Supabase, Cloudflare and production administrators.
- Malware scanning/CDR service for uploaded content.
- Production secret rotation and access reviews.
- Short JWT expiry and revocation operating procedures.
- Independent authenticated penetration testing.
- Audit-log retention and alerting in the production environment.

The offline GitHub build remains a demonstration interface. It must contain synthetic data only and must not be considered secure authentication.

