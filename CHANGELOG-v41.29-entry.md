## v41.29 (weekend days, clean-up), v41.28 (today in the organisation's time zone), v41.27 (unnecessary API calls) and v41.26
### v41.29
- **Weekend days are a setting.** App settings › Defaults › Weekend days (Mon–Sun buttons, default Saturday + Sunday, at least one working day must remain). Stored in `platform.defaults.weekendDays`; drives essential-training deadlines and working-day compliance (`Progress.configure`). Batch training days and the holiday list check keep their own Saturday/Sunday rules.
- **One download helper.** `downloadBlob()` in helpers.js replaces the "save a Blob as a file" code that was copied into several files.
- `permRows` (an unused no-op) removed from platform.js. `TODAY_KEY` replaced by `Progress.today()` in platform.js, masters.js, database.js and `defaultDue`.
- Tooling: `scripts/apply-v41.29.mjs` (the patcher), `scripts/prune-dist.mjs` (old hashed bundles in dist/), `scripts/check-unbound.mjs` (the reviewer's 13 unbound handlers).
- Tests: `tests/patch-v41_29.test.js` (14), which also checks that `assessment.js` is identical in `public/` and `supabase/functions/_shared/`.
### v41.28
- **`Progress.today()`**: the organisation's date when connected (ORG_TIMEZONE, default Asia/Kolkata), `TODAY_KEY` on the offline demo. "Overdue", completion/start fallback dates, default due dates, the migration report's end date, the first admin's joined date and the account-expiry check use it. The course-status cache is dropped when the date changes. Sample-data generators are unchanged.
- Tests: `tests/progress-v41_26.test.js` now has 7 checks (3 new, one of which fails against the old behaviour).
### v41.27
- **Opening a saved sign-in is one call.** `auth.getUser()` (a network call) is gone: the saved sign-in is read on the device and "must change password" from the access token's claims. `me` records the sign-in when asked (`method`), so the separate `signedIn` call is only made against an older server.
- **One database call instead of four for every `learning` request.** `sf_learning_ctx` (migration 011) returns session-alive, member, expiry date, record key and permissions together. Nothing is cached. Without the migration (or if the call fails) the function uses the four separate reads.
- **Faster load.** Rows are read one collection at a time, six at once; the learner directory is read in parallel. `Backend.loadStats()` and `LOAD_DEBUG` show rows and time per collection.
- **Learners ask to sign only files that can qualify** (assigned courses, documents), in 200-path requests three at a time; staff sign 100 per request, three at a time.
- **Account expiry** on the sign-in screen uses the organisation's date.
- Tests: `tests/edge-ctx-v41_27.test.js` (7), `tests/backend-v41_27.test.js` (7).
### v41.26
- **Submit can be finished by a retry.** The attempt is stamped as handed in, dependent records are written by steps that are safe to repeat, then it is marked finalised. A failure in between no longer leaves an attempt used up with no result. Attempts handed in before v41.26 count as complete.
- **Viewing time is counted by the server.** `stepPing` heartbeat (every 20 s while the step and tab are visible; at most 45 s per ping, never more than the clock). `SEAT_TIME_STRICT=false` restores the old rule. SCORM keeps its minimum-time-since-launch rule.
- **A pass follows the attempts' current results.** A lower re-rating removes the pass, or moves it to another attempt that still passes. Steps finished another way are never touched.
- **No invented assignment dates.** A missing assigned-on date is "date unknown". `Progress.workingDaysBetween` returns null for unknown dates.
- **Weekend days are a setting** (`platform.defaults.weekendDays`, default Saturday + Sunday); `Progress.orgToday()` gives today in the organisation's time zone.
- **< and > are refused with a message** instead of being removed silently.
- **One lifetime for file links** (`SIGNED_URL_TTL_SECONDS`, default 3600), renewed in the background.
- **Save retry backs off** (8 s up to 5 minutes, stops after 10 failures, resumes when the connection returns or on the next edit).
- Tests: `tests/learning-v41_26.test.js` (8), `tests/progress-v41_26.test.js` (4).
