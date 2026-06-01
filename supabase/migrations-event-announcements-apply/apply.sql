-- apply.sql — Event announcements: production-safe combined apply
--
-- This file is idempotent. Safe to run multiple times. It:
--   1. Creates public.event_announcements if it doesn't already exist
--      (table, indexes, updated_at trigger, grants).
--   2. Enables RLS and (re)installs the correct permissive policies.
--      It explicitly DROPS the restrictive `deny_all` policy from migration
--      01 if it's present — that policy was always-false and blocked every
--      authenticated write, which prevented announcements from saving.
--   3. (Re)creates the public-safe SECURITY DEFINER RPC
--      public.get_public_event_announcements_by_domain(text) that the
--      public bar calls. Returns only safe public columns.
--
-- No destructive changes. No data loss. Anon retains zero direct access to
-- the table; public reads flow only through the RPC, which itself is gated
-- on resolve_event_by_host() (publishing/billing gate).
--
-- Run as the project owner in the Supabase SQL editor.

begin;

-- 1) Table + indexes + grants ------------------------------------------------

create table if not exists public.event_announcements (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  event_id     uuid not null,
  title        text not null check (length(title)   between 1 and 200),
  message      text not null check (length(message) between 1 and 1000),
  tone         text not null default 'info'
                 check (tone in ('info','success','warning','urgent')),
  link_label   text     check (link_label is null or length(link_label) between 1 and 80),
  link_url     text     check (link_url   is null or link_url ~ '^https?://'),
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint event_announcements_event_fk
    foreign key (event_id) references public.events(id) on delete cascade,
  constraint event_announcements_event_agency_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint event_announcements_window_ck
    check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists idx_event_announcements_event_active
  on public.event_announcements (event_id, is_active);
create index if not exists idx_event_announcements_window
  on public.event_announcements (event_id, starts_at, ends_at)
  where is_active = true;

drop trigger if exists set_updated_at on public.event_announcements;
create trigger set_updated_at
  before update on public.event_announcements
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_announcements to authenticated;
grant all on public.event_announcements to service_role;
-- No anon grant: public reads go through the RPC below.

alter table public.event_announcements enable row level security;

-- 2) RLS policies ------------------------------------------------------------

-- Remove the buggy restrictive deny_all (always false → blocked every write).
drop policy if exists deny_all on public.event_announcements;

drop policy if exists platform_admin_all on public.event_announcements;
create policy platform_admin_all on public.event_announcements
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists agency_admin_manage on public.event_announcements;
create policy agency_admin_manage on public.event_announcements
  for all to authenticated
  using (public.is_agency_admin(auth.uid(), agency_id))
  with check (public.is_agency_admin(auth.uid(), agency_id));

drop policy if exists agency_member_read on public.event_announcements;
create policy agency_member_read on public.event_announcements
  for select to authenticated
  using (public.is_agency_member(auth.uid(), agency_id));

-- 3) Public RPC --------------------------------------------------------------

create or replace function public.get_public_event_announcements_by_domain(
  _hostname text
)
returns table (
  title        text,
  message      text,
  tone         text,
  link_label   text,
  link_url     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

  if r.kind is null or r.kind <> 'event' then
    return;
  end if;

  return query
    select
      a.title,
      a.message,
      a.tone,
      a.link_label,
      a.link_url
    from public.event_announcements a
    where a.event_id = r.event_id
      and a.is_active = true
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at   is null or a.ends_at   >= now())
    order by
      case a.tone
        when 'urgent'  then 0
        when 'warning' then 1
        when 'success' then 2
        else                3
      end,
      a.updated_at desc;
end;
$$;

grant execute on function public.get_public_event_announcements_by_domain(text)
  to anon, authenticated;

commit;

-- Verify after apply:
--   select * from pg_policies where tablename = 'event_announcements';
--   select * from public.get_public_event_announcements_by_domain('<sub>.getstampd.com.au');
