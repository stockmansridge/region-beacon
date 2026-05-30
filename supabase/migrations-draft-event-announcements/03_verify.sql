-- 03_verify.sql
-- DRAFT ONLY. Run AFTER 01 + 02 are applied to staging.

-- 1) Table exists with expected columns + check constraints.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'event_announcements'
order by ordinal_position;

-- 2) RLS enabled + policies present.
select relname, relrowsecurity
from pg_class
where relname = 'event_announcements';

select polname, polcmd, polroles::regrole[]
from pg_policy
where polrelid = 'public.event_announcements'::regclass
order by polname;

-- 3) Anon cannot read the table directly.
--    Run as anon:
--      set role anon;
--      select * from public.event_announcements;        -- expect: 0 rows / permission denied
--      reset role;

-- 4) Public RPC returns zero rows for an unknown host (no error).
select * from public.get_public_event_announcements_by_domain('not-a-real-host.example');

-- 5) After inserting an active announcement against a published event's host:
--      insert into public.event_announcements (agency_id, event_id, title, message, tone)
--      values (<agency>, <event>, 'Test', 'Hello visitors', 'info');
--    select * from public.get_public_event_announcements_by_domain('<live-subdomain>.getstampd.com.au');
--    -- expect: one row, only title/message/tone/link_label/link_url columns.

-- 6) Confirm no PII or admin fields are exposed by the RPC.
select
  pg_get_function_result(p.oid) as returns,
  pg_get_functiondef(p.oid) ilike '%agency_id%' as leaks_agency_id,
  pg_get_functiondef(p.oid) ilike '%created_by%' as leaks_created_by
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_public_event_announcements_by_domain';
-- expect: returns text columns only; leaks_* may be true inside SQL body
-- (commented refs / table joins) but the RETURNS TABLE signature is the
-- authoritative public surface.

-- 7) Scheduled window respected.
--      insert ... starts_at = now() + interval '1 day';  -- should NOT appear yet
--      insert ... ends_at   = now() - interval '1 day';  -- should NOT appear (expired)
