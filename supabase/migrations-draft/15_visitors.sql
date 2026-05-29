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
