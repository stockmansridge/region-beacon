# Hotfix: void_event_award_draw RPC not found (PGRST202)

The frontend (`src/lib/event-awards.ts`) calls:

```ts
supabase.rpc("void_event_award_draw", {
  p_draw_id: drawId,
  p_reason: reason || null,
})
```

PostgREST returned **PGRST202** ("Could not find the function
public.void_event_award_draw(p_draw_id, p_reason) in the schema cache"),
which means either:

1. The original `migrations-prod-awards-void-draw/apply.sql` was never run
   in production, OR
2. An older overload exists with different parameter names, OR
3. PostgREST's schema cache is stale.

## How to apply

Run `apply.sql` in the Supabase SQL editor. It is idempotent and:

1. Re-adds the `voided_at` / `voided_by` / `void_reason` columns if missing.
2. **Drops every existing `public.void_event_award_draw` overload** so the
   signature is unambiguous.
3. Recreates the function with the canonical signature:
   `public.void_event_award_draw(p_draw_id uuid, p_reason text default null)`.
4. Re-grants `execute` to `authenticated`.
5. Issues `notify pgrst, 'reload schema'` so PostgREST picks up the new
   function immediately (no restart needed).
6. Runs a verification `select` — confirm exactly one row is returned with
   arguments `p_draw_id uuid, p_reason text DEFAULT NULL::text`.

After running, retry **Awards → Undo draw** in the admin UI. The PGRST202
error should be gone; the draw row stays visible with a "Voided" badge.

> Note: the read RPCs (`get_event_award_draws_admin`,
> `get_event_awards_admin`) from the original migration are unchanged and
> intentionally not re-applied here — this hotfix only restores the missing
> write RPC.
