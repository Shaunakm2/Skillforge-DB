## v41.26 (reviewer findings: atomic submit, server-counted viewing time, passes follow re-rating, date unknown, weekend days)
- **Submit can be finished by a retry.** The attempt is stamped as handed in, the records that depend on it are written by steps that are safe to repeat, then it is marked finalised. If something fails in between, the learner's next Submit completes it instead of leaving the attempt used up with no result. Attempts handed in before v41.26 count as complete.
- **Viewing time is counted by the server.** New `stepPing` heartbeat (every 20 s while the step is on screen and the tab is visible; at most 45 s credited per ping, never more than the clock). `completeStep` needs the counted seconds. Secret `SEAT_TIME_STRICT=false` restores the old rule. SCORM packages keep the minimum-time-since-launch rule.
- **A pass follows the attempts' current results.** A lower re-rating removes the pass (or moves it to another attempt that still passes). Steps finished another way are never touched.
- **No invented assignment dates.** A missing assigned-on date is "date unknown" (it was due date minus 21 days). `Progress.workingDaysBetween` returns null for unknown dates.
- **Weekend days are a setting** (`platform.defaults.weekendDays`, default Saturday + Sunday) and `Progress.orgToday()` gives today's date in ORG_TIMEZONE.
- **< and > are refused with a message** instead of being removed silently.
- **One lifetime for file links** (`SIGNED_URL_TTL_SECONDS`, default 3600; was 8 hours for staff and 10 minutes for learners), renewed in the background.
- **Save retry backs off** (8 s up to 5 minutes, stops after 10 failures in a row, resumes when the connection returns or on the next edit); it used to retry every 8 s and again after 0.3 s, for ever.
- Tests: `tests/learning-v41_26.test.js` (8), `tests/progress-v41_26.test.js` (4).
