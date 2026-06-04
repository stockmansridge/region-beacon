# System Admin RPCs — production apply

Idempotent, additive SQL that powers the platform-wide System Admin page
(`/admin/system`). No tables are created or dropped — only `CREATE OR REPLACE
FUNCTION` for five read-only RPCs and a tiny guard helper.

## Why this exists

The System Admin page needs to read across every organisation (agencies,
events, members, audit logs, …). RLS on those tables denies broad reads by
design, and exposing the service-role key to the frontend is not acceptable.
The clean answer is small SECURITY DEFINER RPCs that each:

1. Gate on `public.is_platform_admin(auth.uid())` and raise if false.
2. Return only the columns the admin UI actually needs.
3. Grant `EXECUTE` to `authenticated` only (no `anon`, no `public`).

## RPCs installed

| RPC | Purpose |
| --- | --- |
| `_require_platform_admin()` | Internal guard, raises `42501` for non-admins. |
| `system_admin_overview()` → `jsonb` | Summary counts for the top cards. |
| `system_admin_organisations()` | One row per organisation with rollups. |
| `system_admin_users()` | Platform admins + accepted/pending organisation members. |
| `system_admin_events()` | Every event across organisations with rollups. |
| `system_admin_audit_logs(_limit int)` | Recent entries from `audit_logs` (no-op if table absent). |

Optional tables (`event_activations`) are referenced through `to_regclass()`
so the RPC succeeds even if billing tables haven't been deployed yet.

## How to run

1. Open the Supabase SQL editor for the production project
   (`kyjwifumacnrpgyextzz`).
2. Paste `apply.sql`.
3. Run it once. Safe to re-run.

## Verify (as a platform_admin user)

```sql
select public.system_admin_overview();
select * from public.system_admin_organisations() limit 5;
select * from public.system_admin_users() limit 20;
select * from public.system_admin_events() limit 20;
select * from public.system_admin_audit_logs(50);
```

A non-platform-admin caller will receive
`forbidden: platform_admin required` (SQLSTATE 42501).
