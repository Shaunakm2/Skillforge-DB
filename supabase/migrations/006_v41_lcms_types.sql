-- Skillforge v41.11: assignment submissions (collection "asgSub"). Safe to run more than once.
-- Written only by the Edge Function "learning" (submitAssignment / reviewAssignment), never directly by a browser.
-- Readable by the learner who submitted, by Gradebook and Reports users, and by batch trainers / attempt managers for their own trainees.

create or replace function public.sf_server_only(p_coll text) returns boolean language sql immutable as $$
  select p_coll in ('attempt','stepOpen','scormSess','itemDone','itemQuiz','attemptsUsed','attemptRecs','reviews','surveyResp','fbLog','threads','accessReqs','docAck','loginLog','asgSub') $$;

drop policy if exists sf_doc_read_asg on public.sf_doc;
create policy sf_doc_read_asg on public.sf_doc for select using (
  coll = 'asgSub' and org_id = (select sf_ctx()->>'org') and (
       data->>'learnerEmp' = (select sf_ctx()->>'emp')
    or (select sf_ctx()->'perms') ?| array['gradebook','reports']
    or ((select sf_ctx()->'perms') ?| array['batches','attempts'] and (select sf_ctx()->'trainees') ? (data->>'learnerEmp'))));
