# Pending organisation signups

Adds a server-side source of truth for organisation details collected during signup, so email confirmation can complete organisation creation even if the confirmation link opens outside the original browser/localStorage context.

## Apply

Run `apply.sql` in the SQL editor after the existing customer signup and System Admin RPC migrations.

## What changes

- Creates `public.pending_organisation_signups` with explicit grants and RLS.
- Adds `save_pending_organisation_signup(...)` for signup-form upsert by lowercased email.
- Adds `get_my_pending_organisation_signup()` for signed-in users to detect pending setup by their authenticated email.
- Adds `complete_pending_organisation_signup()` to create the agency with slug retry, persist `signup_intention`, and mark the pending row completed.
- Adds `system_admin_pending_organisation_signups()` for platform-admin diagnostics.

## Verification

```sql
select public.save_pending_organisation_signup(
  'test@example.com',
  'Test User',
  'Admin',
  'admin',
  'wine_trail'
);

select proname, pg_get_function_identity_arguments(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'save_pending_organisation_signup',
    'get_my_pending_organisation_signup',
    'complete_pending_organisation_signup',
    'system_admin_pending_organisation_signups'
  )
order by proname;
```

Then test signup with confirmation opened in a different browser/profile. The user should either be redirected into their organisation or see the retry screen with their stored organisation name.