-- =====================================================================================================
-- Skillforge v41.32 — server-side checks on people records (sf_doc, coll = 'users').
-- The forms and the bulk upload check every field in the browser, but anyone with the Users permission can call
-- sf_save directly. This trigger applies the same rules inside the database, whatever sends the data.
-- Existing data is safe: a field is checked only when a record is created or when THAT field changes.
-- A refused row raises check_violation, which sf_save already reports to the app as "denied" with the reason.
-- Idempotent. If you already have a migration numbered 012, rename this file to the next free number.
-- =====================================================================================================
create or replace function public.sf_users_guard() returns trigger language plpgsql as $$
declare
  d jsonb := new.data;
  o jsonb := case when tg_op = 'UPDATE' then old.data else null end;
  f text; v text;
begin
  -- employee ID: 2-30 characters, letters / digits / - _ /, starting with a letter or digit
  v := coalesce(d->>'empId', '');
  if (o is null or v is distinct from coalesce(o->>'empId', '')) and v <> '' and v !~ '^[A-Za-z0-9][A-Za-z0-9_/-]{1,29}$' then
    raise exception 'Employee ID "%" can use letters, numbers, - _ / (2-30 characters)', left(v, 40) using errcode = 'check_violation';
  end if;
  -- e-mail
  v := coalesce(d->>'email', '');
  if (o is null or v is distinct from coalesce(o->>'email', '')) and v <> ''
     and (length(v) > 254 or v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Email "%" is not a valid email', left(v, 60) using errcode = 'check_violation';
  end if;
  -- phone (optional): digits, + space ( ) - only, 7-15 digits
  v := coalesce(d->>'phone', '');
  if (o is null or v is distinct from coalesce(o->>'phone', '')) and v <> ''
     and (v !~ '^[0-9+ ()-]+$' or length(regexp_replace(v, '[^0-9]', '', 'g')) not between 7 and 15) then
    raise exception 'Phone number needs 7 to 15 digits (+, spaces, brackets and dashes allowed)' using errcode = 'check_violation';
  end if;
  -- name: at least two letters, at most 160 characters. Broad on purpose: the app may add a marker to tell two people
  -- with the same name apart. The forms apply the strict letters-only rule.
  v := coalesce(d->>'name', '');
  if (o is null or v is distinct from coalesce(o->>'name', '')) and (v !~ '[[:alpha:]].*[[:alpha:]]' or length(v) > 160) then
    raise exception 'Full name must contain letters (at most 160 characters)' using errcode = 'check_violation';
  end if;
  -- designation: at most 60 characters
  v := coalesce(d->>'designation', '');
  if (o is null or v is distinct from coalesce(o->>'designation', '')) and length(v) > 60 then
    raise exception 'Designation is too long (60 characters max)' using errcode = 'check_violation';
  end if;
  -- no < or > in any top-level text field
  for f, v in select key, value #>> '{}' from jsonb_each(d) where jsonb_typeof(value) = 'string' loop
    if (o is null or v is distinct from (o->>f)) and v ~ '[<>]' then
      raise exception 'The field "%" contains < or >, which are not allowed', f using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists sf_users_guard on public.sf_doc;
create trigger sf_users_guard before insert or update on public.sf_doc
  for each row when (new.coll = 'users') execute function public.sf_users_guard();
