-- Points System Stage 7: QA verification queries.
-- Reference-only. Not a migration. Run manually after Stages 1–6 are applied
-- and after E2E test traffic has been generated against a real event.
--
-- Each query below has an expected result of "zero rows" unless noted.

-- =====================================================================
-- 1. No duplicate point awards
-- =====================================================================
-- Confirms the unique index participant_point_awards_unique_source on
-- (event_id, participant_id, award_type, source_id) is holding.
select
  event_id,
  participant_id,
  award_type,
  source_id,
  count(*) as duplicate_count
from public.participant_point_awards
where source_id is not null
group by event_id, participant_id, award_type, source_id
having count(*) > 1;
-- Expected: zero rows.

-- =====================================================================
-- 2. No negative awards
-- =====================================================================
-- Confirms the participant_point_awards_points_non_negative check
-- constraint is preventing negative ledger rows.
select *
from public.participant_point_awards
where points_awarded < 0;
-- Expected: zero rows.

-- =====================================================================
-- 3. Bonus awards never create venue checkins
-- =====================================================================
-- A bonus claim must NOT also have produced a row in public.checkins
-- against the same (passport, event, source). This guards against a
-- regression where bonus claims were ever wired into the stamp path.
--
-- NOTE: bonus source_id values reference event_bonus_codes.id, which is
-- a separate UUID space from venues.id. A collision is theoretically
-- possible but practically zero, so this is a sanity check.
select ppa.*
from public.participant_point_awards ppa
where ppa.award_type = 'bonus'
  and exists (
    select 1
    from public.checkins c
    where c.passport_id = ppa.participant_id
      and c.event_id     = ppa.event_id
      and c.venue_id     = ppa.source_id
  );
-- Expected: zero rows.

-- =====================================================================
-- 4. No zero-point ledger rows for venues
-- =====================================================================
-- The venue claim path in redeem_checkin only inserts a ledger row when
-- venues.points_value > 0 (zero-point venues still create stamps, but
-- no awards row). This query surfaces any unintended 0-point venue rows.
select *
from public.participant_point_awards
where award_type = 'venue'
  and points_awarded = 0;
-- Expected: zero rows (unless future logic deliberately writes zeroes).

-- =====================================================================
-- 5. Historical award preservation
-- =====================================================================
-- Changing a venue or bonus code's current points_value must NOT rewrite
-- previously inserted award rows. This query flags awards whose
-- points_awarded no longer matches the source's current points_value —
-- which is EXPECTED and PROVES the snapshot is preserved (i.e., a
-- non-empty result here is a feature, not a bug).
select
  ppa.id,
  ppa.event_id,
  ppa.award_type,
  ppa.points_awarded as awarded_at_scan,
  case ppa.award_type
    when 'venue' then v.points_value
    when 'bonus' then bc.points_value
  end as current_source_value
from public.participant_point_awards ppa
left join public.venues             v  on v.id  = ppa.source_id and ppa.award_type = 'venue'
left join public.event_bonus_codes  bc on bc.id = ppa.source_id and ppa.award_type = 'bonus'
where ppa.points_awarded <> coalesce(
  case ppa.award_type
    when 'venue' then v.points_value
    when 'bonus' then bc.points_value
  end,
  ppa.points_awarded
);
-- Expected: any rows here = historical awards correctly preserved after
-- the admin edited the source value. Zero rows = no edits have happened
-- yet. Either result is acceptable.

-- =====================================================================
-- 6. Anonymous permissions audit (reference; check via Supabase dashboard)
-- =====================================================================
-- Run as the anon role to confirm hardening:
--
--   set local role anon;
--
--   -- Should be empty (RLS: select policy gated to platform admin /
--   -- agency member):
--   select * from public.event_bonus_codes;
--
--   -- Should error (no INSERT grant + no policy):
--   insert into public.participant_point_awards
--     (agency_id, event_id, participant_id, award_type, source_id, points_awarded)
--     values ('00000000-0000-0000-0000-000000000000'::uuid,
--             '00000000-0000-0000-0000-000000000000'::uuid,
--             '00000000-0000-0000-0000-000000000000'::uuid,
--             'bonus', null, 1);
--
--   -- Should error (revoked from public, granted only to authenticated):
--   select * from public.get_admin_event_participants_with_points(
--     '00000000-0000-0000-0000-000000000000'::uuid);
--
--   reset role;
--
-- Anonymous is allowed to:
--   * call public.redeem_checkin(...)         (granted to anon)
--   * call public.claim_bonus_code(...)       (granted to anon)
--   * call public.get_public_passport_progress(p_event_id, p_passport_token)
--     — only returns rows when the supplied access token matches a passport
--   * call public.get_public_leaderboard_by_domain(...)
--
-- =====================================================================
-- 7. Reconciliation: participant totals match ledger sums
-- =====================================================================
-- For a single event, confirm get_admin_event_participants_with_points
-- agrees with the raw ledger. Replace :event_id with a real value.
--
-- with admin as (
--   select passport_id, total_points, venue_points, bonus_points
--   from public.get_admin_event_participants_with_points(:event_id)
-- ),
-- raw as (
--   select participant_id as passport_id,
--          coalesce(sum(points_awarded), 0)::int as total_points,
--          coalesce(sum(points_awarded) filter (where award_type='venue'), 0)::int as venue_points,
--          coalesce(sum(points_awarded) filter (where award_type='bonus'), 0)::int as bonus_points
--   from public.participant_point_awards
--   where event_id = :event_id
--   group by participant_id
-- )
-- select a.passport_id
-- from admin a
-- left join raw r on r.passport_id = a.passport_id
-- where coalesce(r.total_points,0) <> a.total_points
--    or coalesce(r.venue_points,0) <> a.venue_points
--    or coalesce(r.bonus_points,0) <> a.bonus_points;
-- Expected: zero rows.
