-- =====================================================================================================
-- Skillforge LMS — Supabase setup (SQL Editor or `supabase db push`). Idempotent. Tested on PostgreSQL 16 with
-- tests/db (real RLS, every role × collection, triggers, login throttle, load).
--
-- Identity     A login is one person: sf_member (user_id → emp_id, user_key = the person's record key, role, role_id).
--              Per-person rows are keyed by employee ID. Learners never see other people's employee IDs (the
--              login username): directories and shared rows use the record key instead.
-- Permissions  role = base type (Learner / Trainer / Admin); role_id = the custom role in Settings › Roles, whose
--              permissions (roles row, data.perms) are enforced HERE as well as in the UI. Admin = everything.
-- Results      Grading, attempt counts, completion, surveys, feedback answers, requests and forum posts are
--              written only by the Edge Function "learning" (service role).
-- Temp passwd  A session whose JWT says must_change = true has no access at all until the password is changed.
-- Private      prefs, bookmarks and survey answers are readable by their owner only (admins: everything; the
--              SCORM-bookmark tool: bookmarks). Reports use aggregates (sf_survey_summary), never other people's rows.
-- Answer keys  The question bank (qs) is readable only with the Question bank or Assessments permission. Raters
--              (Gradebook) get the question text and points inside each review row instead.
-- Concurrency  Every row has a version; sf_save() writes only if the version is unchanged (else returns current).
-- =====================================================================================================

-- crypt() for the employee-ID login check (pgcrypto is installed on every Supabase project)
do $$ begin create extension if not exists pgcrypto with schema extensions; exception when others then raise notice 'pgcrypto: %', sqlerrm; end $$;

-- ---------- membership ----------
create table if not exists public.sf_member (
  org_id     text        not null,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  email      text        not null,
  emp_id     text        not null,
  user_key   text,                                  -- key of the person's row in sf_doc 'users'
  app_name   text        not null,
  role       text        not null default 'Learner' check (role in ('Learner','Trainer','Admin')),
  role_id    text,                                  -- custom role (sf_doc 'roles' key); null = default for the base type
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.sf_member add column if not exists user_key text;
alter table public.sf_member add column if not exists role_id text;
create unique index if not exists sf_member_emp   on public.sf_member (org_id, emp_id);
create unique index if not exists sf_member_email on public.sf_member (org_id, lower(email));
create index        if not exists sf_member_user  on public.sf_member (user_id);

-- ---------- data ----------
create table if not exists public.sf_doc (
  org_id     text        not null,
  coll       text        not null,
  key        text        not null,
  data       jsonb       not null,
  version    int         not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, coll, key)
);
alter table public.sf_doc add column if not exists version int not null default 1;
create index if not exists sf_doc_coll      on public.sf_doc (org_id, coll);
create index if not exists sf_doc_users_emp on public.sf_doc (org_id, (data->>'empId')) where coll = 'users';

create table if not exists public.sf_audit (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  org_id text not null, actor uuid, op text not null, coll text not null, key text not null, version int
);
create index if not exists sf_audit_at on public.sf_audit (org_id, at desc);

-- Trainer → trainee pairs, maintained from batches by a trigger (fast scope checks; no per-row scan of batches).
create table if not exists public.sf_trainee (
  org_id text not null, batch_key text not null, trainer_emp text not null, trainee_emp text not null,
  primary key (org_id, batch_key, trainee_emp)
);
create index if not exists sf_trainee_pair on public.sf_trainee (org_id, trainer_emp, trainee_emp);

-- Employee-ID login attempts (throttle).
create table if not exists public.sf_login_attempt (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  org_id text not null, emp_id text not null, ip text, ok boolean not null
);
create index if not exists sf_login_attempt_emp on public.sf_login_attempt (org_id, emp_id, at desc);
create index if not exists sf_login_attempt_ip  on public.sf_login_attempt (ip, at desc);
create index if not exists sf_login_attempt_pair on public.sf_login_attempt (org_id, emp_id, ip, at desc);
-- Addresses that have signed this person in before (v34): the 'many IPs' pause below does not apply to them.
create table if not exists public.sf_known_ip (org_id text not null, emp_id text not null, ip text not null, last_ok timestamptz not null default now(), primary key (org_id, emp_id, ip));
alter table public.sf_known_ip enable row level security;
revoke all on public.sf_known_ip from anon, authenticated;

-- Server-side values nobody reads through the API (RLS on, no policies).
create table if not exists public.sf_setting (k text primary key, v text not null);
alter table public.sf_setting enable row level security;
revoke all on public.sf_setting from anon, authenticated;

