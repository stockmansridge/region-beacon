# System Admin — recent logins RPC

Adds `public.system_admin_recent_logins(_limit int)` powering the "Latest
logins" table on the System Admin overview tab.

- Read-only, `SECURITY DEFINER`, gated by `public._require_platform_admin()`.
- Returns the most recent `auth.users.last_sign_in_at` rows with the user's
  first accepted organisation membership (if any) and platform-admin flag.
- `EXECUTE` granted to `authenticated` only.

## How to run

1. Open the Supabase SQL editor for the production project.
2. Paste `apply.sql` and run it once. Safe to re-run.

## Verify

```sql
select * from public.system_admin_recent_logins(25);
```

Non-platform-admin callers get `forbidden: platform_admin required` (42501).
