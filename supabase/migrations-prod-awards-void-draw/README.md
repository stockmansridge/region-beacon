# Admin-only undo/void for award winner draws

Apply `apply.sql` via the Supabase SQL editor or your deploy pipeline.

## What it does

1. Adds `voided_at`, `voided_by`, `void_reason` to `public.event_award_draws`.
2. Adds `void_event_award_draw(p_draw_id uuid, p_reason text)` — admin-only
   (gated by `public.can_admin_event`), soft-voids a draw, never deletes.
3. Updates `get_event_award_draws_admin` to return the void columns so the
   admin UI can render a "Voided" badge.
4. Updates `get_event_awards_admin` so the per-award "latest winner" / "draw
   again" view ignores voided draws — the award card reverts to its
   pre-draw state and the admin can redraw.

The draw row is preserved for audit. Voided draws still appear in the draw
history table, flagged. Eligibility (`_event_award_eligible_passports`) does
not look at the draws table at all, so a previously-voided winner can be
drawn again with no extra changes.
