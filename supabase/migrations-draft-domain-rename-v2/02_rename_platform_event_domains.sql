-- DRAFT — do not execute.
--
-- Renames the two PLATFORM rows in public.event_domains so the apex
-- marketing and admin custom-domain rows use the new primary root
-- `getstampd.com.au`. Idempotent: WHERE clauses guard against rerunning.
--
-- Scope:
--   * platform_marketing: getstamped.com.au       → getstampd.com.au
--   * platform_admin:     app.getstamped.com.au   → app.getstampd.com.au
--
-- Does NOT touch:
--   * event_custom rows owned by agencies
--   * event_subdomain rows (those store a label, not a root)
--   * status, domain_type, is_primary, public_subdomain, event_id
--   * any events, visitors, passports, check-ins, venues, consents

begin;

update public.event_domains
   set custom_domain = 'getstampd.com.au'
 where domain_type   = 'platform_marketing'
   and custom_domain = 'getstamped.com.au';

update public.event_domains
   set custom_domain = 'app.getstampd.com.au'
 where domain_type   = 'platform_admin'
   and custom_domain = 'app.getstamped.com.au';

-- Sanity: there should still be exactly one active row per platform type.
do $$
declare
  v_marketing int;
  v_admin int;
begin
  select count(*) into v_marketing
  from public.event_domains
  where domain_type = 'platform_marketing'
    and custom_domain = 'getstampd.com.au'
    and status = 'active';

  select count(*) into v_admin
  from public.event_domains
  where domain_type = 'platform_admin'
    and custom_domain = 'app.getstampd.com.au'
    and status = 'active';

  if v_marketing <> 1 then
    raise exception 'expected exactly 1 active platform_marketing row for getstampd.com.au, found %', v_marketing;
  end if;
  if v_admin <> 1 then
    raise exception 'expected exactly 1 active platform_admin row for app.getstampd.com.au, found %', v_admin;
  end if;
end $$;

commit;
