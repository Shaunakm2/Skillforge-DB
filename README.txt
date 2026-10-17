Skillforge v41.27 (includes everything in the v41.26 patch)
Reviewer findings, round 1 (correctness) and round 2 (unnecessary calls)

DEPLOY (in this order)
1. Supabase: SQL Editor > paste supabase/migrations/011_v41_learning_ctx.sql > Run. Safe to run twice. Put the file next to 010_public_brand.sql in
   the repo (if scripts/deploy-supabase.sh lists migrations by name, add it there). Skipping it is safe: the function falls back to four reads.
2. Extract. In GitHub: Add file > Upload files, drag the "public", "supabase" and "tests" folders in, commit.
3. npm run build, then commit dist/ (Codespace).
4. Once the site is live: Actions > deploy-functions > Run workflow.
5. Learners with the app open: hard refresh (Ctrl+Shift+R) or sign in again.
Mixed versions are safe in both directions except one: a page still on v41.25 cannot finish timed steps against the v41.26+ function until refreshed.
No new secrets. Optional: SEAT_TIME_STRICT=false (old viewing-time rule), SIGNED_URL_TTL_SECONDS (default 3600).
To see how long loading takes and which collections are big: add  LOAD_DEBUG: true,  to public/js/config.js, sign in, open the browser console (F12).

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
- tests/learning-v41_26.test.js (8), progress-v41_26.test.js (4), edge-ctx-v41_27.test.js (7, needs Node 22.13+, skipped on older), backend-v41_27.test.js (7)

ROUND 1 (v41.26), unchanged: atomic submit (resumable), viewing time counted by the server (stepPing), a pass follows re-rating, "date unknown"
instead of an invented assignment date, weekend days setting (Progress.configure), org-time-zone today (Progress.orgToday), < and > refused with a
message, one lifetime for file links, save retry with backoff. Still to wire: the Weekend days switch in App settings and TODAY_KEY -> Progress.orgToday().

TEST: npm test. Run npm run test:e2e too: the browser suites use tests/e2e/mock-supabase.js, and loading now asks it for one collection at a time
(.eq("coll", ...) with .order("key") and an .or(...) page filter); if that mock only understands the old whole-table query, a suite will fail at sign-in.
