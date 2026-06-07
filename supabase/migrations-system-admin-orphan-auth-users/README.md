# System Admin: orphan auth users

Adds `public.system_admin_orphan_auth_users()` — a platform_admin-only RPC
that returns auth.users with no platform role and no agency_members row.

Used by the System Admin → Users tab to surface "auth-only" accounts that
can sign in but have no organisation to land in (typically users who began
signup but never completed organisation creation).

## Apply

Run `apply.sql` in the Supabase SQL editor. Idempotent.

## Verify

```sql
-- 1. Function exists with the expected signature
select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'system_admin_orphan_auth_users';

-- 2. Platform admin can call it
select * from public.system_admin_orphan_auth_users() limit 5;

-- 3. Non-admin gets 'forbidden: platform_admin required'
```
