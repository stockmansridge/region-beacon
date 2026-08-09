# SMS Credits — production migrations (Phase 1)

Apply these **in numeric order** in the Supabase SQL editor for the production
project (`kyjwifumacnrpgyextzz`). Every file is additive and idempotent — no
drops, safe to re-run. Nothing here has been applied for you.

| # | File | What it does | Notes |
|---|---|---|---|
| 01 | `01_sms_credit_core.sql` | `sms_credit_accounts` (one balance per organisation), `sms_credit_transactions` (immutable signed ledger + Stripe unique indexes), `sms_credit_packs` (+ seeds the four launch packs) | Balance columns are a cache; the ledger is authoritative. No write grants for customers. |
| 02 | `02_sms_campaigns.sql` | `sms_campaigns`, `sms_campaign_recipients` | Members may insert/update/delete **drafts only**. Everything from `queued` on is written by RPC/service-role. |
| 03 | `03_sms_consent.sql` | `sms_normalise_au_mobile()`, adds `mobile_e164`, `sms_opt_in`, `sms_opt_in_at`, `sms_opt_in_source`, `sms_opt_out_at`, `sms_opt_out_reason` to `visitors`; widens `visitor_consents.consent_type` to include `'sms'` | Backfills the canonical number only. **No one is backfilled as opted in** — email `marketing_opt_in` is not SMS consent. |
| 04 | `04_sms_idempotency_and_settings.sql` | `sms_stripe_events` (webhook replay guard), `sms_provider_settings` (wholesale $0.072/segment, 20% minimum markup — platform admin only), `sms_inbound_messages` (STOP audit) | Wholesale cost is editable by platform admins and has **no customer grants at all**. |
| 05 | `05_sms_rpcs_credits.sql` | `sms_credit_purchase_apply` (service_role only, idempotent), `sms_campaign_reserve_and_queue` (atomic `FOR UPDATE` reserve), `sms_campaign_recredit` (service_role only), `sms_admin_adjust_credits` (platform admin, ledger-only) | There is **no** function that overwrites `balance_credits`. |
| 06 | `06_sms_rpcs_read.sql` | `sms_account_summary`, `system_admin_sms_overview`, `system_admin_sms_pack_margins` | Margin/wholesale data only ever returned to platform admins. |
| 08 | `08_sms_pack_prices.sql` | Re-prices the four standard packs so all clear the 20% markup floor at the $0.072 wholesale seed: 1k $95, 5k $450, 10k $875, 25k $2,200 | Retail prices only. Does **not** touch `sms_provider_settings`. |
| 07 | `07_sms_recipient_resolution.sql` | `sms_resolve_audience`, `sms_audience_count`, `sms_apply_opt_out` (STOP), `sms_record_consent` | 05 calls `sms_resolve_audience` at runtime, so 07 must be applied before any send is attempted. |

## If 05/06 report `type "public.sms_credit_accounts" does not exist`

That error means **01 (or 02) did not actually apply** — the tables are absent, so
the RPC bodies cannot resolve them. 05 and 06 no longer use table row types and
now start with a preflight that names the missing file. Re-run 01 and 02 first,
confirm with:

```sql
select to_regclass('public.sms_credit_accounts') as accounts,
       to_regclass('public.sms_credit_transactions') as ledger,
       to_regclass('public.sms_credit_packs') as packs,
       to_regclass('public.sms_campaigns') as campaigns,
       to_regclass('public.sms_campaign_recipients') as recipients;
```

All five must be non-null before running 05/06. In the Supabase SQL editor run
each file as a whole and check the result pane for an error before moving on.

## Verify after applying


```sql
-- Tables + packs
select code, name, credits, price_cents, active from public.sms_credit_packs order by sort_order;

-- Consent columns exist and nobody is silently opted in
select count(*) filter (where sms_opt_in) as opted_in,
       count(*) filter (where mobile_e164 is not null) as with_e164
  from public.visitors;

-- Number normalisation
select public.sms_normalise_au_mobile('0412 345 678'); -- +61412345678
select public.sms_normalise_au_mobile('+61412345678'); -- +61412345678
select public.sms_normalise_au_mobile('not a number');  -- null

-- Margin view (as a platform admin)
select * from public.system_admin_sms_pack_margins();
```

After applying `08_sms_pack_prices.sql`, expected markups at the $0.072/segment
wholesale seed are 1k ≈ 31.9%, 5k ≈ 25.0%, 10k ≈ 21.5%, 25k ≈ 22.2% — all above
the 20% minimum, so `below_minimum_markup` should be `false` for all four packs.
The wholesale cost stays at $0.072 and is platform-admin editable later; pricing
is yours to decide, the code only reports it and never auto-changes prices.

## Rollback

All changes are additive. To reverse:

```sql
drop table if exists public.sms_campaign_recipients, public.sms_campaigns,
  public.sms_credit_transactions, public.sms_credit_accounts,
  public.sms_credit_packs, public.sms_stripe_events,
  public.sms_provider_settings, public.sms_inbound_messages cascade;
-- visitors columns can be left in place harmlessly; if required:
-- alter table public.visitors drop column sms_opt_in, ... ;
```
