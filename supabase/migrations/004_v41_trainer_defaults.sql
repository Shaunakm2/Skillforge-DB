-- Skillforge V41: the default Trainer role no longer has LCMS or Assessment attempt management.
-- Removes 'attempts', 'lcms' and 'lcmsForms' from the built-in r_trainer role of every organisation.
-- Run once. Safe to re-run (removing a missing key is a no-op). If an organisation wants trainers to have
-- either permission again, an admin turns it back on in Settings › Roles & permissions; re-running this file
-- would turn it off again, so do not re-run after that.
-- Enforcement is live: RLS (sf_ctx/sf_perm, 001) and the Edge Functions read the roles row on every request,
-- so trainers lose the access immediately; open trainer browsers update through Realtime.
-- v41.18: runs only ONCE per database (marker 'm004_done'). deploy-supabase.sh runs every migration on each deploy,
-- which used to switch these permissions off again after an admin had turned them back on.
do $$
begin
  if exists (select 1 from public.sf_setting where k = 'm004_done') then return; end if;
  update public.sf_doc
     set data = jsonb_set(data, '{perms}', coalesce(data->'perms', '{}'::jsonb) - 'attempts' - 'lcms' - 'lcmsForms'),
         version = version + 1
   where coll = 'roles' and key = 'r_trainer'
     and (data->'perms' ? 'attempts' or data->'perms' ? 'lcms' or data->'perms' ? 'lcmsForms');
  insert into public.sf_setting (k, v) values ('m004_done', now()::text) on conflict (k) do nothing;
end $$;
