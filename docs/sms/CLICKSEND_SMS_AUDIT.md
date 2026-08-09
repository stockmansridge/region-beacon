# SMS Messaging (ClickSend) — Phase 0 Audit

Audit only. No schema, payment or UI changes have been made.

## 1. Existing Stripe / payment architecture (reused, not duplicated)

| Piece | Location | Notes |
|---|---|---|
| Checkout creation | `supabase/functions/create-stripe-checkout/index.ts` | Deno Edge Function. Verifies bearer token, checks `user_roles.platform_admin` or `agency_members` role in (`agency_owner`,`agency_admin`), reuses/creates Stripe customer on `agency_billing_accounts.stripe_customer_id`, creates a **subscription-mode** session. `verify_jwt = false` in `supabase/config.toml` (auth checked in code). |
| Webhook | `supabase/functions/stripe-webhook/index.ts` | Signature-verified via `constructEventAsync`. Handles `checkout.session.completed` + 3 `customer.subscription.*` events. Writes `agency_subscriptions` with the service-role client. **No idempotency table today** — safe for subscriptions (upsert by `stripe_subscription_id`) but NOT safe for credit top-ups. |
| Env diagnostic | `supabase/functions/stripe-env-check/index.ts` | Platform-admin boolean presence check only. |
| Server helpers | `src/lib/stripe.server.ts`, `src/integrations/supabase/admin.server.ts`, `src/lib/server-env.server.ts` | `getStripeClient()`, `getSupabaseAdmin()`, `getSupabaseAsUser(token)`, per-request env reads. |
| Docs | `docs/stripe-getstampd.md` | Existing secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`. Webhook URL `https://kyjwifumacnrpgyextzz.functions.supabase.co/stripe-webhook`. |

**Conclusion:** the same Stripe account, customer records and single webhook endpoint can carry SMS credit purchases. SMS uses `mode: "payment"` (one-off) instead of `subscription`, and the existing webhook gets two new event branches. No parallel billing system, no new webhook endpoint, no change to subscription behaviour.

## 2. Organisation / customer tables

- `public.agencies` — the organisation record (`id`, `name`, `slug`, `status`, `billing_email`). Internal name is still `agency`; customer-facing copy already says "Organisation".
- `public.agency_members` — membership + role (`agency_owner`, `agency_admin`, …, `accepted_at` gate).
- `public.user_roles` — global roles incl. `platform_admin`.
- `public.agency_billing_accounts` — one per agency, holds `stripe_customer_id`.
- `public.agency_subscriptions` — plan/subscription state (untouched by SMS).
- Helper functions (all `SECURITY DEFINER`, `search_path = public`): `is_platform_admin`, `is_agency_member`, `is_agency_admin`, `is_agency_owner`, `has_role`.

**SMS ownership key = `agency_id`** (documented customer-facing as Organisation). This matches `DATABASE_RULES.md` (agency-owned tables carry `agency_id`; operational tables carry both `agency_id` and `event_id`).

## 3. Participant phone / consent fields (already exist)

- `public.visitors`: `mobile text` (format check `^\+?[0-9 \-]{6,20}$`), `marketing_opt_in boolean not null default false`, `postcode`, `email`, `deleted_at`. Tenant-scoped by `(agency_id, event_id, id)`.
- `public.visitor_consents`: append-only ledger, `consent_type in ('terms','privacy','marketing')`, `decision in ('granted','withdrawn')`, `decided_at`, `client_ip`, `user_agent`. Written only by definer RPCs (`register_visitor`, `update_marketing_consent`).
- `public.passports`: one per visitor per event, token-hash addressed.
- `public.checkins`: one row per `(passport_id, venue_id)` — gives us "checked in / not checked in / visited venue X" cohorts with no invented queries.
- Join form (`src/routes/live.$subdomain.join.tsx`) already collects optional mobile + an unticked marketing checkbox.

**Gap:** there is no *SMS-specific* consent, no E.164 canonical number, and no unsubscribe state. Marketing email opt-in must not be treated as SMS consent (Australian Spam Act — consent must be for the channel). Plan: **extend, don't replace** — add `consent_type = 'sms'` to the existing ledger's check constraint, and add `mobile_e164`, `sms_opt_in`, `sms_opt_in_at`, `sms_opt_in_source`, `sms_opt_out_at` to `visitors`. Existing rows default to opted-out.

