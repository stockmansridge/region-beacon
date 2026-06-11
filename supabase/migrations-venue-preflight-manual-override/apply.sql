-- Re-apply manual-plan-override-aware get_agency_plan_limits.
-- Idempotent. Safe to re-run. Only touches the resolver function and the
-- agencies override columns; does not alter any other table/policy/grant.

set search_path = public;

-- 1. Ensure override columns exist (no-op if migration-system-admin-plan-override
--    has already been applied).
alter table public.agencies
  add column if not exists manual_plan_override text;
alter table public.agencies
  add column if not exists manual_plan_override_at timestamptz;
alter table public.agencies
  add column if not exists manual_plan_override_by uuid;

alter table public.agencies
  drop constraint if exists agencies_manual_plan_override_check;
alter table public.agencies
  add constraint agencies_manual_plan_override_check
  check (
    manual_plan_override is null
    or manual_plan_override in ('free','starter','growth','regional','pro_region','enterprise')
  );

-- 2. Effective plan resolver — manual override beats subscription beats free.
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
  select a.manual_plan_override into _override
    from public.agencies a
    where a.id = _agency_id;

  if _override is not null and _override <> '' then
    _raw_code := _override;
    _source := 'manual_override';
  else
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

grant execute on function public.get_agency_plan_limits(uuid) to authenticated;
grant execute on function public.get_agency_plan_limits(uuid) to service_role;
