-- 06_policies_billing.sql
-- Draft only. Do not execute.
-- RLS policies for billing tables.
--
-- General shape:
--   - SELECT: agency_owner / agency_admin for their own agency;
--             platform_admin everywhere.
--   - INSERT / UPDATE / DELETE: not granted to authenticated. Writes are
--     performed by service_role only (Stripe webhook handler, internal
--     RPCs, platform admin actions), which bypasses RLS.
--   - All deny_all RESTRICTIVE policies are dropped now that real
--     permissive policies exist.

-- agency_billing_accounts ------------------------------------------------
drop policy if exists deny_all on public.agency_billing_accounts;

create policy agency_billing_accounts_select
  on public.agency_billing_accounts for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- agency_subscriptions ---------------------------------------------------
drop policy if exists deny_all on public.agency_subscriptions;

create policy agency_subscriptions_select
  on public.agency_subscriptions for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_activations ------------------------------------------------------
drop policy if exists deny_all on public.event_activations;

create policy event_activations_select
  on public.event_activations for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- billing_events ---------------------------------------------------------
-- Per spec: agency_owner sees rows for their agency; platform_admin sees all.
-- agency_admin does NOT get read access here — billing history is
-- considered owner-level information.
drop policy if exists deny_all on public.billing_events;

create policy billing_events_select
  on public.billing_events for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (
      agency_id is not null
      and public.is_agency_owner(auth.uid(), agency_id)
    )
  );

-- NOTE: No insert/update/delete policies are created here. The Postgres
-- default with RLS enabled + no permissive policy for those commands =
-- deny for every non-superuser role, which is what we want. The Stripe
-- webhook handler and admin RPCs will run under service_role and bypass
-- RLS entirely.
