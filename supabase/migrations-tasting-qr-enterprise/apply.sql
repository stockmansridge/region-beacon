-- Tasting QR Codes: include Enterprise in the plan gate.
--
-- Background: the live deployment of _venue_tasting_qr_plan_allows_write
-- only allowed 'regional' and 'pro_region'. Enterprise organisations were
-- blocked at the RPC layer even though Enterprise is the highest tier and
-- should include all lower-tier functionality.
--
-- This migration:
--   1. Recreates the helper with 'enterprise' included.
--   2. Normalises the plan code (lower-case, dash -> underscore) so that
--      casing or punctuation drift cannot lock out a paid plan.
--   3. Updates the user-facing error message to mention Enterprise.

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
  _code := lower(coalesce(_limits ->> 'plan_code', 'free'));
  _code := replace(_code, '-', '_');
  return _code in ('regional', 'pro_region', 'enterprise');
end;
$$;

-- Refresh the save RPC only to update the error message; logic is unchanged
-- aside from the helper above. We patch in-place via a small wrapper update
-- by re-raising with the new copy if the helper denies write access.
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
  select e.agency_id into v_agency from public.events e where e.id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;

  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  if not public._venue_tasting_qr_plan_allows_write(v_agency) then
    raise exception 'plan_required: Tasting QR Codes are available on Regional, Pro Region, and Enterprise plans.';
  end if;

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
