-- =====================================================================
-- STAGING APPLY BUNDLE — region-beacon-staging
-- Target: https://kyjwifumacnrpgyextzz.supabase.co (STAGING ONLY)
-- Generated: 2026-05-29T06:15:14Z
-- DO NOT RUN AGAINST PRODUCTION.
-- Run as a single transaction in the Supabase SQL Editor.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- FILE: 01_extensions.sql
-- ---------------------------------------------------------------------
-- 01_extensions.sql
-- Draft only. Do not execute.
-- Required PG extensions.

create extension if not exists "pgcrypto";   -- gen_random_uuid, digest
create extension if not exists "citext";     -- case-insensitive text

-- ---------------------------------------------------------------------
-- FILE: 02_enums.sql
-- ---------------------------------------------------------------------
-- 02_enums.sql
-- Draft only. Do not execute.
-- Global vs agency-scoped roles are intentionally separated (Rev 3 §1).

do $$ begin
  create type public.app_role as enum ('platform_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agency_role as enum ('agency_owner', 'agency_admin', 'agency_staff');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- FILE: 03_util.sql
-- ---------------------------------------------------------------------
-- 03_util.sql
-- Draft only. Do not execute.
-- Shared utility functions. Not SECURITY DEFINER — they touch only their
-- input row.

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Slug / subdomain validator used by CHECK constraints and the
-- validate_public_subdomain RPC.
create or replace function public.is_valid_public_slug(_value text)
returns boolean
language sql
immutable
as $$
  select _value ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'
$$;

-- Hardcoded reserved-name guard (defence in depth on top of seed rows).
create or replace function public.is_reserved_public_slug(_value text)
returns boolean
language sql
immutable
as $$
  select lower(_value) = any (array[
    'app','www','admin','api','support','status','help','mail',
    'docs','blog','dashboard','auth','login','signup','billing',
    'public','static','cdn','assets','dev','staging','test'
  ])
$$;

-- ---------------------------------------------------------------------
-- FILE: 04_agencies.sql
-- ---------------------------------------------------------------------
-- 04_agencies.sql
-- Draft only. Do not execute.
-- Pass A: table + grants + RLS enabled + deny-all default policy.

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  billing_email citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agencies_slug_unique unique (slug),
  -- Composite uniqueness for tenant-scoped composite FKs from descendants.
  constraint agencies_agency_id_unique unique (id)
);

create index if not exists idx_agencies_status on public.agencies (status);

drop trigger if exists set_updated_at on public.agencies;
create trigger set_updated_at
  before update on public.agencies
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.agencies to authenticated;
grant all on public.agencies to service_role;

alter table public.agencies enable row level security;

drop policy if exists deny_all on public.agencies;
create policy deny_all on public.agencies as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 05_user_roles.sql
-- ---------------------------------------------------------------------
-- 05_user_roles.sql
-- Draft only. Do not execute.
-- GLOBAL roles only (Rev 3 §1). Agency roles live in agency_members.

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_user_role_unique unique (user_id, role),
  -- Defensive: until additional global roles exist, only platform_admin
  -- is permitted. Loosen by ALTER TABLE in a later migration when needed.
  constraint user_roles_global_only check (role = 'platform_admin')
);

create index if not exists idx_user_roles_role on public.user_roles (role);

drop trigger if exists set_updated_at on public.user_roles;
create trigger set_updated_at
  before update on public.user_roles
  for each row execute function public.tg_set_updated_at();

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists deny_all on public.user_roles;
create policy deny_all on public.user_roles as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 06_agency_members.sql
-- ---------------------------------------------------------------------
-- 06_agency_members.sql
-- Draft only. Do not execute.

create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.agency_role not null,
  invited_email citext,
  invited_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_members_unique unique (agency_id, user_id, role)
);

create index if not exists idx_agency_members_user on public.agency_members (user_id);
create index if not exists idx_agency_members_agency on public.agency_members (agency_id);

drop trigger if exists set_updated_at on public.agency_members;
create trigger set_updated_at
  before update on public.agency_members
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.agency_members to authenticated;
grant all on public.agency_members to service_role;

alter table public.agency_members enable row level security;

drop policy if exists deny_all on public.agency_members;
create policy deny_all on public.agency_members as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 07_audit_logs.sql
-- ---------------------------------------------------------------------
-- 07_audit_logs.sql
-- Draft only. Do not execute.
-- Created EARLY so later audit triggers (step 30) can target it.
-- NOTE: no trigger is ever attached to audit_logs itself (recursive audit).

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  event_id uuid,
  actor_user_id uuid,
  actor_role text,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_agency on public.audit_logs (agency_id, created_at desc);
