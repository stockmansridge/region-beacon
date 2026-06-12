# Prod fix — `draw_event_award_winner` ambiguous `drawn_at`

**Symptom (admin Awards → Draw winner):**

```
column reference "drawn_at" is ambiguous. It could refer to either a
PL/pgSQL variable or a table column. (SQLSTATE 42702)
```

**Cause.** The function declares `RETURNS TABLE (... drawn_at timestamptz)`.
That output column is an implicit PL/pgSQL variable inside the body,
and it collides with `event_award_draws.drawn_at` in the
`INSERT ... RETURNING drawn_at` clause.

**Fix.** `apply.sql` re-creates `public.draw_event_award_winner(uuid)` with:

- The local timestamp variable renamed to `v_drawn_at_ts`.
- The `INSERT` aliased as `ead`, and `RETURNING ead.id, ead.drawn_at`
  so the column reference is unambiguous.
- The final `RETURN QUERY SELECT` rows aliased to the OUT column names
  so nothing in the SELECT can be re-interpreted as a table column.

No behaviour change. Same input, same output shape, same single row.

## Apply

Run `apply.sql` against the production Supabase database (same pipeline
used by the other `migrations-prod-*` folders). No rollback needed —
the function can simply be re-created from the previous draft in
`migrations-draft-event-awards/04_admin_rpcs.sql` if anything is wrong.

## Verify

1. Open an event with at least one eligible participant in the admin
   Awards tab.
2. Click **Draw winner** → modal should progress from "Drawing…" to the
   winner card; the draw history below should refresh with the new row.
3. No `42702` error should appear in the admin toast or modal.
