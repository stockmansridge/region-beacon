-- Free-plan GetStampd subdomain activation
--
-- Removes the per-event billing-activation requirement for organisations
-- on the Free plan, so that a free organisation can:
--   * reserve a {label}.getstampd.com.au subdomain (pending while draft)
--   * publish the event, which automatically flips the reserved subdomain
--     to status='active', is_primary=true
--   * have the public passport / venue QR resolve via resolve_event_by_host
--
-- Paid/comped plans continue to require an event_activations row.
-- Reserved labels and already-claimed labels remain blocked by the
-- existing event_domains constraints, indexes, and validate_public_subdomain
-- RPC — this migration does not relax any of those checks.
--
-- Idempotent. Safe to re-run.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Effective plan code helper
--
-- Thin wrapper over get_agency_plan_limits so other DB code has a single
-- canonical source for the normalised plan code (matches the TS
-- normalizePlanCode in src/lib/getstampd-pricing.ts:
--   free | starter | growth | regional | pro_region | enterprise).
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
-- 2. event_is_publishable — bypass activation row when plan = 'free'
--
-- Paid plans: unchanged — must have an event_activations row with
-- status in ('active','comp').
-- Free plan : skips the activation requirement. The event still must be
-- status='published', not soft-deleted, and have a primary active
-- event_domains row.
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
        or exists (
          select 1 from public.event_activations a
          where a.event_id = e.id
            and a.status in ('active','comp')
        )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger: when a Free-plan event is published, auto-activate the
--    reserved event_subdomain row and mark it primary.
--
-- Fires on UPDATE of events.status to 'published'. Only acts when the
-- agency is on the 'free' plan. For paid plans the existing billing
-- activation flow remains the source of truth.
--
-- - Picks the most-recently-updated pending event_subdomain row.
-- - Clears is_primary on any other event_domains for the same event
--   (defensive — there should be at most one primary anyway).
-- - Sets status='active', is_primary=true, verified_at=now().
-- - Idempotent: if the event already has an active primary subdomain,
--   nothing changes.
-- ---------------------------------------------------------------------------
create or replace function public.tg_events_activate_free_subdomain_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_dom_id uuid;
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;  -- already published, no-op
  end if;

  v_plan := public.agency_effective_plan_code(new.agency_id);
  if v_plan <> 'free' then
    return new;
  end if;

  -- Already has an active primary subdomain? Nothing to do.
  if exists (
    select 1 from public.event_domains
    where event_id = new.id
      and domain_type = 'event_subdomain'
      and status = 'active'
      and is_primary = true
  ) then
    return new;
  end if;

  -- Find the most recent pending event_subdomain reservation for this event.
  select id into v_dom_id
  from public.event_domains
  where event_id = new.id
    and domain_type = 'event_subdomain'
    and status = 'pending'
    and public_subdomain is not null
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_dom_id is null then
    return new;
  end if;

  -- Defensive: clear any stale is_primary on the same event.
  update public.event_domains
     set is_primary = false
   where event_id = new.id
     and id <> v_dom_id
     and is_primary = true;

  update public.event_domains
     set status = 'active',
         is_primary = true,
         verified_at = coalesce(verified_at, now()),
         updated_at = now()
   where id = v_dom_id;

  return new;
end;
$$;

drop trigger if exists trg_events_activate_free_subdomain_on_publish on public.events;
create trigger trg_events_activate_free_subdomain_on_publish
  after insert or update of status on public.events
  for each row
  execute function public.tg_events_activate_free_subdomain_on_publish();

-- ---------------------------------------------------------------------------
-- 4. Backfill
--
-- For organisations on the Free plan with a published event whose reserved
-- GetStampd subdomain is still pending, flip the most recent pending
-- subdomain to active + primary. This unblocks existing free users who
-- published before this migration shipped.
--
-- Conservative:
--   * Only touches free + published + non-soft-deleted events.
--   * Only touches event_subdomain rows that are currently pending.
--   * Skips events that already have an active primary subdomain.
--   * Does not insert anything; only flips an existing reservation.
-- ---------------------------------------------------------------------------
with candidates as (
  select distinct on (e.id)
    e.id          as event_id,
    d.id          as domain_id
  from public.events e
  join public.event_domains d on d.event_id = e.id
  where e.deleted_at is null
    and e.status = 'published'
    and public.agency_effective_plan_code(e.agency_id) = 'free'
    and d.domain_type = 'event_subdomain'
    and d.status = 'pending'
    and d.public_subdomain is not null
    and not exists (
      select 1 from public.event_domains d2
      where d2.event_id = e.id
        and d2.domain_type = 'event_subdomain'
        and d2.status = 'active'
        and d2.is_primary = true
    )
  order by e.id, d.updated_at desc nulls last, d.created_at desc
),
clear_primary as (
  update public.event_domains x
     set is_primary = false
    from candidates c
   where x.event_id = c.event_id
     and x.id <> c.domain_id
     and x.is_primary = true
)
update public.event_domains x
   set status = 'active',
       is_primary = true,
       verified_at = coalesce(x.verified_at, now()),
       updated_at = now()
  from candidates c
 where x.id = c.domain_id;
