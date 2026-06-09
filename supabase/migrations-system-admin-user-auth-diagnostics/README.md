# System Admin — User Auth Diagnostics

Adds three platform-admin-only `SECURITY DEFINER` RPCs that power the
**User auth diagnostics** card in `/admin/system → Users & invites`.

## RPCs

| RPC | Purpose |
| --- | --- |
| `system_admin_find_auth_user(p_search text)` | Search `auth.users` by email substring or UUID. Returns a sanitised summary plus org membership info. |
| `system_admin_user_auth_timeline(p_user_id uuid)` | Chronological auth timeline: timestamps from `auth.users` + entries from `auth.audit_log_entries` when present. |
| `system_admin_auth_email_diagnostics(p_user_id uuid)` | Plain-English "likely issue / next action" checklist. |

All RPCs gate on `public.is_platform_admin(auth.uid())` and raise
`forbidden: platform_admin required` (SQLSTATE `42501`) otherwise.

## Safety

- No tokens, OTPs, refresh tokens, password hashes, or identity-provider
  secrets are returned.
- The frontend never touches the `auth` schema directly — only these
  RPCs read from it.
- Email events from `auth.users` are labelled as **"handoff — delivery
  not confirmed"** because Supabase only records that an email was
  generated, not delivered.
- `EXECUTE` is granted to `authenticated` only.

## Apply

Paste `apply.sql` into the Supabase SQL editor and run once. Idempotent.

## Verify (as a platform_admin user)

```sql
select * from public.system_admin_find_auth_user('owner@example.com');
select * from public.system_admin_user_auth_timeline('<user-uuid>');
select public.system_admin_auth_email_diagnostics('<user-uuid>');
```
