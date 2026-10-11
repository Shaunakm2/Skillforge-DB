-- Minimal stand-in for the parts of a Supabase project the migration uses (test only; NOT for production).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth; create schema if not exists extensions; create schema if not exists storage;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text, raw_app_meta_data jsonb default '{}');
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
-- stand-in for pgcrypto's crypt(): test hashes are 'h$' || md5(password)
create or replace function extensions.crypt(pw text, salt text) returns text language sql immutable as $$ select 'h$' || md5(pw) $$;
create or replace function extensions.gen_salt(t text) returns text language sql volatile as $$ select 'h$' $$;
create or replace function extensions.gen_salt(t text, rounds int) returns text language sql volatile as $$ select 'h$' $$;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema auth to anon, authenticated, service_role;
do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