-- ---------- live sessions (v34) ----------
-- A signed-in browser holds an access token (valid until it expires, 1 h by default) and a refresh token behind it.
-- Deactivating, resetting, re-roling or deleting a login calls sf_revoke_sessions(): that deletes the person's rows in
-- auth.sessions, so the refresh token stops working AND every policy below refuses the old access token at once,
-- because sf_me / sf_ctx / sf_member_self require the token's session to still exist. A token without a session_id
-- claim (very old GoTrue) is not checked; tokens only come from GoTrue, so a caller cannot leave the claim out.
create or replace function public.sf_session_live() returns boolean language sql stable security definer set search_path = public as $$
  -- the uuid cast sits inside its own CASE: the planner may evaluate a bare cast early, even in a branch that is never taken
  select case when coalesce(auth.jwt() ->> 'session_id', '') = '' then true
              else exists (select 1 from auth.sessions s where s.user_id = auth.uid()
                             and s.id = (case when (auth.jwt() ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (auth.jwt() ->> 'session_id')::uuid end)) end $$;
grant execute on function public.sf_session_live() to anon, authenticated, service_role;

-- The Edge Functions call these two with the service role (the caller's id and session come from the verified JWT).
create or replace function public.sf_session_ok(p_user uuid, p_sid text) returns boolean language sql stable security definer set search_path = public as $$
  select case when coalesce(p_sid, '') = '' then true
              else exists (select 1 from auth.sessions s where s.user_id = p_user
                             and s.id = (case when p_sid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then p_sid::uuid end)) end $$;
create or replace function public.sf_revoke_sessions(p_user uuid, p_keep text default null) returns int language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from auth.sessions where user_id = p_user and (coalesce(p_keep, '') = '' or id::text <> lower(p_keep));
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.sf_session_ok(uuid, text) from public, anon, authenticated;
revoke all on function public.sf_revoke_sessions(uuid, text) from public, anon, authenticated;
grant execute on function public.sf_session_ok(uuid, text) to service_role;
grant execute on function public.sf_revoke_sessions(uuid, text) to service_role;

-- ---------- who am I ----------
-- Everything goes through sf_me(): one index lookup, and nothing at all while the password must be changed.
create or replace function public.sf_must_change() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'must_change')::boolean, false) $$;

create or replace function public.sf_me(p_org text) returns public.sf_member
language sql stable security definer set search_path = public as $$
  select m.* from sf_member m where m.org_id = p_org and m.user_id = auth.uid() and m.active and sf_session_live() and not sf_must_change() $$;

create or replace function public.sf_role(p_org text) returns text language sql stable security definer set search_path = public as $$
  select (sf_me(p_org)).role $$;
create or replace function public.sf_emp(p_org text) returns text language sql stable security definer set search_path = public as $$
  select (sf_me(p_org)).emp_id $$;
create or replace function public.sf_ukey(p_org text) returns text language sql stable security definer set search_path = public as $$
  select coalesce(m.user_key, (select d.key from sf_doc d where d.org_id = p_org and d.coll = 'users' and d.data->>'empId' = m.emp_id limit 1))
  from sf_me(p_org) m where m.user_id is not null $$;

