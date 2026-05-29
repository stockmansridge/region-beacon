# Event assets storage — draft

Draft only. **Do not execute against production.** Apply to staging only after review.

## What this adds

- New Storage bucket: `event-assets` (public read, 5 MB cap, png/jpeg/webp).
- Helper SQL functions in `public`:
  - `event_assets_path_parts(name)` — parses `{agency_id}/{event_id}/{logo|cover}/{filename}`.
  - `can_write_event_asset(name)` — returns true only for platform_admin or the agency_owner/agency_admin of the path's agency, and only when the event actually belongs to that agency.
- RLS policies on `storage.objects` scoped to `bucket_id = 'event-assets'`:
  - `event_assets_public_read` — SELECT for `anon` + `authenticated`.
  - `event_assets_insert_write` / `event_assets_update_write` / `event_assets_delete_write` — gated by `can_write_event_asset(name)`.

## What this does NOT change

- No changes to `public.event_branding` columns (`logo_path`, `cover_path` already exist).
- No changes to `public.events`, RPCs, or any non-storage RLS.
- No production data, no Stripe wiring, no visitor/passport changes.
- No frontend code is changed by this draft.

## Path convention (enforced by policies)

```
event-assets/{agency_id}/{event_id}/logo/{filename}
event-assets/{agency_id}/{event_id}/cover/{filename}
```

Anything outside this shape is rejected on insert/update/delete (parser returns no row → `can_write_event_asset` returns false).

## Frontend upload plan (NOT in this SQL draft; implemented in a later step)

On `/admin/events/$eventId/branding`:

1. Two upload widgets: **Logo** and **Cover image**.
2. Client-side validation **before** calling Storage:
   - logo: png/jpeg/webp, ≤ 1 MB recommended (5 MB hard cap server-side).
   - cover: png/jpeg/webp, ≤ 5 MB.
   - Reject other MIME types and oversize files with inline error.
3. Build the path as `${agency_id}/${event_id}/${kind}/${crypto.randomUUID()}.${ext}`.
   - Filenames are random — never trust the user filename for paths.
4. `supabase.storage.from('event-assets').upload(path, file, { contentType, upsert: false })`.
5. On success, `update public.event_branding set logo_path = path` (or `cover_path`) via the existing branding editor — RLS on `event_branding` is already in place.
6. After a successful replace, capture the **previous** `logo_path`/`cover_path` and call `supabase.storage.from('event-assets').remove([oldPath])` best-effort. If the delete fails (e.g., already gone), the new path is still written — orphans can be GC'd later by a maintenance job.
7. Render images via the **public** URL:
   `${SUPABASE_URL}/storage/v1/object/public/event-assets/${path}`.
   No signed URLs needed.

Surfaces that render the uploaded images:

- `/admin/events/$eventId/branding` (live preview while editing).
- `/admin/events/$eventId/preview` (admin preview).
- `/live/$subdomain` (public customer landing).
- Any `TrailLanding`-driven surface.

## Security considerations

- **`agency_staff` cannot upload/replace/delete.** Enforced in `can_write_event_asset` via the `role in ('agency_owner','agency_admin')` check.
- **Path traversal is impossible.** Storage object names cannot contain `..` segments meaningfully — the policy parses the name and matches the first two segments to the caller's agency and an existing event, then verifies `events.agency_id = path.agency_id`. Cross-tenant uploads are rejected.
- **MIME enforcement** happens both client-side (UX) and server-side (`allowed_mime_types` on the bucket).
- **SVG caveat.** SVG can carry inline scripts. We allow SVG **only for logos**, and only if the agency admin uploads it. Public read serves them via the `*.supabase.co` Storage domain — not the app origin — so any inline `<script>` runs in the Storage origin, not in the GetStampd app origin. If we ever want to be stricter, drop `image/svg+xml` from `allowed_mime_types` and the frontend whitelist.
- **Service role is never exposed.** All uploads go through the browser client under the authenticated user's session.
- **Public read is intentional.** The bucket is public so anonymous visitors on `/live/$subdomain` can render the logo and cover without an auth call. No PII lives in this bucket.
- **File size cap** at 5 MB server-side prevents abuse; per-kind limits enforced in the frontend.

## Rollback notes

To fully revert on staging:

```sql
drop policy if exists "event_assets_public_read"   on storage.objects;
drop policy if exists "event_assets_insert_write"  on storage.objects;
drop policy if exists "event_assets_update_write"  on storage.objects;
drop policy if exists "event_assets_delete_write"  on storage.objects;

drop function if exists public.can_write_event_asset(text);
drop function if exists public.event_assets_path_parts(text);

-- Bucket removal only if empty:
-- delete from storage.objects where bucket_id = 'event-assets';
-- delete from storage.buckets where id = 'event-assets';
```

`event_branding.logo_path` and `event_branding.cover_path` are untouched, so rolling back storage does not corrupt branding rows — at worst, paths point at deleted objects and the frontend renders the placeholder.

## Status

- [x] Plan drafted
- [x] SQL drafted (`01_event_assets_bucket.sql`)
- [x] Verification drafted (`02_verify.sql`)
- [ ] Reviewed
- [ ] Applied to staging
- [ ] Frontend upload UI implemented
