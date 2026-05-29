# supabase/migrations-draft-billing-admin

Draft-only SQL for platform-admin manual event activation. **Not executed.**

## Files

- `01_platform_set_event_activation.sql` — creates `public.platform_set_event_activation(uuid, text, text, timestamptz)`.
- `02_verify_platform_set_event_activation.sql` — read-only structural checks plus a behavioural test script (manual, requires real user sessions).

## Safety model

- **SECURITY DEFINER** with `set search_path = public`. Required so the
  function can write to `event_activations` and `billing_events` even though
  those tables only grant write privileges to `service_role` and have no
  permissive RLS write policies for `authenticated`.
- **Authorization** is enforced inside the function body BEFORE any write:
  1. `auth.uid()` must be non-null (caller is authenticated).
  2. `public.is_platform_admin(auth.uid())` must return true; otherwise
     the function raises `access denied: platform_admin required` with
     SQLSTATE `42501`.
- **Grants**: `EXECUTE` is granted to `authenticated` only. `anon` and
  `public` are explicitly revoked. The platform-admin check is what restricts
  use within the authenticated role.
- **Bounded side-effects**:
  - Writes a single row to `event_activations` (upsert by `event_id`).
  - Appends one immutable row to `billing_events` with
    `source = 'admin_action'`, `event_type = 'platform.manual_event_activation'`,
    `actor_user_id = auth.uid()`, and a payload that captures old status,
    new status, activation_kind, expires_at, and the resolved activated_at.
  - Does NOT modify `events.status`.
  - Does NOT modify `event_domains.status`.
  - Does NOT call `resolve_event_by_host` or alter any host resolution.
  - Does NOT publish anything to the public visitor surface.
- **`activated_at` policy**: preserved across status transitions. When the
  new status is `active` or `comp` and there was no prior activation
  timestamp, it is stamped to `now()`; otherwise the existing value is kept.
  When transitioning to `unpaid`/`past_due`/`cancelled`, `activated_at` is
  intentionally NOT nulled — this keeps an auditable record of when the
  event was first activated. The full audit trail of every change lives in
  `billing_events`.
- **Input validation**: `_status` and `_activation_kind` are checked against
  the same allow-lists used by `event_activations`'s CHECK constraints, so
  invalid values fail fast with SQLSTATE `22023` before any write.

## Not in scope

- No Stripe SDK, Stripe API calls, or webhook handlers.
- No service-role key exposure (the function runs as definer; the caller
  remains the authenticated user).
- No changes to public visitor routes, visitor registration, or check-ins.
- No changes to `resolve_event_by_host`.
- No production execution. These files are draft-only and intended for
  manual review prior to running on `region-beacon-staging`.
