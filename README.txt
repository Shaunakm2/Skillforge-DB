Skillforge v41.29 (includes v41.26, v41.27 and v41.28: use this package ALONE)
Reviewer findings: correctness, unnecessary calls, "today" in the organisation's time zone, weekend days setting, clean-up

DEPLOY (in this order)
1. Supabase: SQL Editor > paste supabase/migrations/011_v41_learning_ctx.sql > Run. Safe to run twice. Skipping it is safe (the function falls back
   to four reads). If scripts/deploy-supabase.sh lists migrations by name, add 011 there.
2. Extract. In GitHub: Add file > Upload files, drag the "public", "supabase", "scripts" and "tests" folders in, commit.
3. In the Codespace (git pull first), from the repository root:
     node scripts/apply-v41.29.mjs --dry-run     shows what it will change in helpers.js, masters.js, platform.js, database.js and index.html
     node scripts/apply-v41.29.mjs               applies it (safe to run twice; if a REQUIRED place cannot be found it writes NOTHING and says which)
     npm test                                    (includes tests/patch-v41_29.test.js and the assessment.js sync check)
     npm run build
     node scripts/prune-dist.mjs --apply         removes the old hashed bundles from dist/ (keeps the one index.html loads)
   then commit and push, including dist/.
4. Once the site is live: Actions > deploy-functions > Run workflow.
5. Learners with the app open: hard refresh (Ctrl+Shift+R) or sign in again.
Mixed versions are safe in both directions except one: a page still on v41.25 cannot finish timed steps against the v41.26+ function until refreshed.
No new secrets. Optional: SEAT_TIME_STRICT=false (old viewing-time rule), SIGNED_URL_TTL_SECONDS (default 3600).
To see how long loading takes and which collections are big: add  LOAD_DEBUG: true,  to public/js/config.js, sign in, open the browser console (F12).

WEEKEND DAYS, CLEAN-UP (v41.29)
- Settings > Master data > App settings > Defaults: new "Weekend days" buttons (Mon to Sun; selected = day off). Default Saturday + Sunday. At least one
  working day must remain. Saved with the other defaults (platform.defaults.weekendDays) and read by Progress.configure(), so it drives essential-training
  deadlines and working-day compliance. It does NOT change the holiday list check ("falls on a weekend") or batch training days (batches have their own
  "Saturdays are training days" rule); those still use Saturday + Sunday.
- downloadBlob() in helpers.js is the one place that saves a Blob as a file; csvDownload uses it and the patcher replaces every other copy it finds in
  public/js (xlsx.js, engine.js and unzip.js are left alone). Anything it could not convert is listed at the end of the run ("STILL BUILDS A FILE LINK BY HAND").
- Removed the unused permRows no-op from platform.js. TODAY_KEY is replaced by Progress.today() in platform.js, masters.js, database.js, helpers.js (defaultDue).
- scripts/prune-dist.mjs: removes the old hashed app bundles from dist/ (dist/ had 5, only 1 is loaded).
- scripts/check-unbound.mjs: lists the 13 handlers the reviewer named with where each is defined and whether the template uses it. Report only; delete
  the ones marked "NOT IN TEMPLATE" with no "other uses".
- tests/patch-v41_29.test.js: also fails when public/js/core/assessment.js and supabase/functions/_shared/assessment.js differ (run npm run sync-shared).

