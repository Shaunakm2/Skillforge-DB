-- UNUSED. Not applied by any migration or test; kept for reference only. The live schema is supabase/migrations/.
-- =====================================================================================================
-- Skillforge LMS — database schema (PostgreSQL 15+)
-- Matches the data model of the Skillforge prototype (v21). Sizing target: ~3,500 active people,
-- ~1,000 courses, 25–50 assigned per person (~125k assignments), ~600k–1.2M module-level learning records,
-- ~150 training batches / year.
-- Conventions: bigint identity keys, timestamptz in UTC, soft delete via status/archived, created/updated audit.
-- =====================================================================================================

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fast "contains" search on names, titles, questions

-- -----------------------------------------------------------------------------------------------------
-- 1. Organisation, people, roles
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE master_list (                         -- Settings › Master data › MIS lists
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_key    text NOT NULL,                       -- 'segments','trainingNames','divisions','subDivisions','locations','brands',
                                                   -- 'workModes','traineeTypes','attritionCats','attritionResp','attritionReasons','education','divisionHeads'
  value       text NOT NULL CHECK (length(value) BETWEEN 1 AND 60),
  parent_id   bigint REFERENCES master_list(id),   -- sub division → division, division → head
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX master_list_value_uq ON master_list (list_key, lower(value));

CREATE TABLE role (                                -- Settings › Roles & permissions
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  base_type   text NOT NULL CHECK (base_type IN ('Learner','Trainer','Admin')),
  description text,
  builtin     boolean NOT NULL DEFAULT false
);
CREATE TABLE role_permission (role_id bigint REFERENCES role(id) ON DELETE CASCADE, permission text NOT NULL, PRIMARY KEY (role_id, permission));
                                                   -- permission keys: users, roles, qbank, quizzes, lcms, lcmsForms, courseAdmin, assignments, attempts,
                                                   -- bookmarks, certs, categories, paths, builder, batches, places, gradebook, feedback, announcements,
                                                   -- automations, reports, reportsCompletion, analytics, dashboard, audit, integrations, branding, migration, masters

CREATE TABLE app_user (                            -- Users & accounts (source: ZingHR, bulk upload or manual)
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emp_id          citext NOT NULL UNIQUE,          -- UserId / EmployeeCode
  email           citext NOT NULL UNIQUE,
  full_name       text   NOT NULL,
  preferred_name  text,
  phone           text CHECK (phone ~ '^[0-9+ ()-]{7,20}$'),
  role_id         bigint NOT NULL REFERENCES role(id),
  status          text NOT NULL DEFAULT 'Invited' CHECK (status IN ('Invited','Active','Deactivated')),
  manager_id      bigint REFERENCES app_user(id),
  division_id     bigint REFERENCES master_list(id),
  sub_division_id bigint REFERENCES master_list(id),
  location_id     bigint REFERENCES master_list(id),
  brand_id        bigint REFERENCES master_list(id),
  designation     text, gender text, work_mode text, education text, job_role text, account_name text,
  date_of_joining date, date_of_birth date, account_expiry date, exp_months int,
  source          text NOT NULL DEFAULT 'Skillforge' CHECK (source IN ('Skillforge','ZingHR','Bulk upload')),
  terms_accepted_at timestamptz, last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON app_user (status);
CREATE INDEX ON app_user (manager_id);
CREATE INDEX ON app_user (sub_division_id);
CREATE INDEX app_user_name_trgm ON app_user USING gin (full_name gin_trgm_ops);

CREATE TABLE user_credential (user_id bigint PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  password_hash text NOT NULL,                     -- argon2id; default reset password is hashed, never stored in plain text
  must_change boolean NOT NULL DEFAULT true, changed_at timestamptz);
CREATE TABLE user_pref (user_id bigint PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE, prefs jsonb NOT NULL DEFAULT '{}');  -- notifications, tz, date format, goal, motion

-- -----------------------------------------------------------------------------------------------------
-- 2. Content: LCMS, question bank, assessments, courses
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE category (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, parent_id bigint REFERENCES category(id), level smallint NOT NULL CHECK (level BETWEEN 1 AND 3));

CREATE TABLE stored_file (                         -- metadata only; bytes live in object storage (see storage doc)
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,                -- e.g. lcms/2026/10/<uuid>/handbook.pdf
  file_name text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL, sha256 text,
  uploaded_by bigint REFERENCES app_user(id), uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE question (                            -- Question bank
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref_code text UNIQUE,                            -- QB-0001
  text text NOT NULL,
  q_type text NOT NULL CHECK (q_type IN ('Multiple choice','Multiple select','True / False','Image options','Match the following','Likert scale','Fill in the blank','Ordering','Written answer')),
  difficulty text NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
  category text, skill text, bloom text, language text DEFAULT 'English',
  explanation text, points smallint,               -- points for written answers
  body jsonb NOT NULL DEFAULT '{}',                -- options, correct answer(s), pairs, ordering items, accepted answers, rubric
  media_file_id bigint REFERENCES stored_file(id),
  archived boolean NOT NULL DEFAULT false,
  author_id bigint REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE question_tag (question_id bigint REFERENCES question(id) ON DELETE CASCADE, tag citext NOT NULL, PRIMARY KEY (question_id, tag));
CREATE INDEX question_text_trgm ON question USING gin (text gin_trgm_ops);
CREATE INDEX ON question (q_type, difficulty, skill) WHERE NOT archived;

CREATE TABLE assessment (                          -- "Assessments" (formerly Quizzes): questions + rules
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL, pass_pct smallint NOT NULL CHECK (pass_pct BETWEEN 0 AND 100),
  time_limit_min smallint, max_attempts smallint,  -- NULL = unlimited
  shuffle boolean NOT NULL DEFAULT true, draw_count smallint,  -- random draw from the pool when set
  show_review text CHECK (show_review IN ('none','incorrect','all'))
);
CREATE TABLE assessment_question (assessment_id bigint REFERENCES assessment(id) ON DELETE CASCADE, question_id bigint REFERENCES question(id), position int NOT NULL, PRIMARY KEY (assessment_id, question_id));

CREATE TABLE lcms_module (                         -- LCMS: every reusable step
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,                       -- MOD-001
  module_type text NOT NULL CHECK (module_type IN ('Document','Video','Audio','SCORM','Image','Web link','Assessment','Acknowledgment','Survey','Feedback form')),
  title text NOT NULL, description text, minutes smallint,
  file_id bigint REFERENCES stored_file(id),       -- documents, media, SCORM zip
  url text, ack_text text,
  assessment_id bigint REFERENCES assessment(id),
  form jsonb,                                      -- Survey / Feedback form questions: [{t, kind:'rating'|'text'}]
  -- Feedback form (Kirkpatrick) settings
  kp_level text CHECK (kp_level IN ('L1','L2','L3','L4')),
  kp_audience text CHECK (kp_audience IN ('Learner','Manager','Learner & manager')),
  kp_days smallint CHECK (kp_days IN (0,30,60,90)),
  kp_all_courses boolean NOT NULL DEFAULT false,
  owner_id bigint REFERENCES app_user(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scorm_package (module_id bigint PRIMARY KEY REFERENCES lcms_module(id) ON DELETE CASCADE,
  version text NOT NULL CHECK (version IN ('1.2','2004')), manifest jsonb NOT NULL, launch_path text NOT NULL, extracted_prefix text NOT NULL);
CREATE TABLE feedback_form_target (module_id bigint REFERENCES lcms_module(id) ON DELETE CASCADE,
  course_id bigint, training_name_id bigint REFERENCES master_list(id),
  CHECK ((course_id IS NULL) <> (training_name_id IS NULL)));   -- one row per course or training the form is sent for

CREATE TABLE course (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,                       -- CRS-1001
  title text NOT NULL, about text, language text DEFAULT 'English',
  category_id bigint REFERENCES category(id),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published')),
  available_from timestamptz, available_until timestamptz, active boolean NOT NULL DEFAULT true,
  features jsonb NOT NULL DEFAULT '{}',            -- linear, selfComplete, cert, review rules…
  recert text DEFAULT 'Never',
  essential boolean NOT NULL DEFAULT false, essential_days smallint DEFAULT 30, essential_from date,
  auto_assign_new_joiners boolean NOT NULL DEFAULT false,
  icon_file_id bigint REFERENCES stored_file(id), banner_file_id bigint REFERENCES stored_file(id),
  author_id bigint REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feedback_form_target ADD FOREIGN KEY (course_id) REFERENCES course(id) ON DELETE CASCADE;
CREATE INDEX course_title_trgm ON course USING gin (title gin_trgm_ops);

CREATE TABLE course_item (                         -- the ordered steps of a course
  course_id bigint REFERENCES course(id) ON DELETE CASCADE, position smallint NOT NULL,
  module_id bigint NOT NULL REFERENCES lcms_module(id), essential boolean NOT NULL DEFAULT true,
  PRIMARY KEY (course_id, position)
);
CREATE TABLE learning_path (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, description text);
CREATE TABLE learning_path_course (path_id bigint REFERENCES learning_path(id) ON DELETE CASCADE, course_id bigint REFERENCES course(id), position smallint, PRIMARY KEY (path_id, course_id));
CREATE TABLE role_course (role_id bigint REFERENCES role(id) ON DELETE CASCADE, course_id bigint REFERENCES course(id) ON DELETE CASCADE, PRIMARY KEY (role_id, course_id));  -- default courses per role

-- -----------------------------------------------------------------------------------------------------
-- 3. Assignment and learning records (the high-volume tables)
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE enrolment (                           -- a course assigned to a person (~125k live rows)
  user_id bigint REFERENCES app_user(id), course_id bigint REFERENCES course(id),
  assigned_on date NOT NULL DEFAULT current_date, due_on date,
  source text NOT NULL CHECK (source IN ('Manual','Bulk upload','Role','Essential','Access request','Path','Batch')),
  assigned_by bigint REFERENCES app_user(id),
  status text NOT NULL DEFAULT 'Not started' CHECK (status IN ('Not started','In progress','Completed','Overdue')),  -- maintained by trigger/job
  completed_on date, completion_pct smallint NOT NULL DEFAULT 0,
  removed_at timestamptz,                          -- unassign = soft delete; progress kept if reassigned
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX ON enrolment (course_id) WHERE removed_at IS NULL;
CREATE INDEX ON enrolment (due_on) WHERE removed_at IS NULL AND status <> 'Completed';

CREATE TABLE learning_record (                     -- one row per person × course × step completed (~0.6–1.2M rows)
  user_id bigint NOT NULL, course_id bigint NOT NULL, position smallint NOT NULL,
  completed_at timestamptz NOT NULL, score numeric(5,2),       -- assessment best score when the step is an assessment
  time_spent_sec int, source text NOT NULL DEFAULT 'Skillforge',
  PRIMARY KEY (user_id, course_id, position)
) PARTITION BY HASH (user_id);
CREATE TABLE learning_record_p0 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE learning_record_p1 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 1);
CREATE TABLE learning_record_p2 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 2);
CREATE TABLE learning_record_p3 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 3);
CREATE TABLE learning_record_p4 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 4);
CREATE TABLE learning_record_p5 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 5);
CREATE TABLE learning_record_p6 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 6);
CREATE TABLE learning_record_p7 PARTITION OF learning_record FOR VALUES WITH (MODULUS 8, REMAINDER 7);
CREATE INDEX ON learning_record (course_id, completed_at);

CREATE TABLE assessment_attempt (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app_user(id), assessment_id bigint NOT NULL REFERENCES assessment(id),
  course_id bigint REFERENCES course(id), position smallint,
  attempt_no smallint NOT NULL, started_at timestamptz NOT NULL, submitted_at timestamptz,
  question_ids bigint[] NOT NULL,                  -- the drawn/shuffled set shown
  correct smallint, total smallint, score_pct numeric(5,2), passed boolean, final boolean NOT NULL DEFAULT false  -- final = all written answers rated
);
CREATE INDEX ON assessment_attempt (assessment_id, submitted_at);
CREATE INDEX ON assessment_attempt (user_id, submitted_at);
CREATE TABLE attempt_answer (attempt_id bigint REFERENCES assessment_attempt(id) ON DELETE CASCADE, question_id bigint, answer jsonb, is_correct boolean,
  rating smallint, rated_by bigint REFERENCES app_user(id), rated_at timestamptz, PRIMARY KEY (attempt_id, question_id));   -- written answers rated in Gradebook
CREATE TABLE extra_attempt (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id bigint REFERENCES app_user(id), assessment_id bigint REFERENCES assessment(id),
  extra smallint NOT NULL CHECK (extra BETWEEN 1 AND 10), reason text, granted_by bigint REFERENCES app_user(id), granted_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE scorm_runtime (                       -- CMI data per person × course step (resume point = bookmark)
  user_id bigint, course_id bigint, position smallint,
  lesson_location text, suspend_data text, lesson_status text, score_raw numeric(6,2), total_time interval,
  cmi jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id, position)
);
CREATE TABLE bookmark_reset_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id bigint, course_id bigint, completion_reset boolean, reason text, by_user bigint, at timestamptz DEFAULT now());

CREATE TABLE survey_response (user_id bigint, course_id bigint, position smallint, answers jsonb NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, course_id, position));