create index if not exists idx_audit_logs_event  on public.audit_logs (event_id, created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_actor  on public.audit_logs (actor_user_id);

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

drop policy if exists deny_all on public.audit_logs;
create policy deny_all on public.audit_logs as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 08_events.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- FILE: 09_event_domains.sql
-- ---------------------------------------------------------------------
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

  -- Format/reserved CHECK: reserved-name block applies only to tenant rows.
  -- Seed rows with domain_type='platform_reserved' are allowed to hold the
  -- reserved label in public_subdomain so they occupy the unique index and
  -- block any tenant from claiming it. Tenant rows (event_subdomain /
  -- event_custom) cannot use a reserved label — defence in depth alongside
  -- the validate_public_subdomain RPC and the seed rows themselves.
  constraint event_domains_subdomain_format check (
    public_subdomain is null
    or (
      public.is_valid_public_slug(public_subdomain)
      and (
        domain_type = 'platform_reserved'
        or not public.is_reserved_public_slug(public_subdomain)
      )
    )
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

-- ---------------------------------------------------------------------
-- FILE: 10_event_branding.sql
-- ---------------------------------------------------------------------
-- 10_event_branding.sql
-- Draft only. Do not execute.

create table if not exists public.event_branding (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  logo_path text,
  cover_path text,
  primary_color text,
  accent_color text,
  font_family text,
  welcome_copy text,
  terms_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_branding_event_unique unique (event_id),
  constraint event_branding_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.event_branding;
create trigger set_updated_at
  before update on public.event_branding
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_branding to authenticated;
grant all on public.event_branding to service_role;

alter table public.event_branding enable row level security;

drop policy if exists deny_all on public.event_branding;
create policy deny_all on public.event_branding as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 11_event_terms_versions.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- FILE: 12_venues.sql
-- ---------------------------------------------------------------------
-- 12_venues.sql
-- Draft only. Do not execute.

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  order_index int not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint venues_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  -- Composite uniqueness for tenant-scoped composite FKs from descendants.
  constraint venues_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_venues_event_status on public.venues (event_id, status);
create index if not exists idx_venues_agency on public.venues (agency_id);
create index if not exists idx_venues_event_order on public.venues (event_id, order_index);

drop trigger if exists set_updated_at on public.venues;
create trigger set_updated_at
  before update on public.venues
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.venues to authenticated;
grant all on public.venues to service_role;

alter table public.venues enable row level security;

drop policy if exists deny_all on public.venues;
create policy deny_all on public.venues as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 13_venue_qr_codes.sql
-- ---------------------------------------------------------------------
-- 13_venue_qr_codes.sql
-- Draft only. Do not execute.
-- Tokens are random, non-guessable, generated server-side (see step 34).
-- One active token per venue enforced by partial unique index.

create table if not exists public.venue_qr_codes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,
  token text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid,

  constraint venue_qr_codes_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint venue_qr_codes_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete cascade,
  -- Composite uniqueness for tenant-scoped composite FKs from checkins.
  constraint venue_qr_codes_tenant_unique unique (agency_id, event_id, id),
  constraint venue_qr_codes_token_unique unique (token),
  constraint venue_qr_codes_token_length check (length(token) >= 22)
);

create unique index if not exists ux_venue_qr_codes_one_active_per_venue
  on public.venue_qr_codes (venue_id) where status = 'active';

create index if not exists idx_venue_qr_codes_event on public.venue_qr_codes (event_id);

grant select, insert, update on public.venue_qr_codes to authenticated;
grant all on public.venue_qr_codes to service_role;

alter table public.venue_qr_codes enable row level security;

drop policy if exists deny_all on public.venue_qr_codes;
create policy deny_all on public.venue_qr_codes as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 14_venue_offers.sql
-- ---------------------------------------------------------------------
-- 14_venue_offers.sql
-- Draft only. Do not execute.

create table if not exists public.venue_offers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  venue_id uuid not null,
  title text not null,
  description text,
  redemption_instructions text,
  offer_type text not null check (offer_type in ('discount','freebie','tasting','upgrade','other')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint venue_offers_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint venue_offers_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete cascade
);

create index if not exists idx_venue_offers_event_active on public.venue_offers (event_id, is_active);
create index if not exists idx_venue_offers_venue_active on public.venue_offers (venue_id, is_active);
create index if not exists idx_venue_offers_agency on public.venue_offers (agency_id);

drop trigger if exists set_updated_at on public.venue_offers;
create trigger set_updated_at
  before update on public.venue_offers
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.venue_offers to authenticated;
grant all on public.venue_offers to service_role;

alter table public.venue_offers enable row level security;

drop policy if exists deny_all on public.venue_offers;
create policy deny_all on public.venue_offers as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 15_visitors.sql
-- ---------------------------------------------------------------------
-- 15_visitors.sql
-- Draft only. Do not execute.
-- PII table. Public exposure is forbidden — visitor reads go through RPCs.

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  email citext not null,
  full_name text not null,
  first_name text,
  last_name text,
  mobile text,
  postcode text,
  marketing_opt_in boolean not null default false,
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint visitors_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint visitors_email_unique_per_event unique (event_id, email),
  -- Composite uniqueness for tenant-scoped composite FKs from passports/consents.
  constraint visitors_tenant_unique unique (agency_id, event_id, id),

  constraint visitors_mobile_format check (
    mobile is null or mobile ~ '^\+?[0-9 \-]{6,20}$'
  ),
  constraint visitors_postcode_length check (
    postcode is null or length(postcode) between 3 and 12
  )
);

create index if not exists idx_visitors_agency on public.visitors (agency_id);

drop trigger if exists set_updated_at on public.visitors;
create trigger set_updated_at
  before update on public.visitors
  for each row execute function public.tg_set_updated_at();

grant select, update, delete on public.visitors to authenticated;
grant all on public.visitors to service_role;
-- No INSERT grant: visitors are created only via register_visitor() definer RPC.

alter table public.visitors enable row level security;

drop policy if exists deny_all on public.visitors;
create policy deny_all on public.visitors as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 16_passports.sql
-- ---------------------------------------------------------------------
-- 16_passports.sql
-- Draft only. Do not execute.
-- access_token_hash stores SHA-256 of the raw token. Raw token never stored.

create table if not exists public.passports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  visitor_id uuid not null,
  access_token_hash bytea not null,
  status text not null default 'active' check (status in ('active','completed','forfeited')),
  completed_at timestamptz,
  leaderboard_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint passports_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade,
  constraint passports_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete cascade,
  constraint passports_one_per_visitor unique (event_id, visitor_id),
  constraint passports_token_hash_unique unique (access_token_hash),
  constraint passports_tenant_unique unique (agency_id, event_id, id)
);

create index if not exists idx_passports_event_status on public.passports (agency_id, event_id, status);

drop trigger if exists set_updated_at on public.passports;
create trigger set_updated_at
  before update on public.passports
  for each row execute function public.tg_set_updated_at();

grant select, update, delete on public.passports to authenticated;
grant all on public.passports to service_role;
-- No INSERT grant: passports created via register_visitor() definer RPC.

alter table public.passports enable row level security;

drop policy if exists deny_all on public.passports;
create policy deny_all on public.passports as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 17_visitor_consents.sql
-- ---------------------------------------------------------------------
-- 17_visitor_consents.sql
-- Draft only. Do not execute.
-- Append-only consent ledger. UPDATE/DELETE blocked via policies in step 28.

create table if not exists public.visitor_consents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  visitor_id uuid not null,
  passport_id uuid,
  consent_type text not null check (consent_type in ('terms','privacy','marketing')),
  decision text not null check (decision in ('granted','withdrawn')),
  terms_version_id uuid,
  decided_at timestamptz not null default now(),
  client_ip inet,
  user_agent text,

  constraint visitor_consents_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint visitor_consents_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete cascade,
  constraint visitor_consents_passport_fk
    foreign key (agency_id, event_id, passport_id) references public.passports(agency_id, event_id, id) on delete restrict,
  constraint visitor_consents_terms_version_fk
    foreign key (agency_id, event_id, terms_version_id) references public.event_terms_versions(agency_id, event_id, id) on delete restrict,

  constraint visitor_consents_terms_require_version check (
    case when consent_type in ('terms','privacy') then terms_version_id is not null else true end
  )
);

create index if not exists idx_visitor_consents_visitor on public.visitor_consents (visitor_id, consent_type, decided_at desc);
create index if not exists idx_visitor_consents_event   on public.visitor_consents (event_id, consent_type);

grant select on public.visitor_consents to authenticated;
grant all on public.visitor_consents to service_role;
-- No INSERT grant: written only by definer RPCs.

alter table public.visitor_consents enable row level security;

