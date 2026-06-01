# Event palette (frontend rollout)

## Status
- `01_event_branding_palette_key.sql` — APPLIED. Adds nullable
  `palette_key text` column + format check.
- `02_extend_get_public_event_by_domain_palette_key.sql` — **DRAFT**.
  Adds `palette_key` to the public anon RPC so visitors' browsers can
  read the active palette. Required for public pages to render the
  selected palette; until applied, public pages fall back to the legacy
  `primary_color`/`accent_color` flow (and admin Branding still works,
  because the admin reads `event_branding` directly).

## Frontend
- Palettes defined in `src/lib/event-palettes.ts`.
- Admin selector lives in `src/routes/admin.events.$eventId_.branding.tsx`
  (writes directly to `event_branding.palette_key`).
- Public pages (`/`, `/join`, `/venues`, `/map`, `/offers`) wrap their
  fetched event with `applyPaletteToEvent(...)` so the existing
  primary/accent flow automatically adopts palette colours once the RPC
  exposes `palette_key`.

## Apply order
1. (done) `01_event_branding_palette_key.sql`
2. (pending approval) `02_extend_get_public_event_by_domain_palette_key.sql`

No DNS / Cloudflare / Worker changes are required.
