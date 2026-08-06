# Prod fix — event_branding cover focal columns

Fixes the branding editor 400s:

```
PGRST204 — Could not find the 'cover_focal_x' column of 'event_branding' in the schema cache
```

## Apply

Run `apply.sql` in the Supabase SQL editor for project `kyjwifumacnrpgyextzz`.
It is idempotent: columns are added only when absent, existing rows are
backfilled to `50` (centre), and 0–100 range checks are (re)created.

Focal values are **0–100 percentages** (see `src/lib/cover-focal.ts`), applied
as CSS `object-position` on the hero image.

## Optional follow-up (public pages)

`public.get_public_event_by_domain` must also return `cover_focal_x` /
`cover_focal_y` for the focal crop to apply on live public pages. Until then
public pages simply centre the cover (50/50) — no errors. To extend it safely,
dump the currently deployed definition and add the two columns to both the
`returns table (...)` list and the `select`:

```sql
select pg_get_functiondef(oid)
from pg_proc
where proname = 'get_public_event_by_domain';
```

Do not blind-apply the draft in `supabase/migrations-draft-cover-focal/02_*.sql`
— production returns more columns than that draft.
