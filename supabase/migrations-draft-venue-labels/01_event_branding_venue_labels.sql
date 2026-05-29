-- 01_event_branding_venue_labels.sql
-- Draft only. Do not execute.
--
-- Adds configurable customer-facing terminology for the venue/location
-- section to event_branding. The underlying `venues` table is NOT renamed;
-- only customer-facing wording changes.

alter table public.event_branding
  add column if not exists venue_label_singular text not null default 'Venue',
  add column if not exists venue_label_plural   text not null default 'Venues';

-- Trim whitespace, enforce non-empty, cap at 40 characters.
alter table public.event_branding
  drop constraint if exists event_branding_venue_label_singular_chk,
  drop constraint if exists event_branding_venue_label_plural_chk;

alter table public.event_branding
  add constraint event_branding_venue_label_singular_chk
    check (
      length(btrim(venue_label_singular)) between 1 and 40
      and venue_label_singular = btrim(venue_label_singular)
    ),
  add constraint event_branding_venue_label_plural_chk
    check (
      length(btrim(venue_label_plural)) between 1 and 40
      and venue_label_plural = btrim(venue_label_plural)
    );

comment on column public.event_branding.venue_label_singular is
  'Customer-facing singular label for a venue/location (e.g. Winery, Restaurant, Stop). 1-40 chars, trimmed.';
comment on column public.event_branding.venue_label_plural is
  'Customer-facing plural label for venues/locations (e.g. Wineries, Restaurants, Stops). 1-40 chars, trimmed.';