drop policy if exists deny_all on public.visitor_consents;
create policy deny_all on public.visitor_consents as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 18_checkins.sql
-- ---------------------------------------------------------------------
-- 18_checkins.sql
-- Draft only. Do not execute.
-- Browser clients MUST NOT insert. Only redeem_checkin() writes.

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  passport_id uuid not null,
  visitor_id uuid not null,
  venue_id uuid not null,
  venue_qr_code_id uuid,
  source text not null default 'qr_scan' check (source in ('qr_scan','manual_admin')),
  created_by uuid,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint checkins_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint checkins_passport_fk
    foreign key (agency_id, event_id, passport_id) references public.passports(agency_id, event_id, id) on delete restrict,
  constraint checkins_visitor_fk
    foreign key (agency_id, event_id, visitor_id) references public.visitors(agency_id, event_id, id) on delete restrict,
  constraint checkins_venue_fk
    foreign key (agency_id, event_id, venue_id) references public.venues(agency_id, event_id, id) on delete restrict,
  constraint checkins_qr_fk
    foreign key (agency_id, event_id, venue_qr_code_id) references public.venue_qr_codes(agency_id, event_id, id) on delete restrict,
  constraint checkins_one_per_passport_venue unique (passport_id, venue_id)
);

create index if not exists idx_checkins_event_time on public.checkins (event_id, created_at);
create index if not exists idx_checkins_agency_event on public.checkins (agency_id, event_id);
create index if not exists idx_checkins_qr on public.checkins (venue_qr_code_id);

-- Grants: SELECT only for authenticated; no INSERT/UPDATE/DELETE for anon or
-- authenticated. service_role gets ALL (migrations / break-glass only).
grant select on public.checkins to authenticated;
grant all on public.checkins to service_role;

alter table public.checkins enable row level security;

drop policy if exists deny_all on public.checkins;
create policy deny_all on public.checkins as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 19_reward_rules.sql
-- ---------------------------------------------------------------------
-- 19_reward_rules.sql
-- Draft only. Do not execute.

create table if not exists public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  rule_type text not null check (rule_type in ('min_checkins','all_venues','specific_set')),
  threshold int,
  required_venue_ids uuid[],
  reward_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reward_rules_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_reward_rules_event_active on public.reward_rules (event_id, is_active);

drop trigger if exists set_updated_at on public.reward_rules;
create trigger set_updated_at
  before update on public.reward_rules
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.reward_rules to authenticated;
grant all on public.reward_rules to service_role;

alter table public.reward_rules enable row level security;

drop policy if exists deny_all on public.reward_rules;
create policy deny_all on public.reward_rules as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 20_prize_rules.sql
-- ---------------------------------------------------------------------
-- 20_prize_rules.sql
-- Draft only. Do not execute.

create table if not exists public.prize_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  name text not null,
  prize_type text not null check (prize_type in ('draw_entry','instant_reward','completion_prize')),
  threshold_checkins int,
  requires_completion boolean not null default false,
  entries_per_threshold int not null default 1 check (entries_per_threshold >= 1),
  max_entries_per_passport int,
  prize_name text,
  prize_instructions text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prize_rules_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

create index if not exists idx_prize_rules_event_active on public.prize_rules (event_id, is_active);
create index if not exists idx_prize_rules_type on public.prize_rules (prize_type);

drop trigger if exists set_updated_at on public.prize_rules;
create trigger set_updated_at
  before update on public.prize_rules
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.prize_rules to authenticated;
grant all on public.prize_rules to service_role;

alter table public.prize_rules enable row level security;

drop policy if exists deny_all on public.prize_rules;
create policy deny_all on public.prize_rules as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 21_leaderboard_settings.sql
-- ---------------------------------------------------------------------
-- 21_leaderboard_settings.sql
-- Draft only. Do not execute.
-- Disabled by default. Public projection enforced inside get_public_leaderboard.

create table if not exists public.leaderboard_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  is_enabled boolean not null default false,
  display_mode text not null default 'first_name_last_initial'
    check (display_mode in ('first_name_last_initial','first_name_only','alias_only','anonymous')),
  show_first_name boolean not null default true,
  show_last_initial boolean not null default true,
  show_visit_count boolean not null default true,
  hide_below_checkins int not null default 1 check (hide_below_checkins >= 0),
  allow_visitor_opt_out boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leaderboard_settings_event_unique unique (event_id),
  constraint leaderboard_settings_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.leaderboard_settings;
create trigger set_updated_at
  before update on public.leaderboard_settings
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.leaderboard_settings to authenticated;
grant all on public.leaderboard_settings to service_role;

alter table public.leaderboard_settings enable row level security;

drop policy if exists deny_all on public.leaderboard_settings;
create policy deny_all on public.leaderboard_settings as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 22_event_checkin_settings.sql
-- ---------------------------------------------------------------------
-- 22_event_checkin_settings.sql
-- Draft only. Do not execute.

create table if not exists public.event_checkin_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  one_checkin_per_venue boolean not null default true,
  minimum_seconds_between_checkins int not null default 0 check (minimum_seconds_between_checkins >= 0),
  allow_manual_admin_checkins boolean not null default false,
  max_checkins_per_passport_per_day int check (max_checkins_per_passport_per_day is null or max_checkins_per_passport_per_day > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_checkin_settings_event_unique unique (event_id),
  constraint event_checkin_settings_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete cascade
);

drop trigger if exists set_updated_at on public.event_checkin_settings;
create trigger set_updated_at
  before update on public.event_checkin_settings
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_checkin_settings to authenticated;
grant all on public.event_checkin_settings to service_role;

alter table public.event_checkin_settings enable row level security;

drop policy if exists deny_all on public.event_checkin_settings;
create policy deny_all on public.event_checkin_settings as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 23_export_logs.sql
-- ---------------------------------------------------------------------
-- 23_export_logs.sql
-- Draft only. Do not execute.
-- Immutable. Inserted only via export RPCs.

create table if not exists public.export_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('visitors','checkins','passports','prize_entrants')),
  prize_rule_id uuid,
  row_count int not null default 0,
  filters jsonb,
  client_ip inet,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint export_logs_event_fk
    foreign key (agency_id, event_id) references public.events(agency_id, id) on delete restrict,
  constraint export_logs_prize_rule_fk
    foreign key (prize_rule_id) references public.prize_rules(id) on delete set null
);

create index if not exists idx_export_logs_agency_event on public.export_logs (agency_id, event_id, created_at desc);
create index if not exists idx_export_logs_user on public.export_logs (user_id);

grant select on public.export_logs to authenticated;
grant all on public.export_logs to service_role;

alter table public.export_logs enable row level security;

drop policy if exists deny_all on public.export_logs;
create policy deny_all on public.export_logs as restrictive for all to public using (false) with check (false);

-- ---------------------------------------------------------------------
-- FILE: 24_helpers.sql
-- ---------------------------------------------------------------------
-- 24_helpers.sql
-- Draft only. Do not execute.
-- All SECURITY DEFINER. search_path is explicit on every one.

