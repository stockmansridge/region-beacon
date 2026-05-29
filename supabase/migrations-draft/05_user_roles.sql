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
