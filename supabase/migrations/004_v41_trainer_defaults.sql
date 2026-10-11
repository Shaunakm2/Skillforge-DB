-- Skillforge V41: the default Trainer role no longer has LCMS or Assessment attempt management.
-- Removes 'attempts', 'lcms' and 'lcmsForms' from the built-in r_trainer role of every organisation.
-- Run once. Safe to re-run (removing a missing key is a no-op). If an organisation wants trainers to have
-- either permission again, an admin turns it back on in Settings › Roles & permissions; re-running this file
-- would turn it off again, so do not re-run after that.
-- Enforcement is live: RLS (sf_ctx/sf_perm, 001) and the Edge Functions read the roles row on every request,
-- so trainers lose the access immediately; open trainer browsers update through Realtime.
update public.sf_doc
   set data = jsonb_set(data, '{perms}', coalesce(data->'perms', '{}'::jsonb) - 'attempts' - 'lcms' - 'lcmsForms'),
       version = version + 1
 where coll = 'roles' and key = 'r_trainer'
   and (data->'perms' ? 'attempts' or data->'perms' ? 'lcms' or data->'perms' ? 'lcmsForms');
