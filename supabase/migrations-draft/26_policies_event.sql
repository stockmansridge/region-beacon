-- 26_policies_event.sql
-- Draft only. Do not execute.

-- Helper macro convention: every policy uses agency_id-scoped helpers.

-- events -----------------------------------------------------------------
drop policy if exists deny_all on public.events;

create policy events_select
  on public.events for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy events_write
  on public.events for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_domains ----------------------------------------------------------
drop policy if exists deny_all on public.event_domains;

create policy event_domains_select
  on public.event_domains for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (agency_id is not null and public.is_agency_member(auth.uid(), agency_id))
  );

create policy event_domains_write_platform
  on public.event_domains for all to authenticated
  using (
    domain_type in ('platform_marketing','platform_admin','platform_reserved')
    and public.is_platform_admin(auth.uid())
  )
  with check (
    domain_type in ('platform_marketing','platform_admin','platform_reserved')
    and public.is_platform_admin(auth.uid())
  );

create policy event_domains_write_agency
  on public.event_domains for all to authenticated
  using (
    domain_type in ('event_subdomain','event_custom')
    and agency_id is not null
    and public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    domain_type in ('event_subdomain','event_custom')
    and agency_id is not null
    and public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_branding ---------------------------------------------------------
drop policy if exists deny_all on public.event_branding;

create policy event_branding_all
  on public.event_branding for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- event_terms_versions (immutable) ---------------------------------------
drop policy if exists deny_all on public.event_terms_versions;

create policy event_terms_versions_select
  on public.event_terms_versions for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy event_terms_versions_insert
  on public.event_terms_versions for insert to authenticated
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No UPDATE/DELETE policies: append-only by design.

-- event_checkin_settings -------------------------------------------------
drop policy if exists deny_all on public.event_checkin_settings;

create policy event_checkin_settings_all
  on public.event_checkin_settings for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- leaderboard_settings ---------------------------------------------------
drop policy if exists deny_all on public.leaderboard_settings;

create policy leaderboard_settings_all
  on public.leaderboard_settings for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