CREATE TABLE access_request (                      -- Catalog › Request access → Course assignment › Access requests
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app_user(id), course_id bigint NOT NULL REFERENCES course(id),
  reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Declined')),
  requested_at timestamptz NOT NULL DEFAULT now(), decided_by bigint REFERENCES app_user(id), decided_at timestamptz, decision_note text
);
CREATE UNIQUE INDEX ON access_request (user_id, course_id) WHERE status = 'Pending';
CREATE INDEX ON access_request (status, requested_at);

CREATE TABLE external_history (                    -- Migration: completions imported from another LMS
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id bigint REFERENCES app_user(id), course_id bigint REFERENCES course(id),
  external_course text NOT NULL, source_lms text NOT NULL, status text NOT NULL, started_on date, completed_on date, score numeric(5,2), certificate_id text,
  imported_by bigint REFERENCES app_user(id), imported_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------------------------------
-- 4. Training batches (the MIS)
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE training_type (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE, code text NOT NULL, level text NOT NULL,
  pass_pct smallint NOT NULL, lms_weight smallint NOT NULL, ojt_days smallint NOT NULL DEFAULT 5, plan jsonb NOT NULL);  -- day-wise plan, external evaluations and weights
CREATE TABLE trainee_status (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE,
  status_type text NOT NULL CHECK (status_type IN ('active','ojt','attrition','noshow','graduated','absorbed','moved','failed','hold')),
  status_group text NOT NULL CHECK (status_group IN ('training','attrited','handover','other')), builtin boolean NOT NULL DEFAULT false);
CREATE TABLE holiday (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, day date NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE training_place (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, site_id bigint REFERENCES master_list(id), floor text,
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 500), layout text, status text NOT NULL DEFAULT 'Available', it jsonb NOT NULL DEFAULT '{}', notes text);

CREATE TABLE batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE,                       -- e.g. NHI26010
  name text NOT NULL, training_type_id bigint NOT NULL REFERENCES training_type(id),
  training_name_id bigint REFERENCES master_list(id), segment_id bigint REFERENCES master_list(id), trainee_type text,
  division_id bigint REFERENCES master_list(id), trainer_id bigint NOT NULL REFERENCES app_user(id),
  start_on date NOT NULL, classroom_end_on date NOT NULL, ojt_end_on date, handover_on date,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('In person','Virtual','Hybrid')), place_id bigint REFERENCES training_place(id), meeting_url text,
  closed_at timestamptz, closed_by bigint REFERENCES app_user(id), certification jsonb,  -- weights frozen at creation
  created_by bigint REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON batch (start_on);
