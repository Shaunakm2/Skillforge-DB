-- Skillforge v41.18: the usage meter (sf_usage, 007) no longer discloses project-wide totals to everyone.
-- Safe to run more than once.
--   • Who may call it: admins, and people who can upload files (LCMS, surveys/forms, documents, course catalog / builder,
--     question bank, certificates); they need it to see the space left before uploading. Anyone else gets null.
--   • One organisation in the project (the normal set-up): project totals, because the Free plan quota counts the whole
--     project, so that is the number that decides whether an upload fits.
--   • Several organisations in one project: only this organisation's files (storage paths start with "<org>/"), and no
--     database size or per-bucket list, so no organisation learns anything about another.
create or replace function public.sf_usage() returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare c jsonb := (select sf_ctx()); o text; multi boolean; r jsonb;
begin
  if c is null then return null; end if;
  o := c->>'org';
  if not coalesce((c->>'admin')::boolean, false)
     and not (c->'perms' ?| array['lcms','lcmsForms','documents','courseAdmin','builder','qbank','certs']) then return null; end if;
  multi := (select count(distinct m.org_id) from sf_member m) > 1;
  if multi then
    select jsonb_build_object('scope', 'org',
      'storage', coalesce((select sum(coalesce((so.metadata->>'size')::bigint, 0)) from storage.objects so where split_part(so.name, '/', 1) = o), 0),
      'files', (select count(*) from storage.objects so where split_part(so.name, '/', 1) = o),
      'at', now()) into r;
  else
    select jsonb_build_object('scope', 'project',
      'db', pg_database_size(current_database()),
      'storage', coalesce((select sum(coalesce((so.metadata->>'size')::bigint, 0)) from storage.objects so), 0),
      'files', (select count(*) from storage.objects),
      'buckets', coalesce((select jsonb_object_agg(b, n) from (select so.bucket_id b, sum(coalesce((so.metadata->>'size')::bigint, 0)) n from storage.objects so group by so.bucket_id) x), '{}'::jsonb),
      'at', now()) into r;
  end if;
  return r;
end $$;
revoke all on function public.sf_usage() from public, anon;
grant execute on function public.sf_usage() to authenticated;
