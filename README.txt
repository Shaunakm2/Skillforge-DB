Skillforge v41.24: Certificates moves into Master data (admins only)

DEPLOY
1. Extract. In GitHub: Add file > Upload files, drag the "public" and "tests" folders in, commit.
2. npm run build, then commit dist/ (in a Codespace if your site serves a committed dist/).
3. Hard refresh (Ctrl+Shift+R). No database or function redeploy is needed.

WHAT CHANGED (3 files, each is your attached version with small edits)
- settings.js  The Certificates tile moves from "Learning content" to "Master data" (after Badges). Section descriptions updated.
               The tile keeps its title, so anything renamed/hidden in Tile management still applies.
- access.js    The separate "Certificates" permission is removed. The screen now needs the Master data permission, which only
               Admin roles have. The Master data permission label now reads "(MIS lists, holidays, badges, certificate design)".
- masters.js   A "Certificates" tab on the Master data page, between Badges and Tile management. It opens the same editor
               (like the Training types and Trainee statuses tabs do).

WHO LOSES ACCESS
Nobody by default: the built-in Trainer and Learner roles, and the Quality Analyst role, never had Certificates.
If you gave the old Certificates permission to a custom role, that role can no longer open the screen. Check Settings > Roles & permissions.
The database still lists the old permission for saving the template. It is harmless: nobody can be given it any more, and admins are unaffected.

TEST: tests/e2e/v41_24_e2e.py (31 checks).
