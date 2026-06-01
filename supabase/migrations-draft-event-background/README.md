# Event Page Background — draft migrations

Two additive, low-risk migrations. Apply in order.

1. `01_event_branding_page_background_key.sql`
   - Adds `event_branding.page_background_key text` (nullable).
   - Adds `event_branding_page_background_key_format` CHECK constraint
     (mirrors the existing `palette_key` shape: lowercase letters / digits /
     underscore, length 1–64).
   - No existing fields are renamed or removed.

2. `02_extend_get_public_event_by_domain_page_background_key.sql`
   - Drops + recreates `public.get_public_event_by_domain(text)` so the
     anonymous public-event RPC surfaces the new column.
   - SECURITY DEFINER, `set search_path = public`, anon/authenticated
     grants preserved. Publish gate (resolve_event_by_host kind='event',
     deleted_at filter) preserved.
   - The only return-shape change is adding `page_background_key text`
     at the end.

The frontend defaults to `clean_light` when `page_background_key` is
NULL, so the second migration is only required for the admin's chosen
background to actually paint on live public pages.