## 4. Proposed new tables / functions

Tables (all `agency_id`-scoped, RLS on, deny-all default + explicit policies, grants per `DATABASE_RULES.md`):

1. `sms_credit_accounts` — one row per agency (`unique (agency_id)`), `balance_credits`, `lifetime_purchased_credits`, `lifetime_used_credits`.
2. `sms_credit_transactions` — immutable ledger (`purchase|send|refund|adjustment|failed_send_recredit`), signed `credits`, `balance_after`, Stripe IDs, `sms_campaign_id`, `metadata`. No UPDATE/DELETE policy for anyone.
3. `sms_credit_packs` — admin-configurable; seeded 1,000/$95, 5,000/$425, 10,000/$825, 25,000/$1,950 AUD.
4. `sms_campaigns` — status machine `draft|queued|sending|completed|partially_failed|failed|cancelled`, segments/recipients/credits, provider reference.
5. `sms_campaign_recipients` — per-recipient delivery state `queued|submitted|delivered|failed|rejected|opted_out`, provider message id, `credits_used`.
6. `sms_stripe_events` — **idempotency guard**: `unique (stripe_event_id)`, plus `unique` on `stripe_checkout_session_id` in the purchase path. This is what makes duplicate webhooks a no-op.
7. `sms_provider_settings` — internal wholesale cost per segment + minimum markup %. Platform-admin only; never readable by customers.

Functions (all `SECURITY DEFINER`, explicit `search_path`, no direct balance writes exposed):

- `sms_credit_purchase_apply(...)` — service-role only, idempotent, inserts ledger + increments balance in one transaction.
- `sms_campaign_reserve_and_queue(...)` — `SELECT … FOR UPDATE` on the credit account, validates balance, creates campaign + recipients + negative ledger entry, returns `insufficient` with the shortfall instead of raising. This is the double-spend guard.
- `sms_campaign_recredit(...)` — positive `failed_send_recredit` entry for pre-billable provider rejections.
- `sms_admin_adjust_credits(_agency_id, _credits, _reason)` — platform-admin only, ledger-only. No UI path ever writes `balance_credits`.
- `sms_account_summary()` / `sms_campaign_list()` / `system_admin_sms_overview()` — read RPCs matching the existing `system_admin_*` pattern.

## 5. Proposed ClickSend backend integration

- Provider abstraction in `src/lib/sms/provider.server.ts` (`sendSmsBatch`, `getSmsDeliveryStatus`, `normaliseAuMobile`) with a ClickSend adapter in `src/lib/sms/clicksend.server.ts`. React never touches provider APIs.
- Sending happens in a **Supabase Edge Function** (`sms-send-campaign`), not a Cloudflare Worker server fn, because the app worker has a request-time limit and the send must survive the browser closing. It reads `queued` campaigns, batches recipients (ClickSend `POST /v3/sms/send` accepts up to 1,000 messages per call), marks each recipient `submitted` with its provider message id before moving on, and is safe to re-run (already-submitted recipients are skipped).
- Delivery receipts + inbound STOP handled by two `verify_jwt = false` Edge Functions: `sms-delivery-webhook` and `sms-inbound-webhook`, both shared-secret verified via a query token.
- Segmentation implemented once in `src/lib/sms/segments.ts` (GSM-7 alphabet + extended set, 160/153 concatenated, UCS-2 70/67) and imported by both the composer and the server, so the two calculations cannot drift.

## 6. How Stripe webhook activation will work

