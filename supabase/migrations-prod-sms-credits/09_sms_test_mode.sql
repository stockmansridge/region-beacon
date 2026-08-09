-- 09_sms_test_mode.sql
-- GetStampd SMS Messaging — Platform-Admin-only Stripe Sandbox test mode.
--
-- What this does:
--   * adds payment_environment ('live' | 'test') to every SMS billing record
--   * splits sms_credit_accounts so each org has an independent LIVE and TEST
--     balance (unique on (agency_id, payment_environment))
--   * scopes Stripe idempotency separately per environment
--   * adds sms_provider_settings.sms_payment_mode (default 'live')
--   * updates the credit RPCs to be environment aware (default 'live', so any
--     existing caller keeps live behaviour)
--   * adds system_admin_sms_set_payment_mode() and
--     system_admin_sms_reset_test_data() — platform admins only
--
-- A Sandbox purchase can never increase a live balance, and resetting test
-- data can never touch live rows.
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

do $$
begin
  if to_regclass('public.sms_credit_accounts') is null then
    raise exception '09_sms_test_mode.sql: apply 01_sms_credit_core.sql first';
  end if;
end;
$$;

-- 1. payment_environment columns ------------------------------------------
alter table public.sms_credit_accounts
  add column if not exists payment_environment text not null default 'live';
alter table public.sms_credit_transactions
  add column if not exists payment_environment text not null default 'live';
alter table public.sms_stripe_events
  add column if not exists payment_environment text not null default 'live';
alter table public.sms_campaigns
  add column if not exists payment_environment text not null default 'live';

do $$
begin
  begin
    alter table public.sms_credit_accounts
      add constraint sms_credit_accounts_env_check
      check (payment_environment in ('live', 'test'));
  exception when duplicate_object then null; end;
  begin
    alter table public.sms_credit_transactions
      add constraint sms_credit_transactions_env_check
      check (payment_environment in ('live', 'test'));
  exception when duplicate_object then null; end;
  begin
    alter table public.sms_stripe_events
      add constraint sms_stripe_events_env_check
      check (payment_environment in ('live', 'test'));
  exception when duplicate_object then null; end;
  begin
    alter table public.sms_campaigns
      add constraint sms_campaigns_env_check
      check (payment_environment in ('live', 'test'));
  exception when duplicate_object then null; end;
end;
$$;

-- 2. One account row per (org, environment) -------------------------------
alter table public.sms_credit_accounts
  drop constraint if exists sms_credit_accounts_agency_unique;
create unique index if not exists uq_sms_credit_accounts_agency_env
  on public.sms_credit_accounts (agency_id, payment_environment);

-- 3. Environment-scoped Stripe idempotency --------------------------------
drop index if exists public.uq_sms_credit_tx_checkout_session;
drop index if exists public.uq_sms_credit_tx_payment_intent;
create unique index if not exists uq_sms_credit_tx_checkout_session_env
  on public.sms_credit_transactions (payment_environment, stripe_checkout_session_id)
  where transaction_type = 'purchase' and stripe_checkout_session_id is not null;
create unique index if not exists uq_sms_credit_tx_payment_intent_env
  on public.sms_credit_transactions (payment_environment, stripe_payment_intent_id)
  where transaction_type = 'purchase' and stripe_payment_intent_id is not null;

-- Stripe event ids are globally unique per environment; scope the guard so a
-- test event can never collide with a live one.
alter table public.sms_stripe_events
  drop constraint if exists sms_stripe_events_stripe_event_id_key;
create unique index if not exists uq_sms_stripe_events_env_event
  on public.sms_stripe_events (payment_environment, stripe_event_id);

create index if not exists idx_sms_credit_tx_env
  on public.sms_credit_transactions (agency_id, payment_environment, created_at desc);

-- 4. Platform-admin SMS payment mode --------------------------------------
alter table public.sms_provider_settings
  add column if not exists sms_payment_mode text not null default 'live';

do $$
begin
  begin
    alter table public.sms_provider_settings
      add constraint sms_provider_settings_payment_mode_check
      check (sms_payment_mode in ('live', 'test'));
  exception when duplicate_object then null; end;
