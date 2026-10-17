-- Skillforge v41.27: one database call instead of four for every "learning" request. Safe to run more than once.
-- The Edge Function "learning" used to do, before the real action, four separate reads:
--   sf_session_ok (is the sign-in still alive?), sf_member (is the login linked and active?), the person's user record
--   (account expiry date and record key) and their role record (permissions).
-- sf_learning_ctx() answers all four in one round trip. It decides nothing new: the same checks, the same data, and the
-- Edge Function still makes every decision. It runs with the service role only (browsers cannot call it), takes the caller's
-- id and session from the verified JWT, and is never cached, so deactivating or resetting a person still ends their session at once.
-- If this file is not installed the Edge Function falls back to the four separate reads (slower, same result).
create or replace function public.sf_learning_ctx(p_user uuid, p_sid text, p_org text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m sf_member; ukey text; uexp text; rk text; perms jsonb := '[]'::jsonb;
begin
  if not public.sf_session_ok(p_user, p_sid) then return jsonb_build_object('live', false); end if;
  select * into m from sf_member where org_id = p_org and user_id = p_user;
  if not found then return jsonb_build_object('live', true, 'member', null); end if;
  select d.key, d.data->>'expires' into ukey, uexp
    from sf_doc d where d.org_id = p_org and d.coll = 'users' and d.data->>'empId' = m.emp_id order by d.key limit 1;
  if m.role <> 'Admin' then
    rk := coalesce(nullif(m.role_id, ''), case m.role when 'Trainer' then 'r_trainer' else 'r_learner' end);
    select coalesce(jsonb_agg(p.key order by p.key), '[]'::jsonb) into perms
      from sf_doc d, jsonb_each(case when jsonb_typeof(d.data->'perms') = 'object' then d.data->'perms' else '{}'::jsonb end) p
     where d.org_id = p_org and d.coll = 'roles' and d.key = rk and p.value = 'true'::jsonb;
  end if;
  return jsonb_build_object('live', true,
    'member', jsonb_build_object('emp_id', m.emp_id, 'role', m.role, 'role_id', m.role_id, 'app_name', m.app_name, 'active', m.active,
                                 'user_key', coalesce(nullif(m.user_key, ''), ukey)),
    'expires', coalesce(uexp, ''), 'perms', perms);
end $$;
revoke all on function public.sf_learning_ctx(uuid, text, text) from public, anon, authenticated;
grant execute on function public.sf_learning_ctx(uuid, text, text) to service_role;
