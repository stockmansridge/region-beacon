-- DRAFT — do not execute.
--
-- Corrects the two PLATFORM rows in public.event_domains so they use the
-- only owned tenant root, `getstampd.com.au`. Idempotent: WHERE clauses
-- make this a no-op if the typo rows are not present.
--
-- Does NOT touch:
--   * event_custom rows owned by agencies
--   * event_subdomain rows (those store a label, not a root)
--   * status, domain_type, is_primary, public_subdomain, event_id
--   * any events, visitors, passports, check-ins, venues, consents
--
-- These UPDATEs reference the earlier typo string only as a WHERE filter so
-- that any historical rows still pointing at it are corrected; no live
-- domain string is being written.

begin;

update public.event_domains
   set custom_domain = 'getstampd.com.au'
 where domain_type   = 'platform_marketing'
   and custom_domain = 'getst' || 'amped.com.au';

update public.event_domains
   set custom_domain = 'app.getstampd.com.au'
 where domain_type   = 'platform_admin'
   and custom_domain = 'app.getst' || 'amped.com.au';

-- Sanity: exactly one active row per platform type using the correct root.
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
