# Skillforge LMS (front-end prototype)

Open `index.html` in a browser. No build step and no server needed.

Sign in with a work email or employee ID (e.g. maya.okafor@northwind.com or NW-1005) and the demo password `skillforge`. New accounts, and accounts an admin resets with the key icon, use `Pass@123`. "Demo accounts" under the sign-in card lists one account per role. Deactivated accounts can't sign in.

```
index.html                 App shell and the view template (<template id="app-template">)
css/styles.css             All styles
assets/                    Sample media, SCORM demo package, login park illustration (login-park.jpg)

js/core/engine.js          Tiny view engine: {{ bindings }}, <sf-if>, <sf-for>, events, DOM patching
js/core/assessment.js      Question types, grading, random draw, attempt limits, scoring
js/core/helpers.js         Shared helpers: UI toggles/chips, CSV download and parsing
js/core/progress.js        Learning records store (per person · course · module), progress, dashboard summary, indexes
js/data/scale.js           Production-scale data set (3,500 people, 1,000 courses, ~100,000 module records)
js/core/access.js          Roles and permissions: which Settings modules each role opens; role default courses
js/data/seed.js            Sample data (users, courses, quizzes, questions, LCMS, batches seed inputs…)
js/data/migration.js       Sample HRMS / API change log and imported LMS history
js/data/extras.js          Sample rooms, SCORM bookmarks, certificate template, Kirkpatrick forms, attempt records, question metadata

js/app.js                  SkillforgeApp: initial state, navigation, access rules and the view-model pipeline
js/learner/*.js            Learner experience: auth (sign-in, profile menu), courses, essentials (new-joiner rule),
                           search, catalog, player (lessons, steps, quizzes), dashboard, community, account, extras
js/staff/*.js              Trainer tools: tools (gradebook, builder, enrol pop-up…), batches, assignments (+ attempts)
js/admin/*.js              Settings: admin.js runs the admin modules in order — settings (section tabs), migration,
                           questions, question-list, categories, announcements, lcms, quizzes, courses, paths,
                           reports, users, platform
js/main.js                 Mounts the app
```

How the code is organised: `renderVals()` in app.js works out the user, screen and access, then runs
RENDER_PIPELINE. Each feature module receives a shared context `c`, adds the values its screens bind to,
and shares what later modules need (for example the course list) through `c`. Admin modules work the same
way through ADMIN_PIPELINE in js/admin/admin.js.

Fonts: Poppins (body) and Raleway (headings), loaded from Google Fonts.
To connect a backend later, replace the constants in `js/data.js` with API calls.

## Admin and super admin
- **Question bank**: 9 question types (multiple choice, multiple select, true/false, image options, match the following, Likert scale, fill in the blank, ordering, written answer), plus optional image, audio or video in any question.
- **Quizzes**: pass mark, time limit, attempts, shuffle, and dynamic assessment (show N of the selected questions at random).
- **Categories** (Settings → Categories): create, rename and delete categories, sub categories and sub-sub categories. Categories in use by a course can't be deleted.
- **Courses**: pick category › sub › sub-sub, upload a course icon and banner, switch the course on or off, and set "Live from" and "Live until" dates. Inactive, scheduled or ended courses are hidden from learners.
- **Users**: create, edit and delete accounts with employee ID, phone, gender, designation, date of joining and terms accepted. "Attempts" grants extra quiz attempts to one user.
- **Announcements** (Settings → Announcements): homepage banners with live-from and live-until times.

## Everyone
- **Search bar** in the header: results open on a full Search page (courses, lessons, paths; plus assessments, users and reports for admins). Only live courses appear.

## Trainers, admins and super admins
- **Assign courses**: assign or unassign courses for any trainee and set due dates (Gradebook → Assign courses, or Users → Assign).
- **Written answers**: rate them in Gradebook → Written answers.

Uploaded files only last for the browser session in this prototype. Connect file storage (e.g. Supabase Storage) to keep them.

