# Agency signup intention

Adds `agencies.signup_intention` and surfaces it through the customer-signup
RPC and the System Admin Organisations RPC.

## What it changes

1. `agencies.signup_intention text` (nullable) — new column.
2. `public.create_customer_agency(_agency_name, _agency_slug, _signup_intention text default null)`
   — the old 2-arg signature is dropped and replaced by a 3-arg version
   with the third arg defaulted. PostgREST resolves by argument name, so
   existing callers that only send `_agency_name` and `_agency_slug` keep
   working unchanged.
3. `public.system_admin_organisations()` — returns the new `signup_intention`
   column at the end of the result set.
4. One-shot backfill: for each agency where `signup_intention is null`, fill
   from `auth.users.raw_user_meta_data->>'experience_type'` of the earliest
   accepted `agency_owner` member (same relationship the function uses for
   `owner_email`). Agencies with no metadata or no resolvable owner are
   left untouched.

## Apply

Run `apply.sql` against the target Supabase project (SQL editor or `psql`).
Idempotent — safe to re-run.

## Verify

```sql
select agency_id, name, signup_intention
  from public.system_admin_organisations()
  where signup_intention is not null
  order by created_at desc
  limit 20;
```

## Rollback (manual)

```sql
drop function if exists public.create_customer_agency(text, text, text);
-- (Recreate the previous 2-arg version from migrations-draft-customer-signup/01.)
alter table public.agencies drop column if exists signup_intention;
```
