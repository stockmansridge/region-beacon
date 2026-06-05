-- Points System Stage 4: Public passport progress RPC.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   * public.get_public_passport_progress(p_event_id, p_passport_token)
--     Returns the current visitor's own totals only. The caller proves
--     identity by presenting their passport access token (same model as
--     redeem_checkin / claim_bonus_code). The function never reveals
--     any other participant's data.
--
-- The Stage 1 admin RPC public.get_event_participant_points() returns ALL
-- participants and is gated to platform admins / agency members via
-- is_platform_admin / is_agency_member. That is not safe to call from an
-- anonymous public visitor, hence this new dedicated public RPC.

begin;

create or replace function public.get_public_passport_progress(
  p_event_id uuid,
  p_passport_token text
)
returns table (
  passport_id uuid,
  total_points integer,
  venue_points integer,
  bonus_points integer,
  passport_stamp_count integer,
  total_venues integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passport_id uuid;
  v_agency_id uuid;
  v_event_id uuid;
  v_event_status text;
  v_total int := 0;
  v_venue int := 0;
  v_bonus int := 0;
  v_stamp_count int := 0;
  v_total_venues int := 0;
begin
  -- Resolve passport by hashed access token + event scope.
  select p.id, p.agency_id, p.event_id, e.status
    into v_passport_id, v_agency_id, v_event_id, v_event_status
  from public.passports p
  join public.events e on e.id = p.event_id
  where p.event_id = p_event_id
    and p.access_token_hash = digest(p_passport_token, 'sha256')
  limit 1;

  if v_passport_id is null then
    return;
  end if;

  -- Only expose data for published events. (Drafts/archived events stay dark.)
  if v_event_status <> 'published' then
    return;
  end if;

  -- Point totals (always return 0s if no awards yet).
  select
    coalesce(sum(ppa.points_awarded), 0)::int,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::int,
    coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::int
    into v_total, v_venue, v_bonus
  from public.participant_point_awards ppa
  where ppa.event_id = v_event_id
    and ppa.participant_id = v_passport_id;

  -- Stamp count = distinct venues this passport has checked in to.
  select count(distinct c.venue_id)::int
    into v_stamp_count
  from public.checkins c
  where c.passport_id = v_passport_id;

  -- Active venue universe for this event (matches get_public_event_venues).
  select count(*)::int
    into v_total_venues
  from public.venues v
  where v.event_id = v_event_id
    and v.status = 'active'
    and v.deleted_at is null;

  return query select
    v_passport_id,
    coalesce(v_total, 0),
    coalesce(v_venue, 0),
    coalesce(v_bonus, 0),
    coalesce(v_stamp_count, 0),
    coalesce(v_total_venues, 0);
end;
$$;

revoke all on function public.get_public_passport_progress(uuid, text) from public;
grant execute on function public.get_public_passport_progress(uuid, text)
  to anon, authenticated;

commit;

-- =====================================================================
-- Verification
-- =====================================================================
-- 1. With a valid passport access token:
--      select * from public.get_public_passport_progress(
--        '<event_id>'::uuid,
--        '<passport_token>'
--      );
--    Should return one row with the visitor's own totals + stamp progress.
--
-- 2. With an invalid token: returns zero rows (no error, no data leak).
--
-- 3. Against an unpublished event: returns zero rows.
