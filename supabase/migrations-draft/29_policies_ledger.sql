-- 29_policies_ledger.sql
-- Draft only. Do not execute.

-- checkins (no INSERT/UPDATE/DELETE for any non-service role; definer RPC only)
drop policy if exists deny_all on public.checkins;

create policy checkins_select
  on public.checkins for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );
-- Intentionally no INSERT/UPDATE/DELETE policies. redeem_checkin() (definer)
-- is the only writer. service_role bypasses RLS for break-glass admin work.

-- reward_rules -----------------------------------------------------------
drop policy if exists deny_all on public.reward_rules;

create policy reward_rules_select
  on public.reward_rules for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy reward_rules_write
  on public.reward_rules for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- prize_rules ------------------------------------------------------------
drop policy if exists deny_all on public.prize_rules;

create policy prize_rules_select
  on public.prize_rules for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), agency_id)
  );

create policy prize_rules_write
  on public.prize_rules for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- export_logs (append-only via RPC) --------------------------------------
drop policy if exists deny_all on public.export_logs;

create policy export_logs_select
  on public.export_logs for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );
-- No INSERT/UPDATE/DELETE policies.

-- audit_logs (no INSERT policy for non-service roles; triggers run as table owner) --
drop policy if exists deny_all on public.audit_logs;

create policy audit_logs_select
  on public.audit_logs for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or (agency_id is not null and public.is_agency_admin(auth.uid(), agency_id))
  );
-- Triggers in step 30 write via SECURITY DEFINER functions that bypass RLS.
