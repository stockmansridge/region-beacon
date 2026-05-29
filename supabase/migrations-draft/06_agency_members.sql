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
