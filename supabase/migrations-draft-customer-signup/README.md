# Customer self-service signup — draft migration

Adds `public.create_customer_agency(_agency_name text, _agency_slug text)`,
a SECURITY DEFINER RPC that lets a freshly signed-up `authenticated` user
create their own agency workspace and become its `agency_owner` without
opening up direct INSERT access on `agencies` / `agency_members`.

## Files

- `01_create_customer_agency.sql` — function + grants.
- `02_verify.sql` — manual verification snippets to run in staging SQL editor.

## Apply (staging only)

1. Review the SQL.
2. Apply `01_create_customer_agency.sql` to the staging Supabase project.
3. Run the checks in `02_verify.sql`. Confirm:
   - anonymous call rejected,
   - authenticated call creates `agencies` + `agency_members` rows,
   - duplicate slug rejected,
   - bad slug rejected,
   - no `platform_admin` row is created.

## Not in scope

- No table or RLS changes.
- No storage changes.
- No production database changes.
- No service-role usage from the client.

## Frontend wiring

The new `/signup` route imports this RPC name. The form will succeed only
after `01_create_customer_agency.sql` is applied to staging. Until then,
form submission falls back to a friendly "signup not yet enabled" message.
