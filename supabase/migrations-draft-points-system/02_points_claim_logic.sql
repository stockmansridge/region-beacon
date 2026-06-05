-- Points System Stage 3: Claim logic for venue points and bonus codes.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   * Updated public.redeem_checkin (now awards venue points on first scan
--     AND returns participant point totals; existing return columns preserved
--     for backwards compatibility).
--   * public.claim_bonus_code() — public SECURITY DEFINER RPC that awards
--     bonus points to a passport-identified participant.
--
-- Identity model: participant_id = public.passports.id (one per visitor per
-- event). This matches Stage 1 + checkins; we do NOT introduce a second
-- identity table.

begin;

-- =====================================================================
-- Part A — redeem_checkin (venue points)
-- =====================================================================
--
-- Drops the old function first because we change the return signature
-- (add 5 new columns). All existing callers select specific fields, so
-- the additive columns are safe.

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
  is_new boolean,
  points_awarded integer,
  points_already_awarded boolean,
  total_points integer,
  venue_points integer,
  bonus_points integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
  v_entry_value int;
  v_venue_points int;
  v_venue_name text;
  v_awarded int := 0;
  v_already_awarded boolean := false;
  v_inserted_award boolean := false;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
  v_is_new boolean;
begin
  -- 1. Resolve QR (+ snapshot its current entry_value).
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         qr.entry_value, e.status as event_status,
         v.points_value as venue_points_value,
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
  v_venue_points := coalesce(q.venue_points_value, 0);
  v_venue_name := q.venue_name;

  -- 2. Resolve passport.
  select id as passport_id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3. Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4. Settings.
  select coalesce(es.one_checkin_per_venue, true)             as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0)     as min_seconds
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5. One-per-venue idempotency.
  if s.one_per_venue then
    select id into v_existing
    from public.checkins
    where passport_id = p.passport_id and venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      -- No new stamp. No new points. Compute current totals and return.
      v_already_awarded := exists (
        select 1 from public.participant_point_awards
        where event_id = q.event_id
          and participant_id = p.passport_id
          and award_type = 'venue'
          and source_id = q.venue_id
      );

      select coalesce(sum(points_awarded), 0)::int,
             coalesce(sum(points_awarded) filter (where award_type = 'venue'), 0)::int,
             coalesce(sum(points_awarded) filter (where award_type = 'bonus'), 0)::int
        into v_total, v_venue_total, v_bonus_total
      from public.participant_point_awards
      where event_id = q.event_id and participant_id = p.passport_id;

      return query select
        v_existing, q.venue_id, p.passport_id, false,
        0::int, v_already_awarded,
        v_total, v_venue_total, v_bonus_total;
      return;
    end if;
  end if;

  -- 6. Rate limit.
  if s.min_seconds > 0 then
    select max(created_at) into v_last
    from public.checkins where passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7. Insert checkin with snapshotted entry_value.
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

  v_is_new := true;

  -- 8. Award venue points (if any). Uses the unique index on
  --    (event_id, participant_id, award_type, source_id) for idempotency.
  if v_venue_points > 0 then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'venue', q.venue_id, v_venue_points,
      jsonb_build_object('venue_id', q.venue_id, 'venue_name', v_venue_name)
    )
    on conflict (event_id, participant_id, award_type, source_id)
    where source_id is not null
    do nothing;

    -- Detect whether this call actually inserted the row.
    get diagnostics v_inserted_award = row_count;
    if v_inserted_award then
      v_awarded := v_venue_points;
      v_already_awarded := false;
    else
      v_awarded := 0;
      v_already_awarded := true;
    end if;
  else
    v_awarded := 0;
    v_already_awarded := false;
  end if;

  -- 9. Totals.
  select coalesce(sum(points_awarded), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'venue'), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards
  where event_id = q.event_id and participant_id = p.passport_id;

  return query select
    v_checkin, q.venue_id, p.passport_id, v_is_new,
    v_awarded, v_already_awarded,
    v_total, v_venue_total, v_bonus_total;
