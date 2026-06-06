# System Admin — delete user

Adds a single SECURITY DEFINER RPC, `public.system_admin_delete_user(uuid)`,
that lets a platform admin remove a user from the system end-to-end.

## What it does

1. Confirms the caller is a platform admin via `public.is_platform_admin`.
2. Blocks self-deletion (`auth.uid() = _target_user_id`).
3. Deletes the target user's rows from `public.agency_members` and
   `public.user_roles` (both also cascade from `auth.users`, but explicit
   deletes surface row counts and keep the cleanup explicit).
4. Deletes the row from `auth.users`. The function is `SECURITY DEFINER`
   owned by `postgres`, so it bypasses RLS and the usual restrictions on
   the auth schema.

## What it does NOT delete

Organisations, events, venues, passports, check-ins, analytics, audit
logs. Per platform policy, those are left intact for follow-up by a
platform admin (an owner being removed leaves the org ownerless).

## Apply

1. Open the Supabase SQL editor for the production project
   (`kyjwifumacnrpgyextzz`).
2. Paste `apply.sql`.
3. Run it. Safe to re-run.

## Smoke test

```sql
-- As a platform_admin session:
select public.system_admin_delete_user('<target-user-uuid>');
```

A non-admin caller receives `Only platform admins can delete users.`
(SQLSTATE 42501). Deleting yourself returns
`You cannot delete your own platform admin account.`.
