# Skillforge v27 + v28: Analytics Studio and Documents library

Nothing that existed before was removed or changed in behaviour. Every number the v26 dashboards showed was re-checked
after the change: 3,619 values across three filter combinations, plus the Training overview KPI tiles. All of them were identical.

## v27: Analytics Studio
- **KPI builder** (Settings › Reports › KPI builder): your own KPIs as formulas, e.g.
  `hrms_joined_day0 - ABSENT_DAY(1)` (joined on day 0 as per HRMS minus absent on training day 1).
  Fields from three datasets, attendance functions for training days 1–30, + − × ÷, IF/GT/LT/…, PCT, DIV, ROUND, MIN/MAX.
  KPIs can use other KPIs (loops are refused). Live preview, total and top-6 breakdown. Number/percent/decimal, decimals,
  targets with green/amber/red, "higher/lower is better". Saved KPIs appear as ★ measures in every visual.
- **New dataset: People (HRMS employee master)**: status, division, location, designation, joining month.
- **New visuals**: spider web (radar), gauge, treemap. Heat maps now take **any two dimensions** and any measure, including custom KPIs.
  Tables can have any columns you choose, including KPIs.
- **Drill-through**: click a bar, slice, cell, point or row to see the records behind it (paged, CSV).
- **Templates**: Induction & day-1 attendance, Trainer effectiveness, Attendance heat map, Workforce (HRMS), Compliance watch,
  plus "Save as template" for your own.
- **Datasets & fields** tab: every field, dimension and attendance function.

## v28
- **Dashboard sharing**: each dashboard can be limited to chosen roles. A new permission, *dashView*, lets a role view the
  dashboards shared with it without being able to change, schedule or export raw data.
- **Schedules**: daily, weekly or monthly, with recipients restricted to your organisation's own e-mail domains (max 20).
  Schedules are saved. **E-mail sending needs a server job, and that job is not in this build.** "Run now" downloads the same CSV.
- **Power BI data**: flat CSV tables (training facts, learning facts, people, data dictionary) with page filters applied.
  This is a file export for Power BI's *Get data › Text/CSV*. It is not a live connector.

## Documents library (everyone)
- A **Documents** menu item for every role: search, categories, required-reading filter, open, download.
- **Management** (Settings › Communication › Documents library, permission *documents*): upload PDF/Word/PowerPoint/Excel/PNG/JPG
  (25 MB max), audience by user type, effective, review and expiry dates, Draft/Published/Archived, view-only, tags, categories.
- **Versions**: every version is kept with a change note. A new version can ask everyone to acknowledge again.
- **Required reading**: the reader must open the document before "I have read and understood" is accepted. Pending items appear in the bell.
  The acknowledgement report shows counts, a per-person list and a CSV.

## Security
| Area | Control |
|---|---|
| Formulas | Own parser and evaluator. No `eval`/`new Function` (CSP blocks them anyway). Field names are looked up as own properties only (no `constructor`/`__proto__`). Limits: 500 characters, 200 tokens, 24 levels of nesting, 8 levels of KPI references. |
| CSV exports (all, app-wide) | Formula-injection guard: cells starting with `= + - @` get a leading `'`. Numbers are kept. |
| Drill-through & Power BI files | No names, e-mails or phone numbers in Power BI files. Drill rows show work identity only. Viewers cannot export them. |
| Schedules | Recipients must be on the organisation's own domains. |
| Dashboard viewers | Can't edit, create, schedule or export. They can't open the KPI builder or Training MIS. RLS still limits the data they see. |
| Documents: visibility | Status, audience and dates are enforced in **3 places**: database policy (`sf_read_ok`), Edge Function (file signing), and the app. |
| Documents: files | File type and extension must match, and the content signature is checked. SVG and archives are refused. Storage write/read under `org/docs/` needs *documents*. Learners get signed links only for the **current version** of documents they may see. |
| Documents: links | Only `https:`, this tab's `blob:` and shipped `assets/` paths (no `..`). Opened with `noopener,noreferrer`. |
| Acknowledgements | Written by the server (`docSeen`, server clock). This is a server-only collection, so browsers cannot forge it. |
| "View only" | It hides the download button. Anyone who can open a file can still save it, and the screen says so. |

## Tests
- Unit: 42/42 (10 new: formula engine, hostile inputs, KPI loops, document rules on the server).
- New browser test `tests/e2e/analytics_docs_e2e.py`: 59 checks. KPI values are recounted independently from raw batches.
  The drill count is checked against the chart value. Viewer limits, uploads (fake PDF/SVG refused), versions, acknowledgements and visibility dates are all tested.
- Existing suites still pass (offline, backend/RLS mock, SCORM isolation).

## To do before production
- Deploy the updated `supabase/migrations/001_skillforge.sql` and the `learning` Edge Function.
- Report e-mail delivery (server job) if you want scheduled e-mails.
- The data-volume notes from v26 still apply: at full scale, build Power BI extracts on the server.
