# Prod hotfix v2 — `draw_event_award_winner` ambiguous `drawn_at`

## Status

The v1 fix in `../migrations-prod-awards-draw-ambiguous-fix/apply.sql` was
authored but **never executed against production**. The live function still
contains the `RETURNING drawn_at INTO drawn_at` form and the Awards → Draw
winner button keeps returning:

```
column reference "drawn_at" is ambiguous … (SQLSTATE 42702)
```

## Why a v2?

This version is **idempotent and overload-safe**:

1. Pre-inspection `SELECT` against `pg_proc` lists every existing
   `public.draw_event_award_winner` overload so the operator can confirm
   what is about to be dropped.
2. A `DO $$ … $$` block drops **every** overload by identity-argument
   signature (not just the `(uuid)` one) so no stale duplicate survives.
3. The function is re-created from scratch with:
   - local timestamp renamed to `v_drawn_at_ts` (never `drawn_at`)
   - `INSERT ... AS ead ... RETURNING ead.id, ead.drawn_at`
   - OUT columns aliased in the final `RETURN QUERY SELECT`
   - `security definer`, `set search_path = public`, signature
     `(p_award_id uuid)` preserved
   - `grant execute ... to authenticated`
4. Post-inspection `SELECT` re-runs so the operator can confirm exactly
   one overload remains and the body no longer contains the ambiguous
   pattern.

## Apply

Run `apply.sql` against the production Supabase DB (same channel used for
the other `migrations-prod-*` folders — e.g. the SQL editor in the
Supabase dashboard, or `psql` with the production connection string).

The script is wrapped in a single `BEGIN; … COMMIT;` so a failure rolls
back cleanly. It is safe to re-run.

## Verify

1. Inspect the post-`COMMIT` `SELECT` output: exactly one row, arguments
   `p_award_id uuid`. The `definition` column must contain
   `RETURNING ead.id, ead.drawn_at INTO v_new_id, v_drawn_at_ts` and must
   **not** contain `RETURNING drawn_at INTO drawn_at`.
2. In the admin UI: open an event with at least one eligible participant,
   click **Awards → Draw winner**. The modal should progress from
   "Drawing…" to the winner card; the draw history table should refresh
   with the new row. No 42702 error in the toast.

## Note to Lovable agent

I cannot execute DDL against the production Postgres from the sandbox —
no `psql` socket, no Supabase Management API token, and no admin RPC
that runs raw SQL. The Lovable Cloud auto-migration tool is also not
available because this project uses an externally-managed Supabase
(`GETSTAMPD_*` secrets), not Lovable-managed Cloud. The user must run
`apply.sql` via the same channel they use for the other
`migrations-prod-*` folders.
