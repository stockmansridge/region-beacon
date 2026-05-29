-- =====================================================================
-- STAGING BILLING BOOTSTRAP — region-beacon-staging ONLY.
-- Idempotent. Safe to rerun. Read the notes at the bottom before running.
-- DO NOT RUN AGAINST PRODUCTION.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Resolve target agency. Aborts the transaction if not found.
-- ---------------------------------------------------------------------
do $$
declare
  v_agency_id uuid;
  v_event_count int;
begin
  select id into v_agency_id
  from public.agencies
  where slug = 'ready-marketing'
  limit 1;

  if v_agency_id is null then
    raise exception 'Ready Marketing agency (slug=ready-marketing) not found on this database. Aborting bootstrap.';
  end if;

  -- -------------------------------------------------------------------
  -- 1. agency_billing_accounts — one per agency. UNIQUE(agency_id).
  -- -------------------------------------------------------------------
  insert into public.agency_billing_accounts (
    agency_id, billing_email, billing_name, country, stripe_customer_id
  ) values (
    v_agency_id,
    'jonathan@stockmansridge.com.au',
    'Ready Marketing',
    'AU',
    null
  )
  on conflict (agency_id) do nothing;

  -- -------------------------------------------------------------------
  -- 2. agency_subscriptions — insert ONLY if no non-terminal row exists.
  --    Non-terminal set matches the uq_agency_subscriptions_live partial
  --    unique index: trialing, active, past_due, incomplete, paused.
  --    We deliberately insert status='none' so we don't claim a trial
  --    we can't enforce. The partial unique index does NOT cover 'none',
  --    so we guard manually to keep the row count to 1 across reruns.
  -- -------------------------------------------------------------------
  if not exists (
    select 1 from public.agency_subscriptions
    where agency_id = v_agency_id
      and status in ('none','trialing','active','past_due','incomplete','paused')
  ) then
    insert into public.agency_subscriptions (
      agency_id, plan_code, status,
      stripe_subscription_id, trial_ends_at
    ) values (
      v_agency_id, 'starter', 'none',
      null, null
    );
  end if;

  -- -------------------------------------------------------------------
  -- 3. event_activations — one per event for Ready Marketing.
  --    UNIQUE(event_id) gives us a natural conflict target.
  --    All rows start unpaid / one_time so events stay non-publishable.
  -- -------------------------------------------------------------------
  insert into public.event_activations (
    agency_id, event_id, status, activation_kind,
    stripe_checkout_session_id, stripe_payment_intent_id,
    activated_at, expires_at
  )
  select
    e.agency_id, e.id, 'unpaid', 'one_time',
    null, null, null, null
  from public.events e
  where e.agency_id = v_agency_id
    and e.deleted_at is null
  on conflict (event_id) do nothing;

  -- -------------------------------------------------------------------
  -- 4. Audit log — record the bootstrap run.
  --    stripe_event_id is null so the unique constraint allows multiple
  --    audit rows across reruns (Postgres treats NULLs as distinct).
  -- -------------------------------------------------------------------
  select count(*) into v_event_count
  from public.events
  where agency_id = v_agency_id
    and deleted_at is null;

  insert into public.billing_events (
    agency_id, event_id, source, event_type,
    stripe_event_id, payload, actor_user_id
  ) values (
    v_agency_id, null, 'system', 'staging.bootstrap.billing',
    null,
    jsonb_build_object(
      'agency_slug',         'ready-marketing',
      'agency_id',           v_agency_id,
      'event_count',         v_event_count,
      'subscription_status', 'none',
      'plan_code',           'starter',
      'activation_status',   'unpaid',
      'activation_kind',     'one_time',
      'note',                'Initial staging billing bootstrap. No Stripe IDs. No events activated.',
      'run_at',              now()
    ),
    null
  );
end $$;

-- =====================================================================
-- VERIFICATION (read-only). All four checks should look right before COMMIT.
-- =====================================================================

-- V1. Billing account exists (expect 1 row).
select id, agency_id, billing_email, billing_name, country, stripe_customer_id
from public.agency_billing_accounts a
where a.agency_id = (select id from public.agencies where slug='ready-marketing');

-- V2. Subscription row exists (expect exactly 1 row, status='none').
select id, agency_id, plan_code, status, stripe_subscription_id, trial_ends_at
from public.agency_subscriptions
where agency_id = (select id from public.agencies where slug='ready-marketing')
order by created_at;

-- V3. Activation rows exist — one per non-deleted event, all 'unpaid'/'one_time'.
with ready as (
  select id from public.agencies where slug='ready-marketing'
)
select
  e.id                                                          as event_id,
  e.name,
  e.status                                                      as event_status,
  a.status                                                      as activation_status,
  a.activation_kind,
  (a.id is not null)                                            as has_activation
from public.events e
left join public.event_activations a on a.event_id = e.id
where e.agency_id = (select id from ready)
  and e.deleted_at is null
order by e.created_at;

-- Coverage gate: should return ZERO rows (every event has an activation).
with ready as (
  select id from public.agencies where slug='ready-marketing'
)
select e.id, e.name
from public.events e
left join public.event_activations a on a.event_id = e.id
where e.agency_id = (select id from ready)
  and e.deleted_at is null
  and a.id is null;

-- V4. event_is_publishable must return false for every Ready Marketing
--     event. Bootstrap leaves all activations 'unpaid', so none should
--     evaluate true regardless of their events.status or domain state.
with ready as (
  select id from public.agencies where slug='ready-marketing'
)
select
  e.id,
  e.status                                          as event_status,
  public.event_is_publishable(e.id)                 as publishable
from public.events e
where e.agency_id = (select id from ready)
  and e.deleted_at is null
order by e.created_at;
-- Expect every publishable=false. If ANY row returns true, do NOT commit.

-- =====================================================================
-- Inspect the verification results above. If everything looks correct:
--   COMMIT;
-- Otherwise:
--   ROLLBACK;
-- =====================================================================
-- COMMIT;
-- ROLLBACK;
