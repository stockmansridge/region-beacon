# Live-path audit: effective plan + subdomain activation

Run `apply.sql` in the Supabase SQL editor (idempotent, safe to re-run).

## Why both blockers have one root cause

Every normal admin surface (Dashboard, event detail, venue preflight,
Tasting QR gate, Account & Billing) already resolves the plan via the
`get_agency_plan_limits` RPC. System Admin is the only place that *also*
falls back to the raw `agencies.manual_plan_override` column for its badge.

So "System Admin says Enterprise, Dashboard says Free" means the **live
database still runs the pre-override version of `get_agency_plan_limits`**
(the earlier `migrations-venue-preflight-manual-override/apply.sql` was not
applied). The same stale resolver feeds `agency_effective_plan_code`, which
`claim_event_subdomain` uses — so the override org was treated as a paid
plan stuck behind billing, leaving the subdomain `pending` forever.

## What apply.sql installs

1. `get_agency_plan_limits` — manual_plan_override > active subscription >
   free; now also returns `plan_source`, `manual_plan_override`,
   `subscription_plan_code`, `resolved_at` for diagnostics.
2. `agency_effective_plan_code` — wrapper over (1).
3. `event_is_publishable` — free OR manual-override plans bypass the
   `event_activations` billing gate (override = comp).
4. `claim_event_subdomain` v2 — a claimed subdomain activates whenever the
   event is **published**, on every plan. Call with `_subdomain = null` to
   re-run activation on an existing pending row. Returns
   `plan_code, plan_source, event_status, domain_status_before,
   domain_status_after, activation_attempted, activation_result, message`.

## After applying

- Dashboard / event page show Enterprise (check the Diagnostics panel:
  plan_source = manual_override, venue_limit = unlimited).
- Event page Public address card gains **Check / activate subdomain**;
  turning on the public event also auto-activates a pending subdomain.
