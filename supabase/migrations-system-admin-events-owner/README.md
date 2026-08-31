# System Admin events — linked user column

Run `apply.sql` in the production SQL editor.

It recreates `public.system_admin_events()` with two extra columns:

- `owner_name` — the organisation owner's name (from auth metadata, falling
  back to the email local-part)
- `owner_email` — the organisation owner's email (falling back to the
  organisation billing email)

The System Admin Events table and each organisation's event list show this as
an "Owner" column. Until the SQL is applied the column simply renders "—";
nothing breaks.
