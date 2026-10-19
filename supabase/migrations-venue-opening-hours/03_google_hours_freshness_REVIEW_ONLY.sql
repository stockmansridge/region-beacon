-- 03_google_hours_freshness_REVIEW_ONLY.sql
-- REVIEW ONLY — do not run without separate approval.
--
-- Acknowledged live state (verified independently by the owner):
--   * cron job 1 venue-opening-hours-weekly is active, schedule 30 15 * * 0 UTC,
--     already posting to https://project--481bb391-4845-4595-9174-36e7e5516010.lovable.app/api/public/venue-hours/sync
--   * 02_cron_url_and_stale_hours_REVIEW_ONLY.sql is ALREADY APPLIED — do not re-run it.
--   * venue_opening_hours has 0 rows, cron.job_run_details empty, sync_state.last_run_at NULL.
--
-- Gap: the applied get_public_venue_hours bounds the 'error' branch to a
-- synced_at within 28 days, but the 'ok' branch has NO age limit — if the
-- weekly job dies, stale Google hours stay visible indefinitely.
--
-- This patch requires a nonnull synced_at within 28 days for BOTH 'ok' and
-- 'error'. 'not_found' stays hidden, 'manual' always wins regardless of any
-- Google timestamp, 'off' stays hidden. Return type is unchanged, so a plain
-- create or replace suffices and existing grants are preserved.

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
      or (h.hours_source = 'google' and h.google_hours is not null
          and h.sync_status in ('ok', 'error')
          and h.synced_at is not null
          and h.synced_at > now() - interval '28 days'));
$$;

-- VERIFY (read-only):
--   select pg_get_functiondef('public.get_public_venue_hours(text, uuid)'::regprocedure);
--     -- both 'ok' and 'error' gated by synced_at > now() - interval '28 days'
--
-- ROLLBACK: re-apply the get_public_venue_hours definition from
--   02_cron_url_and_stale_hours_REVIEW_ONLY.sql (the currently live version).
