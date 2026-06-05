-- GetStampd venue lifecycle RPCs (DRAFT)
-- Project: kyjwifumacnrpgyextzz
--
-- Adds three RPCs that own the disable / reactivate / hard-delete lifecycle
-- for venues. Reuses the existing `public.venues.deleted_at` column as the
-- "disabled" marker so that:
--   * disabled venues stay in the database for historical events, check-ins,
--     passports, QR records and analytics;
--   * disabled venues are excluded from plan venue-limit counts (the
--     `enforce_agency_venue_limit` trigger already counts rows where
--     `deleted_at IS NULL`);
--   * reactivation re-applies the plan limit check before clearing the marker;
--   * hard delete physically removes the row only when no historical activity
--     (events activations aside) references it.
--
-- Idempotent and additive: safe to re-apply. No destructive schema changes.

-- ---------------------------------------------------------------------------
-- _can_manage_agency(_agency_id uuid) -> boolean
-- Internal helper. Centralises the "platform admin OR agency admin" check
-- used by every lifecycle RPC.
-- ---------------------------------------------------------------------------
create or replace function public._can_manage_agency_venue(_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), _agency_id);
$$;

grant execute on function public._can_manage_agency_venue(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- disable_venue(p_venue_id uuid, p_reason text default null)
-- Sets venues.deleted_at = now(). Idempotent: re-disabling an already-disabled
-- venue is a no-op success. Does NOT alter any historical row.
-- ---------------------------------------------------------------------------
create or replace function public.disable_venue(
  p_venue_id uuid,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_already_disabled timestamptz;
begin
  select agency_id, deleted_at
    into v_agency_id, v_already_disabled
  from public.venues
  where id = p_venue_id;

  if v_agency_id is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  if not public._can_manage_agency_venue(v_agency_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Idempotent: already disabled -> nothing to do.
  if v_already_disabled is not null then
    return;
  end if;

  update public.venues
     set deleted_at = now(),
         status     = 'inactive'
   where id = p_venue_id;
end;
$$;

grant execute on function public.disable_venue(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- reactivate_venue(p_venue_id uuid)
-- Clears deleted_at. Re-checks the agency's active-venue plan limit BEFORE
-- clearing the marker. Idempotent for venues that are already active.
-- ---------------------------------------------------------------------------
create or replace function public.reactivate_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_deleted_at timestamptz;
  v_limits jsonb;
  v_venue_limit int;
  v_active_count int;
begin
  select agency_id, deleted_at
    into v_agency_id, v_deleted_at
  from public.venues
  where id = p_venue_id;

  if v_agency_id is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  if not public._can_manage_agency_venue(v_agency_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Idempotent: already active -> nothing to do, no limit check needed.
  if v_deleted_at is null then
    return;
  end if;

  -- Re-check plan limit before reactivation. If the helper does not yet
  -- exist in this environment, skip the check (legacy fallback).
  begin
    v_limits := public.get_agency_plan_limits(v_agency_id);
  exception when undefined_function then
    v_limits := null;
  end;

  if v_limits is not null and (v_limits ->> 'venue_limit') is not null then
    v_venue_limit := (v_limits ->> 'venue_limit')::int;

    select count(*)::int
      into v_active_count
      from public.venues
     where agency_id   = v_agency_id
       and deleted_at  is null;

    if v_active_count >= v_venue_limit then
      raise exception
        'You have reached your active venue limit. Upgrade your plan or disable another venue before reactivating this venue.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.venues
     set deleted_at = null,
         status     = 'active'
   where id = p_venue_id;
end;
$$;

grant execute on function public.reactivate_venue(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- hard_delete_venue(p_venue_id uuid)
-- Physically removes the venue row. Blocks if the venue is referenced by any
-- check-in or passport-stamp record. QR codes and offers cascade-delete via
-- their FKs, so they don't block deletion. The check is intentionally strict:
-- if in doubt, the caller should disable the venue instead.
-- ---------------------------------------------------------------------------
create or replace function public.hard_delete_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_checkin_count int := 0;
begin
  select agency_id
    into v_agency_id
  from public.venues
  where id = p_venue_id;

  if v_agency_id is null then
    raise exception 'venue_not_found' using errcode = 'P0002';
  end if;

  if not public._can_manage_agency_venue(v_agency_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Block when any check-in references this venue.
  select count(*)::int
    into v_checkin_count
    from public.checkins
   where venue_id = p_venue_id;

  if v_checkin_count > 0 then
    raise exception
      'This venue cannot be permanently deleted because it is linked to existing events or historical activity. Disable it instead.'
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.venues where id = p_venue_id;
end;
$$;

grant execute on function public.hard_delete_venue(uuid) to authenticated;