NOT DONE (needs your decision or more files)
- The 13 unbound handlers are not deleted: I have not seen the files that define them. Run  node scripts/check-unbound.mjs  and send me the output (or the files).
- Duplicate learning rules in public/js/core/progress.js and supabase/functions/_shared/learning-core.js (viewing time, scoring): a design change, not a patch.
- README.md vs README.txt: README.txt is this per-release note; README.md is the standing guide. Not merged.
- docs/unused/*.UNUSED.sql, docs/archive/, 18 version-named e2e scripts: delete or keep as you prefer; nothing depends on them.
- Possible overlaps lcms.js / documents.js / courses.js, kpis.js / dashboard.js / reports.js, database.js / migration.js / user-import.js,
  questions.js / question-list.js / question-meta.js: needs a read of each; the reviewer marked them unverified.
- L&D critique (Kirkpatrick levels 3-4, answer reveal on retakes, role/risk-based deadlines): product decisions.
- Loading everything at sign-in for staff, signing staff files at boot, Realtime for every trainer: see the v41.27 notes below.

TODAY (v41.28): Progress.today()
- New Progress.today(): connected = today's date in the organisation's time zone (ORG_TIMEZONE in js/config.js, default Asia/Kolkata, the same default the
  server uses); offline demo = TODAY_KEY (the sample data is built around it). TODAY_KEY itself is not changed.
- Progress.js: "overdue" (a course due today is not overdue; due yesterday is), and the fallback dates for completion and start now use it.
  The per-course cache is also dropped when the date changes, so a tab left open overnight does not keep yesterday's overdue flags.
- app.js: default due dates (Assign courses, Course assignments), the Data migration report "to" date, the "joined" date of the first admin and the
  account-expiry check use it.
- Left on TODAY_KEY on purpose: the sample-data generators (seedRecords, ScaleData), the calendar's starting month, and the offline-only lesson/quiz
  completion stamps in app.js. They only run on the offline demo.
- ORG_TIMEZONE is optional in config.js: add  ORG_TIMEZONE: 'Asia/Kolkata',  only if your organisation uses another zone, and set the same value in the
  function's ORG_TIMEZONE secret and in sf_setting 'org_timezone' (migration 003).

ROUND 2: UNNECESSARY CALLS (v41.27)
- Opening a saved sign-in: was auth.getUser (network) + me + signedIn + directory one after another. Now ONE call (me): the saved sign-in is read on the
  device, "must change password" is read from the token, and me records the sign-in when the app asks (method). An older server still gets signedIn.
- Every "learning" request did four reads before the real work (session alive, member, expiry date, permissions). Now ONE database call,
  sf_learning_ctx (migration 011). Nothing is cached, so deactivating or resetting a person still blocks them on their next request.
- Reading the organisation's rows at sign-in: was one long chain of 1,000-row pages. Now one stream per collection, 6 at a time, and the
  directory of names (learners) is read at the same time. Same rows, same order within a collection.
- File links: a learner used to send every file path in the organisation to the function, which refused almost all of them. Now only paths that can
  qualify (files of assigned courses, documents) are sent, 200 per request, 3 at a time. Staff who sign their own links do 100 per request, 3 at a time.
- Account expiry on the sign-in screen is compared with today's date in the organisation's time zone (as the server does), not the browser's.
- Not changed: Realtime (see below), and that a person still loads every row they are allowed to read.

NOT DONE, AND WHY
- The load is still "everything the person may read". For learners that is small; for staff with Reports it is every learner's records, and
  it will not scale to 3,500 people. The real fix is to load per screen (reports and dashboards read from the server when opened). That needs
  the report/dashboard files and a decision on which screens come first. Use LOAD_DEBUG to see which collections are big before deciding.
- Files are still signed when the page loads for staff. Signing only when a file is opened needs the screens that read .src (player, documents, LCMS).
- Realtime: anyone with any permission (all Trainers by default) subscribes, and each event is checked per subscriber. On the Free plan the limit is
  200 connections. Who should get live updates is your decision; the line is in Backend.afterSignIn (search for "subscribe()").

FILES (the whole set, so apply this package alone)
- supabase/migrations/011_v41_learning_ctx.sql (new)
- supabase/functions/learning/index.ts
- supabase/functions/_shared/learning-core.js (v41.26)
- public/js/core/backend.js, public/js/core/progress.js, public/js/app.js
- tests/patch-v41_29.test.js (14), learning-v41_26.test.js (8), progress-v41_26.test.js (7), edge-ctx-v41_27.test.js (7, needs Node 22.13+, skipped on older), backend-v41_27.test.js (7)

ROUND 1 (v41.26), unchanged: atomic submit (resumable), viewing time counted by the server (stepPing), a pass follows re-rating, "date unknown"
instead of an invented assignment date, weekend days setting (Progress.configure), org-time-zone today (Progress.orgToday), < and > refused with a
message, one lifetime for file links, save retry with backoff. Weekend days: built in v41.29 (see above).

TEST: npm test. Run npm run test:e2e too (one more check: if an e2e test compares the default due date while connected, it must compare with Progress.today(), not TODAY_KEY): the browser suites use tests/e2e/mock-supabase.js, and loading now asks it for one collection at a time
(.eq("coll", ...) with .order("key") and an .or(...) page filter); if that mock only understands the old whole-table query, a suite will fail at sign-in.
