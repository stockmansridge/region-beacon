-- DRAFT verification — read-only. Safe to run on staging after 01 is applied.
--
-- Static checks (no setup required):
--   * getstamped.com.au           -> marketing
--   * app.getstamped.com.au       -> admin (requires_auth = true)
--   * easypassport.com.au / *.easypassport.com.au -> not_found
--   * admin.getstamped.com.au     -> not_found (reserved label)
--
-- The remaining scenarios depend on per-event rows. Set up the fixture below
-- in staging first, run the scenario block, then mutate the fixture between
-- scenarios. NOTHING in this file performs writes — all UPDATE statements are
-- shown as commented templates so you can paste them manually if desired.

-- ---------------------------------------------------------------------------
-- A. Static checks (run as-is)
-- ---------------------------------------------------------------------------

select 'apex marketing' as case, * from public.resolve_event_by_host('getstamped.com.au');
select 'apex marketing :443' as case, * from public.resolve_event_by_host('getstamped.com.au:443');
select 'admin host' as case, * from public.resolve_event_by_host('app.getstamped.com.au');
select 'admin host :443' as case, * from public.resolve_event_by_host('app.getstamped.com.au:443');
select 'old apex' as case, * from public.resolve_event_by_host('easypassport.com.au');
select 'old subdomain' as case, * from public.resolve_event_by_host('demo.easypassport.com.au');
select 'reserved label' as case, * from public.resolve_event_by_host('admin.getstamped.com.au');
select 'unknown custom' as case, * from public.resolve_event_by_host('notapartner.example.com');

-- ---------------------------------------------------------------------------
-- B. Per-event fixture (manual setup required on staging)
-- ---------------------------------------------------------------------------
-- Pick or create ONE staging event and ONE event_domains row pointing at it.
-- Replace the literals below with your staging IDs / subdomain before running
-- the scenario block.
--
--   :event_id      = an events.id you control on staging
--   :subdomain     = the public_subdomain on its event_domains row
--                    (e.g. 'gate-test')
--
-- The event_domains row MUST have:
--   domain_type      = 'event_subdomain'
--   public_subdomain = :subdomain
--   agency_id        = the event's agency
--
-- The event_activations row is what platform_set_event_activation manages
-- (use the staging admin UI to flip it between unpaid / comp).

-- NOTE: The Supabase SQL editor does NOT support psql meta-commands
-- (`\set`, `:'var'`). Edit the two literals below before running each
-- scenario in the editor. If you run this file through `psql` instead,
-- you can replace these with `\set` variables.

-- >>> EDIT THESE TWO VALUES <<<
-- Replace with a real staging event id and its event_subdomain label.
-- e.g.
--   FIXTURE_EVENT_ID  = '11111111-2222-3333-4444-555555555555'
--   FIXTURE_SUBDOMAIN = 'gate-test'

-- Sanity: show current state of the fixture before each scenario.
select e.id, e.status as event_status, d.status as domain_status,
       d.public_subdomain, a.status as activation_status, a.activation_kind
  from public.events e
  left join public.event_domains d
    on d.event_id = e.id and d.domain_type = 'event_subdomain'
  left join public.event_activations a on a.event_id = e.id
 where e.id = '00000000-0000-0000-0000-000000000000'::uuid;  -- FIXTURE_EVENT_ID

-- ---------------------------------------------------------------------------
-- C. Scenarios — between each scenario, manually set the fixture as noted,
--    then re-run the SELECT in this section.
--    Replace 'gate-test' with FIXTURE_SUBDOMAIN in each call below.
-- ---------------------------------------------------------------------------

-- Scenario 1: active domain + DRAFT event + comp activation -> not_found
--   Fixture: events.status='draft',  event_domains.status='active',
--            event_activations.status='comp'.
--   (Use platform_set_event_activation to set comp; events.status stays draft.)
select 'S1 draft+active+comp' as case,
       * from public.resolve_event_by_host('gate-test.getstamped.com.au');
-- Expected: kind = 'not_found'

-- Scenario 2: PUBLISHED event + PENDING domain + comp activation -> not_found
--   Fixture: events.status='published', event_domains.status='pending',
--            event_activations.status='comp'.
--   NOTE: publishing/domain activation are NOT in scope of this migration; do
--   these mutations manually in staging only.
select 'S2 published+pending+comp' as case,
       * from public.resolve_event_by_host('gate-test.getstamped.com.au');
-- Expected: kind = 'not_found'

-- Scenario 3: published + active domain + UNPAID activation -> not_found
--   Fixture: events.status='published', event_domains.status='active',
--            event_activations.status='unpaid'  (kind='one_time').
select 'S3 published+active+unpaid' as case,
       * from public.resolve_event_by_host('gate-test.getstamped.com.au');
-- Expected: kind = 'not_found'

-- Scenario 4: published + active domain + COMP activation -> event
--   Fixture: events.status='published', event_domains.status='active',
--            event_activations.status='comp'.
select 'S4 published+active+comp' as case,
       * from public.resolve_event_by_host('gate-test.getstamped.com.au');
-- Expected: kind = 'event', event_id matches fixture.

-- Scenario 5: published + active domain + ACTIVE activation -> event
--   Fixture: events.status='published', event_domains.status='active',
--            event_activations.status='active'.
select 'S5 published+active+active' as case,
       * from public.resolve_event_by_host('gate-test.getstamped.com.au');
-- Expected: kind = 'event', event_id matches fixture.

-- Scenario 6: pending subdomain (no published event, no active domain).
--   Fixture: any event_domains row with status='pending' on a known subdomain.
select 'S6 pending subdomain' as case,
       * from public.resolve_event_by_host('some-pending-label.getstamped.com.au');
-- Expected: kind = 'not_found'

-- ---------------------------------------------------------------------------
-- D. Directly probe event_is_publishable for the fixture
-- ---------------------------------------------------------------------------
select 'is_publishable' as case,
       public.event_is_publishable('00000000-0000-0000-0000-000000000000'::uuid) as publishable;  -- FIXTURE_EVENT_ID

       public.event_is_publishable(:'event_id') as publishable;
