## Goal

Let events that take place in a single venue / precinct (markets, expos, halls) skip per-venue addresses and instead show an uploaded event map (image or PDF) on the public site. The existing geolocated venue map keeps working when venues have coordinates.

## 1. Database (new draft migration `migrations-draft-event-map/`)

`01_event_branding_event_map.sql`
- Add to `public.event_branding`:
  - `event_map_path text` (storage object path in `event-assets` bucket)
  - `event_map_file_type text` (`image/png` | `image/jpeg` | `image/webp` | `application/pdf`)
  - `event_map_file_name text` (original filename for display)
- Confirm `venues.address/lat/lng` are already nullable — they are (see `supabase/migrations-draft/12_venues.sql`). No schema change needed there.

`02_save_event_map.sql` — `SECURITY DEFINER` RPC `save_event_map(p_event_id, p_path, p_mime, p_filename)` gated by `is_platform_admin() OR is_agency_admin(uid, agency_id)`. Also `clear_event_map(p_event_id)`.

`03_extend_get_public_event_by_domain.sql` — extend the existing public RPC to return the new `event_map_*` columns so the public page can read them with no extra round-trip.

`04_verify.sql` + `README.md`.

Storage: reuse existing `event-assets` bucket. Path pattern: `{agency_id}/{event_id}/map/{uuid}.{ext}`. Add a storage policy entry (or extend existing event-assets writer policy) so platform/agency admins can write under the `…/map/…` prefix. Public read already allowed on the bucket.

## 2. Admin UI

New component `src/components/event-map-section.tsx` rendered inside the event setup page (`src/routes/admin.events.$eventId.tsx`), under a card titled **Event map / site map** with the helper copy from the brief.

Features:
- File input accepting `.jpg,.jpeg,.png,.webp,.pdf` (max 5 MB image / 10 MB PDF).
- Upload via `supabase.storage.from('event-assets').upload(path, file)`.
- On success, call `save_event_map` RPC with the returned path + mime + original name.
- Display current map: image preview for images, "View current map" link for PDFs.
- Replace and Remove buttons (Remove calls `clear_event_map` and deletes the storage object).
- Surfaces full Supabase error message/details/hint/code (same `formatSupabaseError` pattern as FAQ section).

No changes needed to the venue form — `address/lat/lng` are already optional.

## 3. Public site

In `src/routes/live.$subdomain.map.tsx` (`PublicTrailMapPage`):

```ts
const mapReadyVenues = venues.filter(v => v.status === "active" && v.lat != null && v.lng != null);
const shouldShowVenueMap = mapReadyVenues.length > 0;

if (shouldShowVenueMap)        return <VenueMap venues={mapReadyVenues} />;
else if (event.event_map_path) return <UploadedEventMap event={event} />;
else                            return null; // no map section
```

`UploadedEventMap`:
- If `event_map_file_type` starts with `image/`: render `<img src={publicUrl} className="w-full rounded-xl border object-contain" />` wrapped in an `<a target="_blank">` so tapping opens full-size.
- If `application/pdf`: render a primary button `Open event map` linking to the public URL in a new tab.

Also update `src/components/public-event-nav.tsx` so the "Map" nav item shows when either `shouldShowVenueMap` OR `event_map_path` is present, and hides otherwise (mirrors the FAQ nav rule).

The `useEventMap` data already comes from the extended public RPC, so no extra fetch.

## 4. Acceptance verification

After SQL is applied, manually verify:
- Venue with no coords saves cleanly.
- Public `/map` hides when no coords + no upload.
- Public `/map` shows uploaded image responsively, PDF opens in new tab.
- Existing events with venue coords keep the existing geolocated map.

## Files

**New**
- `supabase/migrations-draft-event-map/01_event_branding_event_map.sql`
- `supabase/migrations-draft-event-map/02_save_event_map.sql`
- `supabase/migrations-draft-event-map/03_extend_get_public_event_by_domain.sql`
- `supabase/migrations-draft-event-map/04_verify.sql`
- `supabase/migrations-draft-event-map/README.md`
- `src/components/event-map-section.tsx`

**Edited**
- `src/routes/admin.events.$eventId.tsx` — mount `<EventMapSection />`
- `src/routes/live.$subdomain.map.tsx` — conditional render logic
- `src/components/public-event-nav.tsx` — show/hide Map nav item

## Out of scope
- Inline PDF viewer (PDFs open in a new tab as specified).
- Map zoom/lightbox beyond opening the image in a new tab.
- Backfilling existing events.