create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'platform_admin'
  )
$$;

create or replace function public.is_agency_member(_user_id uuid, _agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where user_id = _user_id
      and agency_id = _agency_id
      and accepted_at is not null
  )
$$;

create or replace function public.is_agency_admin(_user_id uuid, _agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where user_id = _user_id
      and agency_id = _agency_id
      and accepted_at is not null
      and role in ('agency_owner','agency_admin')
  )
$$;

create or replace function public.is_agency_owner(_user_id uuid, _agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where user_id = _user_id
      and agency_id = _agency_id
      and accepted_at is not null
      and role = 'agency_owner'
  )
$$;

-- Retained for GLOBAL role checks only. Never call with an agency role.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- ---------------------------------------------------------------------
-- FILE: 25_policies_core.sql
-- ---------------------------------------------------------------------
-- 25_policies_core.sql
-- Draft only. Do not execute.
-- Pass B: replace deny-all with real policies for agencies, user_roles, agency_members.

-- agencies ---------------------------------------------------------------
drop policy if exists deny_all on public.agencies;

create policy agencies_select
  on public.agencies for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), id)
  );

create policy agencies_insert_platform
  on public.agencies for insert to authenticated
  with check (public.is_platform_admin(auth.uid()));

create policy agencies_update
  on public.agencies for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), id)
  );

create policy agencies_delete_platform
  on public.agencies for delete to authenticated
  using (public.is_platform_admin(auth.uid()));

-- user_roles -------------------------------------------------------------
drop policy if exists deny_all on public.user_roles;

create policy user_roles_select_self_or_admin
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin(auth.uid())
  );

create policy user_roles_write_platform_only
  on public.user_roles for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- agency_members ---------------------------------------------------------
drop policy if exists deny_all on public.agency_members;

create policy agency_members_select
  on public.agency_members for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy agency_members_write
  on public.agency_members for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), agency_id)
  );

-- ---------------------------------------------------------------------
-- FILE: 26_policies_event.sql
-- ---------------------------------------------------------------------
-- 26_policies_event.sql
-- Draft only. Do not execute.

-- Helper macro convention: every policy uses agency_id-scoped helpers.

-- events -----------------------------------------------------------------
drop policy if exists deny_all on public.events;

create policy events_select
  on public.events for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy events_write
  on public.events for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_domains ----------------------------------------------------------
drop policy if exists deny_all on public.event_domains;

create policy event_domains_select
  on public.event_domains for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (agency_id is not null and public.is_agency_member(auth.uid(), agency_id))
  );

create policy event_domains_write_platform
  on public.event_domains for all to authenticated
  using (
    domain_type in ('platform_marketing','platform_admin','platform_reserved')
    and public.is_platform_admin(auth.uid())
  )
  with check (
    domain_type in ('platform_marketing','platform_admin','platform_reserved')
    and public.is_platform_admin(auth.uid())
  );

create policy event_domains_write_agency
  on public.event_domains for all to authenticated
  using (
    domain_type in ('event_subdomain','event_custom')
    and agency_id is not null
    and public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    domain_type in ('event_subdomain','event_custom')
    and agency_id is not null
    and public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_branding ---------------------------------------------------------
drop policy if exists deny_all on public.event_branding;

create policy event_branding_all
  on public.event_branding for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_terms_versions (immutable) ---------------------------------------
drop policy if exists deny_all on public.event_terms_versions;

create policy event_terms_versions_select
  on public.event_terms_versions for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy event_terms_versions_insert
  on public.event_terms_versions for insert to authenticated
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No UPDATE/DELETE policies: append-only by design.

-- event_checkin_settings -------------------------------------------------
drop policy if exists deny_all on public.event_checkin_settings;

create policy event_checkin_settings_all
  on public.event_checkin_settings for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- leaderboard_settings ---------------------------------------------------
drop policy if exists deny_all on public.leaderboard_settings;

create policy leaderboard_settings_all
  on public.leaderboard_settings for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- ---------------------------------------------------------------------
-- FILE: 27_policies_venue.sql
-- ---------------------------------------------------------------------
-- 27_policies_venue.sql
-- Draft only. Do not execute.

-- venues -----------------------------------------------------------------
drop policy if exists deny_all on public.venues;

create policy venues_select
  on public.venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy venues_write
  on public.venues for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- venue_qr_codes ---------------------------------------------------------
drop policy if exists deny_all on public.venue_qr_codes;

create policy venue_qr_codes_select
  on public.venue_qr_codes for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy venue_qr_codes_insert_update
  on public.venue_qr_codes for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- DELETE is left absent on purpose; use status='revoked' instead.

-- venue_offers -----------------------------------------------------------
drop policy if exists deny_all on public.venue_offers;

create policy venue_offers_select
  on public.venue_offers for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy venue_offers_write
  on public.venue_offers for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- ---------------------------------------------------------------------
-- FILE: 28_policies_visitor.sql
-- ---------------------------------------------------------------------
-- 28_policies_visitor.sql
-- Draft only. Do not execute.

-- visitors ---------------------------------------------------------------
drop policy if exists deny_all on public.visitors;

create policy visitors_select
  on public.visitors for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy visitors_update_delete
  on public.visitors for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy visitors_delete
  on public.visitors for delete to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No INSERT policy: register_visitor() definer RPC is the only writer.

-- passports --------------------------------------------------------------
drop policy if exists deny_all on public.passports;

create policy passports_select
  on public.passports for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy passports_update
  on public.passports for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy passports_delete
  on public.passports for delete to authenticated
  using (public.is_platform_admin(auth.uid()));
-- No INSERT policy: register_visitor() definer RPC is the only writer.

-- visitor_consents (append-only) -----------------------------------------
drop policy if exists deny_all on public.visitor_consents;

create policy visitor_consents_select
  on public.visitor_consents for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
-- No INSERT/UPDATE/DELETE policies: definer RPCs only.

-- ---------------------------------------------------------------------
-- FILE: 29_policies_ledger.sql
-- ---------------------------------------------------------------------
-- 29_policies_ledger.sql
-- Draft only. Do not execute.

-- checkins (no INSERT/UPDATE/DELETE for any non-service role; definer RPC only)
drop policy if exists deny_all on public.checkins;

create policy checkins_select
  on public.checkins for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
-- Intentionally no INSERT/UPDATE/DELETE policies. redeem_checkin() (definer)
-- is the only writer. service_role bypasses RLS for break-glass admin work.

-- reward_rules -----------------------------------------------------------
drop policy if exists deny_all on public.reward_rules;

create policy reward_rules_select
  on public.reward_rules for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy reward_rules_write
  on public.reward_rules for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- prize_rules ------------------------------------------------------------
drop policy if exists deny_all on public.prize_rules;

create policy prize_rules_select
  on public.prize_rules for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy prize_rules_write
  on public.prize_rules for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- export_logs (append-only via RPC) --------------------------------------
drop policy if exists deny_all on public.export_logs;

create policy export_logs_select
  on public.export_logs for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No INSERT/UPDATE/DELETE policies.

-- audit_logs (no INSERT policy for non-service roles; triggers run as table owner) --
drop policy if exists deny_all on public.audit_logs;

create policy audit_logs_select
  on public.audit_logs for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (agency_id is not null and public.is_agency_admin(auth.uid(), agency_id))
  );
