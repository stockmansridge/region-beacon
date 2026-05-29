-- 27_policies_venue.sql
-- Draft only. Do not execute.

-- venues -----------------------------------------------------------------
drop policy if exists deny_all on public.venues;

create policy venues_select
  on public.venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy venues_write
  on public.venues for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- venue_qr_codes ---------------------------------------------------------
drop policy if exists deny_all on public.venue_qr_codes;

create policy venue_qr_codes_select
  on public.venue_qr_codes for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy venue_qr_codes_insert_update
  on public.venue_qr_codes for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- DELETE is left absent on purpose; use status='revoked' instead.

-- venue_offers -----------------------------------------------------------
drop policy if exists deny_all on public.venue_offers;

create policy venue_offers_select
  on public.venue_offers for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy venue_offers_write
  on public.venue_offers for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
