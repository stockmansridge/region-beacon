-- Draft only. Do not execute against production.
-- Apply against the STAGING Supabase project to enable self-service signup.
--
-- This migration adds a SECURITY DEFINER RPC `public.create_customer_agency`
-- so a freshly signed-up authenticated user can create an agency workspace
-- and become its agency_owner — WITHOUT granting any direct INSERT path to
-- the `public.agencies` / `public.agency_members` tables (their existing
-- `deny_all` RLS policies stay in place).
--
-- Security properties:
--   * `auth.uid()` MUST be non-null (anonymous callers rejected).
--   * Never assigns `platform_admin`.
--   * Slug format enforced server-side; duplicate slug returns a clean error.
--   * Owner membership is inserted with accepted_at = now() so the new user
--     immediately passes `useAdminAccess` checks.
--   * RPC is restricted to the `authenticated` role.
--
-- Naming convention: agency slug is reused later as the URL-safe identifier
-- in some flows (NOT the public event subdomain — that lives on
-- event_domains and is reserved per-event).

create or replace function public.create_customer_agency(
  _agency_name text,
  _agency_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name    text := nullif(btrim(_agency_name), '');
  v_slug    text := lower(btrim(_agency_slug));
  v_agency_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid_agency_name' using errcode = '22023';
  end if;

  if v_slug is null
     or char_length(v_slug) < 2
     or char_length(v_slug) > 60
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_agency_slug' using errcode = '22023';
  end if;

  -- Pre-check for friendlier error than the unique-constraint violation.
  if exists (select 1 from public.agencies where slug = v_slug) then
    raise exception 'agency_slug_taken' using errcode = '23505';
  end if;

  insert into public.agencies (name, slug, status)
  values (v_name, v_slug, 'active')
  returning id into v_agency_id;

  insert into public.agency_members (agency_id, user_id, role, accepted_at)
  values (v_agency_id, v_user_id, 'agency_owner'::public.agency_role, now());

  -- Defensive: never grant platform_admin from this path.
  -- (No insert into public.user_roles here.)

  return v_agency_id;
end;
$$;

revoke all on function public.create_customer_agency(text, text) from public;
grant execute on function public.create_customer_agency(text, text) to authenticated;

comment on function public.create_customer_agency(text, text) is
  'Self-service signup: creates a customer agency and makes the calling user its agency_owner. SECURITY DEFINER so it can bypass the deny_all RLS on agencies / agency_members while still validating auth.uid() and slug shape. Never grants platform_admin.';