## How content flows
1. **Question bank**: upload or write questions.
2. **LCMS** (Settings → LCMS): the upload hub. Create modules of any supported type: Document (PDF, Word, PowerPoint, Excel, text), Video, Audio, SCORM / xAPI (.zip), Image, Web link, Assessment (built from the question bank with pass mark, attempts and randomisation) and Acknowledgment. Each module gets an auto ID (MOD-001…). Editing a module updates every course that uses it; modules in use can't be deleted.
3. **Course catalog**: **+ Create course** opens a pop-up with an auto course ID (CRS-1001…), tabs for Basics, Modules (pick from LCMS, any order, linear or non-linear), Assignment (everyone, departments, groups, people; auto-assign new joiners) and Availability & rules. Save closes the pop-up.
   The list has search, Active / Inactive filters and **Export list** (CSV of the filtered list).

A course with assessments completes only when the learner passes every one.

## Batch management (Settings → Batch management; trainers: Batches)
- **Everyone sees every batch.** Admins and super admins can change any batch; trainers change only the batches they run (others are view only).
- **Batch IDs**: `<code><level><YY><NNN>`, e.g. `CommsL126001`. The number increments per training-type code + level + year and restarts at 001 each year. IDs never change after creation.
- **Training types** tab: batch ID code and level, day-wise plan (duration), passing %, LMS vs external weight split, external assessments with max marks and weights.
- **Trainee statuses** tab: the 12 default statuses (Attried, Decertified, Direct Absorb, Early Absorb, Handover to OPS, Induction dropout, In-Training, Moved to next batch, On the job training, Referred to HR, Re-Training, Did not join training) plus custom ones. Each status has a type (In training, On the job, Graduated, Absorbed, Attrition, Did not join, Moved, Not certified, On hold) that drives attendance and KPIs.
- **Holidays** tab and per-batch holidays; the end date is always calculated.
- **Batch view**: Summary (infographic KPIs: joined, in training, absorbed, appeared for evaluation, graduated, throughput, attrition with voluntary/involuntary split, other outcomes; status bar; funnel; recent activity; export), Trainees (current status, timeline, change status), Day plan, Attendance, Completion, Certification, EWS, RAG, History and Reports.
- **Attrition** statuses need voluntary or involuntary, a reason and details (why the trainee resigned, or why they were asked to leave).
- **Weighted certification**: final score = LMS share × weighted LMS average + external share × weighted external average. Each assessment has its own weight; the screen shows each one's share of the final score.
- **History**: every change with who, role, when, before and after. Admin changes to entries made by someone else are marked as corrections. Filter by trainer changes, admin corrections or setup; export as CSV.
- **Throughput** = (graduated + absorbed) ÷ joined. **Attrition %** = attrition ÷ joined. Trainees who did not join are not counted as joined.

## Settings
Tiles are grouped into sections shown as tabs on one line. What a person sees depends on their role.

## Course assignment (Settings → User management)
- **+ Assign** opens a pop-up with two tabs:
  - **Single**: search a course by code or name, choose a user parameter (Employee ID, Username/email, Full name), search the user and pick them (all their details fill in), set a due date, Assign. The result shows in the pop-up.
  - **Bulk upload**: download the example CSV (Course code, Employee ID, Email, Due date), choose the file, Import. The pop-up shows how many users and courses were assigned and how many rows were not, with a download of rejected rows and the reason for each.
- The list below shows who has each course; assign or unassign one person or many.

## Assessment attempt management (Settings → User management; trainers too)
Search a course by code or name, pick the assessment (a dropdown appears when the course has more than one), find the user by Employee ID, username or name, set the number of additional attempts (1–10) and an optional reason. The screen shows allowed / used / left before you assign. Every grant is logged with who, when and why, and the log can be exported.

## User types
- **Learner** (trainee): Home, Catalog, My learning (incl. learning paths), Calendar, Discussions.
- **Trainer**: the same learner experience, plus the gear icon → Settings with Course assignment, Assessment attempt management, Course builder, Batch management and Gradebook.
- **Admin**: the same learner experience, plus every Settings module.
- Everyone signs in with their own type; there's no role switcher. The profile menu (top right) has Account settings, Preferences, Password & security, Settings (trainers/admins), Help & support and Sign out.

## Question bank
Eight filters (question type, difficulty, category, course, module, status, author, usage) with live counts, search, sort, removable filter chips and quick stats. The table shows Question (with category, author, media), Type, Difficulty, Used in (courses, worked out from quizzes) and Status. Click a question to see it in full with the correct answer, explanation and where it's used.

