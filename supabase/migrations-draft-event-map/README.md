# Event map / site map (draft migrations)

Adds support for uploading an event-level site map (image or PDF) that
displays on the public map route when no venues have coordinates.

## Apply order

1. `01_event_branding_event_map.sql` — add nullable columns + CHECK constraint.
2. `02_extend_event_assets_storage.sql` — widen `event-assets` bucket
   (PDF + 10 MB) and extend the storage path helper to accept `kind='map'`.
   Writer gate is unchanged.
3. `03_save_event_map.sql` — `save_event_map` / `clear_event_map` RPCs
   (`SECURITY DEFINER`, platform-admin OR agency-admin gate).
4. `04_extend_get_public_event_by_domain.sql` — extend the public RPC to
   surface the three new columns.
5. `05_verify.sql` — sanity checks.

## Storage path

```
event-assets/{agency_id}/{event_id}/map/{uuid}.{ext}
```

## Rollback

```sql
alter table public.event_branding
  drop column if exists event_map_path,
  drop column if exists event_map_file_type,
  drop column if exists event_map_file_name;
```

Re-apply `migrations-draft-event-assets-storage/01_event_assets_bucket.sql`
to restore the original bucket MIME list / size and the original
`event_assets_path_parts` helper. Re-apply
`migrations-draft-event-background/04_extend_get_public_event_by_domain_custom_background_colors.sql`
to restore the previous public RPC signature.
