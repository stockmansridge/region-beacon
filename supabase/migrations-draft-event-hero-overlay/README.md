# Hero overlay (Branding) — draft migration

Adds two nullable columns to `public.event_branding` so admins can
customise the fade painted over the public hero image, and extends the
`get_public_event_by_domain` RPC to surface them.

## Files (apply in order)

1. `01_event_branding_hero_overlay.sql`
   - `hero_overlay_color   text     null`  (hex `#RRGGBB`, validated)
   - `hero_overlay_opacity smallint null`  (0..100, validated)
2. `02_extend_get_public_event_by_domain_hero_overlay.sql`
   - Drops + recreates the public read RPC with two new return columns,
     identical security posture (security definer, set search_path,
     grants to anon/authenticated).

## Safety

- Both columns are nullable with no default. Existing events render the
  legacy gradient overlay unchanged when both values are NULL.
- Check constraints enforce hex format and range — bad data is rejected
  at the DB layer.
- The branding editor already saves these columns when present and
  silently falls back to the rest of the payload when the columns are
  absent, so deploying the UI before the migration is safe.

## Rollback

```sql
alter table public.event_branding drop column if exists hero_overlay_opacity;
alter table public.event_branding drop column if exists hero_overlay_color;
```
Then re-apply
`supabase/migrations-draft-event-text-colors/02_extend_get_public_event_by_domain_text_colors.sql`
to restore the previous RPC signature.
