# Skillforge LMS — Data storage design

**Where data lives today:** the Skillforge prototype runs entirely in the browser. All data is generated into memory (`js/data/*.js`) and kept in the app state while the page is open, and a refresh resets it. Nothing is stored yet; the files below define what production storage looks like. The table definitions are in `skillforge_schema.sql`.

## 1. Storage layers

| Layer | Technology (suggested) | What it holds |
|---|---|---|
| Relational database | PostgreSQL 15+ (managed, e.g. Azure Database for PostgreSQL) | Everything structured: people, roles, courses, enrolments, learning records, attempts, batches, MIS, feedback, configuration |
| Object storage | Azure Blob / S3 (private container) | Uploaded files: documents, video, audio, images, SCORM packages (zip and extracted folder), certificate backgrounds, issued certificate PNGs, report exports |
| Cache | Redis | Sessions, dashboard and report aggregates, rate limits |
| Search (optional) | PostgreSQL `pg_trgm`; OpenSearch if the question bank grows past ~100k | Name, course and question search |
| Secrets | Key Vault / Secrets Manager | ZingHR client secret, SSO keys, SMTP credentials |
| Queue / jobs | Postgres-backed job table or Azure Service Bus | ZingHR sync, feedback sends, reminders, MIS refresh, big exports |

## 2. Data volumes and how they are handled

| Table | Expected rows | Handling |
|---|---|---|
| `app_user` | ~3,500 active (+ leavers) | Indexed by status, manager and sub division; trigram search on name |
| `course` / `course_item` | ~1,000 / ~5,000 | Small |
| `enrolment` | ~125,000 live (25–50 per person) | Primary key (user, course); index on course and on open due dates. Status and % are stored so dashboards don't recompute |
| `learning_record` | 0.6–1.2M+ and growing | Hash-partitioned by user (8 partitions); index on (course, completed_at) for course reports |
| `assessment_attempt` / `attempt_answer` | ~50k / ~1M per year | Indexed by assessment and by user + date (assessment result reports) |
| `batch_trainee` / `trainee_status_event` / `attendance` | ~3k / ~6k / ~45k per year | `mis_row` materialized view refreshed on change (the MIS tab reads only this) |
| `hr_change_log`, `audit_log` | Tens of thousands per year | Range-partitioned by year; old years archived to cold storage |
| `feedback_request` | ~20k per year | Index on unsent due dates for the send job |

Reports and dashboards query the database with filters and paging (50 rows per page). Exports larger than ~300k rows are built as a background job and emailed as a link.

## 3. Files (object storage)

```
lcms/{yyyy}/{mm}/{uuid}/{original-name}          documents, media, images
scorm/{module-id}/package.zip                     uploaded SCORM zip (kept for re-processing)
scorm/{module-id}/content/...                     extracted package; launch file from imsmanifest.xml
certificates/templates/v{n}/background.{png|jpg}
certificates/issued/{yyyy}/{certificate-id}.png
exports/{yyyy-mm-dd}/{job-id}.{csv|xlsx}          expire after 7 days
```

- Only metadata (`stored_file`) is in the database; the app serves files through short-lived signed URLs.
- SCORM content is served from the **same origin** as the LMS (e.g. `/content/scorm/...` behind the app gateway) so packages can reach the SCORM API.
- Virus scanning on upload; size limits per type (e.g. 500 MB for video, 1 GB for SCORM).

## 4. Integrations

- **ZingHR → `app_user`:** a scheduled job (nightly by default) pulls the employee master and applies new joiners, changes and leavers. Every field change is written to `hr_change_log`, which is the Data migration report.
- **Bulk uploads (UserMaster, CourseApplicability, questions, holidays):** validated server-side; rejected rows are returned as a file. They never write partially: valid rows are applied in one transaction.
- **SCORM:** the LMS API (1.2 `API` / 2004 `API_1484_11`) writes to `scorm_runtime`; completion creates the `learning_record` row.
- **xAPI (later):** needs a learning record store; statements can be stored in an `xapi_statement` table (jsonb) or an external LRS.

## 5. Security and retention

- **Access:** passwords are hashed (argon2id), and the default reset password is never stored in plain text. Personal data columns are encrypted at rest (database-level encryption), and all traffic uses TLS.
- **Permissions:** role permissions are enforced on the API as well as hidden in the UI. Trainers only see batches they run, plus learner data for those batches.
- **Retention (to confirm with HR / legal):**
  - Learning records and certificates: kept for employment plus 7 years.
  - Audit log: 3 years online, then archived.
  - Leaver accounts: deactivated, not deleted, so reports stay correct.
- **Backups:** point-in-time recovery (35 days) and a daily snapshot to a second region; object storage uses versioning.

## 6. Mapping from the prototype

| Prototype state | Database |
|---|---|
| `users`, `passwords`, `prefs` | `app_user`, `user_credential`, `user_pref` |
| `roles` | `role`, `role_permission`, `role_course` |
| `masters` | `master_list` |
| `adminCourses`, `cats`, `paths` | `course`, `course_item`, `category`, `learning_path*` |
| `lcms` (incl. Survey and Feedback form) | `lcms_module`, `scorm_package`, `feedback_form_target`, `stored_file` |
| `qs`, `quizzes` | `question`, `question_tag`, `assessment`, `assessment_question` |
| `enroll`, `assignedOn` | `enrolment` |
| `itemDone`, `itemQuiz`, `attemptRecs`, `reviews`, `extraAttempts` | `learning_record`, `assessment_attempt`, `attempt_answer`, `extra_attempt` |
| `bookmarks`, `bmLog` | `scorm_runtime`, `bookmark_reset_log` |
| `surveyResp` | `survey_response` |
| `accessReqs` | `access_request` |
| `extHistory` | `external_history` |
| `batches`, `ttypes`, `statuses`, `holidays`, `places` | `batch`, `batch_trainee`, `trainee_status_event`, `attendance`, `external_score`, `ews_flag`, `batch_audit`, `training_type`, `trainee_status`, `holiday`, `training_place` |
| `fbLog` | `feedback_request` |
| `certTpl`, `badges` | `certificate_template`, `issued_certificate`, `badge`, `badge_award` |
| `syncLog`, `zh.runs` | `hr_change_log`, `hr_sync_run` |
| `tiles`, `repCols`, `dash`, branding | `ui_config` |
| `anns`, `autos`, notifications, audit | `announcement`, `automation_rule`, `notification`, `audit_log` |
