# Free-plan GetStampd subdomain activation

Apply `apply.sql` once. Idempotent — safe to re-run.

## What this changes

1. **`agency_effective_plan_code(_agency_id)`** — new helper returning the
   normalised plan code (`free | starter | growth | regional | pro_region |
   enterprise`) by reading `get_agency_plan_limits`. Single DB-side source of
   truth that matches `normalizePlanCode` in
   `src/lib/getstampd-pricing.ts`.

2. **`event_is_publishable(_event_id)`** — updated. Paid plans behave exactly
   as before (require `event_activations.status in ('active','comp')`). Free
   plan bypasses the activation-row requirement; it still requires
   `events.status = 'published'` and a primary active `event_domains` row.

3. **Trigger `trg_events_activate_free_subdomain_on_publish`** — on
   `events` INSERT/UPDATE of `status` to `published`, for Free-plan
   organisations only, flips the most-recent pending `event_subdomain` row
   to `status='active'`, `is_primary=true`. No-op for paid plans (existing
   billing/activation flow stays authoritative) and no-op if the event
   already has an active primary subdomain.

4. **Backfill** — for existing Free + published events with a pending
   GetStampd subdomain and no active primary subdomain, activates the
   reservation. Pure UPDATE; nothing inserted; no `event_activations`
   rows created for Free events (per design).

## What this does NOT change

- `event_activations` semantics for paid/comped plans.
- Reserved-label or already-taken protections (`event_domains` constraints
  + `validate_public_subdomain` RPC).
- Custom-domain (`event_custom`) flows — those remain paid-plan gated where
  already gated.
- Existing Free *draft* events stay `pending` until the user publishes.

## Verification

```sql
-- Effective plan for an org
select public.agency_effective_plan_code('<agency-uuid>');

-- Publishable check
select public.event_is_publishable('<event-uuid>');

-- Inspect a Free event's domain rows
select id, public_subdomain, domain_type, status, is_primary, verified_at
  from public.event_domains
 where event_id = '<event-uuid>';
```
