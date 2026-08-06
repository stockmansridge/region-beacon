-- apply.sql — PRODUCTION
-- Project: kyjwifumacnrpgyextzz
--
-- Welcome copy moved back into the hero content stack (over the cover image,
-- directly beneath the event heading). It therefore needs its OWN colour role
-- so the event heading (hero_fg_color) and the welcome copy stay independently
-- configurable. hero_fg_color is NOT reused for both controls.
--
--   DB field : public.event_branding.hero_body_color
--   CSS token: --event-hero-body
--   Fallback : var(--event-hero-body, var(--event-hero-fg, var(--event-primary-fg, #ffffff)))
--
-- Safe to run repeatedly. Additive only: no existing column, function
-- signature, or return shape is modified.

begin;

alter table public.event_branding
  add column if not exists hero_body_color text;

comment on column public.event_branding.hero_body_color is
  'Colour of hero supporting copy (welcome copy) rendered over the cover image. Emitted as --event-hero-body. NULL falls back to hero_fg_color.';

-- Public read path.
--
-- get_public_event_by_domain returns a very wide table; recreating it would
-- risk drifting from the deployed column list, so hero_body_color is exposed
-- through this small companion RPC instead. The client treats a missing
-- function or NULL result as "no override" and falls back to hero_fg.
create or replace function public.get_public_event_hero_body_color(_hostname text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select b.hero_body_color
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where r.kind = 'event'
    and r.event_id is not null
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_public_event_hero_body_color(text)
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verify:
--   select event_id, hero_fg_color, hero_body_color from public.event_branding limit 5;
--   select public.get_public_event_hero_body_color('cargo-road-wine-quest.getstampd.com.au');
