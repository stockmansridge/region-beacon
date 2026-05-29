-- 08_events.sql
-- Draft only. Do not execute.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  name text not null,
  slug citext not null,                         -- internal admin slug
  public_slug citext not null,                  -- globally unique public id (Rev 3 §2)
  status text not null default 'draft' check (status in ('draft','published','ended','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  description text,
  current_terms_version_id uuid,                -- FK added in a later migration
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint events_agency_fk
    foreign key (agency_id) references public.agencies(id) on delete cascade,
  constraint events_slug_unique_per_agency unique (agency_id, slug),
  constraint events_public_slug_unique unique (public_slug),
  -- Composite uniqueness used by descendant composite FKs.
  constraint events_agency_event_unique unique (agency_id, id),

  constraint events_public_slug_format
    check (public.is_valid_public_slug(public_slug)
           and not public.is_reserved_public_slug(public_slug))
);

create index if not exists idx_events_agency_status on public.events (agency_id, status);
create index if not exists idx_events_dates on public.events (starts_at, ends_at);

drop trigger if exists set_updated_at on public.events;
create trigger set_updated_at
  before update on public.events
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;

alter table public.events enable row level security;

drop policy if exists deny_all on public.events;
create policy deny_all on public.events as restrictive for all to public using (false) with check (false);
