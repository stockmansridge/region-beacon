# Draft Migrations — DO NOT EXECUTE

These SQL files are **drafts for review only**. They implement Revision 3 of
the V1 schema proposal for the staging project `region-beacon-staging`
(`https://kyjwifumacnrpgyextzz.supabase.co`).

## Rules

- Drafts live in `supabase/migrations-draft/`, NOT `supabase/migrations/`.
  The Supabase CLI and Lovable migration runner only pick up files in
  `supabase/migrations/`. Moving a file there is the explicit "apply" step.
- Target: **staging only**. Never run any of these against production.
- No `service_role` or `sb_secret` key is required to review or run these.
  When eventually applied, they run as the database owner via standard
  migration tooling — not from the browser, not from frontend code.
- Files are numbered to match the migration order in Revision 3 (§5).
  Apply strictly in numeric order.

## Review checklist (per Revision 3)

- Pass A migrations (04–23): `CREATE TABLE` + GRANT + `ENABLE RLS` +
  deny-all policy in the same file.
- Pass B migrations (25–29): only `DROP POLICY` + `CREATE POLICY`.
- Helpers (24) created AFTER all referenced tables exist.
- `audit_logs` exists at step 07 — before any audit trigger in step 30.
- Audit triggers in 30 must NOT attach to `audit_logs` itself
  (recursive audit avoided).
- All `SECURITY DEFINER` functions set `search_path = public` explicitly.
- No `anon` grants. Visitor surfaces use definer RPCs only.
- `checkins` INSERT denied for `anon` and `authenticated`; only
  `redeem_checkin` writes.

## Rollback

See `docs/migrations-draft/ROLLBACK.md`.
