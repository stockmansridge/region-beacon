-- 28_policies_visitor.sql
-- Draft only. Do not execute.

-- visitors ---------------------------------------------------------------
drop policy if exists deny_all on public.visitors;

create policy visitors_select
  on public.visitors for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy visitors_update_delete
  on public.visitors for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy visitors_delete
  on public.visitors for delete to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No INSERT policy: register_visitor() definer RPC is the only writer.

-- passports --------------------------------------------------------------
drop policy if exists deny_all on public.passports;

create policy passports_select
  on public.passports for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy passports_update
  on public.passports for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

create policy passports_delete
  on public.passports for delete to authenticated
  using (public.is_platform_admin(auth.uid()));
-- No INSERT policy: register_visitor() definer RPC is the only writer.

-- visitor_consents (append-only) -----------------------------------------
drop policy if exists deny_all on public.visitor_consents;

create policy visitor_consents_select
  on public.visitor_consents for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
-- No INSERT/UPDATE/DELETE policies: definer RPCs only.
