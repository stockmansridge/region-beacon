-- 06_sms_rpcs_read.sql
-- GetStampd SMS Messaging — read helpers.
--
-- Customer-facing reads (balance, ledger, campaign history) go through the
-- RLS SELECT policies from 01/02 directly, so no RPC is needed for those.
-- This file adds:
--   * sms_account_summary(_agency_id)     ensures an account row exists and
--                                         returns the balance for the SMS page
--   * system_admin_sms_overview()         platform-admin margin dashboard
--   * system_admin_sms_pack_margins()     per-pack markup vs the minimum
--
-- Internal wholesale cost and margin are NEVER returned by a customer-callable
-- function.
--
-- Idempotent (create or replace). Safe to re-run. Apply in the SQL editor.

begin;

create or replace function public.sms_account_summary(_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  acct public.sms_credit_accounts;
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

  insert into public.sms_credit_accounts (agency_id)
  values (_agency_id)
  on conflict (agency_id) do nothing;

  select * into acct from public.sms_credit_accounts where agency_id = _agency_id;

  return jsonb_build_object(
    'agency_id', _agency_id,
    'balance_credits', acct.balance_credits,
    'lifetime_purchased_credits', acct.lifetime_purchased_credits,
    'lifetime_used_credits', acct.lifetime_used_credits,
    'can_purchase', (public.is_platform_admin(uid) or public.is_agency_admin(uid, _agency_id))
  );
end;
$$;

revoke all on function public.sms_account_summary(uuid) from public;
grant execute on function public.sms_account_summary(uuid) to authenticated;

-- Platform-admin dashboard ------------------------------------------------
create or replace function public.system_admin_sms_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.sms_provider_settings;
  credits_sold bigint;
  credits_used bigint;
  outstanding bigint;
  revenue_cents bigint;
  segments_submitted bigint;
  campaigns_total bigint;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;

  select * into settings from public.sms_provider_settings where id = true;

  select coalesce(sum(credits), 0), coalesce(sum(amount_paid_cents), 0)
    into credits_sold, revenue_cents
    from public.sms_credit_transactions
   where transaction_type = 'purchase';

  select coalesce(sum(-credits), 0) into credits_used
    from public.sms_credit_transactions
   where transaction_type = 'send';

  select coalesce(sum(balance_credits), 0) into outstanding
    from public.sms_credit_accounts;

  select coalesce(sum(credits_used), 0), count(*)
    into segments_submitted, campaigns_total
    from public.sms_campaigns
   where status <> 'draft';

  return jsonb_build_object(
    'credits_sold', credits_sold,
    'credits_used', credits_used,
    'outstanding_credit_liability', outstanding,
    'campaigns_total', campaigns_total,
    'segments_submitted', segments_submitted,
    'retail_revenue_cents', revenue_cents,
    'wholesale_cost_cents_per_segment', settings.wholesale_cost_cents_per_segment,
    'minimum_markup_percent', settings.minimum_markup_percent,
    'estimated_wholesale_cost_cents',
      round(coalesce(segments_submitted, 0) * settings.wholesale_cost_cents_per_segment),
    'estimated_gross_margin_cents',
      revenue_cents - round(coalesce(segments_submitted, 0) * settings.wholesale_cost_cents_per_segment)
  );
end;
$$;

revoke all on function public.system_admin_sms_overview() from public;
grant execute on function public.system_admin_sms_overview() to authenticated;

create or replace function public.system_admin_sms_pack_margins()
returns table (
  id uuid,
  code text,
  name text,
  credits bigint,
  price_cents integer,
  active boolean,
  sort_order integer,
  wholesale_cost_cents numeric,
  markup_percent numeric,
  gross_profit_cents numeric,
  below_minimum_markup boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.sms_provider_settings;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform_admin required' using errcode = '42501';
  end if;

  select * into settings from public.sms_provider_settings where id = true;

  return query
  select p.id,
         p.code,
         p.name,
         p.credits,
         p.price_cents,
         p.active,
         p.sort_order,
         round(p.credits * settings.wholesale_cost_cents_per_segment, 2) as wholesale_cost_cents,
         case
           when p.credits * settings.wholesale_cost_cents_per_segment > 0
           then round(
             ((p.price_cents - (p.credits * settings.wholesale_cost_cents_per_segment))
               / (p.credits * settings.wholesale_cost_cents_per_segment)) * 100, 2)
           else null
         end as markup_percent,
         round(p.price_cents - (p.credits * settings.wholesale_cost_cents_per_segment), 2) as gross_profit_cents,
         case
           when p.credits * settings.wholesale_cost_cents_per_segment > 0
           then ((p.price_cents - (p.credits * settings.wholesale_cost_cents_per_segment))
                  / (p.credits * settings.wholesale_cost_cents_per_segment)) * 100
                < settings.minimum_markup_percent
           else false
         end as below_minimum_markup
    from public.sms_credit_packs p
   order by p.sort_order, p.credits;
end;
$$;

revoke all on function public.system_admin_sms_pack_margins() from public;
grant execute on function public.system_admin_sms_pack_margins() to authenticated;

commit;
