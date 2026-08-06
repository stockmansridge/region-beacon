# Welcome copy hero colour (`hero_body_color`)

Run `apply.sql` on production.

- Adds `public.event_branding.hero_body_color` (nullable `text`).
- Adds additive RPC `public.get_public_event_hero_body_color(text)` so the
  public landing page can read the value without recreating the wide
  `get_public_event_by_domain` return shape.

Until it is applied the app degrades safely: the branding editor's
"Welcome copy colour" write returns `PGRST204` (surfaced as a red toast) and
public pages render welcome copy in `--event-hero-fg`.