CREATE INDEX ON batch (trainer_id);
CREATE TABLE batch_trainee (batch_id bigint REFERENCES batch(id) ON DELETE CASCADE, user_id bigint REFERENCES app_user(id), added_at timestamptz DEFAULT now(), PRIMARY KEY (batch_id, user_id));
CREATE INDEX ON batch_trainee (user_id);
CREATE TABLE trainee_status_event (                -- status timeline; current status = latest event
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id bigint NOT NULL, user_id bigint NOT NULL,
  status_id bigint NOT NULL REFERENCES trainee_status(id), effective_on date NOT NULL,
  attrition_category text, attrition_responsibility text, reason text, details text, target text, note text,
  by_user bigint REFERENCES app_user(id), at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id, user_id) REFERENCES batch_trainee(batch_id, user_id) ON DELETE CASCADE
);
CREATE INDEX ON trainee_status_event (batch_id, user_id, effective_on DESC);
CREATE TABLE attendance (batch_id bigint, user_id bigint, day date, mark char(1) NOT NULL CHECK (mark IN ('P','L','A','E')), by_user bigint, at timestamptz DEFAULT now(),
  PRIMARY KEY (batch_id, user_id, day));
CREATE TABLE external_score (batch_id bigint, user_id bigint, eval_key text, score numeric(6,2), by_user bigint, at timestamptz DEFAULT now(), PRIMARY KEY (batch_id, user_id, eval_key));
CREATE TABLE ews_flag (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id bigint, user_id bigint, severity text CHECK (severity IN ('Medium','High')), note text NOT NULL,
  raised_by bigint, raised_at timestamptz DEFAULT now(), closed_at timestamptz, closed_by bigint);