## Settings
Section tabs (User management, Learning content, Training delivery, Communication, Reports & insights,
Integrations & platform, Migration) — one section open at a time. Course assignment and Assessment attempt
management sit under Learning content. Trainers see Learning content and Training delivery only (no Course builder).

## Completing course content
Learners can only mark documents, images, links and lessons complete when the course allows it
(Course catalog › course › Availability & rules › “Learners can mark steps complete”, off by default).
Otherwise those steps complete after a minimum viewing time on the page (15–60 seconds, from the module's
length; counted only while the tab is visible). Videos and audio complete when they finish, SCORM when the
package reports completion, assessments when passed.

## Essential training for new joiners
Course catalog › course › Assignment › “Essential for new joiners”: complete within N working days of
joining (default 30; weekends and holidays don't count), for people who joined on or after the rule's start
date. They're assigned automatically with that deadline. Anyone past it sees a pop-up at every sign-in and a
red banner on Home until done. Demo: sign in as ishaan.kapoor@northwind.com.

## Batches for trainers
Trainers see a table of batches (their own by default, “All batches” optional). They can change everything
in a batch they run until its end date (except reassigning the trainer); after that only admins can.

## Reports
“All course completion”: every teammate's assigned courses with assigned / start / completion dates,
completion %, attempts and best score. The CSV has one row per module.

## Migration (admins)
- Data migration report: changes received from HRMS and other APIs between two dates, filter and download.
- Migrate to or from Skillforge: import completions from another LMS (template, validation, rejected-rows
  file); matched courses count as completed. Download every dataset as CSV to move out.

## Roles & permissions (Settings › User management)
Each person has one role. A role has a base user type (Learner, Trainer, Admin), the Settings modules it can
open, and default courses. Anyone given the role (including new teammates) gets its access and courses.
Admin roles always have every permission. Default roles: Learner, Trainer, Admin; sample custom role: Quality Analyst.

## Batches
- Primary groups in every headcount: **In training** (In-Training, On the job training), **Attrited** (Attried,
  Induction dropout, Did not join training), **Handed over** (Handover to OPS, Early absorb, Direct absorb) and
  **Other** (Moved to next batch, Referred to HR, Decertified, Re-Training). Custom statuses choose their group.
- After the last training day a batch is **Awaiting closure**. **Mark training complete** is blocked while anything is
  pending from the trainer (anyone still In-Training or On the job training, or a day without attendance). Once
  complete, trainers can't change it; admins can reopen it.
- Attendance tab: a day-wise register for every day (also for completed batches), downloadable.
- EWS: **+ Add EWS** opens a pop-up (trainee, severity, comments, Log EWS).
- Each batch can book a training room; the form warns about capacity, maintenance and double bookings.

## Content
- Question metadata: reference ID, skill, Bloom level and tags (plus category and difficulty). Add it one by one or by
  CSV upload (template, validation, rejected-rows file). Filter by skill, Bloom level or tag; export all active questions
  with options, answers and metadata.
- Clear SCORM bookmarking: find a person, clear the resume point of a SCORM course (optionally reset its completion). Logged.
- Certificates: upload a PNG/JPG background, drag the name, course, date and score fields into place, save as a new
  version. Learners download their certificate (PNG) from My learning.

## Training delivery
- Training places: rooms with site, floor, capacity, layout, IT (PCs, headsets, projector, VC, Wi-Fi, whiteboard) and status.
- Training feedback (Kirkpatrick): per course, L1–L4 each with audience (learner, manager or both), timing (on
  completion or 30/60/90 days after) and questions. Sends go automatically on the due date or from the schedule;
  learners and managers answer from Home. Results per level; responses export as CSV.

## Reports
New: User report (active, invited and deactivated), Assessment result sheet (one assessment, a date-time window, one
column per question in the CSV) and User assessment results (one person's completed courses and attempts). Trainers
can download the All course completion report.

## Learning records (one source of truth)
Every course, including the original lesson-based ones, is a list of modules (steps). Completion is stored per
person, course and module (`itemDone[user][course][step]` = completion date, or `{ at, score }` for a passed
assessment). Home, Catalog, course pages, the essential-training rule, Kirkpatrick feedback, every report and
every export read the same records through `Progress.detail` / `Progress.summary`, so the numbers always agree.

Home: Assigned = Not started + In progress + Overdue + Completed. Due soon = not completed and due within 14 days
or overdue. "Continue learning" is the person's own in-progress (or most urgent) course.

## Scale
Built for ~3,500 people, one 1,000-course catalogue, 25–50 assigned per person (~125,000 assignments, ~600,000 module records):
- Settings modules compute only on their own screen; lookups use memoised indexes (course by id, assignees by
  course, imported completions), never people × courses scans.
- Long tables (users, assignments, question bank, reports) render 50 rows per page; KPIs and CSVs use every row.
- Date formatting is cached.
- Measured with the production-scale set loaded: screens render in ~10–90 ms; the all-course completion report (250k assignments) in ~0.3–0.45 s, building only the page on screen.
- Exports above ~300k rows ask for a filter first; in production the server builds them.
The full organisation loads by default (~1 s). Open index.html?small=1 for the small demo set only.

## ZingHR employee master (Settings › Platform)
API base URL / client ID (secret stays on the server), schedule, rules (create joiners, update changes, deactivate
leavers, assign essentials, role from designation), field mapping (EmployeeCode, EmployeeName, OfficialEmail,
Department, ReportingManagerCode, DateOfJoining, EmploymentStatus …) and run history. "Run sync now" simulates an
incremental run; every change lands in the Data migration report.

## Production notes
The browser prototype keeps data in memory. For production, move the records and indexes to a database
(e.g. Postgres) with paging and filtering done by API (`/learners/:id/summary`, `/reports/completion?page=`),
and run the ZingHR sync as a scheduled server job.

## Bulk uploads (templates match the Northwind files)
- Users › Bulk upload (UserMaster): UserId*, EmailId*, UserName*, MobileNumber* required; 28 more optional columns
  (Designation, Division, Reporting Manager, DateOfJoining, UserType, UserRole, Country …). Existing UserIds are
  updated with the columns given; new ones are created with Pass@123 and get role + essential courses. Dates:
  YYYY-MM-DD, DD-MM-YYYY or DD-Mon-YYYY. Rejected rows download with a reason.
- Course assignment › + Assign / Unassign › Bulk upload (CourseApplicability): CourseCode, UserId, AssignmentType
  (Assign or Unassign; blank = Assign), optional DueDate.

## Unassigning courses
- Course assignment › + Assign / Unassign › Unassign tab: find a person, tick courses, Unassign selected.
- Course assignment list: pick a course, Unassign per row or select many → Unassign from selected.
- Users › Assign (per person): assigned courses with Unassign and due date; search to add more.
- Bulk file: AssignmentType = Unassign. Progress is kept if the course is assigned again.

## Batch delivery
In person (training room), Virtual (meeting link) or Hybrid (both). Paste the Teams / Zoom / Meet / Webex link;
the batch page shows a Join online bar with Copy link and Join. Admins and the batch's trainer can change it;
changes go to batch history.

## Catalog and access requests
Everyone sees the full catalogue. Assigned courses come first (with due dates); any other course has
"Request access" with a reason (10–500 characters). Requests go to the person's manager and L&D and appear on
Settings › Course assignment › Access requests, where they can be approved (assigns the course) or declined,
one at a time or in bulk. Learners filter the catalogue by All / Assigned to me / Not assigned / My requests.

## Analytics dashboard (Settings › Reports › Analytics dashboard)
Power BI–style and customisable: KPI cards, bar, column, line, donut, stacked bar, heat map and table visuals;
choose the measure (assignments, completed, in progress, overdue, completion rate, overdue rate, learners,
average score, modules) and the dimension (department, course category, site, status, month, course, user type);
resize, reorder, retitle or remove; page filters (department, category, period) apply to every visual.
Save several named dashboards, duplicate, reset, and export the data behind them.

## Input validation
Every text field has a length limit; number fields have min/max; the app strips control characters and angle
brackets from everything typed or pasted; forms check names, emails, employee IDs, phone numbers and dates.

## Master data (Settings › Master data) — replaces the MIS "Validation" sheet
- MIS lists: training segment, type of trainee, training name, division, sub division, division head, location, brand,
  WFO/WFH, attrition category / responsibility / reason, education. Add, rename (cascades to every record), remove
  (blocked while in use), reorder, sort, CSV upload/download, with usage counts.
- Training types and trainee statuses: Batch management (the tiles link there).
- Holiday list: add or upload a CSV (Date, Holiday); weekends, duplicates and dates covered by logged attendance are
  rejected with reasons; batch end dates move automatically.
- Badges: icon, name, colour, rule (metric ≥ threshold), on/off; learners earn them from their records.

## MIS report (Reports › MIS report)
One row per trainee per batch, built from live batch, user, status and assessment records. Columns and order match
the Book1 workbook exactly (46 columns). Download as Excel (.xlsx with "Data" and "Validation" sheets and drop-down
lists on Training Segment, Type of Trainee, Training Name, Current Status, Division Head, Trainer, Location,
Division and Sub Divison) or CSV. Filter by month, segment, training, sub division, status, trainee/batch.

## Dashboards (Settings › Reports)
- MIS dashboard: KPIs (participants, unique trainees, in training now, handed over, throughput, attrition rate),
  a live batch tracker (stage — classroom day x of y / OJT / awaiting closure / upcoming — headcount, status split,
  graduation date, throughput), training-wise distribution, monthly participants & unique trainees, training-wise
  counts, location / brand / type / status charts, division-wise handover TAT matrix (weeks from joining), throughput
  by training.
- Analytics dashboards: every visual chooses a data source (learning or training), measure and dimension; learning
  tiles can show their own course drop-down. Page filters: division, sub division, course, training, location,
  from–to dates (with presets).

## Mobile
Two-row header with a scrollable menu, stacked layouts, scrollable wide tables and full-width pop-ups. No sideways
scrolling at 390 px on Home, Catalog, My learning, course pages, Calendar, Account, Settings, Users, Batches,
Reports, Master data, Course assignment, Question bank and dashboards. The sign-in page never scrolls.

## Data at full scale
About 140 training batches (Jan–Oct) with ~2,800 participations are generated with real statuses (In-Training,
OJT, Handover to OPS, Early Absorb, Attried …), attendance and dates, so the MIS, dashboards and batch pages
show realistic numbers.

## v21 changes
- Training overview & MIS (Settings › Reports): one tile with Overview, MIS, Attrition and Batches & trainees, sharing
  division / sub division / training / location / date filters. MIS shows trainees trained and unique, handed over,
  attrition, throughput (handed over ÷ joined), early and direct absorb, the handover pipeline by week (classroom
  end + 1 working day) and the attrition trend. Batches & trainees lists every trainee with admin-chosen columns + CSV.
- The Book1 MIS report and Excel download are removed. Every report has a Columns chooser (add, remove, reorder);
  the CSV follows it.
- Reports: User course completion (completed courses + evaluation %, trainers too) and Feedback responses.
- LCMS: Survey (course step) and Feedback form (Kirkpatrick L1–L4: level, audience, timing, courses and/or trainings).
  Trainers can create surveys and feedback forms. Feedback responses screen and report replace the per-course setup.
- SCORM 1.2 (window.API) and 2004 (window.API_1484_11) runtime: completion, score, resume point (bookmark).
- Master data › Tile management: show, hide, rename and reorder Home, Settings, batch-card and Training KPI tiles.

## v22 changes
- Supabase backend (optional): fill js/config.js and follow SETUP-SUPABASE.md. Sign-in with Supabase Auth, data in Postgres
  (table sf_doc, Row Level Security per role), files in Supabase Storage, automatic save of only the rows that changed,
  account actions through the Edge Function supabase/functions/admin-users, keep-alive workflow for the Free plan.
  Settings › Platform › Database & storage: connection status, load the starting data, download a JSON backup.
- Settings › Master data › App settings: switch features on/off (gamification, badges, learning path card, discussions,
  calendar, catalog access requests, essential-training pop-up, announcements), default password, default due days,
  default essential-training window, and a map of everything else that can be customised.
- Tile management › Learner menu: rename, hide and reorder menu items.
- Assessments tile removed from Settings (create assessments in LCMS: + Assessment). Access requests tile added; pending
  requests appear in approvers' bell. Training overview: "Batches in progress" moved to the bottom.

## v23 — security and data integrity (see SECURITY-REVIEW.md)
- Identity by employee ID in the database; unique display names and cascaded renames in the app.
- Results are decided on the server (Edge Function `learning`): grading, attempt limits, completion, surveys,
  feedback answers; learners can't write results, can't read answer keys, other people's records or contact details.
- Versioned saves with field-level merge, Realtime, no dropped changes; role from the server; employee-ID sign-in
  on the server; temporary passwords that must be changed; logins created on import and for ZingHR joiners.
- SCORM .zip upload: extracted to a private bucket and served same-origin by functions/content (Cloudflare Pages).
- File links signed per request with entitlement checks; type checks on upload; nightly backups; CSP; vendored
  supabase-js; tests (`npm test`, tests/e2e/).

## v24 — second security review (see SECURITY-REVIEW.md)
SCORM on a separate content origin with launch tokens and a postMessage bridge; no employee IDs in directories or
shared rows; employee-ID sign-in checked in SQL then done from the user's own IP; custom-role permissions enforced in
RLS and Edge Functions; batch membership admin-only (no self-granted scope); policies evaluated once per statement
(measured); app served from public/ only; encrypted R2 backups; staff-only Realtime; CI with real PostgreSQL tests.
Layout: public/ (app) · content-site/ (SCORM host) · supabase/ (SQL, Edge Functions) · tests/ · scripts/

## v26 — third security review (see SECURITY-REVIEW.md)
SCORM content site: path traversal closed (raw-URL segments decoded once, no `/ \ %` or dot segments, final storage
URL must stay under the package); launch links tied to a server-side launch session (relaunch, leaving, sign-out and
30-minute idle revoke them). SCORM completion only through the server after a real launch and the minimum time;
completion messages checked for origin and frame. Answer keys for question-bank/assessment authors only (Gradebook
raters get the question in each review). Preferences, bookmarks and survey answers are owner-only, and survey
results are reported as aggregates. Employee-ID sign-in throttled per ID+IP, progressive, no `pg_sleep`, with
cleanup and a trusted client IP. SVG uploads refused. Bundled build (`npm run build` → `dist/`); CI runs browser
e2e, the bundled build, and the Edge Functions on the real Supabase edge runtime.

## v27 / v28 — Analytics Studio and Documents library (see V27-V28-CHANGES.md)
KPI builder (custom formula KPIs with targets/RAG, e.g. `hrms_joined_day0 - ABSENT_DAY(1)`), People (HRMS) dataset, spider web,
gauge, treemap, two-dimension heat maps, table column chooser, drill-through to records, templates, role-shared view-only
dashboards (permission dashView), schedules (internal domains only; e-mail delivery needs a server job), Power BI CSV extracts.
Documents menu for everyone; Settings › Communication › Documents library for managers (versions, audience, dates, required
reading with server-recorded acknowledgements). CSV exports are protected against formula injection.

## v29 — audit fixes (see V29-AUDIT-FIXES.md)
Dashboards stored per board/KPI/schedule with per-role database access; viewers see a published snapshot; schedule recipients
checked by the database; attrition excludes did-not-join (no more rates above 100%); day-1 KPIs show — when not marked;
HRMS day 0 = New Hire batches only; real data in every report and Engagement trends; per-session filters; one time zone.

## v30 (see V30-CHANGES-AND-SECURITY.md)
Training overview & MIS: every tab is a customisable dashboard (MIS included), + New dashboard on the Training page, KPI tile
editor, and the bug where Training edits changed an Analytics board is fixed. Certificates only for courses with Certificate on.
Attack suite (tests/e2e/attack_e2e.py) with engine-level URL/style guards, prototype-pollution guards, clickjacking guard for
GitHub Pages, idle sign-out and a 10 MB CSV limit.

## v31 (see V31-RECHECK.md)
Full recheck of v30. Idle sign-out no longer interrupts videos or SCORM and reloads the tab when connected; Reset layout
keeps a created board's own layout; reports count invited people like the dashboards.

## v32 (see V32-RECHECK.md)
Second full recheck: course edits keep progress on the right steps, every course editable, dated completions,
offline assessment passes on dashboards, due dates from App settings (no past-due publishing), essential-training
extensions, real learning paths, bulk/HR deactivation cuts database access, safer access-request approval.

## v33 (see V33-DETAILED-SCAN.md)
Detailed scan: discussion crash fixed; XP, leaderboards, notifications, calendar, sign-ups and votes per person from real data;
bulk upload no longer applies rejected rows and fills division; account expiry enforced; Account password change works when
connected; real dates only; unique certificate IDs; no double-booked rooms.