end;
$$;

grant execute on function public.redeem_checkin(text, text, inet, text)
  to anon, authenticated;

-- =====================================================================
-- Part B — claim_bonus_code
-- =====================================================================
--
-- Awards bonus points to a passport-identified participant. Identifies
-- the passport via its access_token (same convention as redeem_checkin),
-- so the caller never sends a raw passport_id from the browser.

create or replace function public.claim_bonus_code(
  _token text,
  _passport_token text
)
returns table (
  success boolean,
  already_collected boolean,
  event_id uuid,
  bonus_code_id uuid,
  bonus_code_name text,
  points_awarded integer,
  total_points integer,
  venue_points integer,
  bonus_points integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  p record;
  v_awarded int := 0;
  v_already boolean := false;
  v_inserted boolean := false;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
begin
  -- 1. Resolve bonus code + event status.
  select bc.id as bonus_id, bc.agency_id, bc.event_id, bc.name,
         bc.points_value, bc.is_active,
         e.status as event_status
    into b
  from public.event_bonus_codes bc
  join public.events e on e.id = bc.event_id
  where bc.qr_code_token = _token;

  if b.bonus_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::text,
      0, 0, 0, 0,
      'Bonus code not found.'::text;
    return;
  end if;

  if not b.is_active then
    return query select
      false, false, b.event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This bonus code is no longer active.'::text;
    return;
  end if;

  if b.event_status <> 'published' then
    return query select
      false, false, b.event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token.
  select id as passport_id, agency_id, event_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    return query select
      false, false, b.event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'Passport not found.'::text;
    return;
  end if;

  -- 3. Tenant integrity.
  if p.event_id <> b.event_id or p.agency_id <> b.agency_id then
    return query select
      false, false, b.event_id, b.bonus_id, b.name,
      0, 0, 0, 0,
      'This bonus code is for a different event.'::text;
    return;
  end if;

  -- 4. Insert points award (idempotent via unique index).
  insert into public.participant_point_awards (
    agency_id, event_id, participant_id,
    award_type, source_id, points_awarded, metadata
  )
  values (
    p.agency_id, p.event_id, p.passport_id,
    'bonus', b.bonus_id, coalesce(b.points_value, 0),
    jsonb_build_object('bonus_code_id', b.bonus_id, 'bonus_code_name', b.name)
  )
  on conflict (event_id, participant_id, award_type, source_id)
  where source_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted then
    v_awarded := coalesce(b.points_value, 0);
    v_already := false;
  else
    v_awarded := 0;
    v_already := true;
  end if;

  -- 5. Totals.
  select coalesce(sum(points_awarded), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'venue'), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards
  where event_id = b.event_id and participant_id = p.passport_id;

  return query select
    true,
    v_already,
    b.event_id,
    b.bonus_id,
    b.name,
    v_awarded,
    v_total,
    v_venue_total,
    v_bonus_total,
    case
      when v_already then 'Already collected'
      else 'Bonus points collected'
    end::text;
end;
$$;

revoke all on function public.claim_bonus_code(text, text) from public;
grant execute on function public.claim_bonus_code(text, text) to anon, authenticated;

commit;

-- =====================================================================
-- Verification
-- =====================================================================
-- 1. Set a venue's points_value = 10, scan a fresh QR, confirm a new row
--    appears in participant_point_awards with award_type='venue', and
--    redeem_checkin returns points_awarded=10, points_already_awarded=false.
-- 2. Scan the same QR again: no new ledger row, redeem_checkin returns
--    is_new=false, points_awarded=0, points_already_awarded=true.
-- 3. Create a bonus code worth 25, call:
--      select * from public.claim_bonus_code('<token>', '<passport_token>');
--    Expect success=true, already_collected=false, points_awarded=25.
-- 4. Call again with same args: already_collected=true, points_awarded=0.
-- 5. Set is_active=false on the bonus code, call again: success=false,
--    message='This bonus code is no longer active.'
