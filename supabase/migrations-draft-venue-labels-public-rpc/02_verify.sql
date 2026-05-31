-- 02_verify.sql — manual verification, do not run as a migration.

-- 1. RPC exists with the expected signature.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid)             as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_public_event_by_domain';

-- 2. Output columns include the new labels.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'get_public_event_by_domain';
-- (For SQL functions, also check by calling it — see step 3.)

-- 3. Live published event returns configured labels.
-- Replace the hostname with a real published subdomain.
select
  event_id,
  name,
  venue_label_singular,
  venue_label_plural
from public.get_public_event_by_domain('your-event.getstampd.com.au');

-- 4. Event with null/blank labels falls back to 'Venue' / 'Venues'.
-- Pick an event_id whose event_branding row has NULL or '' for the label
-- columns and confirm the RPC still returns 'Venue' / 'Venues'.

-- 5. Confirm no sensitive fields are exposed.
-- The select-list above is the entire public surface; eyeball it:
--   - no email / phone / contact
--   - no billing / Stripe / plan
--   - no visitor / passport / check-in / QR token
--   - no admin-only flags
-- If any of those appear, STOP and revise before applying.
