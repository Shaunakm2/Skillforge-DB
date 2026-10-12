-- Skillforge v41.10: audit log written once per change, and the double rows already written are removed.
-- Safe to run more than once.
-- Cause: sf_touch (BEFORE trigger) wrote an audit row in old versions of 001. If 001 was run again after 002/003,
-- both sf_touch and sf_doc_audit logged every change. The sf_touch rows have no "changes" column (NULL).

-- 1. sf_touch only stamps the time and the person; it never writes to the audit trail
create or replace function public.sf_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now(); new.updated_by := auth.uid(); return new;
end $$;
drop trigger if exists sf_doc_touch on public.sf_doc;
create trigger sf_doc_touch before insert or update on public.sf_doc for each row execute function public.sf_touch();

-- 2. remove the extra rows: a row without details that has a twin with details (same record, version and action, within 5 seconds)
delete from public.sf_audit a
 where a.changes is null
   and exists (select 1 from public.sf_audit b
                where b.changes is not null and b.org_id = a.org_id and b.coll = a.coll and b.key = a.key
                  and b.op = a.op and b.version is not distinct from a.version
                  and abs(extract(epoch from (b.at - a.at))) < 5);
