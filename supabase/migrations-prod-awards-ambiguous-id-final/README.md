# Production fix — awards ambiguous `id` error

**Symptom (Prizes page):**
> Could not load prizes: column reference "id" is ambiguous · It could refer to
> either a PL/pgSQL variable or a table column. · code 42702

**Root cause:** `public.get_public_event_awards` uses a `RETURNS TABLE (id uuid, ...)` shape. Those OUT parameters become PL/pgSQL variables. When combined with the record variables inside `public._event_award_eligible_passports`, PostgreSQL raises 42702 on any unqualified `id` reference.

**Fix:** Recreate both functions with `#variable_conflict use_column` at the top of each PL/pgSQL body so the planner prefers table columns, and rename/alias every subquery column that could collide. This migration also gracefully handles both schemas (with and without the optional `draw_date` column) so it can run on any environment.

## Apply

Open the Supabase SQL editor and run:

```
supabase/migrations-prod-awards-ambiguous-id-final/apply.sql
```

Safe to re-run.
