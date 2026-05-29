# migrations-draft-visitor-registration

Draft only. **Do not execute from this folder.** Apply to staging via the
Supabase SQL editor after review. Production must not be touched.

## Files

- `01_register_visitor_publishing_gate.sql` — patches
  `public.register_visitor` with server-side publishing + terms gates.
- `02_verify.sql` — manual verification scenarios A–E. Read the header
  comments and set the `\set` variables to a real staging fixture event +
  email before running.

## What changes

`public.register_visitor` gains four server-side checks at the top of the
function body, in order:

1. Event row exists and `deleted_at IS NULL` (else `event_not_available`).
2. `public.event_is_publishable(_event_id) = true` (else `event_not_available`).
3. `events.current_terms_version_id IS NOT NULL` (else `terms_not_configured`).
4. `_accepted_terms_version_id = events.current_terms_version_id`
   (else `terms_version_invalid`).

All four raise `SQLSTATE P0001` so PostgREST surfaces them with a stable
shape the frontend can map to user-facing copy. `event_not_available` is
intentionally opaque — callers cannot probe whether the block was
lifecycle, domain, or billing.

## What does NOT change

- Function name and full argument list (positional and types).
- Return signature: `(passport_id uuid, access_token text)`.
- `language plpgsql / security definer / set search_path = public`.
- Raw access token returned **once**; only `access_token_hash` (SHA-256)
  persisted on `public.passports`.
- Visitor upsert on `(event_id, email)`.
- Passport upsert on `(event_id, visitor_id)` — token rotates on re-register.
- Consent ledger writes: `terms` + `privacy` always, `marketing` only when
  `_marketing_opt_in` is true.
- `EXECUTE` grants to `anon, authenticated`.
- `get_passport_by_token`, `update_marketing_consent`, `redeem_checkin`,
  `passport_token_hash`, `event_is_publishable` — untouched.

No tables, columns, indexes, RLS policies, grants, or other RPCs are
modified.

## Apply order (when approved)

1. Review `01_register_visitor_publishing_gate.sql`.
2. In Supabase SQL editor on **staging**, run the file as one block.
3. Run `02_verify.sql` scenario-by-scenario against a fixture event.
   Flip `events.status`, the primary `event_domains.status`,
   `event_activations` (via `platform_set_event_activation`), and
   `events.current_terms_version_id` between scenarios as the comments
   describe.
4. Do not promote to production in this step.

## Rollback

The patch is a single `CREATE OR REPLACE FUNCTION` against an existing
function. To roll back, re-apply the prior definition from
`supabase/migrations-draft/33_rpcs_visitor.sql` (the `register_visitor`
block, lines 32–131). Same signature, same return type, same grants — no
dependent objects need adjusting.

Cleanup steps for any test rows created during verification are commented
at the bottom of `02_verify.sql`.

## Confirmation

Nothing in this folder has been executed. No schema, RLS, storage, or
production changes were made.
