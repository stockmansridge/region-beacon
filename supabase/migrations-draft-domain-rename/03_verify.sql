-- DRAFT — do not execute as a migration. Run AFTER 01 + 02 on staging only.
-- Read-only verification of the domain rename.

-- 1. Platform rows use the new hostnames.
select custom_domain, domain_type, status
  from public.event_domains
 where domain_type in ('platform_marketing','platform_admin')
 order by domain_type;
-- expect:
--   getstampd.com.au      | platform_marketing | active
--   app.getstampd.com.au  | platform_admin     | active

-- 2. Marketing apex resolves.
select * from public.resolve_event_by_host('getstampd.com.au');
-- expect: kind='marketing', event_id=null, public_slug=null, requires_auth=false

-- 3. Admin host resolves (and strips :port).
select * from public.resolve_event_by_host('app.getstampd.com.au');
select * from public.resolve_event_by_host('app.getstampd.com.au:443');
-- expect (both): kind='admin', event_id=null, public_slug=null, requires_auth=true

-- 4. Event subdomain on the new root does NOT resolve unless a matching
--    active event_subdomain row + published event exists.
select * from public.resolve_event_by_host('test.getstampd.com.au');
-- expect: kind='not_found' (no event_domains row for public_subdomain='test')

-- 5. Old root no longer resolves anywhere.
select * from public.resolve_event_by_host('easypassport.com.au');
select * from public.resolve_event_by_host('app.easypassport.com.au');
select * from public.resolve_event_by_host('test.easypassport.com.au');
-- expect (all three): kind='not_found'

-- 6. Reserved label on the new root still rejected.
select * from public.resolve_event_by_host('admin.getstampd.com.au');
-- expect: kind='not_found' ('admin' is a reserved public slug)

-- 7. Custom domain path still works (sanity — exact match only).
--    Substitute an actual custom_domain you have seeded if you want to test.
-- select * from public.resolve_event_by_host('example-custom-domain.test');
