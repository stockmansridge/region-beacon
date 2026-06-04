-- GetStampd venue-limit enforcement (DRAFT)
-- Additive, idempotent. Does not alter existing tables or data.
-- Apply manually only when ready to enforce plan limits server-side.

-- ---------------------------------------------------------------------------
-- get_agency_plan_limits(_agency_id uuid) -> jsonb
-- Returns the effective plan limits for an organisation. Falls back to Free
-- when there is no active subscription or the plan code is unknown.
-- ---------------------------------------------------------------------------
create or replace function public.get_agency_plan_limits(_agency_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _raw_code text;
  _code text;
  _limits jsonb;
begin
  select s.plan_code
    into _raw_code
  from public.agency_subscriptions s
  where s.agency_id = _agency_id
    and s.status in ('active', 'trialing', 'comp')
  order by s.updated_at desc
  limit 1;

  -- Normalise plan code (accept pro-region and pro_region; unknown -> free).
  _code := lower(coalesce(_raw_code, 'free'));
  _code := replace(_code, '-', '_');

  case _code
    when 'free' then
      _limits := jsonb_build_object(
        'plan_code', 'free',
        'venue_limit', 5,
        'active_event_limit', 1,
        'passport_limit', 250
      );
    when 'starter' then
      _limits := jsonb_build_object(
        'plan_code', 'starter',
        'venue_limit', 10,
        'active_event_limit', 1,
        'passport_limit', 1000
      );
    when 'growth' then
      _limits := jsonb_build_object(
        'plan_code', 'growth',
        'venue_limit', 25,
        'active_event_limit', 3,
        'passport_limit', 3000
      );
    when 'regional' then
      _limits := jsonb_build_object(
        'plan_code', 'regional',
        'venue_limit', 50,
        'active_event_limit', 5,
        'passport_limit', 7500
      );
    when 'pro_region' then
      _limits := jsonb_build_object(
        'plan_code', 'pro_region',
        'venue_limit', 100,
        'active_event_limit', 10,
        'passport_limit', 15000
      );
    when 'enterprise' then
      _limits := jsonb_build_object(
        'plan_code', 'enterprise',
        'venue_limit', null,
        'active_event_limit', null,
        'passport_limit', null
      );
    else
      _limits := jsonb_build_object(
        'plan_code', 'free',
        'venue_limit', 5,
        'active_event_limit', 1,
        'passport_limit', 250
      );
  end case;

  return _limits;
end;
$$;

-- ---------------------------------------------------------------------------
-- enforce_agency_venue_limit() trigger function for public.venues
-- Blocks insert/update that would push active venue count over the plan limit.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_agency_venue_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _limits jsonb;
  _venue_limit int;
  _plan_code text;
  _plan_name text;
  _active_count int;
begin
  -- Only enforce when the row is active (not archived/deleted).
  if NEW.deleted_at is not null then
    return NEW;
  end if;

  _limits := public.get_agency_plan_limits(NEW.agency_id);
  _plan_code := coalesce(_limits ->> 'plan_code', 'free');

  -- Null venue_limit = unlimited (Enterprise).
  if (_limits ->> 'venue_limit') is null then
    return NEW;
  end if;

  _venue_limit := (_limits ->> 'venue_limit')::int;

  -- Count currently-active venues for this organisation, excluding the row
  -- being updated so editing an existing active venue is not blocked.
  select count(*)
    into _active_count
  from public.venues v
  where v.agency_id = NEW.agency_id
    and v.deleted_at is null
    and (TG_OP = 'INSERT' or v.id <> NEW.id);

  if _active_count >= _venue_limit then
    _plan_name := initcap(replace(_plan_code, '_', ' '));
    raise exception
      'Your % plan includes up to % venues. Upgrade your GetStampd plan to add more venues.',
      _plan_name, _venue_limit
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger (idempotent: drop then recreate)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_enforce_agency_venue_limit on public.venues;

create trigger trg_enforce_agency_venue_limit
before insert or update on public.venues
for each row
execute function public.enforce_agency_venue_limit();
