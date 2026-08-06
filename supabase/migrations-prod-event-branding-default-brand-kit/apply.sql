-- Backfill: put every existing event on the current brand kit so all events
-- render through the same modern semantic-token design system.
--
-- Context: the app resolves the current token set only when
-- event_branding.brand_kit_key is set; rows created before this change had it
-- NULL and fell back to the older legacy palette path. This is data-only —
-- there is one renderer for all events.
--
-- Safety: only fills columns that are still NULL, so any colour an organiser
-- explicitly chose is preserved. Events already on a kit are untouched.

begin;

-- minimal_light kit values (keep in sync with src/lib/event-brand-kits.ts)
update public.event_branding set
  primary_color            = coalesce(primary_color,            '#111827'),
  accent_color             = coalesce(accent_color,             '#2563EB'),
  link_color               = coalesce(link_color,               '#2563EB'),
  page_background_color    = coalesce(page_background_color,    '#F8FAFC'),
  text_color               = coalesce(text_color,               '#111827'),
  muted_text_color         = coalesce(muted_text_color,         '#64748B'),
  border_color             = coalesce(border_color,             '#E2E8F0'),
  card_background_color    = coalesce(card_background_color,    '#FFFFFF'),
  card_text_color          = coalesce(card_text_color,          '#111827'),
  card_muted_text_color    = coalesce(card_muted_text_color,    '#64748B'),
  card_border_color        = coalesce(card_border_color,        '#E2E8F0'),
  button_primary_bg        = coalesce(button_primary_bg,        '#111827'),
  button_primary_fg        = coalesce(button_primary_fg,        '#FFFFFF'),
  button_secondary_bg      = coalesce(button_secondary_bg,      '#FFFFFF'),
  button_secondary_fg      = coalesce(button_secondary_fg,      '#111827'),
  nav_background_color     = coalesce(nav_background_color,     '#111827'),
  nav_fg_color             = coalesce(nav_fg_color,             '#FFFFFF'),
  nav_muted_color          = coalesce(nav_muted_color,          '#94A3B8'),
  nav_active_fg_color      = coalesce(nav_active_fg_color,      '#2563EB'),
  hero_bg_color            = coalesce(hero_bg_color,            '#111827'),
  hero_fg_color            = coalesce(hero_fg_color,            '#FFFFFF'),
  hero_accent_color        = coalesce(hero_accent_color,        '#2563EB'),
  brand_kit_key            = 'minimal_light',
  brand_kit_version        = 1
where brand_kit_key is null;

commit;
