-- Live-path audit fix: one effective-plan resolver everywhere + subdomain
-- activation that works for every plan (incl. Enterprise manual override).
--
-- Root cause of "System Admin shows Enterprise but Dashboard shows Free":
-- the System Admin badge falls back to the raw agencies.manual_plan_override
-- column, while every other page trusts get_agency_plan_limits(). If the
-- live get_agency_plan_limits() predates manual-override support it returns
-- 'free' and every normal admin page correctly renders Free. This bundle
-- re-applies the override-aware resolver plus all dependants in one go.
--
-- Contents (in dependency order):
--   1. agencies manual override columns + constraint (no-op if present)
--   2. get_agency_plan_limits(uuid)        — manual_plan_override > subscription > free
--   3. agency_effective_plan_code(uuid)    — thin wrapper, single source of truth
--   4. event_is_publishable(uuid)          — free OR manual_override bypasses
--                                            event_activations billing gate
--   5. claim_event_subdomain(uuid, text)   — v2: activates for ANY plan once
--                                            the event is published; richer
--                                            debug payload for the UI
--
-- Idempotent. Safe to re-run.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Manual override columns
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. get_agency_plan_limits — THE effective plan resolver
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
  _sub_code   text;
  _raw_code   text;
  _source     text;
  _code       text;
  _limits     jsonb;
begin
  select a.manual_plan_override into _override
    from public.agencies a
    where a.id = _agency_id;

  select s.plan_code
    into _sub_code
  from public.agency_subscriptions s
  where s.agency_id = _agency_id
    and s.status in ('active', 'trialing', 'comp')
  order by s.updated_at desc
  limit 1;

  if _override is not null and _override <> '' then
    _raw_code := _override;
    _source := 'manual_override';
  elsif _sub_code is not null then
    _raw_code := _sub_code;
    _source := 'subscription';
  else
    _raw_code := 'free';
    _source := 'default';
  end if;

  _code := replace(lower(coalesce(_raw_code, 'free')), '-', '_');

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

  -- Debug fields so the UI can show exactly where the plan came from.
  return _limits || jsonb_build_object(
    'plan_source', _source,
    'manual_plan_override', _override,
    'subscription_plan_code', _sub_code,
    'resolved_at', now()
  );
end;
$$;

grant execute on function public.get_agency_plan_limits(uuid) to authenticated;
grant execute on function public.get_agency_plan_limits(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. agency_effective_plan_code — canonical wrapper
-- ---------------------------------------------------------------------------
create or replace function public.agency_effective_plan_code(_agency_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.get_agency_plan_limits(_agency_id) ->> 'plan_code'),
    'free'
  );
$$;

