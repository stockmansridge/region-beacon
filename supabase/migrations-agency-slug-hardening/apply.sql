-- Agency slug hardening (defence-in-depth)
--
-- Adds server-side slug validation to public.create_customer_agency so an
-- invalid slug is rejected cleanly with `agency_slug_invalid` BEFORE we hit
-- the `agencies_slug_public_subdomain_check` CHECK constraint. The raw
-- constraint error must never reach the frontend.
--
-- IMPORTANT — keep these three in sync:
--   1. CHECK constraint  `agencies_slug_public_subdomain_check`
--        ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$   (+ reserved-label exclusion)
--   2. Frontend          src/lib/pending-organisation-signup.ts
--                        (sanitiseAgencySlug / isValidAgencySlug)
--                        and src/lib/reserved-subdomains.ts
--   3. This function     public.create_customer_agency
--
-- Idempotent. Additive. Signature is unchanged:
--   public.create_customer_agency(
--     _agency_name      text,
--     _agency_slug      text,
--     _signup_intention text default null
--   ) returns uuid

set search_path = public;

-- Drop any prior overloads so PostgREST sees exactly one resolution.
drop function if exists public.create_customer_agency(text, text);
drop function if exists public.create_customer_agency(text, text, text);

create or replace function public.create_customer_agency(
  _agency_name      text,
  _agency_slug      text,
  _signup_intention text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_name       text := nullif(btrim(_agency_name), '');
  v_slug       text := lower(btrim(_agency_slug));
  v_intention  text := nullif(btrim(coalesce(_signup_intention, '')), '');
  v_agency_id  uuid;

  -- Mirrors src/lib/reserved-subdomains.ts and the reserved list embedded
  -- in agencies_slug_public_subdomain_check. Superset is fine; this list
  -- also includes 'auth' and 'platform' which are reserved by routing even
  -- though they are not in the DB CHECK list today.
  v_reserved   text[] := array[
    'app','admin','api','www','events','support','billing',
    'login','signup','dashboard','system','assets','static',
    'cdn','demo','mail','auth','platform'
  ];
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid_agency_name' using errcode = '22023';
  end if;

  -- Slug validation MUST match agencies_slug_public_subdomain_check exactly:
  --   - non-null
  --   - lowercase a-z 0-9 with internal hyphens
  --   - starts and ends with [a-z0-9]
  --   - length 1..63 (DNS-label limit)
  --   - not a reserved platform subdomain
  if v_slug is null
     or char_length(v_slug) < 1
     or char_length(v_slug) > 63
     or v_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
     or v_slug = any(v_reserved)
  then
    raise exception 'agency_slug_invalid' using errcode = '22023';
  end if;

  if v_intention is not null and char_length(v_intention) > 200 then
    v_intention := substr(v_intention, 1, 200);
  end if;

  if exists (select 1 from public.agencies where slug = v_slug) then
    raise exception 'agency_slug_taken' using errcode = '23505';
  end if;

  insert into public.agencies (name, slug, status, signup_intention)
  values (v_name, v_slug, 'active', v_intention)
  returning id into v_agency_id;

  insert into public.agency_members (agency_id, user_id, role, accepted_at)
  values (v_agency_id, v_user_id, 'agency_owner'::public.agency_role, now());

  return v_agency_id;
end;
$$;

revoke all on function public.create_customer_agency(text, text, text) from public;
grant execute on function public.create_customer_agency(text, text, text) to authenticated;

comment on function public.create_customer_agency(text, text, text) is
  'Self-service signup: creates a customer agency and makes the calling user '
  'its agency_owner. Optional _signup_intention persists the free-text '
  'business-type captured at signup. SECURITY DEFINER. Validates auth.uid(), '
  'name, and slug shape (kept in sync with agencies_slug_public_subdomain_check '
  'and src/lib/pending-organisation-signup.ts). Never grants platform_admin.';

-- ===========================================================================
-- Post-apply verification (run manually after applying):
--
-- 1) Exactly one overload exists:
--      select p.proname,
--             pg_get_function_identity_arguments(p.oid) as args
--      from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and p.proname = 'create_customer_agency';
--    Expected: one row, args = '_agency_name text, _agency_slug text, _signup_intention text DEFAULT NULL::text'
--
-- 2) Invalid-slug rejection (must raise agency_slug_invalid, NOT a CHECK error):
--      select public.create_customer_agency('Bad Org', '-bad-', null);
--      select public.create_customer_agency('Bad Org', 'admin', null);
--      select public.create_customer_agency('Bad Org', 'has space', null);
--      select public.create_customer_agency('Bad Org', '', null);
--    All expected to fail with: ERROR:  agency_slug_invalid
--
-- 3) Happy path through the app: complete signup with a normal organisation
--    name; agencies.signup_intention is populated; no constraint error.
-- ===========================================================================
