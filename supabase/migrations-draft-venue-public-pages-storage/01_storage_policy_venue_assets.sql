-- 01_storage_policy_venue_assets.sql
-- DRAFT ONLY. Do not execute.
--
-- Extends the event-assets storage RLS so admin venue public-page editors
-- can upload logo / cover images under:
--
--   {agency_id}/{event_id}/venues/{venue_id}/logo/{filename}
--   {agency_id}/{event_id}/venues/{venue_id}/cover/{filename}
--
-- The existing 4-segment event-level paths
--   {agency_id}/{event_id}/{logo|cover}/{filename}
-- keep working unchanged.
--
-- Depends on:
--   * supabase/migrations-draft-event-assets-storage/01_event_assets_bucket.sql
--   * supabase/migrations-draft-venue-public-pages/01_venues_public_page_fields.sql
--
-- This file only redefines two helper functions and re-grants EXECUTE.
-- It does NOT drop/recreate the storage.objects policies — they already
-- call these helpers by name, so updating the helpers updates the gate.

begin;

-- 1) Path parser: recognise both 4-segment and 6-segment shapes.
--    Returns (agency_id, event_id, kind, venue_id) where venue_id is
--    NULL for event-level paths.
--
-- Must DROP first: the prior version returned (agency_id, event_id, kind)
-- and Postgres refuses to change an existing function's OUT-parameter row
-- type via CREATE OR REPLACE (error 42P13).
drop function if exists public.event_assets_path_parts(text);
create or replace function public.event_assets_path_parts(_name text)
returns table (
  agency_id uuid,
  event_id  uuid,
  kind      text,
  venue_id  uuid
)
language sql
immutable
as $$
  with parts as (
    select string_to_array(coalesce(_name, ''), '/') as p
  ),
  shaped as (
    select
      p,
      array_length(p, 1) as n,
      (p)[1] as s1,
      (p)[2] as s2,
      (p)[3] as s3,
      (p)[4] as s4,
      (p)[5] as s5,
      (p)[6] as s6
    from parts
  ),
  -- Event-level: {agency}/{event}/{logo|cover}/{file}
  event_level as (
    select
      (s1)::uuid as agency_id,
      (s2)::uuid as event_id,
      s3         as kind,
      null::uuid as venue_id
    from shaped
    where n >= 4
      and s3 in ('logo','cover')
      and s4 is not null and length(s4) > 0
      and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      -- Disambiguate from venue-level by ensuring s3 is a kind, not 'venues'.
  ),
  -- Venue-level: {agency}/{event}/venues/{venue}/{logo|cover}/{file}
  venue_level as (
    select
      (s1)::uuid as agency_id,
      (s2)::uuid as event_id,
      s5         as kind,
      (s4)::uuid as venue_id
    from shaped
    where n >= 6
      and s3 = 'venues'
      and s5 in ('logo','cover')
      and s6 is not null and length(s6) > 0
      and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s4 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  select * from event_level
  union all
  select * from venue_level
$$;

grant execute on function public.event_assets_path_parts(text)
  to authenticated, anon;

-- 2) Write gate: same role rules; additionally require venue row to
--    exist, be in the same event, and not be soft-deleted when the path
--    is a venue-level path.
create or replace function public.can_write_event_asset(_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts record;
  v_event_agency uuid;
  v_venue_event  uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into parts from public.event_assets_path_parts(_name);
  if parts.agency_id is null or parts.event_id is null then
    return false;
  end if;

  -- Event must belong to the path's agency.
  select agency_id into v_event_agency
    from public.events
   where id = parts.event_id
     and deleted_at is null;
  if v_event_agency is null or v_event_agency <> parts.agency_id then
    return false;
  end if;

  -- Venue path: venue must belong to the same event and not be archived.
  if parts.venue_id is not null then
    select event_id into v_venue_event
      from public.venues
     where id = parts.venue_id
       and deleted_at is null;
    if v_venue_event is null or v_venue_event <> parts.event_id then
      return false;
    end if;
  end if;

  -- Role check: platform_admin OR agency_owner/agency_admin of the agency.
  if public.has_role(auth.uid(), 'platform_admin'::app_role) then
    return true;
  end if;

  return exists (
    select 1
      from public.agency_members am
     where am.user_id   = auth.uid()
       and am.agency_id = parts.agency_id
       and am.accepted_at is not null
       and am.role in ('agency_owner','agency_admin')
  );
end;
$$;

grant execute on function public.can_write_event_asset(text) to authenticated;

commit;
