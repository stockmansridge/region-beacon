# System Admin — manual plan override

Adds a database-backed manual plan override so platform admins can manually
set a customer's effective plan when GetStampd invoices them directly,
outside the Stripe/automated flow.

## What changes

1. Adds columns on `public.agencies`:
   - `manual_plan_override text` (one of the canonical GetStampd plan codes
     or NULL)
   - `manual_plan_override_at timestamptz`
   - `manual_plan_override_by uuid` (the platform admin who set it)
   A CHECK constraint restricts allowed values to the canonical plan set.

2. Replaces `public.get_agency_plan_limits(uuid)` so the resolver follows:

   ```
   manual_plan_override ?? paid_subscription_plan ?? free_plan
   ```

   The returned `jsonb` now also includes `plan_source`, one of
   `manual_override`, `subscription`, `default`.

3. New SECURITY DEFINER RPCs, gated on `public.is_platform_admin(auth.uid())`
   and `EXECUTE` granted to `authenticated` only:
   - `save_organisation_plan_override(p_agency_id uuid, p_plan_key text)`
   - `clear_organisation_plan_override(p_agency_id uuid)`
   - `get_organisation_plan_override(p_agency_id uuid)`

   Each validates the agency exists, validates the plan key against the
   canonical set, and returns a JSON payload including the updated effective
   plan so the UI can refresh from the same call.

## What is NOT changed

- `agency_subscriptions` rows, Stripe customer/subscription IDs, webhooks,
  and any other billing data are untouched.
- Existing venue-limit trigger (`enforce_agency_venue_limit`) keeps working
  unchanged because it reads from `get_agency_plan_limits`, which now
  honours the manual override automatically.

## Apply

1. Open the Supabase SQL editor for the production project
   (`kyjwifumacnrpgyextzz`).
2. Paste `apply.sql`.
3. Run it once. Safe to re-run.

## Smoke test (as a platform admin session)

```sql
select public.get_agency_plan_limits('<agency-uuid>');
select public.save_organisation_plan_override('<agency-uuid>', 'regional');
select public.get_organisation_plan_override('<agency-uuid>');
select public.clear_organisation_plan_override('<agency-uuid>');
```

A non-admin caller receives
`Only platform admins can override organisation plans.` (SQLSTATE 42501).
