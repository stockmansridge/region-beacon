-- DRAFT verification — do not bundle into a real migration. Run by hand in
-- the Supabase SQL editor on STAGING ONLY, against a fixture event you
-- control. Nothing here mutates production schema.
--
-- Before running, set the two psql variables below to a real fixture event
-- on staging and a real fixture email you don't mind upserting under.
-- (Use \set in the psql client, or replace inline if running in the
-- Supabase SQL editor.)
--
--   \set fixture_event_id   '00000000-0000-0000-0000-000000000000'
--   \set fixture_email      'qa+register@example.com'
--
-- The flow assumes a platform admin can flip:
--   - events.status                     ('draft' | 'published')
--   - events.current_terms_version_id   (null | <a real version row>)
--   - event_domains.status              ('pending' | 'active')  for the primary domain
--   - event_activations                 via platform_set_event_activation()
--
-- After each scenario, clean up the visitor + passport rows the previous
-- success scenario inserted so the upsert paths stay predictable. A cleanup
-- block is included at the bottom.

-- ---------------------------------------------------------------------------
-- Sanity: confirm fixture exists and inspect current gate state.
-- ---------------------------------------------------------------------------
select e.id,
       e.status,
       e.current_terms_version_id,
       (select status from public.event_domains d
         where d.event_id = e.id and d.is_primary = true limit 1) as primary_domain_status,
       (select status from public.event_activations a
         where a.event_id = e.id limit 1)                         as activation_status,
       public.event_is_publishable(e.id)                          as is_publishable
from public.events e
where e.id = :'fixture_event_id';

-- A scratch terms version id we'll need for the "wrong version" scenario.
-- Replace inline with any UUID that is NOT the event's current terms
-- version (the scenario expects rejection).
\set wrong_terms_version_id '11111111-1111-1111-1111-111111111111'

-- Convenience: fetch the event's CURRENT terms version into a psql var so
-- the success scenario uses the real value. Run this once after you've set
-- current_terms_version_id on the fixture event.
select current_terms_version_id as current_terms
from public.events
where id = :'fixture_event_id';
-- Copy the value into the variable for later scenarios:
--   \set current_terms_version_id 'xxxxxxxx-xxxx-...'
\set current_terms_version_id '22222222-2222-2222-2222-222222222222'

-- ---------------------------------------------------------------------------
-- SCENARIO A: draft event  →  expect SQLSTATE P0001 'event_not_available'
-- Preconditions: set events.status='draft' for the fixture.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.register_visitor(
    _event_id := :'fixture_event_id'::uuid,
    _email := :'fixture_email'::citext,
    _full_name := 'QA Draft',
    _first_name := 'QA',
    _last_name := 'Draft',
    _mobile := null,
    _postcode := null,
    _marketing_opt_in := false,
    _accepted_terms_version_id := :'current_terms_version_id'::uuid
  );
  raise exception 'SCENARIO A FAILED: register_visitor should have rejected a draft event';
exception
  when sqlstate 'P0001' then
    raise notice 'SCENARIO A OK: % (expected event_not_available)', sqlerrm;
end$$;

-- ---------------------------------------------------------------------------
-- SCENARIO B: published + active primary domain + UNPAID activation
--             → expect 'event_not_available'
-- Preconditions: events.status='published', primary event_domains.status='active',
--                event_activations.status='unpaid' (use the platform admin
--                "Set unpaid" button in /admin/account or
--                platform_set_event_activation(..., 'unpaid','one_time',null)).
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.register_visitor(
    _event_id := :'fixture_event_id'::uuid,
    _email := :'fixture_email'::citext,
    _full_name := 'QA Unpaid',
    _first_name := 'QA',
    _last_name := 'Unpaid',
    _mobile := null,
    _postcode := null,
    _marketing_opt_in := false,
    _accepted_terms_version_id := :'current_terms_version_id'::uuid
  );
  raise exception 'SCENARIO B FAILED: register_visitor should have rejected an unpaid event';
exception
  when sqlstate 'P0001' then
    raise notice 'SCENARIO B OK: % (expected event_not_available)', sqlerrm;
end$$;

-- ---------------------------------------------------------------------------
-- SCENARIO C: published + active domain + COMP activation,
--             but events.current_terms_version_id IS NULL
--             → expect 'terms_not_configured'
-- Preconditions: comp-activate via platform_set_event_activation, then
--   update public.events set current_terms_version_id = null where id = :'fixture_event_id';
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.register_visitor(
    _event_id := :'fixture_event_id'::uuid,
    _email := :'fixture_email'::citext,
    _full_name := 'QA NoTerms',
    _first_name := 'QA',
    _last_name := 'NoTerms',
    _mobile := null,
    _postcode := null,
    _marketing_opt_in := false,
    _accepted_terms_version_id := :'current_terms_version_id'::uuid
  );
  raise exception 'SCENARIO C FAILED: should have rejected event with no current terms version';
