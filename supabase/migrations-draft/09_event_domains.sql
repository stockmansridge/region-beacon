-- 09_event_domains.sql
-- Draft only. Do not execute.
-- domain_type includes 'platform_reserved' so reserved-subdomain seed rows
-- in step 31 can use it (per user requirement).

create table if not exists public.event_domains (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  event_id uuid,
  public_subdomain citext,
  custom_domain citext,
  domain_type text not null check (domain_type in (
    'platform_marketing','platform_admin','platform_reserved',
    'event_subdomain','event_custom'
  )),
  status text not null default 'pending' check (status in ('pending','active','disabled','revoked')),
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite tenant FK to events (only when event row).
  constraint event_domains_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,

  constraint event_domains_tenant_shape check (
    case
      when domain_type in ('event_subdomain','event_custom')
        then agency_id is not null and event_id is not null
      when domain_type in ('platform_marketing','platform_admin','platform_reserved')
        then agency_id is null and event_id is null
    end
  ),

  constraint event_domains_has_some_name check (
    public_subdomain is not null or custom_domain is not null
  ),

  constraint event_domains_subdomain_format check (
    public_subdomain is null
    or public.is_valid_public_slug(public_subdomain)
  )
);

create unique index if not exists ux_event_domains_subdomain
  on public.event_domains (public_subdomain) where public_subdomain is not null;

create unique index if not exists ux_event_domains_custom
  on public.event_domains (custom_domain) where custom_domain is not null;

-- One primary active domain per event.
create unique index if not exists ux_event_domains_one_primary_active
  on public.event_domains (event_id)
  where is_primary = true and status = 'active' and event_id is not null;

create index if not exists idx_event_domains_status on public.event_domains (status);
create index if not exists idx_event_domains_type   on public.event_domains (domain_type);

drop trigger if exists set_updated_at on public.event_domains;
create trigger set_updated_at
  before update on public.event_domains
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_domains to authenticated;
grant all on public.event_domains to service_role;

alter table public.event_domains enable row level security;

drop policy if exists deny_all on public.event_domains;
create policy deny_all on public.event_domains as restrictive for all to public using (false) with check (false);
