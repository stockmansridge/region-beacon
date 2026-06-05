-- Points System Stage 11: Bulk admin bonus claims export RPC.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   public.get_admin_event_bonus_claims_export(p_event_id uuid)
--
-- Returns one row per bonus-code award for the event, joined with the
-- participant/visitor identity already exposed via the Stage 6 RPC.
--
-- Points come from the immutable ledger (participant_point_awards.points_awarded),
-- NOT from event_bonus_codes.points_value, so historical claims survive edits
-- to the current bonus code config. LEFT JOIN keeps rows visible if the bonus
-- code is later deleted.
--
-- Access:
--   SECURITY DEFINER, gated identically to
--   public.get_admin_event_participants_with_points and
--   public.get_admin_participant_bonus_claims: platform admin OR agency
--   member for the event's agency. Anonymous callers are rejected.

create or replace function public.get_admin_event_bonus_claims_export(
  p_event_id uuid
)
returns table (
  passport_id              uuid,
  visitor_id               uuid,
  display_name             text,
  email                    text,
  mobile                   text,
  award_id                 uuid,
  bonus_code_id            uuid,
  bonus_code_name          text,
  bonus_code_description   text,
  points_awarded           integer,
  awarded_at               timestamptz,
  bonus_code_is_active     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
begin
  select e.agency_id into v_agency_id
  from public.events e
  where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'event_not_found';
  end if;

  if not (
    public.is_platform_admin(auth.uid())
    or public.is_agency_member(auth.uid(), v_agency_id)
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.id            as passport_id,
    p.visitor_id    as visitor_id,
    coalesce(
      nullif(trim(v.full_name), ''),
      nullif(trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), ''),
      'Guest'
    )               as display_name,
    v.email::text   as email,
    v.mobile        as mobile,
    ppa.id          as award_id,
    ebc.id          as bonus_code_id,
    ebc.name        as bonus_code_name,
    ebc.description as bonus_code_description,
    ppa.points_awarded,
    ppa.awarded_at,
    ebc.is_active   as bonus_code_is_active
  from public.participant_point_awards ppa
  join public.passports p
    on p.id = ppa.participant_id
   and p.event_id = ppa.event_id
  left join public.visitors v
    on v.id = p.visitor_id
  left join public.event_bonus_codes ebc
    on ebc.id = ppa.source_id
   and ebc.event_id = ppa.event_id
  where ppa.event_id = p_event_id
    and ppa.award_type = 'bonus'
  order by
    ppa.awarded_at desc,
    lower(coalesce(v.full_name, '')) asc,
    ppa.id desc;
end;
$$;

revoke all on function public.get_admin_event_bonus_claims_export(uuid) from public;
grant execute on function public.get_admin_event_bonus_claims_export(uuid) to authenticated;

-- =====================================================================
-- Verification
-- =====================================================================
--   select * from public.get_admin_event_bonus_claims_export('<event_id>'::uuid);
