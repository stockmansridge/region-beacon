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