grant execute on function public.agency_effective_plan_code(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. event_is_publishable — manual override is treated as comp/paid-in-full,
--    so it must NOT be blocked by the event_activations billing gate.
-- ---------------------------------------------------------------------------
create or replace function public.event_is_publishable(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = _event_id
      and e.deleted_at is null
      and e.status = 'published'
      and exists (
        select 1 from public.event_domains d
        where d.event_id = e.id
          and d.is_primary = true
          and d.status = 'active'
      )
      and (
        public.agency_effective_plan_code(e.agency_id) = 'free'
        or (public.get_agency_plan_limits(e.agency_id) ->> 'plan_source') = 'manual_override'
        or exists (
          select 1 from public.event_activations a
          where a.event_id = e.id
            and a.status in ('active','comp')
        )
      )
  )
$$;

grant execute on function public.event_is_publishable(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. claim_event_subdomain v2
--    Rule: a claimed subdomain activates as soon as the event is published
--    (i.e. the public event is turned on), for EVERY plan. Billing no longer
--    holds the subdomain row hostage — public visibility for paid
--    non-override plans is still gated by event_is_publishable.
--    Call with _subdomain = null to re-process/activate the existing row.
-- ---------------------------------------------------------------------------
create or replace function public.claim_event_subdomain(
  _event_id uuid,
  _subdomain text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_limits jsonb;
  v_plan text;
  v_source text;
  v_label citext;
  v_row public.event_domains%rowtype;
  v_valid record;
  v_activate boolean;
  v_before text;
  v_result text := 'none';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated',
      'message', 'You must be signed in.');
  end if;

  select * into v_event
    from public.events e
   where e.id = _event_id
     and e.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found',
      'message', 'Event not found.');
  end if;

  if not (
    public.has_role(v_uid, 'platform_admin'::app_role)
    or exists (
      select 1 from public.agency_members am
       where am.user_id = v_uid
         and am.agency_id = v_event.agency_id
         and am.accepted_at is not null
         and am.role in ('agency_owner','agency_admin')
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized',
      'message', 'You do not have permission to manage this event''s public address.');
  end if;

  v_limits := public.get_agency_plan_limits(v_event.agency_id);
  v_plan := replace(lower(coalesce(v_limits ->> 'plan_code', 'free')), '-', '_');
  v_source := coalesce(v_limits ->> 'plan_source', 'default');

  -- Activation rule: published event => subdomain activates, on every plan.
  v_activate := (v_event.status = 'published');

  select * into v_row
    from public.event_domains d
   where d.event_id = _event_id
     and d.domain_type = 'event_subdomain'
   order by d.updated_at desc nulls last, d.created_at desc
   limit 1;

  v_before := v_row.status;

  if _subdomain is null or btrim(_subdomain) = '' then
    if v_row.id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_subdomain',
        'message', 'No subdomain reserved for this event yet.',
        'plan_code', v_plan, 'plan_source', v_source, 'event_status', v_event.status);
    end if;
    v_label := v_row.public_subdomain;
  else
    v_label := lower(btrim(_subdomain));
    if v_row.id is not null and v_row.public_subdomain is distinct from v_label then
      return jsonb_build_object('ok', false, 'reason', 'already_claimed',
        'message', 'This event already has a public address. Use Change address instead.',
        'plan_code', v_plan, 'plan_source', v_source, 'event_status', v_event.status,
        'domain_status', v_row.status, 'domain_status_before', v_before);
    end if;
    if v_row.id is null then
      select * into v_valid from public.validate_public_subdomain(v_label::text);
      if not coalesce(v_valid.ok, false) then
        return jsonb_build_object('ok', false, 'reason', coalesce(v_valid.reason, 'invalid'),
          'message', case coalesce(v_valid.reason, 'invalid')
            when 'length'   then 'Must be 3–63 characters.'
            when 'format'   then 'Invalid format.'
            when 'reserved' then 'That label is reserved by GetStampd.'
            when 'taken'    then 'That subdomain is already taken.'
            else 'That subdomain is not available.' end,
          'plan_code', v_plan, 'plan_source', v_source, 'event_status', v_event.status);
      end if;
    end if;
  end if;

  if v_row.id is null then
    insert into public.event_domains
      (agency_id, event_id, public_subdomain, domain_type, status, is_primary, verified_at)
    values
      (v_event.agency_id, _event_id, v_label, 'event_subdomain',
       case when v_activate then 'active' else 'pending' end, true,
       case when v_activate then now() else null end)
    returning * into v_row;
    v_result := case when v_activate then 'activated' else 'reserved' end;
  else
    if v_activate and v_row.status = 'pending' then
      update public.event_domains
         set status = 'active',
             is_primary = true,
             verified_at = coalesce(verified_at, now()),
             updated_at = now()
       where id = v_row.id
       returning * into v_row;
      v_result := 'activated';
    elsif v_row.status = 'active' then
      update public.event_domains
         set is_primary = true, updated_at = now()
       where id = v_row.id and is_primary = false;
      v_row.is_primary := true;
      v_result := 'already_active';
    else
      v_result := 'still_reserved';
    end if;
  end if;

  update public.event_domains
     set is_primary = false, updated_at = now()
   where event_id = _event_id
     and id <> v_row.id
     and is_primary = true;

  return jsonb_build_object(
    'ok', true,
    'status', case when v_row.status = 'active' then 'activated_live' else 'reserved_publish_to_go_live' end,
    'message', case
      when v_row.status = 'active' then 'Public address active — your public site is live at this address.'
      else 'Public address reserved. Turn on the public event to activate the subdomain and make the public site live.' end,
    'plan_code', v_plan,
    'plan_source', v_source,
    'manual_plan_override', v_limits ->> 'manual_plan_override',
    'subscription_plan_code', v_limits ->> 'subscription_plan_code',
    'event_status', v_event.status,
    'domain_status_before', v_before,
    'domain_status_after', v_row.status,
    'domain_status', v_row.status,
    'is_primary', v_row.is_primary,
    'verified_at', v_row.verified_at,
    'subdomain', v_row.public_subdomain,
    'activation_attempted', v_activate,
    'activation_result', v_result
  );
end;
$$;

revoke all on function public.claim_event_subdomain(uuid, text) from public, anon;
grant execute on function public.claim_event_subdomain(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verify (replace the ids):
-- select public.get_agency_plan_limits('<orange-hop-on-hop-off-agency-id>');
--   -> plan_code='enterprise', plan_source='manual_override', venue_limit=null
-- select public.claim_event_subdomain('<test72-event-id>', null);
--   -> domain_status_after='active' when the event is published
