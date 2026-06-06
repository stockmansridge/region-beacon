-- Tasting QR RPCs. SECURITY DEFINER, explicit search_path.
-- Plan gating: only 'regional', 'pro_region', and 'enterprise' may create or
-- activate tasting QR codes. Lower plans receive a friendly error so the UI
-- can present an upgrade prompt.

-- ---------------------------------------------------------------------------
-- Helper: plan code that gates tasting QR write access.
-- ---------------------------------------------------------------------------
create or replace function public._venue_tasting_qr_plan_allows_write(_agency_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _limits jsonb;
  _code text;
begin
  _limits := public.get_agency_plan_limits(_agency_id);
  _code := coalesce(_limits ->> 'plan_code', 'free');
  return _code in ('regional', 'pro_region', 'enterprise');
end;
$$;

-- ---------------------------------------------------------------------------
-- get_venue_tasting_qr_codes(_event_id, _venue_id)
-- Admin read. Returns active (not soft-deleted) tasting QRs + claim counts.
-- ---------------------------------------------------------------------------
drop function if exists public.get_venue_tasting_qr_codes(uuid, uuid);
create or replace function public.get_venue_tasting_qr_codes(
  _event_id uuid,
  _venue_id uuid
)
returns table (
  id uuid,
  agency_id uuid,
  event_id uuid,
  venue_id uuid,
  label text,
  description text,
  points integer,
  status text,
  qr_token text,
  scan_limit_per_passport integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  claim_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  return query
  select
    t.id, t.agency_id, t.event_id, t.venue_id,
    t.label, t.description, t.points, t.status, t.qr_token,
    t.scan_limit_per_passport, t.starts_at, t.ends_at,
    t.created_at, t.updated_at,
    coalesce(c.cnt, 0)::bigint as claim_count
  from public.venue_tasting_qr_codes t
  left join lateral (
    select count(*) as cnt
    from public.venue_tasting_qr_claims cc
    where cc.tasting_qr_id = t.id
  ) c on true
  where t.event_id = _event_id
    and t.venue_id = _venue_id
    and t.deleted_at is null
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_venue_tasting_qr_codes(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- save_venue_tasting_qr_code(...)
-- Upsert. _id null = insert (server generates qr_token). Otherwise update.
-- ---------------------------------------------------------------------------
drop function if exists public.save_venue_tasting_qr_code(
  uuid, uuid, uuid, text, text, integer, text, integer, timestamptz, timestamptz
);
create or replace function public.save_venue_tasting_qr_code(
  _id uuid,
  _event_id uuid,
  _venue_id uuid,
  _label text,
  _description text,
  _points integer,
  _status text,
  _scan_limit_per_passport integer,
  _starts_at timestamptz,
  _ends_at timestamptz
)
returns public.venue_tasting_qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_venue record;
  v_label text;
  v_status text;
  v_token text;
  v_row public.venue_tasting_qr_codes;
begin
  -- Resolve event/agency.
  select e.agency_id into v_agency from public.events e where e.id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;

  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  if not public._venue_tasting_qr_plan_allows_write(v_agency) then
    raise exception 'plan_required: Tasting QR Codes are available on Regional and Pro Region plans.';
  end if;

  -- Venue must belong to this event + agency and not be soft-deleted.
  select v.id, v.name, v.deleted_at into v_venue
  from public.venues v
  where v.id = _venue_id and v.event_id = _event_id and v.agency_id = v_agency;
  if v_venue.id is null then
    raise exception 'venue_not_in_event';
  end if;
  if v_venue.deleted_at is not null then
    raise exception 'venue_archived';
  end if;

  v_label := nullif(trim(coalesce(_label, '')), '');
  if v_label is null then
    raise exception 'label_required';
  end if;
  if char_length(v_label) > 150 then
    raise exception 'label_too_long';
  end if;

  if _points is null or _points < 0 or _points > 10000 then
    raise exception 'points_out_of_range';
  end if;

  v_status := coalesce(_status, 'active');
  if v_status not in ('active','disabled') then
    raise exception 'invalid_status';
  end if;

  if _ends_at is not null and _starts_at is not null and _ends_at < _starts_at then
    raise exception 'window_invalid';
  end if;

  if _id is null then
    -- Insert. Generate a urlsafe-base64 token, same pattern as rotate_venue_qr.
    v_token := replace(replace(replace(
      encode(gen_random_bytes(24), 'base64'),
      '+','-'), '/','_'), '=','');

    insert into public.venue_tasting_qr_codes (
      agency_id, event_id, venue_id,
      label, description, points, status, qr_token,
      scan_limit_per_passport, starts_at, ends_at
    ) values (
      v_agency, _event_id, _venue_id,
      v_label, nullif(trim(coalesce(_description, '')), ''),
      _points, v_status, v_token,
      _scan_limit_per_passport, _starts_at, _ends_at
    )
    returning * into v_row;
  else
    update public.venue_tasting_qr_codes
       set label = v_label,
           description = nullif(trim(coalesce(_description, '')), ''),
           points = _points,
           status = v_status,
           scan_limit_per_passport = _scan_limit_per_passport,
           starts_at = _starts_at,
           ends_at = _ends_at
     where id = _id
       and event_id = _event_id
       and venue_id = _venue_id
       and agency_id = v_agency
       and deleted_at is null
    returning * into v_row;

    if v_row.id is null then
      raise exception 'tasting_qr_not_found';
    end if;
  end if;

  return v_row;
end;
$$;

grant execute on function public.save_venue_tasting_qr_code(
  uuid, uuid, uuid, text, text, integer, text, integer, timestamptz, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_venue_tasting_qr_code(_id) — soft delete.
-- ---------------------------------------------------------------------------
drop function if exists public.delete_venue_tasting_qr_code(uuid);
create or replace function public.delete_venue_tasting_qr_code(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
begin
  select agency_id into v_agency
  from public.venue_tasting_qr_codes
  where id = _id;
  if v_agency is null then
    raise exception 'tasting_qr_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  update public.venue_tasting_qr_codes
     set deleted_at = now(),
         status = 'disabled'
   where id = _id;
end;
$$;

grant execute on function public.delete_venue_tasting_qr_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_venue_tasting_qr(_qr_token, _passport_token)
-- Public-safe. Mirrors claim_bonus_code shape.
-- ---------------------------------------------------------------------------
drop function if exists public.claim_venue_tasting_qr(text, text);
create or replace function public.claim_venue_tasting_qr(
  _qr_token text,
  _passport_token text
)
returns table (
  success boolean,
  already_collected boolean,
  event_id uuid,
  venue_id uuid,
  tasting_qr_id uuid,
  tasting_qr_label text,
  venue_name text,
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
  q record;
  p record;
  v_inserted boolean := false;
  v_awarded int := 0;
  v_already boolean := false;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
begin
  -- 1. Resolve tasting QR + venue + event status.
  select t.id as tasting_id, t.agency_id, t.event_id, t.venue_id,
         t.label, t.points, t.status as qr_status, t.starts_at, t.ends_at,
         v.name as venue_name, v.status as venue_status, v.deleted_at as venue_deleted,
         e.status as event_status
    into q
  from public.venue_tasting_qr_codes t
  join public.venues v on v.id = t.venue_id
  join public.events e on e.id = t.event_id
  where t.qr_token = _qr_token and t.deleted_at is null;

  if q.tasting_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::uuid, null::text, null::text,
      0, 0, 0, 0,
      'This tasting QR is not available.'::text;
    return;
  end if;

  if q.qr_status <> 'active' then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting code is currently disabled.'::text;
    return;
  end if;

  if q.venue_status <> 'active' or q.venue_deleted is not null then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This venue is not currently available.'::text;
    return;
  end if;

  if q.event_status <> 'published' then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  if q.starts_at is not null and now() < q.starts_at then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR is not active yet.'::text;
    return;
  end if;
  if q.ends_at is not null and now() > q.ends_at then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR has expired.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token (never trust raw passport_id).
  select id as passport_id, agency_id, event_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'Passport not found.'::text;
    return;
  end if;

  -- 3. Tenant integrity.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    return query select
      false, false, q.event_id, q.venue_id, q.tasting_id, q.label, q.venue_name,
      0, 0, 0, 0,
      'This tasting QR is for a different event.'::text;
    return;
  end if;

  -- 4. Insert claim (unique on tasting_qr_id, passport_id).
  insert into public.venue_tasting_qr_claims (
    agency_id, event_id, venue_id, tasting_qr_id, passport_id, points_awarded
  ) values (
    p.agency_id, p.event_id, q.venue_id, q.tasting_id, p.passport_id,
    coalesce(q.points, 0)
  )
  on conflict (tasting_qr_id, passport_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- 5. Mirror to participant_point_awards (idempotent via existing unique
  -- index on event_id+participant_id+award_type+source_id).
  if v_inserted then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      p.agency_id, p.event_id, p.passport_id,
      'tasting', q.tasting_id, coalesce(q.points, 0),
      jsonb_build_object(
        'tasting_qr_id', q.tasting_id,
        'tasting_qr_label', q.label,
        'venue_id', q.venue_id,
        'venue_name', q.venue_name
      )
    )
    on conflict (event_id, participant_id, award_type, source_id)
    where source_id is not null
    do nothing;
    v_awarded := coalesce(q.points, 0);
    v_already := false;
  else
    v_awarded := 0;
    v_already := true;
  end if;

  -- 6. Totals.
  select coalesce(sum(points_awarded), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'venue'), 0)::int,
         coalesce(sum(points_awarded) filter (where award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards
  where event_id = q.event_id and participant_id = p.passport_id;

  return query select
    true,
    v_already,
    q.event_id,
    q.venue_id,
    q.tasting_id,
    q.label,
    q.venue_name,
    v_awarded,
    v_total,
    v_venue_total,
    v_bonus_total,
    case when v_already then 'Already collected' else 'Tasting points collected' end::text;
end;
$$;

revoke all on function public.claim_venue_tasting_qr(text, text) from public;
grant execute on function public.claim_venue_tasting_qr(text, text) to anon, authenticated;