end;
$$;

-- 5. Environment-aware balance lock ---------------------------------------
drop function if exists public.sms_lock_credit_balance(uuid);

create or replace function public.sms_lock_credit_balance(
  _agency_id uuid,
  _payment_environment text default 'live'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  env text := coalesce(_payment_environment, 'live');
  bal bigint;
begin
  if env not in ('live', 'test') then
    raise exception 'sms_lock_credit_balance: invalid payment environment %', env;
  end if;

  insert into public.sms_credit_accounts (agency_id, payment_environment)
  values (_agency_id, env)
  on conflict (agency_id, payment_environment) do nothing;

  select balance_credits into bal
    from public.sms_credit_accounts
   where agency_id = _agency_id and payment_environment = env
     for update;

  return coalesce(bal, 0);
end;
$$;

revoke all on function public.sms_lock_credit_balance(uuid, text) from public;

-- 6. Purchase (Stripe webhook only, environment aware) --------------------
drop function if exists public.sms_credit_purchase_apply(uuid, bigint, integer, text, text, text, uuid, text);

create or replace function public.sms_credit_purchase_apply(
  _agency_id uuid,
  _credits bigint,
  _amount_paid_cents integer,
  _currency text,
  _stripe_checkout_session_id text,
  _stripe_payment_intent_id text,
  _pack_id uuid,
  _description text,
  _payment_environment text default 'live'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  env text := coalesce(_payment_environment, 'live');
  cur_balance bigint;
  new_balance bigint;
  tx_id uuid;
begin
  if env not in ('live', 'test') then
    raise exception 'sms_credit_purchase_apply: invalid payment environment %', env;
  end if;
  if _credits is null or _credits <= 0 then
    raise exception 'sms_credit_purchase_apply: credits must be positive';
  end if;
  if _stripe_checkout_session_id is null and _stripe_payment_intent_id is null then
    raise exception 'sms_credit_purchase_apply: a Stripe reference is required';
  end if;

  -- Idempotency, scoped to the environment.
  if exists (
    select 1 from public.sms_credit_transactions
     where transaction_type = 'purchase'
       and payment_environment = env
       and (
         (_stripe_checkout_session_id is not null
           and stripe_checkout_session_id = _stripe_checkout_session_id)
         or (_stripe_payment_intent_id is not null
           and stripe_payment_intent_id = _stripe_payment_intent_id)
       )
  ) then
    select balance_credits into new_balance
      from public.sms_credit_accounts
     where agency_id = _agency_id and payment_environment = env;
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'payment_environment', env,
      'balance_credits', coalesce(new_balance, 0)
    );
  end if;

  cur_balance := public.sms_lock_credit_balance(_agency_id, env);
  new_balance := cur_balance + _credits;

  update public.sms_credit_accounts
     set balance_credits = new_balance,
         lifetime_purchased_credits = lifetime_purchased_credits + _credits
   where agency_id = _agency_id and payment_environment = env;

  insert into public.sms_credit_transactions (
    agency_id, transaction_type, credits, balance_after,
    amount_paid_cents, currency,
    stripe_checkout_session_id, stripe_payment_intent_id,
    description, metadata, payment_environment
  ) values (
    _agency_id, 'purchase', _credits, new_balance,
    _amount_paid_cents, coalesce(_currency, 'AUD'),
    _stripe_checkout_session_id, _stripe_payment_intent_id,
    coalesce(_description, 'SMS credit purchase'),
    jsonb_build_object('sms_credit_pack_id', _pack_id, 'payment_environment', env),
    env
  )
  returning id into tx_id;

  return jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'transaction_id', tx_id,
    'credits_added', _credits,
    'payment_environment', env,
    'balance_credits', new_balance
  );
exception when unique_violation then
  select balance_credits into new_balance
    from public.sms_credit_accounts
   where agency_id = _agency_id and payment_environment = env;
  return jsonb_build_object(
    'ok', true,
    'already_processed', true,
    'payment_environment', env,
    'balance_credits', coalesce(new_balance, 0)
  );