exception
  when sqlstate 'P0001' then
    raise notice 'SCENARIO C OK: % (expected terms_not_configured)', sqlerrm;
end$$;

-- ---------------------------------------------------------------------------
-- SCENARIO D: gates pass + current_terms_version_id set, but client sends
--             a WRONG _accepted_terms_version_id
--             → expect 'terms_version_invalid'
-- Preconditions: set events.current_terms_version_id back to the real
-- version, leave gates passing.
-- ---------------------------------------------------------------------------
do $$
begin
  perform public.register_visitor(
    _event_id := :'fixture_event_id'::uuid,
    _email := :'fixture_email'::citext,
    _full_name := 'QA WrongTerms',
    _first_name := 'QA',
    _last_name := 'WrongTerms',
    _mobile := null,
    _postcode := null,
    _marketing_opt_in := false,
    _accepted_terms_version_id := :'wrong_terms_version_id'::uuid
  );
  raise exception 'SCENARIO D FAILED: should have rejected a stale terms version';
exception
  when sqlstate 'P0001' then
    raise notice 'SCENARIO D OK: % (expected terms_version_invalid)', sqlerrm;
end$$;

-- ---------------------------------------------------------------------------
-- SCENARIO E: gates pass + correct current terms version → success.
-- Run TWICE — once without marketing opt-in, once with — and assert the
-- consent ledger differs only by the marketing row.
-- ---------------------------------------------------------------------------

-- E.1 — no marketing opt-in
select * from public.register_visitor(
  _event_id := :'fixture_event_id'::uuid,
  _email := :'fixture_email'::citext,
  _full_name := 'QA Success NoMarketing',
  _first_name := 'QA',
  _last_name := 'Success',
  _mobile := null,
  _postcode := null,
  _marketing_opt_in := false,
  _accepted_terms_version_id := :'current_terms_version_id'::uuid
) as r;

-- Assertions for E.1:
--   - passport row exists with non-null access_token_hash of length 32 bytes
--     (SHA-256), and access_token text column does NOT exist.
select p.id                  as passport_id,
       octet_length(p.access_token_hash) as hash_bytes,
       p.access_token_hash is not null   as hash_present
from public.passports p
join public.visitors v on v.id = p.visitor_id
where p.event_id = :'fixture_event_id' and v.email = :'fixture_email';

-- Confirm the passports table has NO column called access_token (raw).
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'passports'
  and column_name in ('access_token','access_token_hash');
-- Expected: only 'access_token_hash'.

-- Consent ledger should contain exactly 'terms' and 'privacy' for this
-- passport (no 'marketing' row yet).
select consent_type, decision, terms_version_id is not null as has_terms_ref
from public.visitor_consents vc
join public.passports p on p.id = vc.passport_id
join public.visitors  v on v.id = p.visitor_id
where p.event_id = :'fixture_event_id' and v.email = :'fixture_email'
order by consent_type;
-- Expected rows: ('privacy','granted',true), ('terms','granted',true).

-- E.2 — same email, marketing opt-in true. Upsert path; new consent row.
select * from public.register_visitor(
  _event_id := :'fixture_event_id'::uuid,
  _email := :'fixture_email'::citext,
  _full_name := 'QA Success Marketing',
  _first_name := 'QA',
  _last_name := 'Success',
  _mobile := '+61400000000',
  _postcode := '2000',
  _marketing_opt_in := true,
  _accepted_terms_version_id := :'current_terms_version_id'::uuid
) as r;

-- Now expect a marketing consent row to exist alongside the prior two.
select consent_type, count(*)
from public.visitor_consents vc
join public.passports p on p.id = vc.passport_id
join public.visitors  v on v.id = p.visitor_id
where p.event_id = :'fixture_event_id' and v.email = :'fixture_email'
group by consent_type
order by consent_type;
-- Expected: marketing >= 1, privacy >= 2, terms >= 2  (each register call
-- inserts a fresh terms+privacy pair; that's intentional ledger behaviour).

-- Confirm access_token_hash was ROTATED by the second register call.
-- (Hash should differ from whatever you noted in E.1.)
select p.access_token_hash
from public.passports p
join public.visitors v on v.id = p.visitor_id
where p.event_id = :'fixture_event_id' and v.email = :'fixture_email';

-- ---------------------------------------------------------------------------
-- Cleanup (optional). Run after verification to keep staging tidy.
-- Only deletes the fixture rows this script created.
-- ---------------------------------------------------------------------------
-- delete from public.visitor_consents
--   where passport_id in (
--     select p.id from public.passports p
--     join public.visitors v on v.id = p.visitor_id
--     where p.event_id = :'fixture_event_id' and v.email = :'fixture_email'
--   );
-- delete from public.passports
--   where visitor_id in (
--     select id from public.visitors
--     where event_id = :'fixture_event_id' and email = :'fixture_email'
--   );
-- delete from public.visitors
--   where event_id = :'fixture_event_id' and email = :'fixture_email';
