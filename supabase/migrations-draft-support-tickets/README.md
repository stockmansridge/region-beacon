# Support tickets — migration draft

Applies the GetStampd support-ticket feature additively to the production
Supabase project (`kyjwifumacnrpgyextzz`).

## What it adds

- `public.support_tickets` table (with status / priority / category checks).
- `updated_at` touch trigger.
- RLS:
  - Authenticated users can `INSERT` only their own rows.
  - Authenticated users can `SELECT` only their own rows.
  - Platform admins (via `public.is_platform_admin(uuid)` if present, else
    `public.user_roles` lookup) can `SELECT` and `UPDATE` all rows.
- RPCs used by the app:
  - `public.create_support_ticket(...)` — user submission.
  - `public.system_admin_support_tickets(p_status, p_limit)` — admin list.
  - `public.system_admin_support_ticket_counts()` — banner counts.
  - `public.system_admin_update_support_ticket(p_id, p_status, p_priority, p_admin_notes)` — admin edit.

## How to apply

```bash
# From the GetStampd repo
psql "$GETSTAMPD_SUPABASE_DB_URL" -f supabase/migrations-draft-support-tickets/01_support_tickets.sql
```

The script is wrapped in a transaction and uses `if not exists` /
`create or replace` so it is safe to re-run.

## Verifying

```sql
select count(*) from public.support_tickets;
select proname from pg_proc
  where proname in (
    'create_support_ticket',
    'system_admin_support_tickets',
    'system_admin_support_ticket_counts',
    'system_admin_update_support_ticket'
  );
```
