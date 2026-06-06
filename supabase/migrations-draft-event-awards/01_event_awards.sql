-- 01_event_awards.sql — DRAFT only.
--
-- Awards / Prizes that participants can unlock by reaching a points
-- threshold and/or visiting every active venue. Soft-delete via
-- deleted_at; status gates whether the row is shown publicly.
--
-- Writes go through SECURITY DEFINER RPCs (see 04_admin_rpcs.sql);
-- direct table access is denied.

begin;

create table if not exists public.event_awards (
  id                       uuid primary key default gen_random_uuid(),
  event_id                 uuid not null,
  agency_id                uuid not null,
  title                    text not null,
  description              text,
  image_url                text,
  points_required          integer not null default 0,
  requires_all_locations   boolean not null default false,
  status                   text not null default 'active',
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,

  constraint event_awards_event_fk
    foreign key (agency_id, event_id)
    references public.events(agency_id, id) on delete cascade,
  constraint event_awards_title_not_blank
    check (length(trim(title)) > 0),
  constraint event_awards_points_required_non_negative
    check (points_required >= 0),
  constraint event_awards_status_valid
    check (status in ('active', 'disabled'))
);

create index if not exists idx_event_awards_event_status
  on public.event_awards (event_id, status, deleted_at);
create index if not exists idx_event_awards_agency
  on public.event_awards (agency_id);
create index if not exists idx_event_awards_points_desc
  on public.event_awards (points_required desc);
create index if not exists idx_event_awards_sort_order
  on public.event_awards (sort_order);

-- updated_at trigger (reuse the project-wide helper if it exists, else
-- create a minimal local one).
create or replace function public.event_awards_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_event_awards_updated_at on public.event_awards;
create trigger trg_event_awards_updated_at
  before update on public.event_awards
  for each row execute function public.event_awards_set_updated_at();

-- Grants — table is accessed only via SECURITY DEFINER RPCs, so we keep
-- direct privileges narrow.
grant select on public.event_awards to authenticated;
grant all on public.event_awards to service_role;

alter table public.event_awards enable row level security;

drop policy if exists event_awards_deny_all on public.event_awards;
create policy event_awards_deny_all on public.event_awards
  as restrictive for all to public using (false) with check (false);

commit;
