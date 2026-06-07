# System Admin: delete orphan auth user

Adds `public.system_admin_delete_orphan_auth_user(uuid)` — a platform_admin-only
RPC that deletes an `auth.users` row only when the target user has no
`user_roles` row and no `agency_members` row. Used by the System Admin →
Users & Invites → Auth-only users (orphans) Delete action.

## Apply

Run `apply.sql` in the Supabase SQL editor. Idempotent.

## Verify

```sql
-- 1. Function exists with the expected signature
select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'system_admin_delete_orphan_auth_user';

-- 2. As platform_admin, deleting yourself raises cannot_delete_self
select public.system_admin_delete_orphan_auth_user(auth.uid());

-- 3. As platform_admin, deleting a non-orphan raises
--    orphan_user_not_found_or_no_longer_orphaned
select public.system_admin_delete_orphan_auth_user('<user-with-membership>');
```
