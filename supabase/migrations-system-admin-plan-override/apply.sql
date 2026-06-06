-- System Admin — manual plan override
--
-- Adds a database-backed manual plan override for platform admins to set a
-- customer's effective plan when GetStampd invoices them outside the
-- automated payment flow.
--
-- Effective plan priority becomes:
--     manual_plan_override ?? paid_subscription_plan ?? free_plan
--
-- Idempotent. Safe to re-run. Additive — no existing column or function is
-- removed; existing Stripe/subscription fields are untouched.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Columns on public.agencies for the manual override.
-- ---------------------------------------------------------------------------
alter table public.agencies
  add column if not exists manual_plan_override text;
alter table public.agencies
  add column if not exists manual_plan_override_at timestamptz;
alter table public.agencies
  add column if not exists manual_plan_override_by uuid;

-- Restrict allowed plan codes to the canonical GetStampd set. Drop and recreate
-- so re-applying the migration always lands the current allow-list.
alter table public.agencies
  drop constraint if exists agencies_manual_plan_override_check;
alter table public.agencies
  add constraint agencies_manual_plan_override_check
  check (
    manual_plan_override is null
    or manual_plan_override in ('free','starter','growth','regional','pro_region','enterprise')
  );

-- ---------------------------------------------------------------------------
-- 2. Effective plan resolver — manual override beats subscription beats free.
-- ---------------------------------------------------------------------------
create or replace function public.get_agency_plan_limits(_agency_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _override   text;
  _raw_code   text;
  _source     text;
  _code       text;
  _limits     jsonb;
begin
  -- 1. Manual override wins.
  select a.manual_plan_override into _override
    from public.agencies a
    where a.id = _agency_id;

  if _override is not null and _override <> '' then
    _raw_code := _override;
    _source := 'manual_override';
  else
    -- 2. Active paid subscription.
    select s.plan_code
      into _raw_code
    from public.agency_subscriptions s
    where s.agency_id = _agency_id
      and s.status in ('active', 'trialing', 'comp')
    order by s.updated_at desc
    limit 1;

    if _raw_code is null then
      _source := 'default';
    else
      _source := 'subscription';
    end if;
  end if;

  _code := lower(coalesce(_raw_code, 'free'));
  _code := replace(_code, '-', '_');

  case _code
    when 'free' then
      _limits := jsonb_build_object('plan_code','free','venue_limit',5,'active_event_limit',1,'passport_limit',250);
    when 'starter' then
      _limits := jsonb_build_object('plan_code','starter','venue_limit',10,'active_event_limit',1,'passport_limit',1000);
    when 'growth' then
      _limits := jsonb_build_object('plan_code','growth','venue_limit',25,'active_event_limit',3,'passport_limit',3000);
    when 'regional' then
      _limits := jsonb_build_object('plan_code','regional','venue_limit',50,'active_event_limit',5,'passport_limit',7500);
    when 'pro_region' then
      _limits := jsonb_build_object('plan_code','pro_region','venue_limit',100,'active_event_limit',10,'passport_limit',15000);
    when 'enterprise' then
      _limits := jsonb_build_object('plan_code','enterprise','venue_limit',null,'active_event_limit',null,'passport_limit',null);
    else
      _limits := jsonb_build_object('plan_code','free','venue_limit',5,'active_event_limit',1,'passport_limit',250);
      _source := 'default';
  end case;

  return _limits || jsonb_build_object('plan_source', _source);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Save RPC — platform admin only.
-- ---------------------------------------------------------------------------
create or replace function public.save_organisation_plan_override(
  p_agency_id uuid,
  p_plan_key  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  _normalised text;
begin
  if caller_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_platform_admin(caller_id) then
    raise exception 'Only platform admins can override organisation plans.'
      using errcode = '42501';
  end if;

  if p_agency_id is null then
    raise exception 'Organisation id is required.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.agencies where id = p_agency_id) then
    raise exception 'Organisation not found.' using errcode = 'P0002';
  end if;

  _normalised := lower(coalesce(p_plan_key, ''));
  _normalised := replace(_normalised, '-', '_');

  if _normalised not in ('free','starter','growth','regional','pro_region','enterprise') then
    raise exception 'Unsupported plan key: %', p_plan_key using errcode = '22023';
  end if;

  update public.agencies
     set manual_plan_override = _normalised,
         manual_plan_override_at = now(),
         manual_plan_override_by = caller_id
   where id = p_agency_id;

  return jsonb_build_object(
    'success', true,
    'agency_id', p_agency_id,
    'manual_plan_override', _normalised,
    'manual_plan_override_at', now(),
    'effective_plan', public.get_agency_plan_limits(p_agency_id)
  );
end;
$$;

revoke all on function public.save_organisation_plan_override(uuid, text) from public;
grant execute on function public.save_organisation_plan_override(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Clear RPC — platform admin only.
-- ---------------------------------------------------------------------------
create or replace function public.clear_organisation_plan_override(
  p_agency_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_platform_admin(caller_id) then
    raise exception 'Only platform admins can clear organisation plan overrides.'
      using errcode = '42501';
  end if;
  if p_agency_id is null then
    raise exception 'Organisation id is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.agencies where id = p_agency_id) then
    raise exception 'Organisation not found.' using errcode = 'P0002';
  end if;

  update public.agencies
     set manual_plan_override = null,
         manual_plan_override_at = null,
         manual_plan_override_by = null
   where id = p_agency_id;

  return jsonb_build_object(
    'success', true,
    'agency_id', p_agency_id,
    'manual_plan_override', null,
    'effective_plan', public.get_agency_plan_limits(p_agency_id)
  );
end;
$$;

revoke all on function public.clear_organisation_plan_override(uuid) from public;
grant execute on function public.clear_organisation_plan_override(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Read RPC — return the manual override for a single org (platform admin).
-- ---------------------------------------------------------------------------
create or replace function public.get_organisation_plan_override(
  p_agency_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  _override text;
  _at timestamptz;
  _by uuid;
begin
  if caller_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_platform_admin(caller_id) then
    raise exception 'Only platform admins can read plan overrides.'
      using errcode = '42501';
  end if;

  select manual_plan_override, manual_plan_override_at, manual_plan_override_by
    into _override, _at, _by
    from public.agencies
   where id = p_agency_id;

  return jsonb_build_object(
    'manual_plan_override', _override,
    'manual_plan_override_at', _at,
    'manual_plan_override_by', _by,
    'effective_plan', public.get_agency_plan_limits(p_agency_id)
  );
end;
$$;

revoke all on function public.get_organisation_plan_override(uuid) from public;
grant execute on function public.get_organisation_plan_override(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- select public.get_agency_plan_limits('<agency-uuid>');
-- select public.save_organisation_plan_override('<agency-uuid>', 'regional');
-- select public.get_organisation_plan_override('<agency-uuid>');
-- select public.clear_organisation_plan_override('<agency-uuid>');
