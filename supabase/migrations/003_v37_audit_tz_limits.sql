-- Skillforge V37: audit diffs, organisation time zone, abuse limits. Safe to run more than once (idempotent).
-- Does not change 001/002; it replaces functions they created.
-- Correction to 001:91: changing a person's role does NOT revoke sessions and does not need to; sf_ctx() reads
-- sf_member live on every request (tests/edge-functions.test.mjs "role change do not").
-- 1. sf_audit keeps WHAT changed: a jsonb diff of top-level fields ({"field": [before, after]}), capped at 32 KB.
-- 2. sf_today() reads the time zone from sf_setting 'org_timezone' (set it to the same value as ORG_TIMEZONE).
-- 3. sf_doc.data is capped at 512 KB per row (new writes; existing rows are not re-checked).
-- 4. sf_save / sf_delete: at most N calls per user per minute (sf_setting 'save_per_minute', default 300).

-- ---------- 1. audit diff ----------
alter table public.sf_audit add column if not exists changes jsonb;
create or replace function public.sf_jsonb_diff(a jsonb, b jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(a -> k, b -> k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) k union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) ks
  where (a -> k) is distinct from (b -> k) $$;
create or replace function public.sf_audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_op = 'DELETE' then
    d := sf_jsonb_diff(case when jsonb_typeof(old.data) = 'object' then old.data else jsonb_build_object('value', old.data) end, '{}'::jsonb);
    if pg_column_size(d) > 32768 then d := jsonb_build_object('truncated', true); end if;
    insert into sf_audit(org_id, actor, op, coll, key, version, changes) values (old.org_id, auth.uid(), 'delete', old.coll, old.key, old.version, d); return old;
  end if;
  d := sf_jsonb_diff(case when tg_op = 'UPDATE' then (case when jsonb_typeof(old.data) = 'object' then old.data else jsonb_build_object('value', old.data) end) else '{}'::jsonb end,
                     case when jsonb_typeof(new.data) = 'object' then new.data else jsonb_build_object('value', new.data) end);
  if pg_column_size(d) > 32768 then d := jsonb_build_object('truncated', true, 'fields', (select jsonb_agg(k) from jsonb_object_keys(d) k)); end if;
  insert into sf_audit(org_id, actor, op, coll, key, version, changes) values (new.org_id, auth.uid(), lower(tg_op), new.coll, new.key, new.version, d);
  return new;
end $$;
revoke all on function public.sf_audit_row() from public, anon, authenticated;
-- sf_audit_purge (002) is unchanged and still applies.

-- ---------- 2. organisation time zone ----------
insert into public.sf_setting (k, v) values ('org_timezone', 'Asia/Kolkata') on conflict (k) do nothing;
create or replace function public.sf_today() returns text language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  select v into tz from sf_setting where k = 'org_timezone';
  if tz is null or not exists (select 1 from pg_timezone_names where name = tz) then tz := 'Asia/Kolkata'; end if;
  return to_char(now() at time zone tz, 'YYYY-MM-DD');
end $$;

-- ---------- 3. size cap ----------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sf_doc_data_size') then
    alter table public.sf_doc add constraint sf_doc_data_size check (pg_column_size(data) <= 524288) not valid;
  end if;
end $$;

-- ---------- 4. call-rate limit ----------
create table if not exists public.sf_rate (uid uuid not null, bucket text not null, win timestamptz not null, n int not null default 0,
  primary key (uid, bucket, win));
alter table public.sf_rate enable row level security;
revoke all on public.sf_rate from anon, authenticated;
create or replace function public.sf_rate_hit(p_bucket text) returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lim int; c int;
begin
  if me is null then return; end if;   -- service role / migrations: no limit
  select coalesce(nullif(v, '')::int, 300) into lim from sf_setting where k = 'save_per_minute'; lim := coalesce(lim, 300);
  insert into sf_rate(uid, bucket, win, n) values (me, p_bucket, date_trunc('minute', now()), 1)
    on conflict (uid, bucket, win) do update set n = sf_rate.n + 1 returning n into c;
  if c = 1 then delete from sf_rate where uid = me and win < now() - interval '10 minutes'; end if;
  if c > lim then raise exception 'sf: too many saves; wait a minute' using errcode = '54000'; end if;
end $$;
revoke all on function public.sf_rate_hit(text) from public, anon;
grant execute on function public.sf_rate_hit(text) to authenticated;

create or replace function public.sf_save(p_org text, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r jsonb; out jsonb := '[]'::jsonb; v int; n int; cur record; exp int;
begin
  perform public.sf_rate_hit('save');   -- v37: per-user call-rate limit
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
  perform public.sf_rate_hit('save');   -- v37: per-user call-rate limit
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

-- ---------- 5. learning `sign`: documents holding the requested paths only (service role) ----------
create or replace function public.sf_docs_by_paths(p_org text, p_paths text[]) returns setof jsonb language sql stable
security definer set search_path = public as $$
  select d.data from sf_doc d
   where d.org_id = p_org and d.coll = 'docs'
     and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.data->'versions') = 'array' then d.data->'versions' else '[]'::jsonb end) v
                  where v->'file'->>'path' = any(p_paths)) $$;
revoke all on function public.sf_docs_by_paths(text, text[]) from public, anon, authenticated;
grant execute on function public.sf_docs_by_paths(text, text[]) to service_role;
