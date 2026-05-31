-- DRAFT — do not execute.
-- Renames the two seeded platform rows in public.event_domains from the
-- old Easy Passport hostnames to the new GetStampd hostnames.
--
-- Safe properties:
--   * UPDATE in place so the row id (and any FK / audit references) is preserved.
--   * Idempotent: re-running after success is a no-op because the WHERE clause
--     no longer matches.
--   * No schema/RLS/storage changes.

begin;

update public.event_domains
   set custom_domain = 'getstampd.com.au'
 where custom_domain = 'easypassport.com.au'
   and domain_type   = 'platform_marketing';

update public.event_domains
   set custom_domain = 'app.getstampd.com.au'
 where custom_domain = 'app.easypassport.com.au'
   and domain_type   = 'platform_admin';

-- Sanity check: there must be exactly one row per platform_* type after the rename.
do $$
declare
  v_marketing int;
  v_admin     int;
begin
  select count(*) into v_marketing
    from public.event_domains
   where domain_type = 'platform_marketing' and custom_domain = 'getstampd.com.au';

  select count(*) into v_admin
    from public.event_domains
   where domain_type = 'platform_admin' and custom_domain = 'app.getstampd.com.au';

  if v_marketing <> 1 or v_admin <> 1 then
    raise exception 'domain rename verification failed: marketing=% admin=%',
      v_marketing, v_admin;
  end if;
end$$;

commit;
