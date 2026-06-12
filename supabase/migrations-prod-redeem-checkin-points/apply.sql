-- Production fix: redeem_checkin must award points on first venue check-in.
--
-- Problem
-- -------
-- The current production redeem_checkin (see
-- supabase/migrations-prod-qr-entry-value/apply.sql) inserts into
-- public.checkins and snapshots entry_value, but never inserts into
-- public.participant_point_awards. The leaderboard / rewards system
-- reads point totals exclusively from participant_point_awards
-- (see get_public_leaderboard_by_domain + get_event_participant_points),
-- so successful check-ins increment the stamp count but leave points = 0.
--
-- Fix
-- ---
-- Recreate public.redeem_checkin so that, on a brand-new venue check-in,
-- it ALSO inserts a row into participant_point_awards with:
--     award_type     = 'venue'   (matches the existing CHECK constraint
--                                  and what the leaderboard CTE filters on)
--     source_id      = venue_id  (one award per (event, participant, venue),
--                                  guaranteed idempotent by the existing
--                                  unique index participant_point_awards_unique_source)
--     points_awarded = COALESCE(qr.entry_value, 1)  (clamped 1..100)
--
-- Behaviour preserved
-- -------------------
--   * Identical parameter list & return signature
--     (checkin_id, venue_id, passport_id, is_new) — no client changes needed.
--   * Duplicate venue check-ins still short-circuit and award no new points.
--   * Rate limit, tenant integrity, published-event gate unchanged.
--   * digest() stays schema-qualified as extensions.digest(...).
--
-- Safe to re-run.

begin;

-- Required extension (already created by the previous prod patch, but
-- re-asserted here so this file is self-contained).
create extension if not exists pgcrypto with schema extensions;

drop function if exists public.redeem_checkin(text, text, inet, text);

create or replace function public.redeem_checkin(
  _qr_token text,
  _passport_token text,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  checkin_id uuid,
  venue_id uuid,
  passport_id uuid,
  is_new boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
  v_entry_value int;
  v_venue_name text;
begin
  -- 1) Resolve QR + snapshot entry_value + grab venue name for ledger metadata.
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         coalesce(qr.entry_value, 1) as entry_value,
         e.status as event_status,
         v.name as venue_name
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  join public.venues v on v.id = qr.venue_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  v_entry_value := greatest(1, least(coalesce(q.entry_value, 1), 100));
  v_venue_name := q.venue_name;

  -- 2) Resolve passport.
  select pp.id as passport_id, pp.agency_id, pp.event_id, pp.visitor_id
    into p
  from public.passports pp
  where pp.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text);

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3) Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4) Settings.
  select coalesce(es.one_checkin_per_venue, true)         as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0) as min_seconds
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5) One-per-venue idempotency (short-circuit, no new points).
  if s.one_per_venue then
    select c.id into v_existing
    from public.checkins c
    where c.passport_id = p.passport_id and c.venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      return query select v_existing, q.venue_id, p.passport_id, false;
      return;
    end if;
  end if;

  -- 6) Rate limit.
  if s.min_seconds > 0 then
    select max(c.created_at) into v_last
    from public.checkins c where c.passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7) Insert checkin (snapshots entry_value).
  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    entry_value, client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.passport_id, p.visitor_id,
    q.venue_id, q.qr_id, 'qr_scan',
    v_entry_value, _client_ip, _user_agent
  )
  returning id into v_checkin;

  -- 8) Award venue points to the leaderboard/rewards ledger.
  --     Idempotent via existing unique index:
  --       participant_point_awards_unique_source
  --       on (event_id, participant_id, award_type, source_id)
  --       where source_id is not null
  --     so retries / race conditions cannot duplicate the row.
  if v_entry_value > 0 then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'venue', q.venue_id, v_entry_value,
      jsonb_build_object(
        'venue_id', q.venue_id,
        'venue_name', v_venue_name,
        'checkin_id', v_checkin,
        'qr_entry_value', v_entry_value
      )
    )
    on conflict (event_id, participant_id, award_type, source_id)
      where source_id is not null
    do nothing;
  end if;

  return query select v_checkin, q.venue_id, p.passport_id, true;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

commit;

-- ===================================================================
-- Verification SQL
-- ===================================================================
--
-- Replace :passport_id with the test passport that just scanned a
-- venue with entry_value = 3.
--
-- 1. Latest checkin row has entry_value = 3:
--    select id, venue_id, passport_id, entry_value, created_at
--    from public.checkins
--    where passport_id = :passport_id
--    order by created_at desc
--    limit 1;
--
-- 2. Matching participant_point_awards row exists for that
--    passport / venue:
--    select id, award_type, source_id, points_awarded, metadata, awarded_at
--    from public.participant_point_awards
--    where participant_id = :passport_id
--      and award_type = 'venue'
--    order by awarded_at desc
--    limit 5;
--
-- 3. The point amount is 3 (will match entry_value):
--    -- shown by points_awarded in step 2.
--
-- 4. Leaderboard returns participant with stamps and points >= 3.
--    Use the public RPC with the live event subdomain hostname:
--      select rank, display_name, stamps, points, venue_points, bonus_points
--      from public.get_public_leaderboard_by_domain(
--        'cargordwinetrail.getstampd.com.au'
--      )
--      order by rank
--      limit 20;
--
--    Also confirm the same totals via the admin summary RPC:
--      select * from public.get_event_participant_points(:event_id)
--      where participant_id = :passport_id;
--
-- 5. Re-scanning the same venue does NOT duplicate the ledger row:
--    -- Run the same checkin/<qr_token> URL again on the device. Then:
--    select count(*)
--    from public.participant_point_awards
--    where participant_id = :passport_id
--      and award_type = 'venue'
--      and source_id  = :venue_id;
--    -- expected: 1
--
-- Notes
-- -----
-- * award_type is 'venue' (NOT 'checkin' / 'venue_checkin') to match
--   the existing CHECK constraint
--   (participant_point_awards_type_check) and the leaderboard +
--   rewards summary RPCs, which all already filter on 'venue'.
-- * Rewards progress uses the same ledger:
--   get_event_participant_points() and the leaderboard CTE both
--   sum public.participant_point_awards.points_awarded, so any
--   rewards/leaderboard surface that reads either RPC is now in sync.
