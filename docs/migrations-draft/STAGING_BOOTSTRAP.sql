-- =====================================================================
-- STAGING BOOTSTRAP — region-beacon-staging ONLY.
-- Do NOT run against production.
-- Run in the Supabase SQL Editor as the postgres role (NOT from the app).
-- Idempotent where practical. Safe to re-run.
--
-- PREREQUISITE:
--   Create the Supabase Auth user jonathan@stockmansridge.com.au first
--   (Authentication > Users > Add user). Copy the resulting auth.users.id.
--   Paste it into :admin_user_id below before running.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Parameter — REPLACE the UUID literal below before running.
-- ---------------------------------------------------------------------
-- Example:
--   \set admin_user_id '00000000-0000-0000-0000-000000000000'
-- Or just substitute the literal in the three places marked TODO.
do $$
declare
  v_admin_user_id uuid := 'REPLACE-WITH-AUTH-USER-UUID'::uuid;  -- TODO
  v_agency_id     uuid;
  v_event_id      uuid;
  v_terms_id      uuid;
  v_v1            uuid;
  v_v2            uuid;
  v_v3            uuid;
begin
  -- Sanity: auth user must already exist.
  if not exists (select 1 from auth.users where id = v_admin_user_id) then
    raise exception 'Auth user % does not exist. Create it in Supabase Auth first.', v_admin_user_id;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Platform admin role.
  -- -------------------------------------------------------------------
  insert into public.user_roles (user_id, role, granted_by)
  values (v_admin_user_id, 'platform_admin', v_admin_user_id)
  on conflict (user_id, role) do nothing;

  -- -------------------------------------------------------------------
  -- 4. Agency: Ready Marketing.
  -- -------------------------------------------------------------------
  insert into public.agencies (name, slug, status, billing_email)
  values ('Ready Marketing', 'ready-marketing', 'active',
          'jonathan@stockmansridge.com.au')
  on conflict (slug) do update set name = excluded.name
  returning id into v_agency_id;

  if v_agency_id is null then
    select id into v_agency_id from public.agencies where slug = 'ready-marketing';
  end if;

  -- -------------------------------------------------------------------
  -- 5. Agency membership: owner.
  -- -------------------------------------------------------------------
  insert into public.agency_members (agency_id, user_id, role, accepted_at, invited_by)
  values (v_agency_id, v_admin_user_id, 'agency_owner', now(), v_admin_user_id)
  on conflict (agency_id, user_id, role) do nothing;

  -- -------------------------------------------------------------------
  -- 6. Event: Orange Wine Festival Test (status starts as 'draft').
  -- -------------------------------------------------------------------
  insert into public.events (
    agency_id, name, slug, public_slug, status, timezone, created_by
  )
  values (
    v_agency_id, 'Orange Wine Festival Test',
    'orange-wine-festival-test', 'orange-wine-festival-test',
    'draft', 'Australia/Sydney', v_admin_user_id
  )
  on conflict (agency_id, slug) do update set name = excluded.name
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.events
    where agency_id = v_agency_id and slug = 'orange-wine-festival-test';
  end if;

  -- -------------------------------------------------------------------
  -- 7. Event branding placeholder.
  -- -------------------------------------------------------------------
  insert into public.event_branding (
    agency_id, event_id, primary_color, accent_color,
    font_family, welcome_copy
  )
  values (
    v_agency_id, v_event_id, '#7A1F2B', '#E8C547',
    'Inter', 'Welcome to the Orange Wine Festival Test passport.'
  )
  on conflict (event_id) do nothing;

  -- -------------------------------------------------------------------
  -- 8. Event domain: orange-wine-festival-test.easypassport.com.au.
  --    'pending' is the safe default; flip to 'active' once DNS/cert is verified.
  -- -------------------------------------------------------------------
  insert into public.event_domains (
    agency_id, event_id, public_subdomain, domain_type, status, is_primary
  )
  values (
    v_agency_id, v_event_id, 'orange-wine-festival-test',
    'event_subdomain', 'pending', true
  )
  on conflict (public_subdomain) where public_subdomain is not null do nothing;

  -- -------------------------------------------------------------------
  -- 9. Terms/privacy version placeholder.
  -- -------------------------------------------------------------------
  insert into public.event_terms_versions (
    agency_id, event_id, terms_version, terms_url,
    privacy_version, privacy_url, published_by
  )
  values (
    v_agency_id, v_event_id, '0.1-draft',
    'https://easypassport.com.au/legal/terms-draft',
    '0.1-draft',
    'https://easypassport.com.au/legal/privacy-draft',
    v_admin_user_id
  )
  on conflict (event_id, terms_version, privacy_version) do nothing;

  select id into v_terms_id
  from public.event_terms_versions
  where event_id = v_event_id
    and terms_version = '0.1-draft'
    and privacy_version = '0.1-draft';

  -- -------------------------------------------------------------------
  -- 10. Link events.current_terms_version_id.
  -- -------------------------------------------------------------------
  update public.events
     set current_terms_version_id = v_terms_id
   where id = v_event_id
     and (current_terms_version_id is distinct from v_terms_id);

  -- -------------------------------------------------------------------
  -- 11. Default check-in settings.
  -- -------------------------------------------------------------------
  insert into public.event_checkin_settings (
    agency_id, event_id,
    one_checkin_per_venue, minimum_seconds_between_checkins,
    allow_manual_admin_checkins
  )
  values (v_agency_id, v_event_id, true, 0, false)
  on conflict (event_id) do nothing;

  -- -------------------------------------------------------------------
  -- 12. Default leaderboard settings (disabled).
  -- -------------------------------------------------------------------
  insert into public.leaderboard_settings (
    agency_id, event_id, is_enabled, display_mode,
    show_first_name, show_last_initial, show_visit_count,
    hide_below_checkins, allow_visitor_opt_out
  )
  values (
    v_agency_id, v_event_id, false, 'first_name_last_initial',
    true, true, true, 1, true
  )
  on conflict (event_id) do nothing;

  -- -------------------------------------------------------------------
  -- 13. Venues. order_index sorts the passport list.
  -- -------------------------------------------------------------------
  insert into public.venues (agency_id, event_id, name, order_index, status)
  values
    (v_agency_id, v_event_id, 'Stockman''s Ridge', 1, 'active'),
    (v_agency_id, v_event_id, 'Rowlee',            2, 'active'),
    (v_agency_id, v_event_id, 'Heifer Station',    3, 'active')
  on conflict do nothing;

  select id into v_v1 from public.venues
   where event_id = v_event_id and name = 'Stockman''s Ridge';
  select id into v_v2 from public.venues
   where event_id = v_event_id and name = 'Rowlee';
  select id into v_v3 from public.venues
   where event_id = v_event_id and name = 'Heifer Station';

  -- -------------------------------------------------------------------
  -- 14. One active QR code per venue.
  --     Token = base64url(gen_random_bytes(24)) → 32 chars, satisfies
  --     the length >= 22 CHECK and is non-guessable.
  --     Partial unique index ux_venue_qr_codes_one_active_per_venue
  --     guarantees idempotency: re-runs skip via NOT EXISTS guard.
  -- -------------------------------------------------------------------
  if not exists (
    select 1 from public.venue_qr_codes
    where venue_id = v_v1 and status = 'active'
  ) then
    insert into public.venue_qr_codes (
      agency_id, event_id, venue_id, token, status, created_by
    )
    values (
      v_agency_id, v_event_id, v_v1,
      translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_'),
      'active', v_admin_user_id
    );
  end if;

  if not exists (
    select 1 from public.venue_qr_codes
    where venue_id = v_v2 and status = 'active'
  ) then
    insert into public.venue_qr_codes (
      agency_id, event_id, venue_id, token, status, created_by
    )
    values (
      v_agency_id, v_event_id, v_v2,
      translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_'),
      'active', v_admin_user_id
    );
  end if;

  if not exists (
    select 1 from public.venue_qr_codes
    where venue_id = v_v3 and status = 'active'
  ) then
    insert into public.venue_qr_codes (
      agency_id, event_id, venue_id, token, status, created_by
    )
    values (
      v_agency_id, v_event_id, v_v3,
      translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_'),
      'active', v_admin_user_id
    );
  end if;

  raise notice 'Bootstrap complete. agency=%, event=%, terms=%',
    v_agency_id, v_event_id, v_terms_id;
