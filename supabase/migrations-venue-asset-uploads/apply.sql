-- apply.sql — Fix venue logo/cover Storage RLS
--
-- Problem
--   Uploading a venue Logo or Hero/Cover fails with
--   "new row violates row-level security policy" because the live
--   `public.event_assets_path_parts(text)` helper only recognises the
--   4-segment event-level shape:
--     {agency_id}/{event_id}/{logo|cover}/{filename}
--   The frontend (src/lib/venue-assets.ts) writes the 6-segment shape:
--     {agency_id}/{event_id}/venues/{venue_id}/{logo|cover}/{filename}
--   so the parser returns NULL, `can_write_event_asset` returns false,
--   and the storage.objects INSERT policy denies the write.
--
-- Fix
--   Extend the path parser to recognise both 4- and 6-segment shapes,
--   and extend the write gate to additionally require that the venue
--   row exists, is not soft-deleted, and belongs to the same event.
--   storage.objects RLS policies already call these helpers by name,
--   so updating the helpers updates the gate. Event-level uploads
--   (logo/cover/map/awards) are unaffected.
--
-- Safe to run multiple times.

begin;

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
  event_level as (
    select
      (s1)::uuid as agency_id,
      (s2)::uuid as event_id,
      s3         as kind,
      null::uuid as venue_id
    from shaped
    where n >= 4
      and s3 in ('logo','cover','map','awards')
      and s4 is not null and length(s4) > 0
      and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
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

  select agency_id into v_event_agency
    from public.events
   where id = parts.event_id
     and deleted_at is null;
  if v_event_agency is null or v_event_agency <> parts.agency_id then
    return false;
  end if;

  if parts.venue_id is not null then
    select event_id into v_venue_event
      from public.venues
     where id = parts.venue_id
       and deleted_at is null;
    if v_venue_event is null or v_venue_event <> parts.event_id then
      return false;
    end if;
  end if;

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
