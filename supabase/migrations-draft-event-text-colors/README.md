# Event branding — simplified semantic colour roles

Adds four nullable hex columns to `public.event_branding` and surfaces them on
the public RPC `get_public_event_by_domain` so public passport pages can read
them via `useEventBrandingKeys`.

| Column | Role |
|---|---|
| `text_color` | Main text (headings, venue names, body copy, labels) |
| `muted_text_color` | Helper / metadata / secondary labels |
| `border_color` | Card borders & dividers |
| `primary_text_color` | Text/icons on the primary brand button |

All columns are nullable. When NULL, the frontend falls back to the curated
palette (or the legacy `primary_color`/`accent_color` pair). Existing events
keep rendering unchanged.

## Apply in order

1. `01_event_branding_text_colors.sql`
2. `02_extend_get_public_event_by_domain_text_colors.sql`

The Branding editor and the central theme helper (`src/lib/event-theme.ts`)
already tolerate the columns being absent — they degrade to palette values
and the save path retries without the new keys if the DB rejects them. This
means the frontend can be deployed before the migration is applied.

## Rollback

Re-apply
`supabase/migrations-draft-event-background/04_extend_get_public_event_by_domain_custom_background_colors.sql`
then run the rollback block at the bottom of `01_event_branding_text_colors.sql`.