end $$;

commit;

-- =====================================================================
-- 17. VERIFICATION — read-only checks. Run after the block above commits.
-- =====================================================================

-- 17a. platform_admin role exists.
select ur.user_id, u.email, ur.role, ur.granted_at
from public.user_roles ur
join auth.users u on u.id = ur.user_id
where ur.role = 'platform_admin'
  and u.email = 'jonathan@stockmansridge.com.au';

-- 17b. Agency exists.
select id, name, slug, status from public.agencies where slug = 'ready-marketing';

-- 17c. agency_owner membership exists.
select am.agency_id, am.user_id, am.role, am.accepted_at, u.email
from public.agency_members am
join auth.users u on u.id = am.user_id
join public.agencies a on a.id = am.agency_id
where a.slug = 'ready-marketing'
  and am.role = 'agency_owner';

-- 17d. Event exists and is linked to terms version.
select e.id, e.name, e.slug, e.public_slug, e.status, e.timezone,
       e.current_terms_version_id,
       (e.current_terms_version_id is not null) as terms_linked
from public.events e
join public.agencies a on a.id = e.agency_id
where a.slug = 'ready-marketing'
  and e.slug = 'orange-wine-festival-test';

-- 17e. Domain row exists.
select d.public_subdomain, d.domain_type, d.status, d.is_primary
from public.event_domains d
join public.events e on e.id = d.event_id
where e.slug = 'orange-wine-festival-test';

-- 17f. Terms version row exists and matches events.current_terms_version_id.
select tv.id, tv.terms_version, tv.privacy_version, tv.effective_at,
       (tv.id = e.current_terms_version_id) as is_current
from public.event_terms_versions tv
join public.events e on e.id = tv.event_id
where e.slug = 'orange-wine-festival-test';

-- 17g. Venues exist (expect 3).
select v.name, v.order_index, v.status
from public.venues v
join public.events e on e.id = v.event_id
where e.slug = 'orange-wine-festival-test'
order by v.order_index;

-- 17h. QR tokens exist (expect 3 active rows, one per venue).
--      Token values are intentionally returned for copy/paste into test URLs.
select v.name as venue_name, q.token, q.status, q.issued_at
from public.venue_qr_codes q
join public.venues v on v.id = q.venue_id
join public.events e on e.id = q.event_id
where e.slug = 'orange-wine-festival-test'
order by v.order_index;

-- 17i. Leaderboard disabled.
select ls.is_enabled, ls.display_mode, ls.hide_below_checkins
from public.leaderboard_settings ls
join public.events e on e.id = ls.event_id
where e.slug = 'orange-wine-festival-test';

-- 17j. Check-in settings exist with defaults.
select cs.one_checkin_per_venue, cs.minimum_seconds_between_checkins,
       cs.allow_manual_admin_checkins, cs.max_checkins_per_passport_per_day
from public.event_checkin_settings cs
join public.events e on e.id = cs.event_id
where e.slug = 'orange-wine-festival-test';

-- =====================================================================
-- END BOOTSTRAP
-- =====================================================================