end;
$$;

revoke all on function public.sms_credit_purchase_apply(uuid, bigint, integer, text, text, text, uuid, text, text) from public;
grant execute on function public.sms_credit_purchase_apply(uuid, bigint, integer, text, text, text, uuid, text, text) to service_role;

-- 7. Campaign reserve / recredit / adjustment: environment aware ----------
drop function if exists public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid);

create or replace function public.sms_campaign_reserve_and_queue(
  _agency_id uuid,
  _event_id uuid,
  _message text,
  _encoding text,
  _segments_per_recipient integer,
  _audience_kind text,
  _audience_params jsonb default '{}'::jsonb,
  _name text default null,
  _campaign_id uuid default null,
  _payment_environment text default 'live'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  env text := coalesce(_payment_environment, 'live');
  cur_balance bigint;
  uid uuid := auth.uid();
  recipient_count integer := 0;
  credits_needed bigint := 0;
  new_balance bigint;
  campaign_id uuid;
begin
  if uid is null then
    raise exception 'forbidden: authentication required' using errcode = '42501';
  end if;
  if not (
    public.is_platform_admin(uid)
    or public.is_agency_admin(uid, _agency_id)
    or public.is_agency_member(uid, _agency_id)
  ) then
    raise exception 'forbidden: not a member of this organisation' using errcode = '42501';
  end if;

  if env not in ('live', 'test') then
    raise exception 'sms_campaign_reserve_and_queue: invalid payment environment %', env;
  end if;
  -- Only platform admins may run against the test environment.
  if env = 'test' and not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required for test campaigns' using errcode = '42501';
  end if;

  if _segments_per_recipient is null or _segments_per_recipient < 1 then
    raise exception 'sms_campaign_reserve_and_queue: invalid segment count';
  end if;
  if _message is null or char_length(btrim(_message)) = 0 then
    raise exception 'sms_campaign_reserve_and_queue: message is required';
  end if;

  create temporary table if not exists _sms_reserve_recipients (
    visitor_id uuid, passport_id uuid, phone_e164 text
  ) on commit drop;
  delete from _sms_reserve_recipients;

  insert into _sms_reserve_recipients (visitor_id, passport_id, phone_e164)
  select r.visitor_id, r.passport_id, r.phone_e164
    from public.sms_resolve_audience(_agency_id, _event_id, _audience_kind, _audience_params) r;

  select count(*)::int into recipient_count from _sms_reserve_recipients;

  if recipient_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_recipients');
  end if;

  credits_needed := recipient_count::bigint * _segments_per_recipient::bigint;

  cur_balance := public.sms_lock_credit_balance(_agency_id, env);

  if cur_balance < credits_needed then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'payment_environment', env,
      'credits_required', credits_needed,
      'balance_credits', cur_balance,
      'shortfall', credits_needed - cur_balance,
      'recipients', recipient_count
    );
  end if;

  new_balance := cur_balance - credits_needed;

  if _campaign_id is not null then
    update public.sms_campaigns
       set name = _name,
           message = _message,
           encoding = coalesce(_encoding, 'GSM-7'),
           sms_segments_per_recipient = _segments_per_recipient,
           intended_recipient_count = recipient_count,
           credits_required = credits_needed,
           audience_kind = _audience_kind,
           audience_params = coalesce(_audience_params, '{}'::jsonb),
           status = 'queued',
           sent_by = uid,
           sent_at = now(),
           payment_environment = env,
           error_message = null
     where id = _campaign_id
       and agency_id = _agency_id
       and status = 'draft'
    returning id into campaign_id;

    if campaign_id is null then
      raise exception 'sms_campaign_reserve_and_queue: draft campaign not found or not editable';
    end if;
  else
    insert into public.sms_campaigns (
      agency_id, event_id, created_by, sent_by, name, message, encoding,
      sms_segments_per_recipient, intended_recipient_count, credits_required,
      audience_kind, audience_params, status, sent_at, payment_environment
    ) values (
      _agency_id, _event_id, uid, uid, _name, _message, coalesce(_encoding, 'GSM-7'),
      _segments_per_recipient, recipient_count, credits_needed,
      _audience_kind, coalesce(_audience_params, '{}'::jsonb), 'queued', now(), env
    )
    returning id into campaign_id;
  end if;

  insert into public.sms_campaign_recipients (
    campaign_id, agency_id, event_id, visitor_id, passport_id, phone_e164, credits_used
  )
  select campaign_id, _agency_id, _event_id, r.visitor_id, r.passport_id, r.phone_e164,
         _segments_per_recipient
    from _sms_reserve_recipients r
  on conflict (campaign_id, phone_e164) do nothing;

  update public.sms_credit_accounts
     set balance_credits = new_balance,
         lifetime_used_credits = lifetime_used_credits + credits_needed
   where agency_id = _agency_id and payment_environment = env;

  insert into public.sms_credit_transactions (
    agency_id, event_id, transaction_type, credits, balance_after,
    sms_campaign_id, description, created_by, payment_environment
  ) values (
    _agency_id, _event_id, 'send', -credits_needed, new_balance,
    campaign_id,
    case when env = 'test' then 'TEST SMS campaign send' else 'SMS campaign send' end,
    uid, env
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', campaign_id,
    'payment_environment', env,
    'recipients', recipient_count,
    'segments_per_recipient', _segments_per_recipient,
    'credits_required', credits_needed,
    'balance_credits', new_balance
  );
