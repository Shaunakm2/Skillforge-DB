Skillforge v41.26: submit can be finished by a retry, server-counted viewing time, passes follow re-rating, date unknown, weekend days

DEPLOY (in this order)
1. Extract. In GitHub: Add file > Upload files, drag the "public", "supabase" and "tests" folders in, commit.
2. npm run build, then commit dist/ (in a Codespace: CI fails if dist/ is stale).
3. Wait for the site to publish, THEN Actions > deploy-functions > Run workflow (deploys "learning" with the new learning-core.js).
   Site first, function second: a new page talking to the old function still works (the heartbeat is ignored); an old page talking to the
   new function cannot finish timed steps until it is refreshed.
4. Learners with the app already open: hard refresh (Ctrl+Shift+R) or sign in again.
5. No migration. Optional Edge Function secrets: SEAT_TIME_STRICT=false (back to the old viewing-time rule), SIGNED_URL_TTL_SECONDS (default 3600).

WHAT CHANGED (4 files + 2 test files)
- supabase/functions/_shared/learning-core.js
  * submit: the attempt is stamped, the records are written by steps that are safe to repeat, then the attempt is marked finalised.
    A failure in between leaves finalised:false and the learner's next "Submit" finishes the job (before: attempt used, no result, no pass).
    Attempts handed in before this version count as complete.
  * stepPing (new): viewing time is counted on the server from heartbeats, at most 45 s per ping and never more than the clock allows.
    completeStep needs the counted seconds. Rows opened before this version, and SEAT_TIME_STRICT=false, keep the old rule.
  * rescore + submit: a pass follows the attempts' current results. A lower re-rating removes the pass, or moves it to another attempt
    that still passes. Steps finished another way (viewed, accepted assignment, survey) are never touched.
  * < and > are refused with "the characters < and > are not allowed" instead of being removed without a word.
  * rescore no longer writes an empty record when the attempt record is missing.
- supabase/functions/learning/index.ts: passes seatStrict; file links last SIGNED_URL_TTL_SECONDS (default 3600) for everyone.
- public/js/core/backend.js
  * heartbeat while a step is open and the tab is visible (every 20 s, stops after 20 minutes, on completion, on another step, on sign-out)
  * file links: one lifetime for staff and learners (SIGNED_URL_TTL_SECONDS in js/config.js, default 3600) and renewed in the background
    when the page is used again after three quarters of it (was 8 hours for staff and 10 minutes for learners)
  * save retry: 8 s, 16 s, 32 s ... up to 5 minutes, stops after 10 failures in a row and says so; resumes on the next edit or when the
    connection returns (was every 8 s AND again after 0.3 s, for ever)
- public/js/core/progress.js
  * no assignment date recorded = "date unknown" (blank on screen, "Date unknown" in the completion CSV). It used to be invented as the due date minus 21 days.
  * Progress.workingDaysBetween returns null when a date is unknown (not 0): callers must treat null as "no value".
  * weekend days: Progress.configure(state) reads platform.defaults.weekendDays (0 = Sunday ... 6 = Saturday), default Saturday + Sunday.
  * Progress.orgToday(tz): today's date in the organisation's time zone (ORG_TIMEZONE in js/config.js, default Asia/Kolkata).

NOT DONE YET (needs the screen files): the Weekend days switch in App settings, wiring TODAY_KEY to Progress.orgToday(), and any screen that
used the invented assignment date (search: grep -rn "workingDaysBetween\|assignedOn(" public/js).

WHO IS AFFECTED
Learners: viewing steps now count only time the step is on screen and the tab is visible. A step opened and left in a background tab no longer completes.
Trainers/QA: lowering a rating below the pass mark now removes the pass (and any completion that depended on it).

TEST: tests/learning-v41_26.test.js (8 checks) and tests/progress-v41_26.test.js (4 checks). Run: npm test
