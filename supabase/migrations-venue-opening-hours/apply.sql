-- Venue opening hours from Google (weekly scheduled refresh).
-- Run once in the database SQL editor. Additive only: one new table for
-- hours, one single-row table for the scheduler lease, RPCs, and a weekly
-- pg_cron job. Rollback at the bottom.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Hours per venue -------------------------------------------------------
create table if not exists public.venue_opening_hours (
  venue_id            uuid primary key references public.venues(id) on delete cascade,
  agency_id           uuid not null,
  event_id            uuid not null,
  hours_source        text not null default 'google'
                        check (hours_source in ('google','manual','off')),
  google_place_id     text,
  google_place_name   text,
  google_hours        jsonb,          -- { periods: [...], weekdayDescriptions: [...] }
  utc_offset_minutes  int,
  manual_hours        jsonb,          -- array of 7 strings, Monday..Sunday
  sync_status         text not null default 'pending'
                        check (sync_status in ('pending','ok','no_hours','not_found','error')),
  sync_error          text,
  synced_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_venue_opening_hours_event on public.venue_opening_hours (event_id);

alter table public.venue_opening_hours enable row level security;
grant select on public.venue_opening_hours to authenticated;
grant all on public.venue_opening_hours to service_role;

drop policy if exists venue_opening_hours_member_read on public.venue_opening_hours;
create policy venue_opening_hours_member_read on public.venue_opening_hours
  for select to authenticated
  using (public.is_platform_admin(auth.uid()) or public.is_agency_member(auth.uid(), agency_id));

-- 2. Scheduler state (single row) -----------------------------------------
create table if not exists public.venue_hours_sync_state (
  id            int primary key default 1 check (id = 1),
  cron_token    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  lease_until   timestamptz,
  paused_reason text,
  last_run_at   timestamptz,
  last_summary  jsonb
);
insert into public.venue_hours_sync_state (id) values (1) on conflict (id) do nothing;
alter table public.venue_hours_sync_state enable row level security;
revoke all on public.venue_hours_sync_state from anon, authenticated;
grant all on public.venue_hours_sync_state to service_role;

-- Verifies the scheduler token and takes the single-flight lease.
create or replace function public.venue_hours_acquire_lease(_token text, _seconds int)
returns table(acquired boolean, paused_reason text)
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  update public.venue_hours_sync_state s
     set lease_until = now() + make_interval(secs => greatest(_seconds, 30))
   where s.id = 1 and s.cron_token = _token
     and (s.lease_until is null or s.lease_until < now())
  returning true into v_ok;
  return query select coalesce(v_ok, false), (select s.paused_reason from public.venue_hours_sync_state s where s.id = 1);
end $$;

create or replace function public.venue_hours_release_lease(_summary jsonb, _paused_reason text)
returns void language sql security definer set search_path = public as $$
  update public.venue_hours_sync_state
     set lease_until = null, last_run_at = now(), last_summary = _summary, paused_reason = _paused_reason
   where id = 1;
$$;

-- Venues due for a refresh: active, located, not opted out, not refreshed in
-- the last 6 days, and not previously "not found" (admins retry those).
create or replace function public.venue_hours_due(_limit int)
returns table(venue_id uuid, agency_id uuid, event_id uuid, name text, lat double precision, lng double precision, google_place_id text)
language sql stable security definer set search_path = public as $$
  select v.id, v.agency_id, v.event_id, v.name, v.lat::double precision, v.lng::double precision, h.google_place_id
  from public.venues v
  left join public.venue_opening_hours h on h.venue_id = v.id
  where v.deleted_at is null and v.status = 'active'
    and v.lat is not null and v.lng is not null
    and coalesce(h.hours_source, 'google') = 'google'
    and coalesce(h.sync_status, 'pending') <> 'not_found'
    and (h.synced_at is null or h.synced_at < now() - interval '6 days')
  order by h.synced_at nulls first
  limit greatest(least(_limit, 200), 1);
$$;

revoke all on function public.venue_hours_acquire_lease(text, int) from public, anon, authenticated;
revoke all on function public.venue_hours_release_lease(jsonb, text) from public, anon, authenticated;
revoke all on function public.venue_hours_due(int) from public, anon, authenticated;
grant execute on function public.venue_hours_acquire_lease(text, int) to service_role;
grant execute on function public.venue_hours_release_lease(jsonb, text) to service_role;
grant execute on function public.venue_hours_due(int) to service_role;

-- 3. Admin RPCs --------------------------------------------------------------
create or replace function public.admin_can_manage_venue_hours(_venue_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.venues v
    where v.id = _venue_id
      and (public.is_platform_admin(auth.uid()) or public.is_agency_member(auth.uid(), v.agency_id))
  );
$$;

create or replace function public.admin_set_venue_hours(_venue_id uuid, _hours_source text, _manual_hours jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_agency uuid; v_event uuid;
begin
  if _hours_source not in ('google','manual','off') then
    raise exception 'Invalid hours source' using errcode = '22023';
  end if;
  if _manual_hours is not null and (jsonb_typeof(_manual_hours) <> 'array' or jsonb_array_length(_manual_hours) <> 7) then
    raise exception 'Manual hours must list 7 days' using errcode = '22023';
  end if;
  select v.agency_id, v.event_id into v_agency, v_event from public.venues v where v.id = _venue_id;
  if v_agency is null then raise exception 'Venue not found' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin(auth.uid()) or public.is_agency_member(auth.uid(), v_agency)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.venue_opening_hours (venue_id, agency_id, event_id, hours_source, manual_hours)
  values (_venue_id, v_agency, v_event, _hours_source, _manual_hours)
  on conflict (venue_id) do update
    set hours_source = excluded.hours_source, manual_hours = excluded.manual_hours, updated_at = now();
end $$;

revoke all on function public.admin_can_manage_venue_hours(uuid) from public, anon;
revoke all on function public.admin_set_venue_hours(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_can_manage_venue_hours(uuid) to authenticated;
grant execute on function public.admin_set_venue_hours(uuid, text, jsonb) to authenticated;

-- 4. Public read (same host resolution as get_public_venue_extras) ----------
create or replace function public.get_public_venue_hours(_hostname text, _venue_id uuid)
returns table(hours_source text, weekday_text jsonb, periods jsonb, utc_offset_minutes int, synced_at timestamptz)
language sql stable security definer set search_path = public as $$
  with r as (
    select event_id from public.resolve_event_by_host(_hostname)
    where kind = 'event' and event_id is not null limit 1
  )
  select h.hours_source,
         case when h.hours_source = 'manual' then h.manual_hours
              else h.google_hours -> 'weekdayDescriptions' end,
         case when h.hours_source = 'google' then h.google_hours -> 'periods' end,
         h.utc_offset_minutes,
         h.synced_at
  from r
  join public.venues v on v.id = _venue_id and v.event_id = r.event_id and v.deleted_at is null
  join public.venue_opening_hours h on h.venue_id = v.id
  where h.hours_source <> 'off'
    and ((h.hours_source = 'manual' and h.manual_hours is not null)
      or (h.hours_source = 'google' and h.sync_status = 'ok' and h.google_hours is not null));
$$;
revoke all on function public.get_public_venue_hours(text, uuid) from public;
grant execute on function public.get_public_venue_hours(text, uuid) to anon, authenticated;

-- 5. Weekly schedule: Sunday 15:30 UTC (= early Monday morning in Sydney) ----
select cron.unschedule('venue-opening-hours-weekly')
where exists (select 1 from cron.job where jobname = 'venue-opening-hours-weekly');

select cron.schedule(
  'venue-opening-hours-weekly',
  '30 15 * * 0',
  $cron$
  select net.http_post(
    url := 'https://region-beacon.lovable.app/api/public/venue-hours/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-venue-hours-token', (select cron_token from public.venue_hours_sync_state where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

notify pgrst, 'reload schema';

-- Rollback:
--   select cron.unschedule('venue-opening-hours-weekly');
--   drop function if exists public.get_public_venue_hours(text, uuid);
--   drop function if exists public.admin_set_venue_hours(uuid, text, jsonb);
--   drop function if exists public.admin_can_manage_venue_hours(uuid);
--   drop function if exists public.venue_hours_due(int);
--   drop function if exists public.venue_hours_release_lease(jsonb, text);
--   drop function if exists public.venue_hours_acquire_lease(text, int);
--   drop table if exists public.venue_hours_sync_state;
--   drop table if exists public.venue_opening_hours;
