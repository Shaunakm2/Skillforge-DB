# Skillforge V35: UI/UX bug fixes only

No features, screens, wording or layouts changed apart from the fixes below.

## Bugs fixed
1. **Documents:** a blocked pop-up no longer counts as "Opened", so a mandatory document can't be acknowledged unseen. (`admin/documents.js`)
2. **Documents:** a download without a stored file name gets the correct extension from the real file type instead of always `.pdf`.
3. **Leaderboard:** the podium no longer shows empty places when fewer than 3 people are on the board. (`learner/dashboard.js`)
4. **Leaderboard:** you always appear on your own board, even with 0 XP.
5. **Leaderboard:** avatar colour comes from the person's name, not their rank.
6. **Dashboards:** the delete prompt says how many scheduled e-mails are removed with the dashboard. (`admin/dashboard.js`, `index.html`)
7. **Dashboards:** CSV export lists visuals it can't include (batch tables, plain heat maps, radar rows past 60) in the file and in the message.
8. **Dashboards:** Duplicate opens the copy in edit mode, so Cancel discards it (same as + New).
9. **Dashboards:** picking a division clears a sub-division that belongs to another division.

## Accessibility
- Visible keyboard focus ring (`:focus-visible`) on every control, including upload buttons.
- Login animations stop when the device asks for reduced motion.
- Dashboard source label darker and larger (meets 4.5:1 contrast).
- All on/off switches announce `role="switch"` and `aria-checked`. The view engine used to drop `aria-checked="false"`; it now keeps it.
- Messages (toasts) are announced to screen readers (`aria-live="polite"`).

## Forms
- When input is changed automatically (< or > removed, too long, above maximum), a message says why.
- The minimum number is applied when you leave the field, not while typing.
- CSV upload buttons show "CSV · up to 10 MB" before you pick a file.

## Layout
- Course assignment pop-up fits narrow screens.
- Two-column pages with a 400px side panel stack below 1000px.
- Feedback rows stack on phones.

## Tests
- `npm test`: 52/52. E2E: offline 6/6, backend 61/61, SCORM isolation 18/18, analytics/docs 59/59, numbers 28/28, v30 19/19, attack 16/16, v31 6/6, v32 16/16, v33 23/23, **new v35 11/11** (also run against the built `dist/`).
- Not run here: `test:db` (needs PostgreSQL), `test:stack` (needs Deno/Supabase), `test:load`.
