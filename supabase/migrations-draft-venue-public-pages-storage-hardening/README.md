# Event-asset helper grant hardening (draft only)

Draft only. **Do not execute.**

## Why

The earlier drafts in
`supabase/migrations-draft-event-assets-storage/` and
`supabase/migrations-draft-venue-public-pages-storage/` granted EXECUTE
on the helper functions to `anon` (and PUBLIC retains EXECUTE by
default). Neither function needs to be callable by unauthenticated
sessions:

- `public.event_assets_path_parts(text)` — pure path parser.
- `public.can_write_event_asset(text)` — SECURITY DEFINER write-gate
  called by `storage.objects` RLS during INSERT/UPDATE/DELETE on the
  `event-assets` bucket.

## What this draft does

- Revokes EXECUTE on both helpers from `PUBLIC` and `anon`.
- Grants EXECUTE on both helpers to `authenticated` and `service_role`
  only.

## Does this break anything?

No.

- **Authenticated uploads (agency_owner / agency_admin / platform_admin)**:
  still work. The storage policies call `can_write_event_asset` and the
  caller is `authenticated`, which retains EXECUTE.
- **Storage RLS evaluation**: even if storage internally invokes the
  helper, `can_write_event_asset` is `SECURITY DEFINER`, so it executes
  with the function owner's privileges regardless of the caller.
- **Anon public reads of `event-assets` objects**: unaffected. Public
  read is governed by the `event_assets_public_read` policy on
  `storage.objects`, which does not call either helper.
- **Anon uploads**: still rejected (already were). They now also can't
  probe the helpers directly.
- **Malformed paths**: still return no row / `false`; never raise.

## Files

- `01_harden_event_asset_helper_grants.sql` — revoke + regrant.
- `02_verify.sql` — read-only verification, including the final grants
  matrix.

## Apply order on staging

1. Apply `migrations-draft-event-assets-storage/01_event_assets_bucket.sql`.
2. Apply `migrations-draft-venue-public-pages/01_venues_public_page_fields.sql`.
3. Apply `migrations-draft-venue-public-pages-storage/01_storage_policy_venue_assets.sql`.
4. Apply this draft's `01_*.sql`.
5. Run this draft's `02_verify.sql`.

## Confirmation

Nothing here is executed automatically. No production changes. No
service-role keys exposed. No frontend changes.
