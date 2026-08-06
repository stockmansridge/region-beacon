# Custom font uploads (Brand → Fonts)

Run `apply.sql` against production (SQL editor). It is idempotent.

Creates:
- `event-fonts` public storage bucket (2 MB cap, font mime types)
- `public.event_custom_fonts` table with public read + owner/admin writes
- `public.can_write_event_font(uuid)` / `can_write_event_font_object(text)` helpers
- storage.objects policies scoped to the `event-fonts` bucket

Storage path convention: `{agency_id}/{event_id}/font/{uuid}.{ext}`
