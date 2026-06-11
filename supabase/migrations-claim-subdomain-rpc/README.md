# claim_event_subdomain RPC

Run `apply.sql` against the database (idempotent, safe to re-run).

## Why

Normal users' claimed subdomains were stuck on `pending` because the frontend
relied on direct client-side `INSERT`/`UPDATE` of `event_domains.status`,
which RLS does not reliably permit for non-platform-admins. All
claim/reserve/activate transitions now run inside a single
`SECURITY DEFINER` RPC.

## RPC: `public.claim_event_subdomain(_event_id uuid, _subdomain text default null)`

- Auth: platform admin, or accepted `agency_owner` / `agency_admin` of the
  event's agency. Anonymous and unrelated users are rejected.
- Validation: delegates to `validate_public_subdomain` (format / reserved /
  taken; released/deleted rules unchanged).
- Plan: `agency_effective_plan_code` (single source of truth), normalised
  lowercase.
- Free + draft → row `pending`, `is_primary=true` → `reserved_publish_to_go_live`
- Free + published → row `active`, `is_primary=true`, `verified_at=now()` → `activated_live`
- Free + published + existing pending row → call with `_subdomain=null` to
  activate it in place → `activated_live`
- Paid plans → row stays `pending` → `reserved_pending_billing` (billing flow unchanged)
- Never inserts into `event_activations`.
- Clears `is_primary` on other domains for the event.

Returns jsonb: `ok, status, message, plan_code, event_status, domain_status,
is_primary, verified_at, subdomain, activation_attempted, reason` (on failure).

## Frontend

`src/routes/admin.events.$eventId.tsx` now calls this RPC for both the
claim/reserve button and the "Activate public address" button, shows the
returned message, logs the full debug payload to the console
(`[claim_event_subdomain]`), and refetches the domain bundle afterwards.
