# Skillforge v31: full recheck of v30

## What was run (on the V30 zip, unchanged)
Unit 43/43 · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS & certificates 19/19 · attacks 16/16 ·
database rules 55/55 · SCORM 18/18. The shipped `dist/` (GitHub Pages build) was rebuilt from `public/` and is byte-identical.

## Logic traps found in the fresh review (all in V30, proved by tests/e2e/v31_e2e.py, fixed in V31)
1. **Idle sign-out interrupted learning.** A learner watching a video or working in a SCORM package without clicking was signed out
   after 30 minutes, in the middle of the module. Playing media and an open SCORM package now count as activity (only when the tab is visible).
2. **Idle sign-out left the previous person's data in memory (connected mode, shared PCs).** Manual sign-out reloaded the page; idle
   sign-out didn't, so settings the next person couldn't read (dashboards, KPIs, schedules) stayed in the tab. It now signs out
   and reloads, then shows why.
3. **Reset layout on a dashboard you created** replaced it with the Learning overview charts (on a Training board too). It now
   returns the board to the layout it was created with.

4. **Reports counted 2 fewer assignments than the dashboards** (124,570 vs 124,572): reports used Active people only, dashboards
   and statistics also counted Invited people, who already have courses due. Reports now use the same rule. Dashboards, statistics
   and the All course completion report agree on assignments, completed and overdue.

## Tests after the fixes
Unit 43/43 · offline 6/6 · analytics & documents 59/59 · numbers 28/28 · Training/MIS & certificates 19/19 · attacks 16/16 ·
v31 6/6 (new) · database rules 57/57 (2 new) · SCORM 18/18. GitHub Pages build: offline 6/6, attacks 16/16, v31 6/6.
Dashboards, statistics and reports agree: assignments 124,572 · completed 40,096 · overdue 17,382 · certificates 15,698.