-- Custom-role permission check (Settings › Roles & permissions). Admin base = all permissions.
-- A member without role_id uses the default role of their base type (r_learner / r_trainer).
create or replace function public.sf_perm(p_org text, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when m.role = 'Admin' then true
              else coalesce((select (d.data -> 'perms' ->> p_perm)::boolean from sf_doc d
                             where d.org_id = p_org and d.coll = 'roles'
                               and d.key = coalesce(m.role_id, case m.role when 'Trainer' then 'r_trainer' else 'r_learner' end)), false) end
  from sf_me(p_org) m where m.user_id is not null $$;

-- Collections a permission lets a non-admin write (admin writes everything). 'roles' is admin-only on purpose:
-- editing permissions would let someone grant themselves more.
create or replace function public.sf_perm_writes(p_coll text) returns text[] language sql immutable as $$
  select case p_coll
    when 'users' then array['users'] when 'groups' then array['users','assignments'] when 'qs' then array['qbank']
    when 'quizzes' then array['quizzes','qbank'] when 'lcms' then array['lcms'] when 'adminCourses' then array['courseAdmin','builder']
    when 'cats' then array['categories'] when 'paths' then array['paths'] when 'anns' then array['announcements']
    when 'autos' then array['automations'] when 'certTpl' then array['certs'] when 'places' then array['places']
    when 'masters' then array['masters'] when 'tiles' then array['masters'] when 'platform' then array['masters'] when 'badges' then array['masters']
    when 'holidays' then array['masters','batches'] when 'ttypes' then array['masters','batches'] when 'statuses' then array['masters','batches']
    when 'brand' then array['branding'] when 'integ' then array['integrations'] when 'zh' then array['integrations']
    when 'extHistory' then array['migration'] when 'syncLog' then array['migration','integrations']
    when 'dash' then array['dashboard'] when 'dashBoard' then array['dashboard'] when 'dashKpi' then array['dashboard'] when 'dashSched' then array['dashboard']
    when 'repCols' then array['reports'] when 'kp' then array['feedback']
    when 'docs' then array['documents'] when 'docCfg' then array['documents']
    else array[]::text[] end $$;
create or replace function public.sf_any_perm(p_org text, p_perms text[]) returns boolean language sql stable as $$
  select coalesce(bool_or(sf_perm(p_org, p)), false) from unnest(p_perms) p $$;

-- Results and other server-written collections: no direct writes except by admins (corrections, seeding).
create or replace function public.sf_server_only(p_coll text) returns boolean language sql immutable as $$
  select p_coll in ('attempt','stepOpen','scormSess','itemDone','itemQuiz','attemptsUsed','attemptRecs','reviews','surveyResp','fbLog','threads','accessReqs','docAck','loginLog') $$;

-- Today's date in the organisation's time zone (documents' effective / expiry dates). Same zone as the app and the Edge
-- Function (ORG_TIMEZONE). Change 'Asia/Kolkata' here if the organisation works in another zone.
create or replace function public.sf_today() returns text language sql stable as $$
  select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') $$;

-- ---------- the caller's context, computed ONCE per statement ----------
-- Policies call sf_ctx() inside a scalar subquery, so Postgres evaluates it once (an InitPlan) and then checks each
-- row with plain expressions (sf_read_ok / sf_write_ok are inlined SQL). One login belongs to one organisation; if
-- someone belongs to several, the app sends the header x-sf-org to pick one.
create or replace function public.sf_ctx() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cached text := current_setting('sf.ctx', true); k text := coalesce(auth.uid()::text, '') || '|' || coalesce(auth.jwt()->'app_metadata'->>'must_change', '') || '|' || coalesce(auth.jwt()->>'session_id', '') || '|' || coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-sf-org', '');
        c jsonb;
begin
  -- cached for the rest of the transaction (bulk saves evaluate policies once per row)
  if cached is not null and cached <> '' and split_part(cached, chr(1), 1) = k then return nullif(split_part(cached, chr(1), 2), '')::jsonb; end if;
  c := (select jsonb_build_object(
    'org', m.org_id, 'emp', m.emp_id, 'admin', m.role = 'Admin', 'role', m.role, 'today', sf_today(),
    'roleId', coalesce(m.role_id, case m.role when 'Admin' then 'r_admin' when 'Trainer' then 'r_trainer' else 'r_learner' end),
    'ukey', coalesce(m.user_key, (select d.key from sf_doc d where d.org_id = m.org_id and d.coll = 'users' and d.data->>'empId' = m.emp_id limit 1)),
    'perms', coalesce((select jsonb_agg(p.key) from sf_doc d, jsonb_each(d.data->'perms') p
                       where d.org_id = m.org_id and d.coll = 'roles' and p.value = 'true'::jsonb
                         and d.key = coalesce(m.role_id, case m.role when 'Trainer' then 'r_trainer' else 'r_learner' end)), '[]'::jsonb),
    'trainees', coalesce((select jsonb_agg(distinct t.trainee_emp) from sf_trainee t
                          where t.org_id = m.org_id and t.trainer_emp = m.emp_id and t.trainee_emp <> m.emp_id), '[]'::jsonb))
  from sf_member m
  where m.user_id = auth.uid() and m.active and sf_session_live() and not sf_must_change()
    -- v33: an account past its expiry date (AccountExpiryDate in the user upload) has no access
    and not exists (select 1 from sf_doc u where u.org_id = m.org_id and u.coll = 'users' and u.data->>'empId' = m.emp_id
                    and coalesce(u.data->>'expires', '') <> '' and u.data->>'expires' < sf_today())
    and (nullif(nullif(current_setting('request.headers', true), ''), '{}') is null
         or coalesce(current_setting('request.headers', true)::json->>'x-sf-org', m.org_id) = m.org_id)
  order by m.org_id limit 1);
  perform set_config('sf.ctx', k || chr(1) || coalesce(c::text, ''), true);
  return c;
end $$;


-- plpgsql (not SQL): its expression plan is cached, ~5x faster per row than a non-inlined SQL function.
create or replace function public.sf_read_ok(c jsonb, o text, coll text, k text, d jsonb) returns boolean language plpgsql immutable as $$
begin
  return coalesce(c is not null and o = c->>'org' and coll not in ('attempt','stepOpen','scormSess') and (
       (c->>'admin')::boolean
    or coll in ('lcms','quizzes','cats','paths','anns','badges','masters','tiles','platform','brand','certTpl','holidays','roles','statuses','threads')
    -- private per-person rows: owner only (bookmarks also for the SCORM-bookmark tool)
    or (coll in ('prefs','surveyResp') and k = c->>'emp')
    or (coll = 'bookmarks' and (k = c->>'emp' or c->'perms' ? 'bookmarks'))
    or (coll in ('enroll','itemDone','itemQuiz','attemptsUsed','extraAttempts','assignedOn')
        and (k = c->>'emp' or c->'perms' ?| array['reports','analytics','dashboard']
             or (c->'perms' ?| array['batches','assignments','attempts','gradebook'] and c->'trainees' ? k)))
    or (coll = 'users' and (d->>'empId' = c->>'emp' or c->'perms' ?| array['users','reports'] or (c->'perms' ? 'batches' and c->'trainees' ? (d->>'empId'))))
    or (coll in ('attemptRecs','extHistory') and (d->>'empId' = c->>'emp' or c->'perms' ? 'reports'
        or (c->'perms' ?| array['batches','attempts','gradebook'] and c->'trainees' ? (d->>'empId'))))
    or (coll = 'reviews' and (d->>'learnerEmp' = c->>'emp' or c->'perms' ?| array['gradebook','reports']
        or (c->'perms' ?| array['batches','attempts'] and c->'trainees' ? (d->>'learnerEmp'))))
    or (coll = 'fbLog' and (split_part(k, '|', 4) = c->>'emp' or c->'perms' ?| array['feedback','reports']))
    or (coll = 'accessReqs' and (d->>'empId' = c->>'emp' or d->>'managerKey' = c->>'ukey' or c->'perms' ? 'assignments'))
    or (coll = 'adminCourses' and (d->>'status' = 'Published' or c->'perms' ?| array['courseAdmin','builder','assignments','lcms']))
    or (coll = 'batches' and (c->'perms' ?| array['dashboard','reports','analytics'] or (c->'perms' ? 'batches' and d->>'trainerEmp' = c->>'emp')))
    or (coll = 'qs' and c->'perms' ?| array['qbank','quizzes'])          -- answer keys: authors only (not Gradebook)
    or (coll = 'attemptLog' and c->'perms' ? 'attempts')
    or (coll = 'bmLog' and c->'perms' ? 'bookmarks')
    or (coll in ('ttypes','places','groups') and c->'perms' ?| array['batches','places','assignments','masters'])
    -- v27 documents library: published, for the reader's user type, inside its effective..expiry dates (managers: all)
    or (coll = 'docs' and (c->'perms' ? 'documents' or (d->>'status' = 'Published'
        and (d->'audience' ? 'All' or d->'audience' ? (c->>'role'))
        and coalesce(nullif(d->>'effective', ''), '0000') <= (c->>'today')
        and coalesce(nullif(d->>'expiry', ''), '9999') >= (c->>'today'))))
    or (coll = 'docCfg')
    or (coll = 'docAck' and (k = c->>'emp' or c->'perms' ? 'documents'))
    or (coll = 'loginLog' and (k = c->>'emp' or c->'perms' ? 'reports'))
    -- v29 dashboards: one row per board. Viewers (dashView) read only boards shared with everyone or with their role;
    -- the board carries the published snapshot (aggregate numbers), never learner records. KPIs, schedules and
    -- templates ('dashKpi', 'dashSched', 'dash') are for dashboard editors only (generic rule below).
    or (coll = 'dashBoard' and (c->'perms' ? 'dashboard' or (c->'perms' ? 'dashView' and k not in ('mis', 'mistab', 'attr') and coalesce(d->>'area', '') <> 'train'
        and (coalesce(jsonb_array_length(d->'audience'), 0) = 0 or d->'audience' ? (c->>'roleId')))))
    or (coll not in ('enroll','itemDone','itemQuiz','attemptsUsed','extraAttempts','bookmarks','surveyResp','prefs','assignedOn','users','attemptRecs','extHistory','reviews','fbLog','accessReqs','adminCourses','batches','qs','attemptLog','bmLog','docs','docAck','dashBoard','loginLog')
        and c->'perms' ?| sf_perm_writes(coll))), false);
end $$;

-- plpgsql (not SQL): its expression plan is cached, ~5x faster per row than a non-inlined SQL function.
create or replace function public.sf_write_ok(c jsonb, o text, coll text, k text, d jsonb) returns boolean language plpgsql immutable as $$
begin
  return coalesce(c is not null and o = c->>'org' and coll not in ('attempt','stepOpen','scormSess') and (
       (c->>'admin')::boolean
    or (not sf_server_only(coll) and coll <> 'roles' and (
          (coll in ('prefs','bookmarks') and k = c->>'emp')
       or (coll = 'bookmarks' and c->'perms' ? 'bookmarks')                -- Settings › Clear SCORM bookmarking
       or (coll = 'batches' and c->'perms' ? 'batches' and d->>'trainerEmp' = c->>'emp')
       or (coll in ('enroll','assignedOn') and c->'perms' ? 'assignments' and c->'trainees' ? k)
       or (coll = 'extraAttempts' and c->'perms' ? 'attempts' and c->'trainees' ? k)
       or (coll = 'attemptLog' and c->'perms' ? 'attempts' and d->>'byEmp' = c->>'emp')
       or (coll = 'bmLog' and c->'perms' ? 'bookmarks' and d->>'byEmp' = c->>'emp')
       or (coll = 'lcms' and (c->'perms' ? 'lcms' or (c->'perms' ? 'lcmsForms' and d->>'type' in ('Survey','Feedback form') and d->>'ownerEmp' = c->>'emp')))
       or (coll not in ('prefs','bookmarks','batches','enroll','assignedOn','extraAttempts','attemptLog','bmLog','lcms') and c->'perms' ?| sf_perm_writes(coll))))), false);
end $$;

-- ---------- row level security ----------
alter table public.sf_member        enable row level security;
alter table public.sf_doc           enable row level security;
alter table public.sf_audit         enable row level security;
alter table public.sf_trainee       enable row level security;
alter table public.sf_login_attempt enable row level security;

drop policy if exists sf_member_self  on public.sf_member;
drop policy if exists sf_member_admin on public.sf_member;
create policy sf_member_self  on public.sf_member for select using (user_id = auth.uid() and sf_session_live() and not sf_must_change());
create policy sf_member_admin on public.sf_member for select using (sf_role(org_id) = 'Admin');
-- sf_member is written only by the Edge Function admin-users (service role). sf_trainee only by the trigger.

drop policy if exists sf_doc_read   on public.sf_doc;
drop policy if exists sf_doc_insert on public.sf_doc;
drop policy if exists sf_doc_update on public.sf_doc;
drop policy if exists sf_doc_delete on public.sf_doc;
create policy sf_doc_read   on public.sf_doc for select using (sf_read_ok((select sf_ctx()), org_id, coll, key, data));
create policy sf_doc_insert on public.sf_doc for insert with check (sf_write_ok((select sf_ctx()), org_id, coll, key, data));
create policy sf_doc_update on public.sf_doc for update using (sf_write_ok((select sf_ctx()), org_id, coll, key, data)) with check (sf_write_ok((select sf_ctx()), org_id, coll, key, data));
create policy sf_doc_delete on public.sf_doc for delete using ((select sf_ctx()->>'admin')::boolean and org_id = (select sf_ctx()->>'org') and coll not in ('attempt','stepOpen','scormSess'));

drop policy if exists sf_audit_admin on public.sf_audit;
create policy sf_audit_admin on public.sf_audit for select using (sf_role(org_id) = 'Admin');

-- ---------- batch rules: who is in a batch is decided by admins; nobody trains themselves ----------
create or replace function public.sf_batch_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare me sf_member; is_service boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' or auth.uid() is null;
begin
  if (tg_op = 'DELETE' and old.coll <> 'batches') or (tg_op <> 'DELETE' and new.coll <> 'batches') then return coalesce(new, old); end if;
  if tg_op <> 'DELETE' then
    if coalesce(new.data->'traineeEmps', '[]'::jsonb) ? coalesce(new.data->>'trainerEmp', '') then
      raise exception 'A trainer cannot be a trainee in their own batch' using errcode = 'check_violation'; end if;
  end if;
  if not is_service then
    me := sf_me(coalesce(new.org_id, old.org_id));
    if me.role is distinct from 'Admin' then
      if tg_op = 'INSERT' then raise exception 'Only admins create batches' using errcode = 'insufficient_privilege'; end if;
      if tg_op = 'UPDATE' and (old.data->'traineeEmps' is distinct from new.data->'traineeEmps' or old.data->>'trainerEmp' is distinct from new.data->>'trainerEmp') then
        raise exception 'Only admins change who is in a batch or who trains it' using errcode = 'insufficient_privilege'; end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists sf_batch_guard on public.sf_doc;
create trigger sf_batch_guard before insert or update or delete on public.sf_doc for each row execute function public.sf_batch_guard();

create or replace function public.sf_batch_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.coll = 'batches' then delete from sf_trainee where org_id = old.org_id and batch_key = old.key; end if;
  if tg_op in ('INSERT','UPDATE') and new.coll = 'batches' and coalesce(new.data->>'trainerEmp', '') <> '' then
    insert into sf_trainee (org_id, batch_key, trainer_emp, trainee_emp)
    select new.org_id, new.key, new.data->>'trainerEmp', e from jsonb_array_elements_text(coalesce(new.data->'traineeEmps', '[]'::jsonb)) e
    where e <> new.data->>'trainerEmp' on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists sf_batch_sync on public.sf_doc;
create trigger sf_batch_sync after insert or update or delete on public.sf_doc for each row execute function public.sf_batch_sync();

-- ---------- report schedules: recipients inside the organisation only (checked for every writer, admins too) ----------
create or replace function public.sf_sched_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare r text; n int := coalesce(jsonb_array_length(case jsonb_typeof(new.data->'to') when 'array' then new.data->'to' end), 0);
begin
  if n = 0 or n > 20 then raise exception using errcode = 'check_violation', message = 'A schedule needs 1 to 20 recipients'; end if;
  for r in select lower(x) from jsonb_array_elements_text(new.data->'to') x loop
    if r !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or not exists (select 1 from sf_member m where m.org_id = new.org_id
        and lower(split_part(m.email, '@', 2)) = split_part(r, '@', 2)) then
      raise exception using errcode = 'check_violation', message = 'Recipient ' || r || ' is outside the organisation';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists sf_sched_guard on public.sf_doc;
create trigger sf_sched_guard before insert or update on public.sf_doc for each row when (new.coll = 'dashSched') execute function public.sf_sched_guard();

-- ---------- deactivated people lose access at once, however they were deactivated ----------
-- (Users & accounts one by one or in bulk, ZingHR leavers, bulk upload). sf_ctx() only admits active members, so every
-- policy denies them immediately, even with a sign-in token that has not expired yet. Reactivating restores access.
create or replace function public.sf_user_active_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.coll = 'users' and coalesce(new.data->>'empId', '') <> ''
     and (tg_op = 'INSERT' or coalesce(old.data->>'status', '') is distinct from coalesce(new.data->>'status', '')) then
    update sf_member set active = (coalesce(new.data->>'status', '') <> 'Deactivated')
     where org_id = new.org_id and emp_id = new.data->>'empId';
  end if;
  return null;
end $$;
drop trigger if exists sf_user_active_sync on public.sf_doc;
create trigger sf_user_active_sync after insert or update on public.sf_doc for each row when (new.coll = 'users') execute function public.sf_user_active_sync();

-- ---------- versioned save / delete (called by the app) ----------
create or replace function public.sf_save(p_org text, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb; out jsonb := '[]'::jsonb; v int; n int; cur record; exp int;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    exp := nullif(r->>'version', '')::int;
    begin
      if exp is null then
        insert into sf_doc (org_id, coll, key, data, version) values (p_org, r->>'coll', r->>'key', r->'data', 1) on conflict do nothing;
        get diagnostics n = row_count; v := 1;
      else
        update sf_doc set data = r->'data', version = version + 1
         where org_id = p_org and coll = r->>'coll' and key = r->>'key' and version = exp returning version into v;
        get diagnostics n = row_count;
      end if;
      if n = 1 then out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'ok', 'version', v)); continue; end if;
      select data, version into cur from sf_doc where org_id = p_org and coll = r->>'coll' and key = r->>'key';   -- RLS applies
      if not found then
        out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', case when exp is null then 'denied' else 'gone' end));
      elsif cur.version = coalesce(exp, -1) then
        out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'denied', 'version', cur.version));
      else
        out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'conflict', 'version', cur.version, 'data', cur.data));
      end if;
    exception when insufficient_privilege or check_violation then
      out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'denied', 'reason', sqlerrm));
    end;
  end loop;
  return out;