-- Triggers in step 30 write via SECURITY DEFINER functions that bypass RLS.

-- ---------------------------------------------------------------------
-- FILE: 30_audit_triggers.sql
-- ---------------------------------------------------------------------
-- 30_audit_triggers.sql
-- Draft only. Do not execute.
-- A single SECURITY DEFINER trigger function writes to audit_logs.
-- audit_logs itself is NEVER attached (no recursive audit).

create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_agency uuid;
  v_event uuid;
  v_target uuid;
  v_action text;
begin
  -- Pick agency_id/event_id/id from NEW or OLD if those columns exist.
  v_action := lower(tg_op);  -- 'insert' | 'update' | 'delete'

  if tg_op = 'DELETE' then
    begin v_agency := (to_jsonb(old)->>'agency_id')::uuid; exception when others then v_agency := null; end;
    begin v_event  := (to_jsonb(old)->>'event_id')::uuid;  exception when others then v_event  := null; end;
    begin v_target := (to_jsonb(old)->>'id')::uuid;        exception when others then v_target := null; end;
  else
    begin v_agency := (to_jsonb(new)->>'agency_id')::uuid; exception when others then v_agency := null; end;
    begin v_event  := (to_jsonb(new)->>'event_id')::uuid;  exception when others then v_event  := null; end;
    begin v_target := (to_jsonb(new)->>'id')::uuid;        exception when others then v_target := null; end;
  end if;

  insert into public.audit_logs (
    agency_id, event_id, actor_user_id, action,
    target_table, target_id, metadata
  ) values (
    v_agency, v_event, v_actor,
    tg_table_name || '.' || v_action,
    tg_table_schema || '.' || tg_table_name,
    v_target,
    jsonb_build_object('op', tg_op)
  );

  return coalesce(new, old);
end;
$$;

-- Attach to every audited table. NOT attached to audit_logs (recursive).
-- NOT attached to checkins/visitor_consents/export_logs/event_terms_versions —
-- those tables ARE the audit themselves; their writes are already traceable.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agencies','user_roles','agency_members',
    'events','event_domains','event_branding',
    'event_checkin_settings','leaderboard_settings',
    'venues','venue_qr_codes','venue_offers',
    'visitors','passports',
    'reward_rules','prize_rules'
  ]
  loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I
       for each row execute function public.tg_audit_row()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- FILE: 31_seed_reserved_subdomains.sql
-- ---------------------------------------------------------------------
-- 31_seed_reserved_subdomains.sql
-- Draft only. Do not execute.
-- Seeds reserved-subdomain rows. domain_type='platform_reserved'.

insert into public.event_domains (
  agency_id, event_id, public_subdomain, custom_domain,
  domain_type, status, is_primary
)
select null, null, sub, null, 'platform_reserved', 'active', false
from (values
  ('app'),('www'),('admin'),('api'),('support'),('status'),('help'),('mail'),
  ('docs'),('blog'),('dashboard'),('auth'),('login'),('signup'),('billing'),
  ('public'),('static'),('cdn'),('assets'),('dev'),('staging'),('test')
) as r(sub)
on conflict (public_subdomain) where public_subdomain is not null do nothing;

-- Platform marketing + admin hosts tracked as full custom_domain rows so
-- they do NOT collide with the reserved 'app' subdomain seeded above.
-- resolve_event_by_host() special-cases these hostnames directly.
insert into public.event_domains (
  agency_id, event_id, public_subdomain, custom_domain,
  domain_type, status, is_primary
)
values
  (null, null, null, 'easypassport.com.au',     'platform_marketing', 'active', false),
  (null, null, null, 'app.easypassport.com.au', 'platform_admin',     'active', false)
on conflict do nothing;
-- ---------------------------------------------------------------------
-- FILE: 32_rpcs_public.sql
-- ---------------------------------------------------------------------
-- 32_rpcs_public.sql
-- Draft only. Do not execute.
-- Public-facing RPCs. SECURITY DEFINER, explicit search_path, no SELECT *,
-- never return private visitor fields.

