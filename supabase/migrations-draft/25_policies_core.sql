-- 25_policies_core.sql
-- Draft only. Do not execute.
-- Pass B: replace deny-all with real policies for agencies, user_roles, agency_members.

-- agencies ---------------------------------------------------------------
drop policy if exists deny_all on public.agencies;

create policy agencies_select
  on public.agencies for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), id)
  );

create policy agencies_insert_platform
  on public.agencies for insert to authenticated
  with check (public.is_platform_admin(auth.uid()));

create policy agencies_update
  on public.agencies for update to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), id)
  );

create policy agencies_delete_platform
  on public.agencies for delete to authenticated
  using (public.is_platform_admin(auth.uid()));

-- user_roles -------------------------------------------------------------
drop policy if exists deny_all on public.user_roles;

create policy user_roles_select_self_or_admin
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin(auth.uid())
  );

create policy user_roles_write_platform_only
  on public.user_roles for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- agency_members ---------------------------------------------------------
drop policy if exists deny_all on public.agency_members;

create policy agency_members_select
  on public.agency_members for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy agency_members_write
  on public.agency_members for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_owner(auth.uid(), agency_id)
  );
