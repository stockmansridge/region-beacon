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
  primary_color            = coalesce(primary_color,            '#111111'),
  accent_color             = coalesce(accent_color,             '#2F6FE4'),
  link_color               = coalesce(link_color,               '#2F6FE4'),
  page_background_color    = coalesce(page_background_color,    '#FFFFFF'),
  text_color               = coalesce(text_color,               '#111111'),
  muted_text_color         = coalesce(muted_text_color,         '#64748B'),
  border_color             = coalesce(border_color,             '#E5E7EB'),
  card_background_color    = coalesce(card_background_color,    '#F8FAFC'),
  card_text_color          = coalesce(card_text_color,          '#111111'),
  card_muted_text_color    = coalesce(card_muted_text_color,    '#64748B'),
  card_border_color        = coalesce(card_border_color,        '#E5E7EB'),
  button_primary_bg        = coalesce(button_primary_bg,        '#111111'),
  button_primary_fg        = coalesce(button_primary_fg,        '#FFFFFF'),
  button_secondary_bg      = coalesce(button_secondary_bg,      '#F8FAFC'),
  button_secondary_fg      = coalesce(button_secondary_fg,      '#111111'),
  nav_background_color     = coalesce(nav_background_color,     '#FFFFFF'),
  nav_fg_color             = coalesce(nav_fg_color,             '#111111'),
  nav_muted_color          = coalesce(nav_muted_color,          '#64748B'),
  nav_active_fg_color      = coalesce(nav_active_fg_color,      '#2F6FE4'),
  hero_bg_color            = coalesce(hero_bg_color,            '#F8FAFC'),
  hero_fg_color            = coalesce(hero_fg_color,            '#111111'),
  hero_accent_color        = coalesce(hero_accent_color,        '#2F6FE4'),
  brand_kit_key            = 'minimal_light',
  brand_kit_version        = 1
where brand_kit_key is null;

commit;
