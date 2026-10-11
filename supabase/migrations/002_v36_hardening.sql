-- Skillforge V36: database hardening found in the V36 review. Safe to run more than once (idempotent).
-- 1. Audit rows are written AFTER the change is really stored (before V36 the BEFORE trigger logged inserts that
--    "on conflict do nothing" skipped, and changes refused later in the statement).
-- 2. sf_save / sf_delete accept at most 500 rows per call (payload-size abuse by a signed-in member).
-- 3. Audit trail: index for "who did what" and a retention function (service role only; default 7 years).

create or replace function public.sf_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end $$;
create or replace function public.sf_audit_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into sf_audit(org_id, actor, op, coll, key, version) values (old.org_id, auth.uid(), 'delete', old.coll, old.key, old.version); return old;
  end if;
  insert into sf_audit(org_id, actor, op, coll, key, version) values (new.org_id, auth.uid(), lower(tg_op), new.coll, new.key, new.version);
  return new;
end $$;
revoke all on function public.sf_audit_row() from public, anon, authenticated;
drop trigger if exists sf_doc_touch on public.sf_doc;
create trigger sf_doc_touch before insert or update on public.sf_doc for each row execute function public.sf_touch();
drop trigger if exists sf_doc_audit on public.sf_doc;
create trigger sf_doc_audit after insert or update or delete on public.sf_doc for each row execute function public.sf_audit_row();

create or replace function public.sf_save(p_org text, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb; out jsonb := '[]'::jsonb; v int; n int; cur record; exp int;
begin
  -- v36: one call carries at most 500 rows (a member could otherwise send a huge payload and hold a connection)
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'sf: at most 500 rows per call' using errcode = '22023'; end if;
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
  -- v36: one call carries at most 500 rows (a member could otherwise send a huge payload and hold a connection)
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'sf: at most 500 rows per call' using errcode = '22023'; end if;
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
grant execute on function public.sf_save(text, jsonb) to authenticated;
grant execute on function public.sf_delete(text, jsonb) to authenticated;

create index if not exists sf_audit_actor on public.sf_audit (org_id, actor, at desc);
create or replace function public.sf_audit_purge(p_days int default 2555) returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if p_days < 365 then raise exception 'sf: keep at least one year of audit history'; end if;
  delete from sf_audit where at < now() - make_interval(days => p_days); get diagnostics n = row_count; return n;
end $$;
revoke all on function public.sf_audit_purge(int) from public, anon, authenticated;
grant execute on function public.sf_audit_purge(int) to service_role;
