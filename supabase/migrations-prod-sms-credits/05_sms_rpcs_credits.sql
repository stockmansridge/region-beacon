-- 05_sms_rpcs_credits.sql
-- GetStampd SMS Messaging — the only sanctioned writers of credit state.
--
-- Every function here is SECURITY DEFINER with a pinned search_path, and
-- EXECUTE is granted narrowly:
--   * sms_credit_purchase_apply    service_role only (Stripe webhook)
--   * sms_campaign_reserve_and_queue authenticated (gated to org members)
--   * sms_campaign_recredit        service_role only (sender/provider result)
--   * sms_admin_adjust_credits     platform admins only, ledger-only
--
-- There is deliberately NO function that overwrites balance_credits.
--
-- Idempotent (create or replace). Safe to re-run. Apply in the SQL editor.

begin;

-- Internal: get (or create) the organisation's credit account, locked.
create or replace function public.sms_lock_credit_account(_agency_id uuid)
returns public.sms_credit_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.sms_credit_accounts;
begin
  insert into public.sms_credit_accounts (agency_id)
  values (_agency_id)
  on conflict (agency_id) do nothing;

  select * into acct
    from public.sms_credit_accounts
   where agency_id = _agency_id
     for update;

  return acct;
end;
$$;

revoke all on function public.sms_lock_credit_account(uuid) from public;

-- 1. Purchase (Stripe webhook only) --------------------------------------
create or replace function public.sms_credit_purchase_apply(
  _agency_id uuid,
  _credits bigint,
  _amount_paid_cents integer,
  _currency text,
  _stripe_checkout_session_id text,
  _stripe_payment_intent_id text,
  _pack_id uuid,
  _description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  acct public.sms_credit_accounts;
  new_balance bigint;
  tx_id uuid;
begin
  if _credits is null or _credits <= 0 then
    raise exception 'sms_credit_purchase_apply: credits must be positive';
  end if;
  if _stripe_checkout_session_id is null and _stripe_payment_intent_id is null then
    raise exception 'sms_credit_purchase_apply: a Stripe reference is required';
  end if;

  -- Idempotency: a replayed webhook must not credit twice.
  if exists (
    select 1 from public.sms_credit_transactions
     where transaction_type = 'purchase'
       and (
         (_stripe_checkout_session_id is not null
           and stripe_checkout_session_id = _stripe_checkout_session_id)
         or (_stripe_payment_intent_id is not null
           and stripe_payment_intent_id = _stripe_payment_intent_id)
       )
  ) then
    select balance_credits into new_balance
      from public.sms_credit_accounts where agency_id = _agency_id;
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'balance_credits', coalesce(new_balance, 0)
    );
  end if;

  acct := public.sms_lock_credit_account(_agency_id);
  new_balance := acct.balance_credits + _credits;

  update public.sms_credit_accounts
     set balance_credits = new_balance,
         lifetime_purchased_credits = lifetime_purchased_credits + _credits
   where agency_id = _agency_id;

  insert into public.sms_credit_transactions (
    agency_id, transaction_type, credits, balance_after,
    amount_paid_cents, currency,
    stripe_checkout_session_id, stripe_payment_intent_id,
    description, metadata
  ) values (
    _agency_id, 'purchase', _credits, new_balance,
    _amount_paid_cents, coalesce(_currency, 'AUD'),
    _stripe_checkout_session_id, _stripe_payment_intent_id,
    coalesce(_description, 'SMS credit purchase'),
    jsonb_build_object('sms_credit_pack_id', _pack_id)
  )
  returning id into tx_id;

  return jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'transaction_id', tx_id,
    'credits_added', _credits,
    'balance_credits', new_balance
  );
exception when unique_violation then
  -- Two concurrent deliveries of the same webhook: the loser is a no-op.
  select balance_credits into new_balance
    from public.sms_credit_accounts where agency_id = _agency_id;
  return jsonb_build_object(
    'ok', true,
    'already_processed', true,
    'balance_credits', coalesce(new_balance, 0)
  );
end;
$$;

revoke all on function public.sms_credit_purchase_apply(uuid, bigint, integer, text, text, text, uuid, text) from public;
grant execute on function public.sms_credit_purchase_apply(uuid, bigint, integer, text, text, text, uuid, text) to service_role;

