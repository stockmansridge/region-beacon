-- DRAFT — verification queries only. Read-only.
--
-- Run AFTER applying 01_ and 02_. Each block notes the expected shape.
-- Replace <PUBLISHED_SUB> with a real published event subdomain in your env
-- before running the parameterised checks.

-- 1) Apex / admin still resolve under BOTH suffixes.
--    Expected: kind='marketing', event_id=null, public_slug=null, requires_auth=false
select 'apex new' as case, * from public.resolve_event_by_host('getstampd.com.au');
select 'apex old' as case, * from public.resolve_event_by_host('getstamped.com.au');

--    Expected: kind='admin', requires_auth=true
select 'admin new' as case, * from public.resolve_event_by_host('app.getstampd.com.au');
select 'admin old' as case, * from public.resolve_event_by_host('app.getstamped.com.au');
select 'admin new :443' as case, * from public.resolve_event_by_host('app.getstampd.com.au:443');

-- 2) Reserved labels still rejected on the new suffix.
--    Expected: kind='not_found'
select 'reserved new' as case, * from public.resolve_event_by_host('admin.getstampd.com.au');
select 'reserved old' as case, * from public.resolve_event_by_host('admin.getstamped.com.au');

-- 3) A real published event subdomain resolves on BOTH suffixes.
--    Replace <PUBLISHED_SUB> with e.g. 'cargordtrail'.
--    Expected: kind='event', event_id=<uuid>, public_slug=<citext>
select 'event new' as case, * from public.resolve_event_by_host('<PUBLISHED_SUB>.getstampd.com.au');
select 'event old' as case, * from public.resolve_event_by_host('<PUBLISHED_SUB>.getstamped.com.au');

-- 4) Downstream resolvers pick up the new suffix automatically because they
--    delegate to resolve_event_by_host. Spot-check the customer-facing ones:
select 'public event'    as rpc, * from public.get_public_event_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public legal'    as rpc, * from public.get_public_event_legal_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public venues'   as rpc, * from public.get_public_venues_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public ann'      as rpc, * from public.get_public_event_announcements_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public lboard'   as rpc, * from public.get_public_leaderboard_by_domain('<PUBLISHED_SUB>.getstampd.com.au');

-- 5) Publishing gate is still enforced. Temporarily flip a row to verify and
--    then restore it; this is the same drill as
--    supabase/migrations-draft-publishing-gate/02_verify.sql section 2.
--    EXPECT kind='not_found' while status<>'published'.
--
--   update public.events set status='draft' where id = '<EVENT_ID>';
--   select * from public.resolve_event_by_host('<PUBLISHED_SUB>.getstampd.com.au');
--   update public.events set status='published' where id = '<EVENT_ID>';

-- 6) Platform rows are renamed in event_domains.
--    Expected: exactly 2 rows, both with status='active'.
select custom_domain, domain_type, status
from public.event_domains
where custom_domain in ('getstampd.com.au', 'app.getstampd.com.au')
order by domain_type;

-- 7) No active platform rows still pinned to the legacy spelling.
--    Expected: zero rows.
select custom_domain, domain_type, status
from public.event_domains
where domain_type in ('platform_marketing','platform_admin')
  and custom_domain in ('getstamped.com.au','app.getstamped.com.au');
