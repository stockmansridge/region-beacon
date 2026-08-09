# Phase 2 — SMS credit purchase flow test

Sending stays locked until every step below passes. Nothing in the app grants
credits; only the Stripe webhook does, via `sms_credit_purchase_apply()`.

## Code-level verification (done)

| # | Requirement | Where it is enforced |
|---|---|---|
| 3 | Two events cannot double-credit | `sms_stripe_events` unique `stripe_event_id` (replay of the *same* event) **and** partial unique indexes `uq_sms_credit_tx_checkout_session` / `uq_sms_credit_tx_payment_intent` plus the `exists` pre-check in `sms_credit_purchase_apply` (different events, same payment). The `checkout.session.completed` branch passes the payment intent id, so the later `payment_intent.succeeded` event matches and returns `already_processed: true`. |
| 4 | One-off, not subscription | `mode: "payment"` in `src/lib/sms-credits.server.ts`; no `subscription` object is touched. |
| 5 | Server-side price/credits | Pack is re-read from `sms_credit_packs` by id with `active = true`; browser sends only `pack_id`. `credits` and `unit_amount` come from that row. |
| 6 | Owners/admins only | `authorisePurchaser()` requires `user_roles.platform_admin` or an accepted `agency_members` row with role `agency_owner`/`agency_admin`. UI also disables the buttons when `can_purchase` is false. |
| 7 | Verified payment → ledger + balance | Webhook (signature-verified via `constructEventAsync`) calls `sms_credit_purchase_apply`, which locks the account row (`sms_lock_credit_balance`, creating it if absent), inserts the immutable `purchase` ledger row and increments `balance_credits` + `lifetime_purchased_credits` in one transaction. |
| 8 | No platform-admin action | No approval state exists in the schema or UI. |
| 9 | Cancelled/failed → no credits | Credits are only applied on `checkout.session.completed` with `payment_status === 'paid'`, or `payment_intent.succeeded`. Cancel returns to `?checkout=cancelled` (display only). |
| 10 | Return to Communications → SMS | `success_url` = `<origin>/admin/communications?checkout=success`; the page refetches at 1.5s/4s/8s, and on every window focus. |

## Manual test script (after deploy + webhook config)

1. Sign in as an organisation owner. Go to **Communications**. Note the balance.
2. Buy the 1,000 pack. Confirm Stripe Checkout shows **$95.00 AUD**, one-off (no
   "then $x/month" wording).
3. Cancel first. Confirm you land back on Communications with a "cancelled"
   toast and the balance is unchanged, and that `sms_credit_transactions` has no
   new row.
4. Buy again and complete payment. Confirm the balance rises by 1,000 without a
   manual reload, and a `purchase` row appears in Credit history.
5. In Stripe → Webhooks → the endpoint → the `checkout.session.completed`
   delivery, click **Resend**. Confirm the balance does **not** change and no
   second ledger row appears (`sms_stripe_events` blocks the replay).
6. Confirm `payment_intent.succeeded` for the same payment also produced no
   second ledger row.
7. Sign in as a non-admin member. Confirm the Buy buttons are disabled.

```sql
-- after step 4
select transaction_type, credits, balance_after, amount_paid_cents,
       stripe_checkout_session_id, stripe_payment_intent_id, created_at
  from public.sms_credit_transactions
 where agency_id = '<agency-uuid>' order by created_at desc limit 5;

select stripe_event_id, event_type, processed_at
  from public.sms_stripe_events order by processed_at desc limit 5;

select balance_credits, lifetime_purchased_credits
  from public.sms_credit_accounts where agency_id = '<agency-uuid>';
```

Expected: exactly one `purchase` row per payment, two `sms_stripe_events` rows
(one per Stripe event) and `balance_credits` up by exactly the pack credits.
