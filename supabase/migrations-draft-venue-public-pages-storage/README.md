# Venue Asset Storage Policy (draft only)

Draft only. **Do not execute.**

## Purpose

The existing `event-assets` bucket and its RLS policies were drafted in
`supabase/migrations-draft-event-assets-storage/` and enforce a strict
4-segment path:

```
{agency_id}/{event_id}/{logo|cover}/{filename}
```

This is enforced by `public.event_assets_path_parts(name)` and
`public.can_write_event_asset(name)`. Any 6-segment venue path such as

```
{agency_id}/{event_id}/venues/{venue_id}/logo/{uuid}.png
{agency_id}/{event_id}/venues/{venue_id}/cover/{uuid}.png
```

…fails the path parser (`s3 in ('logo','cover')` check), so
`can_write_event_asset` returns `false` and uploads are rejected by RLS.

**Compatibility result:** current storage RLS does **NOT** allow venue
asset paths. A draft policy update is required before the admin venue
public-profile editor can accept logo / cover uploads.

## What this draft changes

Extends `public.event_assets_path_parts` to recognise an optional
`venues/{venue_id}` middle segment, and tightens
`public.can_write_event_asset` so a venue upload additionally requires
that the venue row exists, belongs to the same event, and isn't soft
deleted.

It **does not**:

- create a new bucket
- change `event-assets` MIME types or size cap (5 MB) — the editor
  enforces a smaller 1 MB cap for logos client-side
- change any non-storage RLS
- change the existing event-level `{agency}/{event}/{kind}/{file}` paths;
  those continue to work unchanged
- grant any new privileges to `anon`
- grant `agency_staff` write access

Path conventions supported AFTER this draft:

```
event-assets/{agency_id}/{event_id}/{logo|cover}/{filename}              -- existing event branding
event-assets/{agency_id}/{event_id}/venues/{venue_id}/{logo|cover}/{file} -- new venue assets
```

## Files

- `01_storage_policy_venue_assets.sql` — extends path parser + write gate.
- `02_verify.sql` — read-only smoke checks.

## Apply order on staging

1. Apply `supabase/migrations-draft-venue-public-pages/01_venues_public_page_fields.sql`
   first (adds the venue columns the editor reads/writes).
2. Then apply this draft.
3. Run `02_verify.sql` to confirm both old and new paths resolve correctly.

## Confirmation

Nothing here is executed automatically. No production changes.
