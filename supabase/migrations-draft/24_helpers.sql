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
