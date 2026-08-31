-- Event page views — anonymous traffic counting for public event pages.
--
-- Run this in the production SQL editor. Until it is applied the Analytics
-- "Page views" card simply shows zero; nothing else breaks.
--
-- Privacy posture: no PII. We store the event, the path, and an opaque
-- random device id generated in the browser (localStorage) so we can count
-- unique devices. No IP, no user agent, no visitor/email linkage.

begin;

create table if not exists public.event_page_views (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null,
  event_id   uuid not null,
  path       text not null check (length(path) between 1 and 300),
  device_id  text not null check (length(device_id) between 8 and 64),
  created_at timestamptz not null default now(),

  constraint event_page_views_event_fk
    foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_page_views_event_agency_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_event_page_views_event_created
  on public.event_page_views (event_id, created_at desc);
create index if not exists idx_event_page_views_agency_created
  on public.event_page_views (agency_id, created_at desc);

-- Grants. No anon grant: anonymous writes happen through the SECURITY
-- DEFINER RPC below only.
grant select on public.event_page_views to authenticated;
grant all on public.event_page_views to service_role;

alter table public.event_page_views enable row level security;

drop policy if exists deny_all on public.event_page_views;
create policy deny_all on public.event_page_views
  as restrictive for all to public using (false) with check (false);

drop policy if exists platform_admin_all on public.event_page_views;
create policy platform_admin_all on public.event_page_views
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists agency_member_read on public.event_page_views;
create policy agency_member_read on public.event_page_views
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

-- Public write surface. Anonymous visitors call this once per path per
-- session; it derives agency_id from the event so callers cannot spoof it.
create or replace function public.record_event_page_view(
  _event_id  uuid,
  _path      text,
  _device_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_path      text;
  v_device    text;
begin
  if _event_id is null or _device_id is null then
    return;
  end if;

  select e.agency_id into v_agency_id
  from public.events e
  where e.id = _event_id
    and e.deleted_at is null;

  if v_agency_id is null then
    return;
  end if;

  v_path   := left(coalesce(nullif(trim(_path), ''), '/'), 300);
  v_device := left(regexp_replace(_device_id, '[^A-Za-z0-9_-]', '', 'g'), 64);

  if length(v_device) < 8 then
    return;
  end if;

  insert into public.event_page_views (agency_id, event_id, path, device_id)
  values (v_agency_id, _event_id, v_path, v_device);
end;
$$;

grant execute on function public.record_event_page_view(uuid, text, text)
  to anon, authenticated;

commit;

-- Rollback:
--   drop function if exists public.record_event_page_view(uuid, text, text);
--   drop table if exists public.event_page_views cascade;