CREATE TABLE batch_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, batch_id bigint REFERENCES batch(id) ON DELETE CASCADE, area text, text text, before text, after text, by_user bigint, by_role text, at timestamptz DEFAULT now());

-- MIS: one row per trainee per batch, refreshed on status/attendance change (fast filters for the MIS tab)
CREATE MATERIALIZED VIEW mis_row AS
SELECT b.id AS batch_id, b.code AS batch, bt.user_id, b.start_on, b.classroom_end_on, b.ojt_end_on, b.handover_on,
       ev.status_id, ts.status_type, ts.status_group, ev.effective_on AS status_on, ev.attrition_category, ev.attrition_responsibility, ev.reason
FROM batch b JOIN batch_trainee bt ON bt.batch_id = b.id
LEFT JOIN LATERAL (SELECT * FROM trainee_status_event e WHERE e.batch_id = b.id AND e.user_id = bt.user_id ORDER BY effective_on DESC, id DESC LIMIT 1) ev ON true
LEFT JOIN trainee_status ts ON ts.id = ev.status_id;
CREATE UNIQUE INDEX ON mis_row (batch_id, user_id);

-- -----------------------------------------------------------------------------------------------------
-- 5. Feedback, certificates, badges, communication
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE feedback_request (                    -- one per form × learner × recipient × source
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, form_module_id bigint NOT NULL REFERENCES lcms_module(id),
  learner_id bigint NOT NULL REFERENCES app_user(id), recipient_id bigint NOT NULL REFERENCES app_user(id), recipient_as text NOT NULL,
  course_id bigint REFERENCES course(id), batch_id bigint REFERENCES batch(id),
  due_on date NOT NULL, sent_at timestamptz, responded_at timestamptz, answers jsonb,
  UNIQUE (form_module_id, learner_id, recipient_id, course_id, batch_id)
);
CREATE INDEX ON feedback_request (due_on) WHERE sent_at IS NULL;
CREATE TABLE certificate_template (version int PRIMARY KEY, background_file_id bigint REFERENCES stored_file(id), fields jsonb NOT NULL, note text, by_user bigint, at timestamptz DEFAULT now(), current boolean NOT NULL DEFAULT false);
CREATE TABLE issued_certificate (id text PRIMARY KEY, user_id bigint REFERENCES app_user(id), course_id bigint REFERENCES course(id), template_version int REFERENCES certificate_template(version), issued_on date NOT NULL, expires_on date);
CREATE TABLE badge (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, glyph text, name text NOT NULL UNIQUE, description text, metric text NOT NULL, threshold int NOT NULL, color text, active boolean NOT NULL DEFAULT true);
CREATE TABLE badge_award (badge_id bigint REFERENCES badge(id), user_id bigint REFERENCES app_user(id), awarded_at timestamptz DEFAULT now(), PRIMARY KEY (badge_id, user_id));
CREATE TABLE announcement (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text, body text, audience jsonb, live_until timestamptz, created_by bigint, created_at timestamptz DEFAULT now());
CREATE TABLE automation_rule (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text, trigger jsonb, action jsonb, enabled boolean DEFAULT true);
CREATE TABLE notification (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id bigint REFERENCES app_user(id), kind text, text text, link text, created_at timestamptz DEFAULT now(), read_at timestamptz);
CREATE INDEX ON notification (user_id, created_at DESC);

