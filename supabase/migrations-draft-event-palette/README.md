# Event branding palette — audit + draft

Draft only. DO NOT EXECUTE without approval. No frontend palette
selector has been wired up yet — that is the follow-up once this column
is approved.

## Branding storage audit
`public.event_branding` (one row per event) currently stores:

| Column | Used for |
| --- | --- |
| `logo_path`, `cover_path` | Event imagery (kept as-is) |
| `primary_color`, `accent_color` | Two-colour scheme used by current public pages |
| `font_family` | Reserved |
| `welcome_copy` | Hero copy |
| `terms_url` | Legacy external terms link |
| `venue_label_singular/plural` | Visitor-facing venue terminology |

There is no existing field for a curated multi-colour palette key. The
two `*_color` fields are not enough to express background + card +
heading + primary + accent + visited as a coordinated set.

## Proposed minimal change
Add a single nullable column:

```
event_branding.palette_key text
```

- NULL = keep current behaviour (primary_color + accent_color + defaults).
- Non-NULL = one of the curated keys from `src/lib/event-palettes.ts`
  (to be authored when this migration is approved).
- CHECK constraint restricts to `^[a-z][a-z0-9_]{2,40}$` to keep values
  safe to embed in CSS class names / data attributes.

## Why not store the full palette in JSON
A `palette_key` keeps the source of truth in code, so palette tweaks ship
as a frontend change (no SQL, no per-event re-save). Custom per-event
overrides can be layered on top of `primary_color`/`accent_color` later
without changing this column.

## Follow-up work (NOT in this draft)
1. `src/lib/event-palettes.ts` — curated palette config:
   `classic_vineyard`, `modern_navy`, `festival_bright`,
   `premium_wine`, `coastal_trail`, `orchard_country`.
2. Branding editor: palette picker UI with swatches + live preview;
   writes `palette_key` via the existing branding upsert.
3. Public shell provider that reads `palette_key` from the event
   branding RPC and sets CSS variables (background, card, heading,
   primary, accent, visited, nav-active) consumed by every public route.
4. Public RPC: confirm `get_public_event_by_domain` projects
   `palette_key` so visitors load the right theme.
5. Contrast guardrails — palettes are author-curated, so we restrict
   to the curated set rather than allowing free-form hexes here.

## Rollback
See trailing block in `01_event_branding_palette_key.sql`.
