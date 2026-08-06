-- apply.sql — PRODUCTION
-- Project: kyjwifumacnrpgyextzz
--
-- The event logo is now a dominant element: it is rendered centred over the
-- hero cover image on the public landing page (above the event title), and at
-- 200% of its former size on the printed posters. The small logo in the public
-- top bar is gone.
--
-- To keep a logo legible over busy photography, organisers choose a shape and
-- an optional solid backdrop plate:
--
--   public.event_branding.logo_shape          'square' | 'circle'  (NULL = square)
--   public.event_branding.logo_backdrop       'transparent' | 'color' (NULL = transparent)
--   public.event_branding.logo_backdrop_color hex, used only when backdrop='color'
--
-- Safe to run repeatedly. Additive only: no existing column, function
-- signature, or return shape is modified.

begin;

alter table public.event_branding
  add column if not exists logo_shape text,
  add column if not exists logo_backdrop text,
  add column if not exists logo_backdrop_color text;

comment on column public.event_branding.logo_shape is
  'Event logo frame shape on the public hero and posters: square | circle. NULL = square.';
comment on column public.event_branding.logo_backdrop is
  'Event logo backdrop on the public hero and posters: transparent | color. NULL = transparent.';
comment on column public.event_branding.logo_backdrop_color is
  'Solid colour behind the event logo when logo_backdrop = ''color''. NULL falls back to white.';

-- Constrain to the supported values without breaking existing NULL rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_branding_logo_shape_check'
  ) then
    alter table public.event_branding
      add constraint event_branding_logo_shape_check
      check (logo_shape is null or logo_shape in ('square', 'circle'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_branding_logo_backdrop_check'
  ) then
    alter table public.event_branding
      add constraint event_branding_logo_backdrop_check
      check (logo_backdrop is null or logo_backdrop in ('transparent', 'color'));
  end if;
end
$$;

-- Public read path.
--
-- get_public_event_by_domain returns a very wide table; recreating it would
-- risk drifting from the deployed column list, so the logo style is exposed
-- through this small companion RPC instead (same approach as
-- get_public_event_hero_body_color). The client treats a missing function or
-- NULL result as "square + transparent".
create or replace function public.get_public_event_logo_style(_hostname text)
returns table (
  logo_shape text,
  logo_backdrop text,
  logo_backdrop_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.logo_shape, b.logo_backdrop, b.logo_backdrop_color
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where r.kind = 'event'
    and r.event_id is not null
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_public_event_logo_style(text)
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verify:
--   select event_id, logo_shape, logo_backdrop, logo_backdrop_color
--     from public.event_branding limit 5;
--   select * from public.get_public_event_logo_style('cargo-road-wine-quest.getstampd.com.au');
