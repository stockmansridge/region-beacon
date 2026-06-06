# System Admin — Delete organisation

Apply `apply.sql` in the Supabase SQL editor.

## What it does

Adds `public.system_admin_delete_organisation(_agency_id uuid)`:

- Platform-admin gated (`is_platform_admin(auth.uid())`).
- **Soft delete**: sets `agencies.deleted_at = now()` and `status = 'deleted'`.
- `system_admin_organisations()` already filters `deleted_at is null`, so the
  organisation disappears from the System Admin list immediately.
- Does NOT touch events, venues, passports, check-ins, analytics, billing
  records, or auth users — the action is reversible.

## Reverting a delete

```sql
update public.agencies
   set deleted_at = null,
       status = 'active',
       updated_at = now()
 where id = '<agency_id>';
```