end;
$$;

revoke all on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid, text) from public;
grant execute on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid, text) to authenticated;
grant execute on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid, text) to service_role;

create or replace function public.sms_campaign_recredit(
  _campaign_id uuid,
  _credits bigint,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  camp_agency_id uuid;
  camp_event_id uuid;
  env text;
  cur_balance bigint;
  new_balance bigint;
begin
  if _credits is null or _credits <= 0 then
    return jsonb_build_object('ok', true, 'credits_returned', 0);
  end if;

  select agency_id, event_id, coalesce(payment_environment, 'live')
    into camp_agency_id, camp_event_id, env
    from public.sms_campaigns where id = _campaign_id;
  if camp_agency_id is null then
    raise exception 'sms_campaign_recredit: campaign not found';
  end if;

  cur_balance := public.sms_lock_credit_balance(camp_agency_id, env);
  new_balance := cur_balance + _credits;

  update public.sms_credit_accounts
     set balance_credits = new_balance,
         lifetime_used_credits = greatest(0, lifetime_used_credits - _credits)
   where agency_id = camp_agency_id and payment_environment = env;

  insert into public.sms_credit_transactions (
    agency_id, event_id, transaction_type, credits, balance_after,
    sms_campaign_id, description, payment_environment
  ) values (
    camp_agency_id, camp_event_id, 'failed_send_recredit', _credits, new_balance,
    _campaign_id, coalesce(_reason, 'Unsent SMS segments returned'), env
  );

  return jsonb_build_object('ok', true, 'credits_returned', _credits, 'balance_credits', new_balance);
end;
$$;

revoke all on function public.sms_campaign_recredit(uuid, bigint, text) from public;
grant execute on function public.sms_campaign_recredit(uuid, bigint, text) to service_role;

drop function if exists public.sms_admin_adjust_credits(uuid, bigint, text);

create or replace function public.sms_admin_adjust_credits(
  _agency_id uuid,
  _credits bigint,
  _reason text,
  _payment_environment text default 'live'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  env text := coalesce(_payment_environment, 'live');
  cur_balance bigint;
  new_balance bigint;
begin
  if not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;
  if env not in ('live', 'test') then
    raise exception 'sms_admin_adjust_credits: invalid payment environment %', env;
  end if;
  if _credits is null or _credits = 0 then
    raise exception 'sms_admin_adjust_credits: credits must be non-zero';
  end if;
  if _reason is null or char_length(btrim(_reason)) < 3 then
    raise exception 'sms_admin_adjust_credits: a reason is required';
  end if;

  cur_balance := public.sms_lock_credit_balance(_agency_id, env);
  new_balance := cur_balance + _credits;
  if new_balance < 0 then
    raise exception 'sms_admin_adjust_credits: adjustment would make the balance negative';
  end if;

  update public.sms_credit_accounts
     set balance_credits = new_balance
   where agency_id = _agency_id and payment_environment = env;

  insert into public.sms_credit_transactions (
    agency_id, transaction_type, credits, balance_after, description,
    created_by, metadata, payment_environment
  ) values (
    _agency_id, 'adjustment', _credits, new_balance, _reason, uid,
    jsonb_build_object('admin_user_id', uid, 'adjusted_at', now(), 'payment_environment', env),
    env
  );

  return jsonb_build_object('ok', true, 'payment_environment', env, 'balance_credits', new_balance);
end;
$$;

revoke all on function public.sms_admin_adjust_credits(uuid, bigint, text, text) from public;
grant execute on function public.sms_admin_adjust_credits(uuid, bigint, text, text) to authenticated;

-- 8. Account summary: live + test in one payload ---------------------------
create or replace function public.sms_account_summary(_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  can_buy boolean;
  mode text;
  live_bal bigint; live_pur bigint; live_used bigint;
  test_bal bigint; test_pur bigint; test_used bigint;
  active_env text;
begin
  if uid is null then
    raise exception 'forbidden: authentication required' using errcode = '42501';
  end if;
  if not (
    public.is_platform_admin(uid)
    or public.is_agency_admin(uid, _agency_id)
    or public.is_agency_member(uid, _agency_id)
  ) then
    raise exception 'forbidden: not a member of this organisation' using errcode = '42501';
  end if;

  is_admin := public.is_platform_admin(uid);
  can_buy := is_admin or public.is_agency_admin(uid, _agency_id);

  select coalesce(sms_payment_mode, 'live') into mode
    from public.sms_provider_settings where id = true;
  mode := coalesce(mode, 'live');

  -- Only platform admins can ever be routed to the test environment.
  active_env := case when mode = 'test' and is_admin then 'test' else 'live' end;

  insert into public.sms_credit_accounts (agency_id, payment_environment)
  values (_agency_id, active_env)
  on conflict (agency_id, payment_environment) do nothing;

  select balance_credits, lifetime_purchased_credits, lifetime_used_credits
    into live_bal, live_pur, live_used
    from public.sms_credit_accounts
   where agency_id = _agency_id and payment_environment = 'live';

  select balance_credits, lifetime_purchased_credits, lifetime_used_credits
    into test_bal, test_pur, test_used
    from public.sms_credit_accounts
   where agency_id = _agency_id and payment_environment = 'test';

  return jsonb_build_object(
    'agency_id', _agency_id,
    'active_payment_environment', active_env,
    'sms_payment_mode', case when is_admin then mode else 'live' end,
    'is_platform_admin', is_admin,
    'can_purchase', can_buy,
    -- Legacy top-level fields reflect the ACTIVE environment for this caller.
    'balance_credits', case when active_env = 'test' then coalesce(test_bal, 0) else coalesce(live_bal, 0) end,
    'lifetime_purchased_credits', case when active_env = 'test' then coalesce(test_pur, 0) else coalesce(live_pur, 0) end,
    'lifetime_used_credits', case when active_env = 'test' then coalesce(test_used, 0) else coalesce(live_used, 0) end,
    'live', jsonb_build_object(
      'balance_credits', coalesce(live_bal, 0),
      'lifetime_purchased_credits', coalesce(live_pur, 0),
      'lifetime_used_credits', coalesce(live_used, 0)
    ),
    'test', case when is_admin then jsonb_build_object(
      'balance_credits', coalesce(test_bal, 0),
      'lifetime_purchased_credits', coalesce(test_pur, 0),
      'lifetime_used_credits', coalesce(test_used, 0)
    ) else null end
  );
end;
$$;

revoke all on function public.sms_account_summary(uuid) from public;
grant execute on function public.sms_account_summary(uuid) to authenticated;

-- 9. Platform-admin test-mode controls ------------------------------------
create or replace function public.system_admin_sms_set_payment_mode(_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;
  if _mode not in ('live', 'test') then
    raise exception 'system_admin_sms_set_payment_mode: mode must be live or test';
  end if;

  insert into public.sms_provider_settings (id, sms_payment_mode, updated_by)
  values (true, _mode, uid)
  on conflict (id) do update
    set sms_payment_mode = excluded.sms_payment_mode,
        updated_by = excluded.updated_by;

  return jsonb_build_object('ok', true, 'sms_payment_mode', _mode);
end;
$$;

revoke all on function public.system_admin_sms_set_payment_mode(text) from public;
grant execute on function public.system_admin_sms_set_payment_mode(text) to authenticated;

create or replace function public.system_admin_sms_test_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mode text;
  test_balance bigint;
  test_purchased bigint;
  test_purchases bigint;
  test_tx bigint;
  test_campaigns bigint;
  test_events bigint;
  live_balance bigint;
begin
  if not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;

  select coalesce(sms_payment_mode, 'live') into mode
    from public.sms_provider_settings where id = true;

  select coalesce(sum(balance_credits), 0) into test_balance
    from public.sms_credit_accounts where payment_environment = 'test';
  select coalesce(sum(balance_credits), 0) into live_balance
    from public.sms_credit_accounts where payment_environment = 'live';
  select coalesce(sum(lifetime_purchased_credits), 0) into test_purchased
    from public.sms_credit_accounts where payment_environment = 'test';
  select count(*) into test_purchases
    from public.sms_credit_transactions
   where payment_environment = 'test' and transaction_type = 'purchase';
  select count(*) into test_tx
    from public.sms_credit_transactions where payment_environment = 'test';
  select count(*) into test_campaigns
    from public.sms_campaigns where payment_environment = 'test';
  select count(*) into test_events
    from public.sms_stripe_events where payment_environment = 'test';

  return jsonb_build_object(
    'sms_payment_mode', coalesce(mode, 'live'),
    'test_balance_credits', test_balance,
    'test_lifetime_purchased_credits', test_purchased,
    'test_purchase_count', test_purchases,
    'test_transaction_count', test_tx,
    'test_campaign_count', test_campaigns,
    'test_stripe_event_count', test_events,
    'live_balance_credits', live_balance
  );
end;
$$;

revoke all on function public.system_admin_sms_test_overview() from public;
grant execute on function public.system_admin_sms_test_overview() to authenticated;

-- Reset TEST data only. Every statement is filtered on payment_environment
-- = 'test'; live rows are physically out of scope.
create or replace function public.system_admin_sms_reset_test_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed_tx bigint := 0;
  removed_campaigns bigint := 0;
  removed_events bigint := 0;
  reset_accounts bigint := 0;
begin
  if not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;

  delete from public.sms_campaign_recipients r
   using public.sms_campaigns c
   where r.campaign_id = c.id and c.payment_environment = 'test';

  with d as (
    delete from public.sms_campaigns where payment_environment = 'test' returning 1
  ) select count(*) into removed_campaigns from d;

  with d as (
    delete from public.sms_credit_transactions where payment_environment = 'test' returning 1
  ) select count(*) into removed_tx from d;

  with d as (
    delete from public.sms_stripe_events where payment_environment = 'test' returning 1
  ) select count(*) into removed_events from d;

  with u as (
    update public.sms_credit_accounts
       set balance_credits = 0,
           lifetime_purchased_credits = 0,
           lifetime_used_credits = 0
     where payment_environment = 'test'
    returning 1
  ) select count(*) into reset_accounts from u;

  return jsonb_build_object(
    'ok', true,
    'transactions_removed', removed_tx,
    'campaigns_removed', removed_campaigns,
    'stripe_events_removed', removed_events,
    'accounts_reset', reset_accounts
  );
end;
$$;

revoke all on function public.system_admin_sms_reset_test_data() from public;
grant execute on function public.system_admin_sms_reset_test_data() to authenticated;

commit;
