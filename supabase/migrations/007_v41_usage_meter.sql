-- Skillforge v41.13: how much of the Supabase Free plan is used (for the usage meter in Settings and LCMS). Safe to run more than once.
-- Storage = total size of every file in Storage (all buckets: the Free plan's 1 GB counts the whole project).
-- Database = size of the Postgres database (the Free plan's 500 MB).
-- Egress (5 GB / month) can't be measured from inside the database: check it in the Supabase dashboard (Organization › Usage).
-- Totals only, no file names. Any signed-in member of the organisation may read them (uploaders need them to see the space left).
create or replace function public.sf_usage() returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare r jsonb;
begin
  if (select sf_ctx()) is null then return null; end if;
  select jsonb_build_object(
    'db', pg_database_size(current_database()),
    'storage', coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0)) from storage.objects o), 0),
    'files', (select count(*) from storage.objects),
    'buckets', coalesce((select jsonb_object_agg(b, n) from (select o.bucket_id b, sum(coalesce((o.metadata->>'size')::bigint, 0)) n from storage.objects o group by o.bucket_id) x), '{}'::jsonb),
    'at', now()) into r;
  return r;
end $$;
revoke all on function public.sf_usage() from public, anon;
grant execute on function public.sf_usage() to authenticated;
