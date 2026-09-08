-- apply.sql — PRODUCTION
-- Project: kyjwifumacnrpgyextzz
--
-- Custom menu item: organisers can add one extra link to the public event
-- menu (drawer). Configured on the Branding tab, activated by a toggle:
--
--   public.event_branding.custom_link_label    text, max 15 chars
--   public.event_branding.custom_link_url      text, normalised to https://
--   public.event_branding.custom_link_enabled  boolean, default false
--
-- Safe to run repeatedly. Additive only.

begin;

alter table public.event_branding
  add column if not exists custom_link_label text,
  add column if not exists custom_link_url text,
  add column if not exists custom_link_enabled boolean not null default false;

comment on column public.event_branding.custom_link_label is
  'Label for the optional custom item in the public event menu. Max 15 characters.';
comment on column public.event_branding.custom_link_url is
  'Destination URL for the custom public menu item (https://).';
comment on column public.event_branding.custom_link_enabled is
  'When true and label + url are set, the custom item is shown in the public event menu.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_branding_custom_link_label_check'
  ) then
    alter table public.event_branding
      add constraint event_branding_custom_link_label_check
      check (custom_link_label is null or char_length(custom_link_label) <= 15);
  end if;
end
$$;

-- Public read path. Companion RPC (same approach as
-- get_public_event_logo_style) so the wide get_public_event_by_domain
-- return shape is never rewritten.
create or replace function public.get_public_event_custom_link(_hostname text)
returns table (
  custom_link_label text,
  custom_link_url text,
  custom_link_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select b.custom_link_label, b.custom_link_url, coalesce(b.custom_link_enabled, false)
  from public.resolve_event_by_host(_hostname) r
  join public.events e on e.id = r.event_id
  left join public.event_branding b on b.event_id = e.id
  where r.kind = 'event'
    and r.event_id is not null
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.get_public_event_custom_link(text)
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verify:
--   select * from public.get_public_event_custom_link('cargo-road-wine-quest.getstampd.com.au');
