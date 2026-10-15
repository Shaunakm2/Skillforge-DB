-- Skillforge v41.21: Gradebook scope. Safe to run more than once.
-- Before: everyone with the Gradebook permission (the default Trainer role) could read and grade the written answers and
-- assignment submissions of EVERY learner. Now a grader sees the trainees of the batches they train (a person can be a trainer
-- in one batch and a trainee in another: train-the-trainer). Roles that must grade everyone get the new permission
-- "Gradebook: all learners" (gradeAll) in Settings › Roles & permissions. Admins: everyone, as before.
-- The "learning" Edge Function applies the same rule when an answer is rated or an assignment reviewed (deploy it too).

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
    -- v41.21: Gradebook reads the written answers of the trainees of batches the person trains; all learners only with gradeAll (or reports)
    or (coll = 'reviews' and (d->>'learnerEmp' = c->>'emp' or c->'perms' ?| array['reports','gradeAll']
        or (c->'perms' ?| array['gradebook','batches','attempts'] and c->'trainees' ? (d->>'learnerEmp'))))
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

drop policy if exists sf_doc_read_asg on public.sf_doc;
create policy sf_doc_read_asg on public.sf_doc for select using (
  coll = 'asgSub' and org_id = (select sf_ctx()->>'org') and (
       data->>'learnerEmp' = (select sf_ctx()->>'emp')
    or (select sf_ctx()->'perms') ?| array['reports','gradeAll']
    or ((select sf_ctx()->'perms') ?| array['gradebook','batches','attempts'] and (select sf_ctx()->'trainees') ? (data->>'learnerEmp'))));
