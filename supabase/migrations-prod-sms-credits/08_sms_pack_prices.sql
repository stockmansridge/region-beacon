-- 08_sms_pack_prices.sql
-- GetStampd SMS Messaging — retail price correction for the four standard packs.
--
-- WHY: the wholesale cost seed stays at $0.072 AUD per segment (conservative,
-- platform-admin editable later). At that wholesale rate the original launch
-- prices left the 5k/10k/25k packs BELOW the 20% minimum markup floor. This
-- file only re-prices the customer-facing packs.
--
-- This file does NOT touch public.sms_provider_settings — the wholesale cost
-- and the 20% minimum markup threshold are intentionally left as seeded in
-- 04_sms_idempotency_and_settings.sql.
--
-- Resulting markup at $0.072/segment wholesale:
--   sms_1k    1,000 @ $95    -> ~31.9%
--   sms_5k    5,000 @ $450   -> ~25.0%
--   sms_10k  10,000 @ $875   -> ~21.5%
--   sms_25k  25,000 @ $2,200 -> ~22.2%
--
-- Additive and idempotent. Safe to re-run. Apply in the Supabase SQL editor.

begin;

do $$
begin
  if to_regclass('public.sms_credit_packs') is null then
    raise exception '08_sms_pack_prices.sql: apply 01_sms_credit_core.sql first (public.sms_credit_packs is missing)';
  end if;
end;
$$;

-- Upsert by code so this works whether or not the pack row already exists.
insert into public.sms_credit_packs (code, name, credits, price_cents, currency, badge, sort_order, active)
values
  ('sms_1k',  '1,000 SMS Credits',   1000,   9500, 'AUD', null,           10, true),
  ('sms_5k',  '5,000 SMS Credits',   5000,  45000, 'AUD', 'Popular',      20, true),
  ('sms_10k', '10,000 SMS Credits', 10000,  87500, 'AUD', 'Large events', 30, true),
  ('sms_25k', '25,000 SMS Credits', 25000, 220000, 'AUD', 'Major events', 40, true)
on conflict (code) do update
  set name        = excluded.name,
      credits     = excluded.credits,
      price_cents = excluded.price_cents,
      currency    = excluded.currency,
      badge       = excluded.badge,
      sort_order  = excluded.sort_order,
      active      = true;

commit;

-- Verify (as a platform admin):
--   select code, credits, price_cents from public.sms_credit_packs order by sort_order;
--   select * from public.system_admin_sms_pack_margins();
-- Expect below_minimum_markup = false for all four packs.
