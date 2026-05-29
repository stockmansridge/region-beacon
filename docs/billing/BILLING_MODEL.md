# GetStampd — Billing model

This document explains how billing will work once the draft migrations in
`supabase/migrations-draft-billing/` are approved, applied, and wired to
Stripe. Nothing here is live yet.

## Two-level model

GetStampd bills at **two levels**:

1. **Agency subscription** — a recurring plan attached to an agency. It
   covers ongoing platform usage (admin seats, hosted dashboards,
   leaderboard, support).
2. **Per-event activation** — each event must be commercially activated
   before its public address goes live. An activation can be:
   - `one_time` — paid as a one-off Stripe Checkout charge for that event.
   - `included_in_plan` — granted automatically because the agency's
     subscription plan includes N activations per period.
   - `comp` — granted manually by a platform admin (e.g. pilot customers).

Both levels are tracked independently:

- `agency_subscriptions` — one history row per Stripe subscription, with
  status (`trialing`, `active`, `past_due`, `cancelled`, …) and period
  bounds. At most one non-terminal subscription per agency is enforced by
  a partial unique index.
- `event_activations` — exactly one row per event, status (`unpaid`,
  `active`, `past_due`, `cancelled`, `comp`), plus the Stripe checkout /
  payment-intent IDs that produced it.

## Pending vs active subdomains

Agencies can reserve a public subdomain for an event as soon as the event
is created. That reservation stores a row in `event_domains` with
`status = 'pending'`. **Pending subdomains do not resolve in production.**
The activation flow is:

```
draft event
  -> reserve public subdomain (event_domains.status = 'pending')
  -> preview privately at /admin/events/{id}/preview
  -> activate event (Stripe Checkout or plan inclusion)
  -> event_activations.status flips to 'active'
  -> publish event (events.status = 'published')
  -> event_domains row marked is_primary, status = 'active'
  -> resolve_event_by_host now returns the event
```

The `event_is_publishable(_event_id)` helper (draft file
`05_helper_event_is_publishable.sql`) returns true only when **all** of:

- the event exists and is `published`
- at least one primary `event_domains` row is `active`
- the matching `event_activations` row is `active` or `comp`

Public-facing resolvers (`resolve_event_by_host`, public read RPCs) will
call this helper in a later migration. Admin preview routes explicitly do
**not** call it — admins must be able to review work before paying.

## Audit log

`billing_events` is an append-only audit log. Every meaningful billing
side effect writes a row:

- Stripe webhook deliveries (deduplicated on `stripe_event_id`)
- Platform admin actions (comp activation, manual subscription override)
- System events (auto-renewal handled, activation expired)

The table is read-only to agency owners (for their own agency) and
platform admins. Writes go through the service-role webhook handler /
admin RPCs only.

## Stripe integration (future, not implemented)

The plan for when Stripe is wired in:

1. **Customer creation** — first time an agency reaches the billing page,
   a Stripe customer is created and its ID is stored in
   `agency_billing_accounts.stripe_customer_id`.
2. **Stripe Checkout** — "Start subscription" opens a Checkout Session in
   subscription mode. "Activate event" opens a Checkout Session in
   payment mode with the event ID in metadata.
3. **Customer Portal** — "Manage billing" opens Stripe's hosted Customer
   Portal so agencies can update payment methods, cancel, or change plan
   without us building UI for it.
4. **Webhook handler** — a `/api/public/stripe/webhook` route verifies
   the Stripe signature, deduplicates on `stripe_event_id` via
   `billing_events`, and updates the relevant `agency_subscriptions` or
   `event_activations` row. The handler uses the service-role client and
   is the only writer to billing tables.
5. **Service-role isolation** — the Stripe secret key and the
   service-role Supabase key live in server env vars
   (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and are never bundled
   into the browser.

## RLS posture

- All four billing tables have RLS enabled.
- Reads:
  - `agency_billing_accounts`, `agency_subscriptions`, `event_activations`:
    visible to agency_owner / agency_admin for their own agency, and to
    platform_admin globally.
  - `billing_events`: visible to agency_owner (their agency only) and
    platform_admin. agency_admin is intentionally excluded.
- Writes: no policies granted to `authenticated`. All inserts/updates run
  under service_role from the webhook handler or admin RPCs.
- No anon grants on any billing table.

## Why public signup is still deferred

A self-service signup that takes a credit card is only useful once:

- the Stripe customer / subscription / checkout flow is fully wired,
- the webhook handler reliably updates `agency_subscriptions` and
  `event_activations`,
- and the publish gate (`event_is_publishable`) is enforced everywhere
  that returns event data publicly.

Until all three are in place, allowing public signup would let people
create agencies and events that can never be paid for or activated. The
`/signup` route stays a coming-soon placeholder until the full billing
loop closes.
