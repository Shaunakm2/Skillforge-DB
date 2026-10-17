## v41.27 (reviewer findings: unnecessary API calls) and v41.26
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
