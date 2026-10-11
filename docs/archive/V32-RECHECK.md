# Skillforge v32: second full recheck (areas not covered by earlier audits)

All earlier suites were run again on v31 first: unit 43/43 and every browser suite passed (209 checks).
This round reviewed the areas no earlier audit had covered: course editing, due dates, how completions are stored,
assessments offline, essential training, learning paths, deactivation and access-request approval.
Every problem below was **proved on v31** by `tests/e2e/v32_e2e.py`, `backend_e2e.py` or `learning-core.test.js`
(those checks fail on v31) and is fixed in v32.

## Data integrity
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

## Dates
5. **Due dates were fixed calendar dates in the code** (new course: 30 Nov 2026; assignments: 31 Oct 2026). After those dates
   every default would be in the past, and App settings › Default due date was ignored. Defaults are now today + the
   App settings value.
6. **A course could be published with a due date in the past.** Everyone in the audience was assigned already overdue
   (the test published to 3,322 people). This is now refused, and the team-assign pop-up checks it too.
7. **Extending an essential-training due date didn't stop the overdue pop-up.** The pop-up used the rule's deadline, not the
   person's own due date. It now uses the person's due date, and an unassigned essential course no longer triggers it.

## Learning paths (were mostly sample text)
8. **Every learner saw the same "Customer Success Essentials" path** (three fixed courses plus invented "Final assessment"
   and "Certificate" steps). The card now shows the path that covers the learner's own courses, or is hidden.
9. **Auto-enroll did nothing and "enrolled" was a fixed number.** Save now assigns the path's courses to the people the rule
   covers (Department, Role, or New hires in the last 30 days), keeping existing due dates. "Enrolled" counts the people who
   have every course of the path. A path containing a deleted course used to crash the screen.

## Security
10. **People deactivated in bulk (or by a ZingHR leaver sync) kept their database access.** Only the single-person switch
    disabled the login. The database now marks the login inactive whenever a person's row says Deactivated, whoever changed
    it (trigger `sf_user_active_sync`), so every rule refuses them at once. Bulk deactivation also disables each login on the
    server, and reactivating restores access.
11. **Access-request approval accepted any due date from the browser** (in the past, or decades ahead), could approve a
    course that had since been unpublished, and let someone with the assignment permission approve their own request.
    The server now refuses all three.

## Tests
Unit 44/44 (1 new) · v32 16/16 (new) · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS 19/19 ·
v31 6/6 · attacks 16/16 · database rules 59/59 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16,
v31 6/6, v32 16/16. Dashboard numbers compared with v31: 18,925 values, all identical (sample course titles changed, totals didn't).

One existing test was order-dependent: "step completion still enforces the server rules" tried to complete the assessment step,
which an earlier check sometimes passes, so it passed or failed by chance. It now picks an assessment or SCORM step that isn't done.

## Still open
Same list as v30/v31: run `npm run test:db` on real PostgreSQL (the new trigger included), get an independent penetration
test, switch on MFA, add rate limiting, and build the e-mail delivery job. SCORM completion is reported by the learner's browser.
When connected, saving a Learning path assigns courses only if the editor also has the Course assignment permission.