1. Client calls new Edge Function `create-sms-credit-checkout` with `{ agency_id, pack_id }`. Server re-reads the pack price from `sms_credit_packs` (browser price is never trusted), reuses the Stripe customer, creates a `mode: "payment"` session with metadata `purchase_type=sms_credits`, `agency_id`, `sms_credit_pack_id`, `credits`.
2. Stripe redirects to `/admin/events/:id#tab=sms&checkout=success|cancelled` — **display only**, it never credits.
3. `stripe-webhook` gains branches for `checkout.session.completed` (when `metadata.purchase_type === 'sms_credits'` and `payment_status === 'paid'`) and `payment_intent.succeeded`.
4. Branch inserts `sms_stripe_events(stripe_event_id)`; on unique violation it returns 200 immediately (replay = no-op). Otherwise it calls `sms_credit_purchase_apply(...)`, which itself guards on `unique (stripe_checkout_session_id)`.
5. Credits are live immediately. The SMS page polls/refetches balance on focus and on `checkout=success`. No admin approval state exists anywhere in the design.
6. Cancelled/failed payment produces no webhook credit path, so the balance is unchanged.

## 7. SQL migrations required (run in this order)

Nothing has been created yet. Proposed numbered files under `supabase/migrations-prod-sms-credits/`:

| # | File | What it does |
|---|---|---|
| 01 | `01_sms_credit_core.sql` | `sms_credit_accounts`, `sms_credit_transactions`, `sms_credit_packs` (+ seed), grants, RLS, policies. |
| 02 | `02_sms_campaigns.sql` | `sms_campaigns`, `sms_campaign_recipients`, indexes, grants, RLS, policies. |
| 03 | `03_sms_consent.sql` | Extends `visitors` (`mobile_e164`, `sms_opt_in`, `sms_opt_in_at`, `sms_opt_in_source`, `sms_opt_out_at`) and widens the `visitor_consents.consent_type` check to include `'sms'`. Additive only. |
| 04 | `04_sms_idempotency_and_settings.sql` | `sms_stripe_events`, `sms_provider_settings` (+ default wholesale/markup row). |
| 05 | `05_sms_rpcs_credits.sql` | `sms_credit_purchase_apply`, `sms_campaign_reserve_and_queue`, `sms_campaign_recredit`, `sms_admin_adjust_credits`. |
| 06 | `06_sms_rpcs_read.sql` | Customer + platform-admin read RPCs (balance, history, campaign detail, admin dashboard/margin). |
| 07 | `07_sms_recipient_resolution.sql` | Audience resolution function over `visitors`/`passports`/`checkins` with consent + opt-out + phone-validity filtering. |

Each file is idempotent (`create … if not exists`, `create or replace`) and additive — no drops.

## 8. What you will need to do manually

**ClickSend**
1. Create/confirm the GetStampd ClickSend account and note the account username.
2. Create an API key (ClickSend → Account → API Credentials).
3. Register a sender: either a dedicated AU virtual number (**required for STOP replies to reach us**) or an alphanumeric sender ID (no replies possible — then unsubscribe must be link-based only). Recommendation: dedicated number.
4. Configure ClickSend Delivery Receipts URL → `https://kyjwifumacnrpgyextzz.functions.supabase.co/sms-delivery-webhook?token=<shared secret>`.
5. Configure Inbound SMS rule (for STOP) → `https://kyjwifumacnrpgyextzz.functions.supabase.co/sms-inbound-webhook?token=<shared secret>`.
6. Confirm your actual per-segment AU cost so the internal wholesale figure is right (the $0.067 assumption implies pack margins of ~29–42% at the prices above, i.e. all four packs clear the 20% floor).

**Secrets (Supabase Edge Function env, server-only)**
- `CLICKSEND_USERNAME`
- `CLICKSEND_API_KEY`
- `CLICKSEND_SENDER` (number in E.164 or sender ID)
- `SMS_WEBHOOK_TOKEN` (shared secret for the two ClickSend webhooks)

**Stripe**
- Add `payment_intent.succeeded` to the existing webhook endpoint's event list (`checkout.session.completed` is already enabled).
- No new prices needed — SMS packs use `price_data` from `sms_credit_packs` so you can change pricing in the admin UI without touching Stripe. (Optional `stripe_price_id` column supported if you'd rather manage prices in Stripe.)

## 9. Open questions before Phase 1

1. Sender: dedicated AU virtual number (STOP replies work) or alphanumeric sender ID?
2. Confirm your ClickSend per-segment AU cost.
3. Is SMS credit purchasing restricted to `agency_owner`/`agency_admin` only (recommended, matches existing checkout function)?
