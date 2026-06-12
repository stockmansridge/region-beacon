# Event branding — separate card-surface text colours

Adds two nullable hex columns to `public.event_branding` and surfaces them on
the public RPC `get_public_event_by_domain` so public passport pages can read
them via `useEventBrandingKeys`.

| Column | Role |
|---|---|
| `card_text_color` | Headings + body inside cards (venue list, FAQ, etc.) |
| `card_muted_text_color` | Helper / metadata text inside cards |

Both columns are nullable. When NULL the frontend keeps using the existing
`text_color` / `muted_text_color` for both page and card surfaces, so existing
events render identically until an organiser overrides the card-specific
values.

## Why split?

A dark page background combined with a light card background (or vice versa)
makes it impossible to pick a single "main text colour" that stays readable on
both surfaces. The Branding editor now exposes Page text / Page muted text
and Card text / Card muted text as separate fields and warns when the chosen
colours fail WCAG AA on either surface.

## Apply in order

1. `01_event_branding_card_text_colors.sql`
2. `02_extend_get_public_event_by_domain_card_text_colors.sql`

The Branding editor and `src/lib/event-theme.ts` already tolerate the columns
being absent — they degrade to the page-surface values and the save path
retries without the new keys if the DB rejects them. The frontend can be
deployed before the migration is applied.

## Rollback

Re-apply
`supabase/migrations-draft-event-text-colors/02_extend_get_public_event_by_domain_text_colors.sql`
then run the rollback block at the bottom of `01_event_branding_card_text_colors.sql`.
