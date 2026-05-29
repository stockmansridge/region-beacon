-- 02_enums.sql
-- Draft only. Do not execute.
-- Global vs agency-scoped roles are intentionally separated (Rev 3 §1).

do $$ begin
  create type public.app_role as enum ('platform_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.agency_role as enum ('agency_owner', 'agency_admin', 'agency_staff');
exception when duplicate_object then null; end $$;
