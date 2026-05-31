-- DRAFT — verification queries only. Read-only.
--
-- Run AFTER applying 01_ and 02_. Replace <PUBLISHED_SUB> with a real
-- published event subdomain in your env.

-- 1) Apex resolves under the only owned root.
--    Expected: kind='marketing', event_id=null, public_slug=null, requires_auth=false
select 'apex' as case, * from public.resolve_event_by_host('getstampd.com.au');

-- 2) Admin host.
--    Expected: kind='admin', requires_auth=true
select 'admin' as case, * from public.resolve_event_by_host('app.getstampd.com.au');
select 'admin :443' as case, * from public.resolve_event_by_host('app.getstampd.com.au:443');

-- 3) Reserved label rejected.
--    Expected: kind='not_found'
select 'reserved' as case, * from public.resolve_event_by_host('admin.getstampd.com.au');

-- 4) Published event subdomain resolves.
--    Expected: kind='event', event_id=<uuid>, public_slug=<citext>
select 'event' as case, * from public.resolve_event_by_host('<PUBLISHED_SUB>.getstampd.com.au');

-- 5) Downstream resolvers pick up the new suffix automatically because they
--    delegate to resolve_event_by_host.
select 'public event'  as rpc, * from public.get_public_event_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public legal'  as rpc, * from public.get_public_event_legal_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public venues' as rpc, * from public.get_public_venues_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public ann'    as rpc, * from public.get_public_event_announcements_by_domain('<PUBLISHED_SUB>.getstampd.com.au');
select 'public lboard' as rpc, * from public.get_public_leaderboard_by_domain('<PUBLISHED_SUB>.getstampd.com.au');

-- 6) Publishing gate is still enforced. Same drill as
--    supabase/migrations-draft-publishing-gate/02_verify.sql section 2:
--
--   update public.events set status='draft' where id = '<EVENT_ID>';
--   select * from public.resolve_event_by_host('<PUBLISHED_SUB>.getstampd.com.au');
--   update public.events set status='published' where id = '<EVENT_ID>';

-- 7) Platform rows use the correct root only.
--    Expected: exactly 2 active rows.
select custom_domain, domain_type, status
from public.event_domains
where custom_domain in ('getstampd.com.au', 'app.getstampd.com.au')
order by domain_type;

-- 8) No active platform rows still pinned to the earlier typo. Expected: 0.
select count(*) as legacy_platform_rows
from public.event_domains
where domain_type in ('platform_marketing','platform_admin')
  and custom_domain in ('getst' || 'amped.com.au', 'app.getst' || 'amped.com.au');
