-- 05_verify_fix_restrictive_deny_all.sql
-- DRAFT verifier — run inside begin; ... rollback;
--
-- Confirms:
--   1. deny_all policy is gone
--   2. three permissive policies remain with the expected USING/CHECK shape
--   3. anon has NO direct table privileges
--   4. authenticated retains insert/update/delete/select grants (RLS still enforced)

begin;

-- 1. deny_all removed
select 'deny_all_removed' as check, count(*) = 0 as ok
from pg_policies
where schemaname = 'public'
  and tablename  = 'event_announcements'
  and policyname = 'deny_all';

-- 2. permissive policies present
select policyname, permissive, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'event_announcements'
order by policyname;

-- 3. no anon table grants
select 'no_anon_grants' as check,
       count(*) = 0 as ok
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'event_announcements'
  and grantee      = 'anon';

-- 4. authenticated grants present
select privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'event_announcements'
  and grantee      = 'authenticated'
order by privilege_type;

rollback;
