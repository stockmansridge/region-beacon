-- Production compatibility fix for self-service Organisation signup.
--
-- Purpose:
--   Ensure PostgREST exposes exactly:
--     public.create_customer_agency(_agency_name text, _agency_slug text)
--   because the frontend calls supabase.rpc("create_customer_agency", {
--     _agency_name: ..., _agency_slug: ...
--   }).
--
-- Safe / additive notes:
--   * Does not create, drop, or alter tables.
--   * Does not grant platform_admin.
--   * Uses SECURITY DEFINER so the authenticated caller can create its own
--     agency + owner membership while table RLS remains locked down.
--   * If a two-text-argument function already exists with different argument
--     names, CREATE OR REPLACE updates it to the exact API argument names.

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
  v_name text := nullif(btrim(_agency_name), '');
  v_slug text := lower(btrim(_agency_slug));
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

  if exists (select 1 from public.agencies where slug = v_slug) then
    raise exception 'agency_slug_taken' using errcode = '23505';
  end if;

  insert into public.agencies (name, slug, status)
  values (v_name, v_slug, 'active')
  returning id into v_agency_id;

  insert into public.agency_members (agency_id, user_id, role, accepted_at)
  values (v_agency_id, v_user_id, 'agency_owner'::public.agency_role, now());

  return v_agency_id;
end;
$$;

revoke all on function public.create_customer_agency(text, text) from public;
grant execute on function public.create_customer_agency(text, text) to authenticated;

comment on function public.create_customer_agency(text, text) is
  'Self-service Organisation signup compatibility RPC. Creates an agency and agency_owner membership for auth.uid(); never grants platform_admin.';

-- Force PostgREST/Supabase API schema cache reload so the RPC is callable immediately.
notify pgrst, 'reload schema';