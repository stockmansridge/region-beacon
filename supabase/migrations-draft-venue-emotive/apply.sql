-- Draft migration: Venue emotive text block + per-event default emotive font.
--
-- Adds optional "emotive text" copy on each venue (small script-styled
-- storytelling block shown above the description on the public venue page),
-- plus an optional per-venue font override. A per-event default emotive
-- font family lives on event_branding so an organiser can pick one script
-- font once and have every venue use it.
--
-- Apply in the Supabase SQL editor.

alter table public.venues
  add column if not exists emotive_text        text,
  add column if not exists emotive_font_family text;

comment on column public.venues.emotive_text is
  'Optional short emotive/storytelling copy shown in script font above the venue description on the public page.';
comment on column public.venues.emotive_font_family is
  'Optional per-venue CSS font-family override for emotive_text. NULL = inherit event_branding.default_emotive_font_family, then platform default (Caveat).';

alter table public.event_branding
  add column if not exists default_emotive_font_family text;

comment on column public.event_branding.default_emotive_font_family is
  'Default CSS font-family used to render venue emotive_text when the venue has no per-venue override. NULL = platform default (Caveat).';

-- Public read RPC for the two new venue fields plus the event-level default
-- and the venue points value. Keeps existing get_public_venue_by_domain
-- untouched to minimise blast radius. The public venue page calls this in
-- parallel with the existing RPCs.
create or replace function public.get_public_venue_extras(
  _hostname text,
  _venue_id uuid
)
returns table(
  emotive_text                text,
  emotive_font_family         text,
  default_emotive_font_family text,
  points_value                int
)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select event_id
    from public.resolve_event_by_host(_hostname)
    where kind = 'event' and event_id is not null
    limit 1
  )
  select
    v.emotive_text,
    v.emotive_font_family,
    b.default_emotive_font_family,
    coalesce(v.points_value, 0)::int
  from r
  left join public.venues         v on v.id = _venue_id and v.event_id = r.event_id
  left join public.event_branding b on b.event_id = r.event_id;
$$;

revoke all on function public.get_public_venue_extras(text, uuid) from public;
grant execute on function public.get_public_venue_extras(text, uuid) to anon, authenticated;
