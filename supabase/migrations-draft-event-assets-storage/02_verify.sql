-- Draft verification — run after 01_event_assets_bucket.sql on STAGING.
-- Replace placeholders with real UUIDs from staging fixtures.

-- A. Bucket exists, public, capped, mime-restricted.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'event-assets';

-- B. Path-parser returns expected parts.
select * from public.event_assets_path_parts(
  '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/logo/file.png'
);
-- Expect: agency_id=1111..., event_id=2222..., kind=logo

-- C. Reject malformed paths — must return no row (never raise 22P02).
select * from public.event_assets_path_parts('foo/bar/baz');                                          -- no row (too few segments)
select * from public.event_assets_path_parts('foo/bar/logo/test.png');                                -- no row (agency_id not a uuid)
select * from public.event_assets_path_parts('11111111-1111-1111-1111-111111111111/bad-event/logo/test.png'); -- no row (event_id not a uuid)
select * from public.event_assets_path_parts('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/badkind/test.png'); -- no row (kind not in logo/cover)
select * from public.event_assets_path_parts('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/logo/');            -- no row (empty filename)
select * from public.event_assets_path_parts(null);                                                   -- no row (null name)
select * from public.event_assets_path_parts('');                                                     -- no row (empty name)
select * from public.event_assets_path_parts('a/b/avatar/x.png');                                     -- no row (kind not logo/cover + non-uuid)

-- C.1 can_write_event_asset must return false (not raise) for the same inputs.
select
  public.can_write_event_asset('foo/bar/logo/test.png')                                                   as foo_path,
  public.can_write_event_asset('11111111-1111-1111-1111-111111111111/bad-event/logo/test.png')            as bad_event,
  public.can_write_event_asset('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/badkind/test.png') as bad_kind,
  public.can_write_event_asset('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/logo/')             as empty_filename,
  public.can_write_event_asset(null)                                                                       as null_path,
  public.can_write_event_asset('')                                                                         as empty_path;
-- Expect: all false, no exception.

-- D. Authorisation helper — set role + claim to simulate callers:
--    set local role authenticated; set local "request.jwt.claims" = '{"sub":"<uuid>"}';

-- D.1 platform_admin → true for matching event/agency path
-- D.2 agency_owner of agency X → true for X/event/logo/..., false for other agency
-- D.3 agency_staff → false
-- D.4 anon (no auth.uid()) → false
-- D.5 path agency_id mismatched against events.agency_id → false

-- E. storage.objects policies exist.
select polname, polcmd
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'event_assets_%'
order by polname;
-- Expect: event_assets_delete_write (d), event_assets_insert_write (a),
--         event_assets_public_read (r), event_assets_update_write (w)

-- F. Smoke test via Storage REST/JS (out of SQL):
--    - upload as agency_owner to {agency}/{event}/logo/foo.png    → 200
--    - upload as agency_staff                                     → 403
--    - upload as agency_owner to OTHER_AGENCY/{event}/logo/...    → 403
--    - upload as anon                                             → 403
--    - public GET https://<project>.supabase.co/storage/v1/object/public/event-assets/{path}
--      → 200 (no auth header)
