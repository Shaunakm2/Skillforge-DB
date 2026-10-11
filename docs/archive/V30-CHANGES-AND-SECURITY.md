# Skillforge v30: editable Training overview & MIS, certificates per course, attack-tested hardening

## Training overview & MIS: everything is editable
- **Bug fixed (it predates v27):** Customise on the Training overview changed whichever *Analytics* dashboard had been opened last.
  Removing a visual on Training overview removed it from Learning overview. Edits now always go to the board on screen.
- **The MIS tab is a dashboard.** Its handover pipeline and attrition trend are now visuals. You can add any visual (KPIs, ★ custom
  KPIs, heat maps, spider webs…), remove, reorder and resize them, and Save or Cancel.
- **+ New dashboard on the Training page.** New boards appear as their own tabs and can start from any template. They stay on the
  Training page (editors only), not among the Analytics dashboards.
- **KPI tiles** (Customise › Edit KPI tiles): show or hide, rename, reorder, and add a tile for any training measure or ★ custom KPI.
  These are part of the Customise session (Save keeps them, Cancel undoes them). Master data › Tile management still works.
- Built-in tabs (Overview, MIS, Attrition) can be reset but not deleted.

## Certificates are per course
- A certificate is issued only when the course has **Certificate** switched on. New courses start with it **off**.
- One rule (`Progress.hasCert`) is used everywhere: My learning certificates, reports, Engagement trends, dashboards (new measure:
  *Certificates issued*) and the Power BI learning file (new column: Certificate issued).
- The sample catalogue now has a realistic mix (about 40% of courses issue certificates).

## Security: attacks run against the app (tests/e2e/attack_e2e.py + backend_e2e.py)
| Attack | Result | Fix in v30 |
|---|---|---|
| Stored XSS: script/img/svg payloads in names, titles, posts, documents, KPIs, badges, batches, modules (18 screens) | Nothing runs; shown as text | Already safe (no HTML rendering); now tested |
| `javascript:` / `data:text/html` / `vbscript:` / protocol-relative links stored in module, meeting and file URLs | Never rendered | **Engine-level URL guard on every bound href/src/action/poster** |
| CSS injection through a colour field (`red;background:url(…)`) | **Was possible** (CSP blocked the request) | **Bound style values can't add declarations; url() only to this site, blob, data:image or Supabase storage; CSS escapes refused** |
| Prototype pollution: a person named `__proto__`, rows carrying `__proto__`, merges | Blocked | **Reserved names get the employee ID added; `__proto__` keys removed from all database rows and merges; template paths can't reach constructor/__proto__** |
| Server action named `constructor` / `toString` | **Was accepted** (passed the "unknown action" check) | **Own-property lookup; reserved values refused as ids** |
| Learner: grant own role permissions, change membership role, write KPIs/boards/schedules, forge acknowledgements or sign-ins, publish a document, edit an account, read others' sign-ins or KPI formulas | All refused | Database rules (and their test mirror) |
| CSV formula injection (`=HYPERLINK`, `+cmd`, `@SUM`) | Neutralised on export | (v28) now tested |
| 11 MB CSV upload / 100k-character or 3,000-deep formula | Refused instantly | **10 MB CSV limit on every picker** |
| Clickjacking: another site frames the app | **Was possible on GitHub Pages** (headers aren't sent there) | **The page hides itself when framed by another origin** |
| Session left open on a shared training-room PC | **No timeout** | **Idle sign-out (App settings, default 30 min, 0 = off), shared across tabs** |
| Reverse tabnabbing | All new-tab links use noopener | Tested on every screen |

The engine logs a console warning whenever it blocks a value. A crawl of about 60 screens and tabs with normal data produced none,
so nothing legitimate is lost.

## What is still open (an honest list for reviewers)
1. **SQL not executed in this environment** (no PostgreSQL here). The database rules are tested through a JavaScript mirror.
   Run `npm run test:db` (CI on real PostgreSQL) before deploying, and keep the mirror in step with the SQL.
2. **Independent penetration test** by a third party before production. Automated tests prove what was tested, nothing more.
3. **SCORM completion** still comes from code running in the learner's browser (inherent to SCORM). Use server-graded assessments for compliance.
4. **Offline demo mode is not a security boundary**: anyone can edit browser memory. Use it with sample data only.
5. **No rate limiting on the Edge Functions** beyond Supabase's platform limits; add it at the API gateway for production.
6. **MFA** must be enabled in Supabase Auth (and on GitHub, Supabase and Cloudflare accounts). The app doesn't enforce it itself.
7. **E-mail delivery** for schedules and reports needs a server job (not built).
8. `style-src 'unsafe-inline'` is required by the design (bound style attributes). It is mitigated by the engine's style guard.