-- 2. Reserve credits and queue a campaign (atomic, double-spend safe) -----
create or replace function public.sms_campaign_reserve_and_queue(
  _agency_id uuid,
  _event_id uuid,
  _message text,
  _encoding text,
  _segments_per_recipient integer,
  _audience_kind text,
  _audience_params jsonb default '{}'::jsonb,
  _name text default null,
  _campaign_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  -- Any accepted organisation member may SEND. Purchasing is gated elsewhere.
  if not (
    public.is_platform_admin(uid)
    or public.is_agency_admin(uid, _agency_id)
    or public.is_agency_member(uid, _agency_id)
  ) then
    raise exception 'forbidden: not a member of this organisation' using errcode = '42501';
  end if;

  if _segments_per_recipient is null or _segments_per_recipient < 1 then
    raise exception 'sms_campaign_reserve_and_queue: invalid segment count';
  end if;
  if _message is null or char_length(btrim(_message)) = 0 then
    raise exception 'sms_campaign_reserve_and_queue: message is required';
  end if;

  -- Resolve the audience server-side. The browser count is never trusted.
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

  cur_balance := public.sms_lock_credit_balance(_agency_id);

  if cur_balance < credits_needed then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
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
      audience_kind, audience_params, status, sent_at
    ) values (
      _agency_id, _event_id, uid, uid, _name, _message, coalesce(_encoding, 'GSM-7'),
      _segments_per_recipient, recipient_count, credits_needed,
      _audience_kind, coalesce(_audience_params, '{}'::jsonb), 'queued', now()
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
   where agency_id = _agency_id;

  insert into public.sms_credit_transactions (
    agency_id, event_id, transaction_type, credits, balance_after,
    sms_campaign_id, description, created_by
  ) values (
    _agency_id, _event_id, 'send', -credits_needed, new_balance,
    campaign_id, 'SMS campaign send', uid
  );

  return jsonb_build_object(
    'ok', true,
    'campaign_id', campaign_id,
    'recipients', recipient_count,
    'segments_per_recipient', _segments_per_recipient,
    'credits_required', credits_needed,
    'balance_credits', new_balance
  );
end;
$$;

revoke all on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid) from public;
grant execute on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid) to authenticated;
grant execute on function public.sms_campaign_reserve_and_queue(uuid, uuid, text, text, integer, text, jsonb, text, uuid) to service_role;

-- 3. Re-credit unsent/rejected segments ----------------------------------
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
  cur_balance bigint;
  new_balance bigint;
begin
  if _credits is null or _credits <= 0 then
    return jsonb_build_object('ok', true, 'credits_returned', 0);
  end if;

  select agency_id, event_id into camp_agency_id, camp_event_id
    from public.sms_campaigns where id = _campaign_id;
  if camp_agency_id is null then
    raise exception 'sms_campaign_recredit: campaign not found';
  end if;

  cur_balance := public.sms_lock_credit_balance(camp_agency_id);
  new_balance := cur_balance + _credits;

  update public.sms_credit_accounts
     set balance_credits = new_balance,
         lifetime_used_credits = greatest(0, lifetime_used_credits - _credits)
   where agency_id = camp_agency_id;

  insert into public.sms_credit_transactions (
    agency_id, event_id, transaction_type, credits, balance_after,
    sms_campaign_id, description
  ) values (
    camp_agency_id, camp_event_id, 'failed_send_recredit', _credits, new_balance,
    _campaign_id, coalesce(_reason, 'Unsent SMS segments returned')
  );

  return jsonb_build_object('ok', true, 'credits_returned', _credits, 'balance_credits', new_balance);
end;
$$;

revoke all on function public.sms_campaign_recredit(uuid, bigint, text) from public;
grant execute on function public.sms_campaign_recredit(uuid, bigint, text) to service_role;

-- 4. Platform-admin ledger adjustment ------------------------------------
create or replace function public.sms_admin_adjust_credits(
  _agency_id uuid,
  _credits bigint,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur_balance bigint;
  new_balance bigint;
begin
  if not public.is_platform_admin(uid) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;
  if _credits is null or _credits = 0 then
    raise exception 'sms_admin_adjust_credits: credits must be non-zero';
  end if;
  if _reason is null or char_length(btrim(_reason)) < 3 then
    raise exception 'sms_admin_adjust_credits: a reason is required';
  end if;

  cur_balance := public.sms_lock_credit_balance(_agency_id);
  new_balance := cur_balance + _credits;
  if new_balance < 0 then
    raise exception 'sms_admin_adjust_credits: adjustment would make the balance negative';
  end if;

  update public.sms_credit_accounts
     set balance_credits = new_balance
   where agency_id = _agency_id;

  insert into public.sms_credit_transactions (
    agency_id, transaction_type, credits, balance_after, description, created_by, metadata
  ) values (
    _agency_id, 'adjustment', _credits, new_balance, _reason, uid,
    jsonb_build_object('admin_user_id', uid, 'adjusted_at', now())
  );

  return jsonb_build_object('ok', true, 'balance_credits', new_balance);
end;
$$;

revoke all on function public.sms_admin_adjust_credits(uuid, bigint, text) from public;
grant execute on function public.sms_admin_adjust_credits(uuid, bigint, text) to authenticated;

commit;
