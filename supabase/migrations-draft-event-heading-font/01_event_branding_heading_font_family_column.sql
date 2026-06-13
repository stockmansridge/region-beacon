-- Phase E — Event heading font: additive column on event_branding.
--
-- Holds an optional CSS font-family string for the public hero/event title.
-- When NULL, the public theme resolver falls back to the existing
-- font_family (body font), which in turn falls back to the platform default.

alter table public.event_branding
  add column if not exists heading_font_family text;

comment on column public.event_branding.heading_font_family is
  'Optional CSS font-family for the public event hero/title. NULL = inherit body font.';
