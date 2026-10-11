# Skillforge v33: detailed scan of the areas no earlier round had reviewed

Baseline first: v32 as uploaded passed every suite (unit 44/44; offline 6, analytics & documents 59, numbers 28, Training/MIS 19,
v31 6, v32 16, attacks 16, database rules 59, SCORM 18).

This round covered gamification, notifications, calendar, discussions, bulk user upload, account settings, certificates, migration
import, room booking and account expiry. Every problem below was **proved on v32** (the new checks in `tests/e2e/v33_e2e.py` and
`backend_e2e.py` fail on v32) and is fixed in v33.

## Crash
1. **Deleting the open discussion froze the whole app.** The discussions code runs on every screen and crashed when the selected
   thread no longer existed, so no screen could open any more. With no discussions at all (a fresh database) the same happened.
   It now falls back to the first discussion, or shows an empty page.

## Everyone saw the same person's data (gamification, notifications, calendar)
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

## Bulk user upload
6. **A rejected row was applied anyway.** A row whose name didn't match the existing account was reported as rejected, but its other
   columns (designation…) had already been written.
7. **The Division column filled only the department**, so everyone uploaded showed as "Unassigned" on every division dashboard and in the MIS.
8. **A Reporting Manager given as an employee code** (as HR files usually have it) wasn't linked to the manager. It now is.

## Accounts and sign-in
9. **AccountExpiryDate was never enforced.** An expired account could sign in forever. Now it can't sign in offline, the server
   refuses it, and the database gives it no access (checked in `sf_ctx`).
10. **Changing your password in Account settings failed when connected.** It called a function that doesn't exist. The screen
    also accepted 8-character passwords that the server refuses (it needs 10+ with upper, lower and a number). Both are fixed.

## Data quality
11. **Impossible dates were accepted** (31 February) in migration imports and bulk course assignment; the browser silently turned
    them into 3 March. Real dates only now.
12. **Every learner got the same certificate ID for a course**, so IDs couldn't verify anyone. IDs are now unique per person, course
    and completion date and printed on the certificate. Expired re-certifications show in red (they always showed "Valid"), long names
    and titles shrink to fit instead of running off the page, and the printed name leaves out the "(employee ID)" added to tell
    two people with the same name apart.
13. **A training room could be double-booked**, or booked while under maintenance (warnings only). Both are now refused when the
    room or dates change. A trainer already running another batch on the same days is shown as a warning (co-training exists).

## Tests
Unit 44/44 · v33 23/23 (new) · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS 19/19 · v31 6/6 ·
v32 16/16 · attacks 16/16 · database rules 61/61 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16,
v32 16/16, v33 23/23. Dashboard numbers compared with v32: 18,925 values, all identical. Every screen opened for Learner,
Trainer and Admin (123 screen loads): no errors, nothing blocked.
Proof on v32: the v33 suite fails 19 of its checks there (the rest could not run because of the discussion crash, and were
proved separately), and the database-rules suite fails the 2 new checks ("Backend.changePassword is not a function"; an
expired account could still read 3 batches).

## Still open
Run `npm run test:db` on real PostgreSQL (the new expiry rule included), an independent penetration test, MFA, rate limiting and
the e-mail delivery job. Organisation sessions on the calendar are still sample events (there is no screen to create them yet).
