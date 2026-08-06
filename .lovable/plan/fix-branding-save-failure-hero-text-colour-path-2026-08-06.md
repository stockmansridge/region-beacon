# Fix branding save failure + hero text colour path

## What's wrong

**1. Branding save/load 400s (PGRST204)**
The branding editor's data contract includes `cover_focal_x` / `cover_focal_y`, but those columns don't exist in the production database. A draft migration was written (`supabase/migrations-draft-cover-focal/01_event_branding_cover_focal.sql`) but never applied, so PostgREST rejects both the read and the PATCH.

Confirmed focal-value range: **0–100 percentages** (`src/lib/cover-focal.ts` clamps 0–100 and emits CSS `object-position` percentages; the editor rounds to an integer 0–100 before saving). So the migration uses 0–100 defaults of 50, matching the draft.

This project uses a self-managed Supabase project (`kyjwifumacnrpgyextzz`) with no direct DB tooling here, so the SQL is delivered as a file for you to run — same pattern as the previous `migrations-prod-*` fixes.

**2. Hero text colour**
Public pages (`live.$subdomain.index.tsx`, `passport.$token.tsx`) already use `var(--event-hero-fg, var(--event-primary-fg))`. The shared hero component `src/components/trail-landing.tsx` does not: the hero block sets `text-[var(--event-primary-fg,#F6EFE2)]` on the container and the `<h1>` inherits it, so the editor preview, full preview and the `/t/:agency/e/:event` landing page ignore the saved Hero Text colour. That's the root cause of the white title.

## Changes

### Migration (run manually in Supabase SQL editor)
`supabase/migrations-prod-event-branding-cover-focal/apply.sql`
- `add column if not exists cover_focal_x/y numeric not null default 50` (no duplicate columns if partially applied)
- drop/recreate `event_branding_cover_focal_x_check` / `_y_check` range checks 0–100
- backfill any NULLs to 50 (defensive, in case the draft added them nullable)
- `notify pgrst, 'reload schema';`

### Frontend
- `src/components/trail-landing.tsx` — hero `<h1>` (and pitch paragraph) get an explicit `color: var(--event-hero-fg, var(--event-hero-text, var(--event-primary-fg, #ffffff)))`, replacing the inherited white/primary-fg. Eyebrow keeps `--event-hero-accent`; logo/badge keep their own tokens, so hero elements stay independently themable.
- `src/routes/admin.events.$eventId_.branding.tsx` — surface the real Supabase error (`message`, `details`, `hint`, `code`) in the save banner instead of the generic string, and stop the blind retry when the error is a schema error (`PGRST204` / `42703`): retry only once for the known optional-column fallback, otherwise fail fast with the real message.

Nothing is removed from the frontend contract; the database is brought up to match.

## Verification
After you run the SQL: reload the branding editor (read succeeds), Save, Save & return, reload to confirm focal + `#41372E` hero colour persist and unrelated fields are untouched, then check the full preview and the public landing page render the same hero colour. Legacy events with no `hero_fg_color` still fall back through the token chain to white.
