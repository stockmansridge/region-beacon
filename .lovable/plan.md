# Awards / Prizes System

A large multi-part feature spanning database, RPCs, admin UI, public passport UI, and navigation. I'll deliver it as draft SQL (not auto-applied) plus full frontend wiring against those RPC names.

## Part A — Draft SQL Migrations

New folder: `supabase/migrations-draft-event-awards/`

1. `01_event_awards.sql` — `event_awards` table + indexes + updated_at trigger + GRANTs + RLS (deny-all; access via RPCs only).
2. `02_event_award_draws.sql` — `event_award_draws` table + indexes + GRANTs + RLS (deny-all).
3. `03_storage_event_awards.sql` — note that we reuse the existing `event-assets` bucket (see `src/lib/event-assets.ts`) with path `{agency_id}/{event_id}/awards/{uuid}.{ext}`. Adds a storage RLS policy allowing agency admins to write under that prefix (mirrors existing event asset policies).
4. `04_admin_rpcs.sql` — `get_event_awards_admin`, `save_event_award`, `delete_event_award`, `draw_event_award_winner`, `get_event_award_draws_admin`.
5. `05_public_rpcs.sql` — `get_public_event_awards`.
6. `06_verify.sql` — sanity selects.
7. `README.md` — review/apply instructions; lists that SQL must be applied manually before the UI works.

Eligibility logic inside RPCs:
- Points: sum from existing event points source of truth (will inspect `passport_stamps` / leaderboard RPC and reuse the same calc).
- All-locations: distinct venue checkins for passport `>=` count of active, non-deleted venues for the event, AND active venue count `> 0`.
- Excludes soft-deleted passports if `passports.deleted_at` exists.

## Part B — Frontend (admin)

Files:
- `src/lib/event-awards.ts` — TS types matching RPC return shapes; upload helper reusing `uploadEventAsset` pattern but under `awards/` subfolder, or extend `EventAssetKind` to include `"award"`. I'll add a small helper `uploadAwardImage` rather than mutate the existing kind enum, to avoid touching the existing validator.
- `src/components/event-awards-section.tsx` — Admin tab content: list, create/edit dialog (with image upload), draw-winner confirm dialog, draw-result display, draw history table.
- `src/routes/admin.events.$eventId.tsx` — add `"awards"` to `EventTabKey`, add tab entry, render `<EventAwardsSection />`.

## Part C — Frontend (public)

Files:
- `src/components/public-event-awards.tsx` — shared awards list rendering (cards with eligibility badges, entrant counts, copy variants for each state).
- `src/routes/live.$subdomain.awards.tsx` — tenant-hosted route.
- `src/routes/awards.tsx` — root-hosted shim mirroring existing FAQ/offers pattern.
- `src/components/public-event-nav.tsx` — add Awards nav item (desktop + mobile), hidden when no active awards (uses a small `useEventHasAwards` hook).
- `src/lib/use-event-has-awards.ts` — lightweight hook calling a cheap count.
- `src/routeTree.gen.ts` — regenerated entries for new routes (manual edits since the tree is committed).

## Part D — Behaviour details

- Confirm-modal copy and "Draw again" warning per spec.
- Soft-delete in admin; never hard-delete.
- Public RPC never returns winner PII.
- All RPC calls go through the existing supabase browser client (admin RPCs check `agency_id` server-side via SECURITY DEFINER).

## Part E — Out of scope (unchanged)

Points ledger, leaderboard, check-in flow, passport claim, existing tabs.

## Technical notes

- RPC names (must match exactly in SQL and frontend):
  - `get_event_awards_admin`
  - `save_event_award`
  - `delete_event_award`
  - `draw_event_award_winner`
  - `get_event_award_draws_admin`
  - `get_public_event_awards`
- Storage path: `{agency_id}/{event_id}/awards/{uuid}.{ext}` in `event-assets` bucket. Images jpg/jpeg/png/webp, 5 MB cap.
- SQL is delivered as a **draft** under `supabase/migrations-draft-event-awards/`. The user must apply it (the project's convention — all other features ship the same way per `supabase/migrations-draft-*/README.md`). The UI will surface real RPC errors if SQL hasn't been applied yet.
- Typecheck will pass; runtime requires the SQL to be applied.

## Deliverables on completion

Delivery report listing SQL files, changed admin/public files, RPC names, storage path, and the manual-apply instruction.