-- Host → routing dispatch.
create or replace function public.resolve_event_by_host(_hostname text)
returns table (
  kind text,           -- 'marketing' | 'admin' | 'event' | 'not_found'
  event_id uuid,
  public_slug citext,
  requires_auth boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host citext := lower(_hostname);
  v_root constant citext := 'easypassport.com.au';
  v_suffix constant text := '.easypassport.com.au';
  v_label citext;
  v_evt uuid;
  v_slug citext;
begin
  -- Strip an optional :port (defensive — Host headers can include one).
  v_host := split_part(v_host::text, ':', 1)::citext;

  -- Apex marketing site.
  if v_host = v_root then
    return query select 'marketing'::text, null::uuid, null::citext, false;
    return;
  end if;

  -- Admin host.
  if v_host = ('app' || v_suffix)::citext then
    return query select 'admin'::text, null::uuid, null::citext, true;
    return;
  end if;

  -- Event subdomain: ONLY when host ends with .easypassport.com.au and the
  -- first label is not a reserved name.
  if right(v_host::text, length(v_suffix)) = v_suffix then
    v_label := split_part(v_host::text, '.', 1)::citext;

    if public.is_reserved_public_slug(v_label::text) then
      return query select 'not_found'::text, null::uuid, null::citext, false;
      return;
    end if;

    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and e.status = 'published'
      and d.domain_type = 'event_subdomain'
      and d.public_subdomain = v_label
    limit 1;
  else
    -- Custom domain: exact host match only. No first-label fallback.
    select e.id, e.public_slug
      into v_evt, v_slug
    from public.event_domains d
    join public.events e on e.id = d.event_id
    where d.status = 'active'
      and e.status = 'published'
      and d.domain_type = 'event_custom'
      and d.custom_domain = v_host
    limit 1;
  end if;

  if v_evt is null then
    return query select 'not_found'::text, null::uuid, null::citext, false;
  else
    return query select 'event'::text, v_evt, v_slug, false;
  end if;
end;
$$;

-- Public event lookup by globally-unique public_slug (path fallback).
create or replace function public.get_public_event(_public_slug citext)
returns table (
  event_id uuid,
  name text,
  public_slug citext,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  logo_path text,
  cover_path text,
  primary_color text,
  accent_color text,
  font_family text,
  welcome_copy text,
  terms_url text,
  current_terms_version_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.name, e.public_slug, e.description,
    e.starts_at, e.ends_at, e.timezone,
    b.logo_path, b.cover_path, b.primary_color, b.accent_color,
    b.font_family, b.welcome_copy, b.terms_url,
    e.current_terms_version_id
  from public.events e
  left join public.event_branding b on b.event_id = e.id
  where e.status = 'published'
    and e.public_slug = _public_slug
  limit 1
$$;

create or replace function public.get_public_event_by_domain(_hostname text)
returns table (
  event_id uuid,
  name text,
  public_slug citext,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  logo_path text,
  cover_path text,
  primary_color text,
  accent_color text,
  font_family text,
  welcome_copy text,
  terms_url text,
  current_terms_version_id uuid
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

  if r.kind <> 'event' then
    return;
  end if;

  return query
    select
      e.id, e.name, e.public_slug, e.description,
      e.starts_at, e.ends_at, e.timezone,
      b.logo_path, b.cover_path, b.primary_color, b.accent_color,
      b.font_family, b.welcome_copy, b.terms_url,
      e.current_terms_version_id
    from public.events e
    left join public.event_branding b on b.event_id = e.id
    where e.id = r.event_id and e.status = 'published';
end;
$$;

create or replace function public.get_public_event_venues(_event_id uuid)
returns table (
  venue_id uuid,
  name text,
  address text,
  lat numeric(9,6),
  lng numeric(9,6),
  order_index int
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.name, v.address, v.lat, v.lng, v.order_index
  from public.venues v
  join public.events e on e.id = v.event_id
  where e.status = 'published'
    and v.event_id = _event_id
    and v.status = 'active'
    and v.deleted_at is null
  order by v.order_index, v.name
$$;

create or replace function public.get_public_venue_offers(_event_id uuid)
returns table (
  offer_id uuid,
  venue_id uuid,
  title text,
  description text,
  redemption_instructions text,
  offer_type text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.venue_id, o.title, o.description,
    o.redemption_instructions, o.offer_type,
    o.starts_at, o.ends_at
  from public.venue_offers o
  join public.events e on e.id = o.event_id
  where e.status = 'published'
    and o.event_id = _event_id
    and o.is_active = true
    and o.deleted_at is null
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at   is null or o.ends_at   >= now())
$$;

-- Leaderboard: NEVER selects full_name, email, mobile, postcode.
create or replace function public.get_public_leaderboard(_event_id uuid)
returns table (
  display_name text,
  visit_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.leaderboard_settings%rowtype;
begin
  select * into s from public.leaderboard_settings where event_id = _event_id;
  if not found or s.is_enabled = false then
    return;
  end if;

  return query
  with counts as (
    select
      p.id as passport_id,
      p.visitor_id,
      p.leaderboard_opt_out,
      count(c.*)::int as cnt
    from public.passports p
    left join public.checkins c on c.passport_id = p.id
    where p.event_id = _event_id
    group by p.id, p.visitor_id, p.leaderboard_opt_out
  )
  select
    case s.display_mode
      when 'anonymous'               then 'Anonymous'
      when 'alias_only'              then coalesce(v.first_name, 'Guest')
      when 'first_name_only'         then coalesce(v.first_name, 'Guest')
      else                                 -- first_name_last_initial
        coalesce(v.first_name, 'Guest')
        || case
             when s.show_last_initial and v.last_name is not null and length(v.last_name) > 0
               then ' ' || upper(left(v.last_name, 1)) || '.'
             else ''
           end
    end as display_name,
    case when s.show_visit_count then counts.cnt else null end as visit_count
  from counts
  join public.visitors v on v.id = counts.visitor_id
  where counts.cnt >= s.hide_below_checkins
    and (s.allow_visitor_opt_out = false or counts.leaderboard_opt_out = false)
  order by counts.cnt desc, v.first_name asc;
end;
$$;

create or replace function public.validate_public_subdomain(_candidate text)
returns table (ok boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v citext := lower(_candidate);
begin
  if v is null or length(v) < 3 or length(v) > 63 then
    return query select false, 'length'; return;
  end if;
  if not public.is_valid_public_slug(v) then
    return query select false, 'format'; return;
  end if;
  if public.is_reserved_public_slug(v) then
    return query select false, 'reserved'; return;
  end if;
  if exists (select 1 from public.event_domains where public_subdomain = v) then
    return query select false, 'taken'; return;
  end if;
  return query select true, null::text;
end;
$$;

-- EXECUTE grants: public RPCs are intentionally callable by anon AND
-- authenticated; they return only safe projections.
grant execute on function public.resolve_event_by_host(text)            to anon, authenticated;
grant execute on function public.get_public_event(citext)                to anon, authenticated;
grant execute on function public.get_public_event_by_domain(text)        to anon, authenticated;
grant execute on function public.get_public_event_venues(uuid)           to anon, authenticated;
grant execute on function public.get_public_venue_offers(uuid)           to anon, authenticated;
grant execute on function public.get_public_leaderboard(uuid)            to anon, authenticated;
grant execute on function public.validate_public_subdomain(text)         to anon, authenticated;

-- ---------------------------------------------------------------------
-- FILE: 33_rpcs_visitor.sql
-- ---------------------------------------------------------------------
-- 33_rpcs_visitor.sql
-- Draft only. Do not execute.
-- Visitor RPCs. SECURITY DEFINER, explicit search_path, no SELECT *.
-- Returns only fields the passport owner is allowed to see; never returns
-- another visitor's PII.
--
-- DEFERRED SCOPE (intentional, tracked):
--   * get_passport_by_token returns only owner identity + raw checkin_count.
--     Reward progress, prize eligibility, and milestone state will be added
--     in a later migration (alongside reward_rules / prize_rules evaluation
--     helpers) BEFORE the visitor UI consumes those fields.
--   * redeem_checkin writes the checkin row only. Passport completion and
--     reward unlock evaluation (reading reward_rules, flipping
--     passports.status to 'completed', writing completed_at) will be added
--     in a later migration BEFORE UI integration. The current RPC is safe
--     in isolation: it never leaves the passport in an inconsistent state,
--     it just doesn't yet advance progress.

-- Helper: SHA-256 of a raw access token.
create or replace function public.passport_token_hash(_raw text)
returns bytea
language sql
immutable
set search_path = public
as $$
  select digest(_raw, 'sha256')
$$;

-- register_visitor
-- Creates visitor + passport + consent rows in a single transaction.
-- Returns the raw access token ONCE so the client can store it.
create or replace function public.register_visitor(
  _event_id uuid,
  _email citext,
  _full_name text,
  _first_name text,
  _last_name text,
  _mobile text,
  _postcode text,
  _marketing_opt_in boolean,
  _accepted_terms_version_id uuid,
  _locale text default null,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  passport_id uuid,
  access_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_visitor uuid;
  v_passport uuid;
  v_raw text;
  v_hash bytea;
begin
  -- Resolve agency_id; reject if event is not published.
  select agency_id into v_agency
  from public.events
  where id = _event_id and status = 'published';
  if v_agency is null then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;

  -- Validate terms version belongs to this event.
  if _accepted_terms_version_id is null
     or not exists (
       select 1 from public.event_terms_versions
       where id = _accepted_terms_version_id and event_id = _event_id
     )
  then
    raise exception 'terms_version_invalid' using errcode = 'P0001';
  end if;

  -- Upsert visitor by (event_id, email).
  insert into public.visitors (
    agency_id, event_id, email, full_name, first_name, last_name,
    mobile, postcode, marketing_opt_in, locale
  )
  values (
    v_agency, _event_id, _email, _full_name, _first_name, _last_name,
    _mobile, _postcode, coalesce(_marketing_opt_in, false), _locale
  )
  on conflict (event_id, email) do update
    set full_name = excluded.full_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        mobile = coalesce(excluded.mobile, public.visitors.mobile),
        postcode = coalesce(excluded.postcode, public.visitors.postcode),
        marketing_opt_in = excluded.marketing_opt_in
  returning id into v_visitor;

  -- Generate opaque token + hash.
  v_raw := encode(gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');
  v_hash := digest(v_raw, 'sha256');

  insert into public.passports (
    agency_id, event_id, visitor_id, access_token_hash
  ) values (
    v_agency, _event_id, v_visitor, v_hash
  )
  on conflict (event_id, visitor_id) do update
    set access_token_hash = excluded.access_token_hash,
        updated_at = now()
  returning id into v_passport;

  -- Consent ledger (terms + privacy required; marketing optional).
  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, terms_version_id,
    client_ip, user_agent
  ) values
    (v_agency, _event_id, v_visitor, v_passport, 'terms',   'granted', _accepted_terms_version_id, _client_ip, _user_agent),
    (v_agency, _event_id, v_visitor, v_passport, 'privacy', 'granted', _accepted_terms_version_id, _client_ip, _user_agent);

  if coalesce(_marketing_opt_in, false) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, terms_version_id,
      client_ip, user_agent
    ) values (v_agency, _event_id, v_visitor, v_passport, 'marketing', 'granted', null, _client_ip, _user_agent);
  end if;

  return query select v_passport, v_raw;
end;
$$;

-- update_marketing_consent (append-only)
create or replace function public.update_marketing_consent(
  _raw_token text,
  _decision text,
  _client_ip inet default null,
  _user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  if _decision not in ('granted','withdrawn') then
    raise exception 'invalid_decision';
  end if;

  select id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = digest(_raw_token, 'sha256');

  if p.id is null then
    raise exception 'passport_not_found';
  end if;

  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, terms_version_id,
    client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.visitor_id, p.id,
    'marketing', _decision, null, _client_ip, _user_agent
  );

  update public.visitors
    set marketing_opt_in = (_decision = 'granted')
  where id = p.visitor_id;
end;
$$;

-- get_passport_by_token: returns ONLY the passport owner's data.
create or replace function public.get_passport_by_token(_raw_token text)
returns table (
  passport_id uuid,
  event_id uuid,
  status text,
  completed_at timestamptz,
  leaderboard_opt_out boolean,
  -- Owner-only PII fields:
  email citext,
  full_name text,
  first_name text,
  last_name text,
  mobile text,
  postcode text,
  marketing_opt_in boolean,
  checkin_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.event_id, p.status, p.completed_at, p.leaderboard_opt_out,
    v.email, v.full_name, v.first_name, v.last_name,
    v.mobile, v.postcode, v.marketing_opt_in,
    (select count(*)::int from public.checkins c where c.passport_id = p.id)
  from public.passports p
  join public.visitors v on v.id = p.visitor_id
  where p.access_token_hash = digest(_raw_token, 'sha256')
  limit 1
$$;

-- redeem_checkin: the ONLY writer of public.checkins.
create or replace function public.redeem_checkin(
  _qr_token text,
  _passport_token text,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  checkin_id uuid,
  venue_id uuid,
  passport_id uuid,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q record;
  p record;
  s record;
  v_checkin uuid;
  v_existing uuid;
  v_last timestamptz;
begin
  -- 1. Resolve QR.
  select qr.id as qr_id, qr.venue_id, qr.event_id, qr.agency_id,
         e.status as event_status
    into q
  from public.venue_qr_codes qr
  join public.events e on e.id = qr.event_id
  where qr.token = _qr_token and qr.status = 'active';

  if q.qr_id is null then
    raise exception 'qr_invalid';
  end if;

  if q.event_status <> 'published' then
    raise exception 'event_not_available';
  end if;

  -- 2. Resolve passport.
  select id as passport_id, agency_id, event_id, visitor_id
    into p
  from public.passports
  where access_token_hash = digest(_passport_token, 'sha256');

  if p.passport_id is null then
    raise exception 'passport_not_found';
  end if;

  -- 3. Tenant integrity: passport must belong to QR's event.
  if p.event_id <> q.event_id or p.agency_id <> q.agency_id then
    raise exception 'passport_event_mismatch';
  end if;

  -- 4. Load checkin settings (with safe defaults).
  select coalesce(es.one_checkin_per_venue, true)             as one_per_venue,
         coalesce(es.minimum_seconds_between_checkins, 0)     as min_seconds,
         coalesce(es.allow_manual_admin_checkins, false)      as allow_manual
    into s
  from (select 1) x
  left join public.event_checkin_settings es on es.event_id = q.event_id;

  -- 5. one-per-venue: short-circuit duplicate to idempotent result.
  if s.one_per_venue then
    select id into v_existing
    from public.checkins
    where passport_id = p.passport_id and venue_id = q.venue_id
    limit 1;

    if v_existing is not null then
      return query select v_existing, q.venue_id, p.passport_id, false;
      return;
    end if;
  end if;

  -- 6. min-seconds rate limit per passport.
  if s.min_seconds > 0 then
    select max(created_at) into v_last
    from public.checkins where passport_id = p.passport_id;
    if v_last is not null and (now() - v_last) < (s.min_seconds || ' seconds')::interval then
      raise exception 'rate_limited';
    end if;
  end if;

  -- 7. Insert checkin (definer-bypass of RLS).
  insert into public.checkins (
    agency_id, event_id, passport_id, visitor_id,
    venue_id, venue_qr_code_id, source,
    client_ip, user_agent
  ) values (
    p.agency_id, p.event_id, p.passport_id, p.visitor_id,
    q.venue_id, q.qr_id, 'qr_scan',
    _client_ip, _user_agent
  )
  returning id into v_checkin;

  return query select v_checkin, q.venue_id, p.passport_id, true;
end;
$$;

grant execute on function public.register_visitor(
  uuid, citext, text, text, text, text, text, boolean, uuid, text, inet, text
) to anon, authenticated;
grant execute on function public.update_marketing_consent(text, text, inet, text) to anon, authenticated;
grant execute on function public.get_passport_by_token(text)                       to anon, authenticated;
grant execute on function public.redeem_checkin(text, text, inet, text)            to anon, authenticated;

-- ---------------------------------------------------------------------
-- FILE: 34_rpcs_admin.sql
-- ---------------------------------------------------------------------
-- 34_rpcs_admin.sql
-- Draft only. Do not execute.
-- Admin RPCs. SECURITY DEFINER, explicit search_path.
-- Every function verifies caller via agency_id-scoped helpers.

-- Rotate the active QR token for a venue.
create or replace function public.rotate_venue_qr(_venue_id uuid)
returns text                                  -- new token (raw)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_token text;
begin
  select id, agency_id, event_id into v
  from public.venues where id = _venue_id;
  if v.id is null then
    raise exception 'venue_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v.agency_id)) then
    raise exception 'forbidden';
  end if;

  v_token := replace(replace(replace(encode(gen_random_bytes(24), 'base64'),'+','-'),'/','_'),'=','');

  update public.venue_qr_codes
    set status = 'revoked', revoked_at = now()
  where venue_id = _venue_id and status = 'active';

  insert into public.venue_qr_codes (
    agency_id, event_id, venue_id, token, status, created_by
  ) values (v.agency_id, v.event_id, _venue_id, v_token, 'active', auth.uid());

  return v_token;
end;
$$;

-- Evaluate which prize rules a passport currently satisfies.
create or replace function public.evaluate_prize_eligibility(_passport_id uuid)
returns table (
  prize_rule_id uuid,
  prize_type text,
  eligible boolean,
  entry_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  cnt int;
begin
  select agency_id, event_id, status into p
  from public.passports where id = _passport_id;
  if p.event_id is null then
    raise exception 'passport_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), p.agency_id)) then
    raise exception 'forbidden';
  end if;

  select count(*)::int into cnt
  from public.checkins where passport_id = _passport_id;

  return query
  select
    pr.id,
    pr.prize_type,
    case
      when pr.is_active = false then false
      when pr.prize_type = 'completion_prize' then p.status = 'completed'
      when pr.prize_type in ('draw_entry','instant_reward')
        then pr.threshold_checkins is not null and cnt >= pr.threshold_checkins
      else false
    end as eligible,
    case
      when pr.prize_type = 'draw_entry' and pr.threshold_checkins is not null and pr.threshold_checkins > 0 then
        least(
          coalesce(pr.max_entries_per_passport, 2147483647),
          (cnt / pr.threshold_checkins) * pr.entries_per_threshold
        )
      else 0
    end as entry_count
  from public.prize_rules pr
  where pr.event_id = p.event_id;
end;
$$;

-- Generic event CSV export. Writes an export_logs row.
create or replace function public.export_event_csv(
  _event_id uuid,
  _kind text,
  _filters jsonb default '{}'::jsonb,
  _client_ip inet default null,
  _user_agent text default null
)
returns uuid                                    -- export_logs.id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_log uuid;
  v_rows int := 0;
begin
  if _kind not in ('visitors','checkins','passports') then
    raise exception 'invalid_kind';
  end if;

  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  -- Row counting only; actual CSV streaming is done by a future server fn
  -- that calls a paged read RPC. Logging is the security boundary.
  if _kind = 'visitors' then
    select count(*)::int into v_rows from public.visitors where event_id = _event_id;
  elsif _kind = 'checkins' then
    select count(*)::int into v_rows from public.checkins where event_id = _event_id;
  elsif _kind = 'passports' then
    select count(*)::int into v_rows from public.passports where event_id = _event_id;
  end if;

  insert into public.export_logs (
    agency_id, event_id, user_id, kind, prize_rule_id,
    row_count, filters, client_ip, user_agent
  ) values (
    v_agency, _event_id, auth.uid(), _kind, null,
    v_rows, _filters, _client_ip, _user_agent
  )
  returning id into v_log;

  return v_log;
end;
$$;

-- Prize entrants export. Writes an export_logs row.
create or replace function public.export_prize_entrants(
  _event_id uuid,
  _prize_rule_id uuid,
  _client_ip inet default null,
  _user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_log uuid;
  v_rows int;
begin
  select agency_id into v_agency from public.events where id = _event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;
  if not exists (
    select 1 from public.prize_rules
    where id = _prize_rule_id and event_id = _event_id
  ) then
    raise exception 'prize_rule_not_in_event';
  end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  -- Approximation: count passports meeting eligibility right now.
  select count(*)::int into v_rows
  from public.passports p
  where p.event_id = _event_id
    and (select eligible from public.evaluate_prize_eligibility(p.id)
         where prize_rule_id = _prize_rule_id) = true;

  insert into public.export_logs (
    agency_id, event_id, user_id, kind, prize_rule_id,
    row_count, filters, client_ip, user_agent
  ) values (
    v_agency, _event_id, auth.uid(), 'prize_entrants', _prize_rule_id,
    coalesce(v_rows, 0), jsonb_build_object('prize_rule_id', _prize_rule_id),
    _client_ip, _user_agent
  )
  returning id into v_log;

  return v_log;
end;
$$;

-- Invite / revoke agency members (owner only).
create or replace function public.invite_agency_member(
  _agency_id uuid,
  _user_id uuid,
  _role public.agency_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_owner(auth.uid(), _agency_id)) then
    raise exception 'forbidden';
  end if;

  insert into public.agency_members (agency_id, user_id, role, invited_by)
  values (_agency_id, _user_id, _role, auth.uid())
  on conflict (agency_id, user_id, role) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_agency_member(
  _agency_id uuid,
  _user_id uuid,
  _role public.agency_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_owner(auth.uid(), _agency_id)) then
    raise exception 'forbidden';
  end if;

  delete from public.agency_members
  where agency_id = _agency_id and user_id = _user_id and role = _role;
end;
$$;

-- Admin RPCs are NOT granted to anon. authenticated only.
grant execute on function public.rotate_venue_qr(uuid)                                        to authenticated;
grant execute on function public.evaluate_prize_eligibility(uuid)                             to authenticated;
grant execute on function public.export_event_csv(uuid, text, jsonb, inet, text)              to authenticated;
grant execute on function public.export_prize_entrants(uuid, uuid, inet, text)                to authenticated;
grant execute on function public.invite_agency_member(uuid, uuid, public.agency_role)         to authenticated;
grant execute on function public.revoke_agency_member(uuid, uuid, public.agency_role)         to authenticated;

commit;