-- -----------------------------------------------------------------------------------------------------
-- 6. Integration, migration, audit, configuration
-- -----------------------------------------------------------------------------------------------------
CREATE TABLE integration (id text PRIMARY KEY, name text, category text, enabled boolean, config jsonb);  -- secrets in a vault, not here
CREATE TABLE hr_sync_run (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source text NOT NULL, kind text CHECK (kind IN ('Incremental','Full')), started_at timestamptz, finished_at timestamptz,
  read_n int, created_n int, updated_n int, deactivated_n int, failed_n int, triggered_by text);
CREATE TABLE hr_change_log (                       -- Data migration report (every change from ZingHR / APIs)
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id bigint REFERENCES hr_sync_run(id), received_at timestamptz NOT NULL,
  source text NOT NULL, change_type text NOT NULL, emp_id text, user_id bigint, field text, before_value text, after_value text,
  result text NOT NULL CHECK (result IN ('Applied','Skipped','Failed')), note text
) PARTITION BY RANGE (received_at);
CREATE TABLE hr_change_log_2026 PARTITION OF hr_change_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE INDEX ON hr_change_log (received_at);

CREATE TABLE audit_log (id bigint GENERATED ALWAYS AS IDENTITY, at timestamptz NOT NULL DEFAULT now(), actor_id bigint, actor_role text, action text NOT NULL, target text, detail jsonb, ip inet,
  PRIMARY KEY (id, at)) PARTITION BY RANGE (at);
CREATE TABLE audit_log_2026 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE ui_config (                           -- Tile management, report columns, dashboards, branding
  scope text NOT NULL,                             -- 'tiles:home' | 'tiles:settings' | 'tiles:batchcard' | 'tiles:training' | 'reportcols:<report>' | 'dashboard:<id>' | 'branding'
  owner_id bigint,                                 -- NULL = organisation-wide; a user id for personal layouts
  config jsonb NOT NULL, updated_by bigint, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (scope, owner_id)
);
