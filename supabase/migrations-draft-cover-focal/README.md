# Cover image focal-point (crop window)

Adds `cover_focal_x` and `cover_focal_y` (smallint, 0–100) to
`public.event_branding`. Public passport pages apply these values as
`object-position` percentages on the hero `<img>` so organisers can
reposition a cover image that's larger than the hero window instead of
having it stretched or centre-cropped.

## Apply order

1. `01_event_branding_cover_focal.sql` — adds the columns + range checks.
2. `02_extend_get_public_event_by_domain_cover_focal.sql` — extends the
   public RPC so live pages receive the values.

Both are idempotent-ish (uses `if not exists` / `create or replace`).
The frontend already tolerates missing columns — before the migration
is applied, focal values simply fall back to `50/50` (centered).

Merge the column list in step 2 with whatever your production
`get_public_event_by_domain` currently returns before executing.
