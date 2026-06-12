# Draft migration — Brand Kits (Phase D)

Adds curated **Brand Kit** support to `public.event_branding`. Strictly
additive: no columns are dropped, no defaults set on existing rows, no
existing values rewritten. Events with `brand_kit_key IS NULL` continue
to resolve through the existing palette/background/colour fallbacks and
look identical to today.

## Files
1. `01_event_branding_brand_kit_columns.sql` — adds `brand_kit_key`,
   `brand_kit_version`, and the new semantic colour columns (hero,
   buttons, navigation, card border, link). All nullable + hex CHECK.
2. `03_event_branding_heading_body_columns.sql` — adds the explicit
   heading / body / muted split columns for page and card surfaces:
   `page_heading_color`, `page_body_color`, `page_muted_color`,
   `card_heading_color`, `card_body_color`, `card_muted_color`.
3. `02_extend_get_public_event_by_domain_brand_kit.sql` — drop+create of
   `get_public_event_by_domain` so the RPC returns the full Phase D
   shape (Brand Kit selection, heading/body/muted, buttons, nav, hero,
   link, card border) while keeping every previously returned column in
   place for fallback. SECURITY DEFINER + anon/authenticated EXECUTE
   grants preserved verbatim.

## Apply order
Run `01`, then `03`, then `02`. All are idempotent
(`add column if not exists`, `create or replace function`).

## Rollback
```sql
alter table public.event_branding
  drop column if exists brand_kit_key,
  drop column if exists brand_kit_version,
  drop column if exists hero_bg_color,
  drop column if exists hero_fg_color,
  drop column if exists hero_accent_color,
  drop column if exists button_primary_bg,
  drop column if exists button_primary_fg,
  drop column if exists button_secondary_bg,
  drop column if exists button_secondary_fg,
  drop column if exists nav_fg_color,
  drop column if exists nav_muted_color,
  drop column if exists nav_active_fg_color,
  drop column if exists card_border_color,
  drop column if exists link_color;
```
Re-apply the previous RPC definition from
`supabase/migrations-draft-event-card-text-colors/02_extend_get_public_event_by_domain_card_text_colors.sql`
to revert the return shape.
