# Draft billing migrations

These files are **drafts only**. They are not in `supabase/migrations/` and
have not been executed against any database. Nothing in this folder
modifies production or preview Supabase.

## Ordering

Run order, once approved and moved into the live migrations folder:

1. `01_agency_billing_accounts.sql` — one billing account per agency.
2. `02_agency_subscriptions.sql` — agency-level subscription history.
3. `03_event_activations.sql` — per-event commercial activation gate.
4. `04_billing_events.sql` — immutable audit log + Stripe webhook dedupe.
5. `05_helper_event_is_publishable.sql` — combined lifecycle/domain/billing gate.
6. `06_policies_billing.sql` — RLS read policies for the four tables above.

All files are additive. They do not modify existing tables, existing RLS,
existing helpers, or `resolve_event_by_host`. Application/UI changes that
depend on the new tables (Account & Billing page, Stripe checkout, webhook
handler, publish gating) are handled in later steps and are not part of
this migration set.

## Assumptions inherited from existing schema

- `public.events` already has the composite unique
  `(agency_id, id)` constraint (`events_agency_event_unique`), so the
  composite FK on `event_activations` works without further changes.
- `public.tg_set_updated_at()` and `public.is_platform_admin`,
  `is_agency_admin`, `is_agency_owner` are already defined in the existing
  draft migrations.
- `citext` and `pgcrypto` extensions are installed (used by
  `agency_billing_accounts.billing_email` and `gen_random_uuid()`).

## What is NOT in this draft

- No Stripe SDK, checkout sessions, customer portal, or webhook handler.
- No service-role secrets in the frontend.
- No anon grants. No browser writes to billing tables.
- No changes to `resolve_event_by_host` or any public RPC.
- No storage buckets, no schema changes to non-billing tables.

See `docs/billing/BILLING_MODEL.md` for the product-level explanation.
