-- 010_public_brand.sql  (v41.25)
-- Lets the SIGN-IN PAGE show the saved branding (portal name, accent colour, sign-in message, logo) to everyone,
-- before anyone has signed in. Until now the page could only show the defaults, because sf_doc is readable only
-- after sign-in.
--
-- Safe to run more than once. It changes no table, policy or existing function.
-- What it exposes: only the four branding fields, each checked and size-capped below. Nothing else in sf_doc is reachable
-- through it, and it answers only for the organisation id passed in.
--
-- Branding is stored by the app as one sf_doc row: coll = 'brand', key = 'value',
-- data = { brandName, brandAccent, brandMsg, brandLogo }.

create or replace function public.sf_public_brand(p_org text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d      jsonb;
  v_name text;
  v_acc  text;
  v_msg  text;
  v_logo text;
begin
  if p_org is null or length(p_org) = 0 or length(p_org) > 100 then
    return '{}'::jsonb;
  end if;

  select data into d
    from public.sf_doc
   where org_id = p_org and coll = 'brand' and key = 'value'
   limit 1;

  if d is null or jsonb_typeof(d) <> 'object' then
    return '{}'::jsonb;
  end if;

  -- each field is only returned if it is the right type and shape; anything else is dropped (not repaired)
  v_name := case when jsonb_typeof(d->'brandName')   = 'string' then left(btrim(d->>'brandName'), 120) end;
  v_acc  := case when jsonb_typeof(d->'brandAccent') = 'string' and (d->>'brandAccent') ~ '^#[0-9A-Fa-f]{6}$'
                 then d->>'brandAccent' end;
  v_msg  := case when jsonb_typeof(d->'brandMsg')    = 'string' then left(d->>'brandMsg', 2000) end;
  v_logo := case when jsonb_typeof(d->'brandLogo')   = 'string'
                  and length(d->>'brandLogo') <= 300000
                  and (d->>'brandLogo') ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
                 then d->>'brandLogo' end;

  -- same clean-up the app does for databases seeded by older versions
  if v_msg ~* 'northwind' then
    v_msg := 'Welcome to Skillforge. Sign in with your work account.';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'brandName',   nullif(v_name, ''),
    'brandAccent', v_acc,
    'brandMsg',    v_msg,
    'brandLogo',   v_logo
  ));
end;
$$;

-- callable before sign-in (anon) and after (authenticated), like sf_login_lookup
revoke all on function public.sf_public_brand(text) from public;
grant execute on function public.sf_public_brand(text) to anon, authenticated;

comment on function public.sf_public_brand(text) is
  'Public branding for the sign-in page: name, accent colour, message, logo (validated). Nothing else.';