end $$;

create or replace function public.sf_delete(p_org text, p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb; out jsonb := '[]'::jsonb; n int;
begin
  for r in select * from jsonb_array_elements(p_items) loop
    delete from sf_doc where org_id = p_org and coll = r->>'coll' and key = r->>'key';
    get diagnostics n = row_count;
    if n = 0 and exists (select 1 from sf_doc where org_id = p_org and coll = r->>'coll' and key = r->>'key') then
      out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'denied'));
    else
      out := out || jsonb_build_array(jsonb_build_object('coll', r->>'coll', 'key', r->>'key', 'status', 'ok'));
    end if;
  end loop;
  return out;
end $$;

-- ---------- directory: names for leaderboards, managers, forum. No employee IDs (= usernames), emails or phones ----------
create or replace function public.sf_directory(p_org text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when sf_role(p_org) is null then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
    'id', key, 'name', data->>'name', 'dept', data->>'dept', 'designation', data->>'designation',
    'role', data->>'role', 'manager', data->>'manager', 'managerKey', data->>'managerKey', 'status', data->>'status')), '[]'::jsonb) end
  from sf_doc where org_id = p_org and coll = 'users' and coalesce(data->>'status', '') <> 'Deactivated' $$;

-- ---------- employee-ID sign-in ----------
-- Called by the browser BEFORE the normal password sign-in, so the Auth rate limit applies to each user's own IP
-- (not one shared server IP). Returns the login email only if the password is right.
--
-- Client IP: only CF-Connecting-IP, which Cloudflare (in front of the Supabase API) overwrites on every request.
-- X-Forwarded-For is NOT used: its leftmost value is whatever the client sent. Check it once on your project:
-- `select sf_client_ip()` through the API must return your own public IP (see SETUP-SUPABASE.md).
--
-- Throttling (failures in the last 15 minutes):
--   • one ID from one IP: 5 failures -> paused 30 s, then 60 s, 120 s … up to 15 min (progressive). A success clears
--     it. Someone guessing IDs from THEIR IP cannot lock the real person out on another IP.
--   • one ID from all IPs: 30 failures -> employee-ID sign-in paused for that ID (distributed guessing). The person
--     can still sign in with their work email (Supabase Auth's own limits apply there), and an admin can reset.
--   • one IP across all IDs: 50 failures -> that IP paused (password spraying).
-- No pg_sleep (it held a pooled connection per failure). The password check always runs a bcrypt compare, against a
-- dummy hash for unknown IDs, so unknown IDs and wrong passwords take the same time and give the same answer.
-- Old rows are deleted by sf_login_attempt_cleanup() (hourly with pg_cron when available, and opportunistically).
create or replace function public.sf_client_ip() returns text language sql stable as $$
  select case when v ~ '^[0-9A-Fa-f:.]{2,45}$' then v else '' end
  from (select trim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip', '')) v) x $$;
grant execute on function public.sf_client_ip() to anon, authenticated;

insert into public.sf_setting (k, v) values ('dummy_hash', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 10))) on conflict (k) do nothing;

