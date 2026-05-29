-- 11_event_terms_versions.sql
-- Draft only. Do not execute.
-- Immutable version ledger. UPDATE/DELETE are blocked via policies in 26.

create table if not exists public.event_terms_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  terms_version text not null,
  terms_url text not null,
  privacy_version text not null,
  privacy_url text not null,
  effective_at timestamptz not null default now(),
  published_by uuid,
  created_at timestamptz not null default now(),

  constraint event_terms_versions_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint event_terms_versions_unique unique (event_id, terms_version, privacy_version),
  -- Composite uniqueness for tenant-scoped composite FKs from visitor_consents.
  constraint event_terms_versions_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_event_terms_versions_event on public.event_terms_versions (event_id, effective_at desc);

-- Wire events.current_terms_version_id FK now that target table exists.
-- Wire events.current_terms_version_id FK now that target table exists.
-- Tenant-safe composite FK: forces the referenced terms_version to belong to
-- the SAME (agency_id, event_id). Prevents an event from pointing at another
-- agency's or another event's terms row at the database level.
alter table public.events
  drop constraint if exists events_current_terms_fk;
alter table public.events
  add constraint events_current_terms_fk
  foreign key (agency_id, id, current_terms_version_id)
  references public.event_terms_versions(agency_id, event_id, id)
  on delete restrict;

grant select, insert on public.event_terms_versions to authenticated;
grant all on public.event_terms_versions to service_role;

alter table public.event_terms_versions enable row level security;

drop policy if exists deny_all on public.event_terms_versions;
create policy deny_all on public.event_terms_versions as restrictive for all to public using (false) with check (false);
