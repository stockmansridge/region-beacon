# Draft: Configurable venue/location terminology

Status: DRAFT — nothing executed. No schema, RLS, storage, or production
changes have been applied.

## Why

GetStampd is not only for wine trails. The customer-facing word "Wineries"
must be configurable per event. A food festival might say "Restaurants", a
tourism trail "Stops", a market "Exhibitors".

The underlying database table is and remains `public.venues`. Only
**customer-facing wording** is configurable.

## Proposed schema change (`01_event_branding_venue_labels.sql`)

Add two columns to `public.event_branding`:

| Column                  | Type | Default  | Nullable | Notes |
|-------------------------|------|----------|----------|-------|
| `venue_label_singular`  | text | `Venue`  | NOT NULL | 1–40 chars, trimmed, non-empty |
| `venue_label_plural`    | text | `Venues` | NOT NULL | 1–40 chars, trimmed, non-empty |

Validation enforced by CHECK constraints:

- `length(btrim(value)) between 1 and 40`
- `value = btrim(value)` (no leading/trailing whitespace)

Frontend must mirror this with the same Zod rules before submit:

```ts
const labelSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(40, "Max 40 characters");
```

UI fallback when `event_branding` row is missing or column is null:
`Venue` / `Venues`.

## RLS

No new policies. Existing `event_branding` policies (read by event members,
write by `platform_admin` / `agency_owner` / `agency_admin`) cover the new
columns automatically. `agency_staff` remains read-only on the row.

## Affected frontend surfaces (Step 2 — not changed yet)

Customer-facing reads of plural label:
- `src/components/trail-shell.tsx` — bottom nav `Wineries` label
- `src/routes/demo.wineries.tsx` — page heading + filter copy
- `src/routes/demo.wineries.$venueId.tsx` — back link
- `src/routes/demo.rewards.tsx` — "Visit N wineries" copy
- `src/routes/demo.offers.tsx` — any "wineries" copy
- `src/routes/live.$subdomain.tsx` (and `live.$subdomain.join.tsx`) — public landing
- `src/routes/admin_.events.$eventId.preview.tsx` — admin preview
- `src/routes/admin.events.$eventId_.branding.tsx` — branding preview pane
- Future real passport pages

Singular label uses (lower priority):
- detail page headings ("About this venue/winery/restaurant")
- "Visited 1 venue" microcopy

Component prop plan:
- `TrailShell` gains optional `venueLabelPlural?: string` (defaults to "Venues") and forwards to `BottomNav`.
- `TrailLanding` (live + preview) accepts `venueLabelSingular`/`venueLabelPlural` and uses them in CTA / counts / section titles.
- Demo screens hardcode `venueLabelPlural="Wineries"` for the Cargo Road sample.
- Live/admin pages read `event_branding.venue_label_singular` / `_plural`, falling back to `Venue` / `Venues`.

## Admin editing (Step 3 — not built yet)

Add a "Customer wording" card to
`src/routes/admin.events.$eventId_.branding.tsx`:

- Field: Singular venue label (text, required, max 40, trimmed)
- Field: Plural venue label   (text, required, max 40, trimmed)
- Help text: "Use *Wineries* for a wine trail, *Restaurants* for a food
  festival, *Stops* for a tourism trail."
- Permission: editable by `platform_admin`, `agency_owner`, `agency_admin`;
  read-only for `agency_staff`.
- Validation: Zod schema mirroring the CHECK constraints.

## Rollback

```sql
alter table public.event_branding
  drop constraint if exists event_branding_venue_label_singular_chk,
  drop constraint if exists event_branding_venue_label_plural_chk,
  drop column if exists venue_label_singular,
  drop column if exists venue_label_plural;
```

Safe to roll back: defaults populate existing rows; dropping the columns
removes wording only and does not touch `venues` data.

## Confirmation

- Draft SQL written to `01_event_branding_venue_labels.sql` and `02_verify.sql`.
- Nothing executed. No migrations run, no RLS changed, no storage touched.
- Frontend not modified in this step.
- Production untouched. The `venues` table is NOT renamed.