create or replace function public.sf_login_attempt_cleanup() returns int language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from sf_login_attempt where id in (select id from sf_login_attempt where at < now() - interval '1 day' limit 50000);
  get diagnostics n = row_count;
  delete from sf_known_ip where last_ok < now() - interval '90 days';
  return n;
end $$;
revoke all on function public.sf_login_attempt_cleanup() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sf-login-attempt-cleanup', '17 * * * *', 'select public.sf_login_attempt_cleanup()');
  end if;
exception when others then raise notice 'pg_cron schedule skipped: %', sqlerrm; end $$;

drop function if exists public.sf_login_lookup(text, text, text);
create or replace function public.sf_login_lookup(p_org text, p_emp text, p_password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare m sf_member; u_email text; u_hash text; v_ip text := sf_client_ip(); emp text := upper(trim(coalesce(p_emp, '')));
        pw text := coalesce(p_password, ''); win timestamptz := now() - interval '15 minutes'; last_ok timestamptz;
        pair_n int; pair_last timestamptz; wait int; hash text; good boolean; known boolean; ipcap int;
begin
  if length(emp) = 0 or length(emp) > 40 or length(pw) > 200 then return jsonb_build_object('error', 'invalid'); end if;
  if random() < 0.02 then perform sf_login_attempt_cleanup(); end if;
  -- one ID from one IP (progressive; a success resets)
  select max(at) into last_ok from sf_login_attempt where org_id = p_org and emp_id = emp and ip = v_ip and ok and at > win;
  select count(*), max(at) into pair_n, pair_last from sf_login_attempt
   where org_id = p_org and emp_id = emp and ip = v_ip and not ok and at > greatest(win, coalesce(last_ok, win));
  if pair_n >= 5 then
    wait := least(900, 30 * (2 ^ least(pair_n - 5, 5))::int);
    if pair_last > now() - make_interval(secs => wait) then
      return jsonb_build_object('error', 'locked', 'retryAfter', ceil(extract(epoch from (pair_last + make_interval(secs => wait) - now())))::int);
    end if;
  end if;
  -- one ID from many IPs (distributed guessing). An address that has already signed THIS person in (last 60 days) is not
  -- paused by it, so strangers cannot lock the real person out of their usual network; anyone else uses e-mail sign-in.
  known := v_ip <> '' and exists (select 1 from sf_known_ip kn where kn.org_id = p_org and kn.emp_id = emp and kn.ip = v_ip and kn.last_ok > now() - interval '60 days');
  if not known and (select count(*) from sf_login_attempt where org_id = p_org and emp_id = emp and not ok and at > win) >= 30 then
    return jsonb_build_object('error', 'locked', 'retryAfter', 900, 'useEmail', true);
  end if;
  -- one IP across many IDs (only when the IP is known). Behind a shared office address raise the limit:
  --   insert into sf_setting (k, v) values ('ip_fail_limit', '300') on conflict (k) do update set v = excluded.v;
  ipcap := coalesce((select case when st.v ~ '^[0-9]{1,5}$' then st.v::int end from sf_setting st where st.k = 'ip_fail_limit'), 50);
  if v_ip <> '' and (select count(*) from sf_login_attempt a where a.ip = v_ip and not a.ok and a.at > win) >= greatest(ipcap, 5) then
    return jsonb_build_object('error', 'locked', 'retryAfter', 900);
  end if;
  select * into m from sf_member where org_id = p_org and emp_id = emp and active;
  if found then select au.email, au.encrypted_password into u_email, u_hash from auth.users au where au.id = m.user_id; end if;
  -- always one bcrypt compare: against the real hash, or a dummy one for unknown IDs (same time, same answer)
  hash := coalesce(u_hash, (select v from sf_setting where k = 'dummy_hash'));
  good := extensions.crypt(pw, hash) = hash and u_hash is not null;
  insert into sf_login_attempt (org_id, emp_id, ip, ok) values (p_org, emp, v_ip, good);
  if good then
    if v_ip <> '' then insert into sf_known_ip (org_id, emp_id, ip, last_ok) values (p_org, emp, v_ip, now())
      on conflict (org_id, emp_id, ip) do update set last_ok = excluded.last_ok; end if;
    return jsonb_build_object('email', u_email);
  end if;
  return jsonb_build_object('error', 'invalid');
end $$;
revoke all on function public.sf_login_lookup(text, text, text) from public;
grant execute on function public.sf_login_lookup(text, text, text) to anon, authenticated;

-- ---------- survey results as aggregates (no per-person answers) ----------
-- Rating questions: count, average and 1–5 distribution. Fewer than 3 responses: count only (people stay anonymous).
create or replace function public.sf_survey_summary(p_org text, p_course text, p_step int) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select d.data -> (p_course || ':' || p_step) -> 'answers' a from sf_doc d
    where d.org_id = p_org and d.coll = 'surveyResp' and d.data ? (p_course || ':' || p_step)),
  q as (select (e.ordinality - 1)::int qi, e.value v from r, jsonb_array_elements(r.a) with ordinality e where jsonb_typeof(e.value) = 'number')
  select case when not coalesce(sf_any_perm(p_org, array['feedback','reports','analytics']), false) then null
    when (select count(*) from r) < 3 then jsonb_build_object('responses', (select count(*) from r), 'questions', '[]'::jsonb)
    else jsonb_build_object('responses', (select count(*) from r), 'questions', coalesce((select jsonb_agg(jsonb_build_object('q', qi + 1, 'n', n, 'avg', avg, 'dist', dist) order by qi)
      from (select qi, count(*) n, round(avg((v #>> '{}')::numeric), 2) avg,
                   jsonb_build_array(count(*) filter (where (v #>> '{}') = '1'), count(*) filter (where (v #>> '{}') = '2'), count(*) filter (where (v #>> '{}') = '3'),
                                     count(*) filter (where (v #>> '{}') = '4'), count(*) filter (where (v #>> '{}') = '5')) dist
            from q group by qi) g), '[]'::jsonb)) end $$;
revoke all on function public.sf_survey_summary(text, text, int) from public, anon;
grant execute on function public.sf_survey_summary(text, text, int) to authenticated;

-- Service-role helper for admin-users: find a login by email without listing every user.
create or replace function public.sf_auth_user_id(p_email text) returns uuid
language sql stable security definer set search_path = public as $$ select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke all on function public.sf_auth_user_id(text) from public, anon, authenticated;
grant execute on function public.sf_auth_user_id(text) to service_role;

grant execute on function public.sf_directory(text) to authenticated;
grant execute on function public.sf_ctx() to authenticated;
grant execute on function public.sf_save(text, jsonb) to authenticated;
grant execute on function public.sf_delete(text, jsonb) to authenticated;
grant select, insert, update, delete on public.sf_doc to authenticated;
grant select on public.sf_member to authenticated;

-- ---------- timestamps + audit trail ----------
-- v41.10: timestamps only. The audit row is written by sf_doc_audit (migration 002/003), AFTER the change is stored.
-- (Before, running this file again after 002 brought back an audit insert here, so every change was logged twice.)
create or replace function public.sf_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end $$;
drop trigger if exists sf_doc_touch on public.sf_doc;
create trigger sf_doc_touch before insert or update on public.sf_doc for each row execute function public.sf_touch();

-- ---------- live updates (subscribed only by staff in the app; RLS applies to every event) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sf_doc') then
    alter publication supabase_realtime add table public.sf_doc;
  end if;
end $$;
alter table public.sf_doc replica identity full;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lms-files', 'lms-files', false, 52428800, array[
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg','text/plain','text/csv'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No image/svg+xml on purpose: an SVG can carry script. Use PNG, JPEG, GIF or WebP.
-- SCORM packages: never read by browsers; served by the separate content site with short-lived launch tokens.
insert into storage.buckets (id, name, public, file_size_limit) values ('lms-scorm', 'lms-scorm', false, 52428800) on conflict (id) do nothing;

drop policy if exists sf_files_read   on storage.objects;
drop policy if exists sf_files_write  on storage.objects;
drop policy if exists sf_files_update on storage.objects;
drop policy if exists sf_files_delete on storage.objects;
drop policy if exists sf_scorm_write  on storage.objects;
drop policy if exists sf_scorm_read   on storage.objects;
create policy sf_files_read on storage.objects for select
  using (bucket_id = 'lms-files' and (sf_any_perm(split_part(name, '/', 1), array['lcms','lcmsForms','courseAdmin','builder','certs','qbank'])
         or (sf_perm(split_part(name, '/', 1), 'documents') and split_part(name, '/', 2) = 'docs')));
create policy sf_files_write on storage.objects for insert
  with check (bucket_id = 'lms-files' and (sf_any_perm(split_part(name, '/', 1), array['lcms','courseAdmin','builder','certs','qbank'])
              or (sf_perm(split_part(name, '/', 1), 'lcmsForms') and split_part(name, '/', 2) = 'lcms')
              or (sf_perm(split_part(name, '/', 1), 'documents') and split_part(name, '/', 2) = 'docs')));
create policy sf_files_update on storage.objects for update using (bucket_id = 'lms-files' and sf_role(split_part(name, '/', 1)) = 'Admin');
create policy sf_files_delete on storage.objects for delete using (bucket_id in ('lms-files','lms-scorm') and sf_role(split_part(name, '/', 1)) = 'Admin');
create policy sf_scorm_write on storage.objects for insert with check (bucket_id = 'lms-scorm' and sf_perm(split_part(name, '/', 1), 'lcms'));
create policy sf_scorm_read  on storage.objects for select using (bucket_id = 'lms-scorm' and sf_perm(split_part(name, '/', 1), 'lcms'));

-- ---------- keep-alive ----------
create or replace function public.sf_ping() returns text language sql stable as $$ select 'ok' $$;
grant execute on function public.sf_ping() to anon;

-- ---------- first admin ----------
-- 1. Authentication › Users › Add user (your email + a password, Auto confirm).
-- 2. Run (your email, employee ID, name):
--    insert into public.sf_member (org_id, user_id, email, emp_id, app_name, role)
--    select 'northwind', id, email, 'NW-1007', 'Lena Fischer', 'Admin' from auth.users where email = 'you@company.com';
