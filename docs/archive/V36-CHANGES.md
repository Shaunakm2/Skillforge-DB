# Skillforge V36: UI/UX fixes, honest actions, Kirkpatrick in Reports, full sweep, DB hardening, CI/CD

Built on V35. Covered by `tests/e2e/v36_e2e.py` (47 checks) and the new full sweep `tests/e2e/sweep_e2e.py`.

## Users & accounts
- The Actions column no longer covers **Terms** and **Last active** (columns tightened; fits every desktop width).
- Six unlabelled icons per row replaced by one **Manage** button with labelled actions: View learning, Assign or unassign courses, Assessment attempts, Edit details, Reset password, Deactivate.
- **Deactivate and reactivate always ask first** (single and bulk), explaining what happens.
- Filter chips: **All statuses** and **All roles**. **View learning** opens Reports for that person (was a message only).
- "Reset password to Pass@123" tooltip removed; create button says **Create account** (no invite e-mail is sent).
- Long custom role names shorten with "…" and show in full on hover. Row tick-boxes are named checkboxes for screen readers.

## Learner home
- **Continue learning** in the first screen on laptop and phone; five tiles became one compact summary line.
- Feedback requests and announcements moved below Continue learning / Due soon.
- Announcements: lighter amber for Important (not black), Important first, one at a time with "Show all".
- Phone: the menu shows a soft edge and thin scrollbar when more tabs exist.

## Course player
- The menu highlights where you came from (Home, My learning or Catalog); it always said Catalog.
- Timer wording: "Take your time. This step is marked complete in 45s, and then you can continue." Same rule; not announced to screen readers every second.
- Phone: Previous / Next pinned at the bottom of every step; messages appear above it.

## Messages
- Stay up 2.6–7 s by length, can be closed with ✕, announced through a permanent live region.

## Fixed "it said it did something, but nothing happened"
- **Audit log Export** downloads a real CSV. Offline the screen shows sample history plus every admin action in the session (deactivate/reactivate, password reset, account create/edit, role change, course publish, dashboard delete, reminders); connected it reads the database audit trail.
- **Reminders** (Users, Feedback, Manager team): offline they reach the person's bell; connected the app says e-mail isn't connected and nothing was sent.
- **Gradebook** shows real results with paging and search; trainers see their batch trainees, admins everyone; **Export CSV** downloads a real file.
- **My progress**: time, certificates and skills come from the person's records (were fixed samples). Empty states added.
- **Leaderboard**: connected, a note explains rankings need the server ranking job.
- **Logo upload** and **Retry sync** no longer claim success; Integrations labelled **Sample data**.

## Kirkpatrick L1–L4 analysis is now in Reports
- First report card. Settings › "Kirkpatrick analysis" and any old link open it there.
- People with the *Training feedback* permission see it (plus the "Feedback responses (Kirkpatrick)" row report) without getting other reports. Trainers with only *course completion* see the same reports as before.

## Full sweep and the fixes it found
`tests/e2e/sweep_e2e.py` opens every screen as learner, trainer and admin, on laptop and phone, clicks every visible button, and checks script errors, sideways scroll, unnamed buttons, covered buttons, broken images, unsafe links, tap targets and untrue "sent" messages. Runs in CI and uploads a JSON report.
- Edit details from Manage left the menu open behind the edit window (also caught by the old backend test).
- Phones: Discussions reply box, lesson tabs, Gradebook header, batch trainer bar, Users role chips, Analytics bars, Branding preview and Learning paths widened the page.
- Phones: back links, "View all", "Show all", "Give feedback", ✕ buttons, question bank and certificate field names now 28–32px to tap.
- 30 on/off switches, the colour swatches and the Learning paths order switch now have names.

## Database (`supabase/migrations/002_v36_hardening.sql`)
Audit rows only for changes really stored (AFTER trigger); max 500 rows per save/delete call; audit index and retention function. See `docs/RLS-AND-ACCESS-REVIEW.md`.

## CI/CD
`cd.yml` (staging → approval → production, pre-deploy DB dump, smoke check), reusable deploy action, `codeql.yml`, `dependabot.yml`, secret scanning; CI also runs the sweep. See `docs/CICD.md`. Bucketization opinion: `docs/BUCKETIZATION.md`.

## Not in this build
E-mail delivery; server-side leaderboard; error monitoring (Sentry); MFA/SSO; verifiable certificates; server-side paging for 3,500+ users.
