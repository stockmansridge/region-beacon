-- REVIEW ONLY — do not run without separate approval.
-- Two narrow fixes for the venue opening-hours feature:
--   A) Repoint the existing weekly cron job (job 1) at the stable Lovable URL.
--      region-beacon.lovable.app now 307-redirects to getstampd.com.au and
--      pg_cron's net.http_post does not follow redirects, so the job can never
--      reach the endpoint. Uses cron.alter_job to preserve job identity,
--      schedule, active flag, token lookup and timeout. No token is exposed.
--   B) Bounded last-known-good policy in get_public_venue_hours: a transient
--      sync error no longer hides recently validated hours. Hours are shown
--      while sync_status = 'ok', or after an error while the last confirmed
--      validation (synced_at) is within 28 days. 'not_found' stays hidden.
--      The server only bumps synced_at on confirmed Google data, so stale
--      hours expire 28 days after the last successful validation.
--   C) venue_hours_due also returns the venue address so the matcher can use
--      locality evidence to resolve close duplicate listings.

-- A) Repoint cron job 1 ------------------------------------------------------
select cron.alter_job(
  job_id   := 1,
  command  := $cron$
  select net.http_post(
    url := 'https://project--481bb391-4845-4595-9174-36e7e5516010.lovable.app/api/public/venue-hours/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-venue-hours-token', (select cron_token from public.venue_hours_sync_state where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
  -- schedule, database, username and active are left unchanged (NULL = keep).
);

-- B) Bounded stale-hours policy ----------------------------------------------
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
      or (h.hours_source = 'google' and h.google_hours is not null and (
           h.sync_status = 'ok'
           or (h.sync_status = 'error' and h.synced_at is not null
               and h.synced_at > now() - interval '28 days')
         )));
$$;

-- C) Address for duplicate disambiguation ------------------------------------
-- Return type changes, so the old function must be dropped first; the grant
-- is re-applied below.
drop function if exists public.venue_hours_due(int);
create function public.venue_hours_due(_limit int)
returns table(venue_id uuid, agency_id uuid, event_id uuid, name text, address text, lat double precision, lng double precision, google_place_id text)
language sql stable security definer set search_path = public as $$
  select v.id, v.agency_id, v.event_id, v.name, v.address, v.lat::double precision, v.lng::double precision, h.google_place_id
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

notify pgrst, 'reload schema';

-- VERIFY (read-only):
--   select jobid, jobname, schedule, active, command from cron.job where jobid = 1;
--     -- command must contain project--481bb391-4845-4595-9174-36e7e5516010.lovable.app
--     -- schedule must still be '30 15 * * 0', active still true
--   select proname, pg_get_function_arguments(oid) from pg_proc
--     where proname in ('get_public_venue_hours','venue_hours_due');
--   -- after the next scheduled run:
--   select last_run_at, last_summary, paused_reason from public.venue_hours_sync_state where id = 1;
--   select status_code, error_msg, start_time from cron.job_run_details where jobid = 1 order by start_time desc limit 3;
--
-- ROLLBACK:
--   select cron.alter_job(job_id := 1, command := $cron$
--     select net.http_post(
--       url := 'https://region-beacon.lovable.app/api/public/venue-hours/sync',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-venue-hours-token', (select cron_token from public.venue_hours_sync_state where id = 1)),
--       body := '{}'::jsonb, timeout_milliseconds := 120000);
--   $cron$);
--   -- then re-apply the original get_public_venue_hours and venue_hours_due
--   -- definitions from supabase/migrations-venue-opening-hours/apply.sql
--   -- (sections 4 and 2 respectively).
