-- Points System Stage 9: Admin bonus code drill-down per participant.
-- Draft only. Do not execute via Lovable Cloud until reviewed.
--
-- Adds:
--   public.get_admin_participant_bonus_claims(p_event_id uuid, p_passport_id uuid)
--
-- Returns the bonus code claim ledger rows for a single participant within a
-- single event. Points values come from the immutable ledger snapshot
-- (participant_point_awards.points_awarded), NOT from event_bonus_codes, so
-- later edits to a bonus code's points_value do not rewrite history.
--
-- Access:
--   SECURITY DEFINER, gated identically to
--   public.get_admin_event_participants_with_points: platform admin OR
--   agency member for the event's agency. Anonymous callers are rejected.

create or replace function public.get_admin_participant_bonus_claims(
  p_event_id     uuid,
  p_passport_id  uuid
)
returns table (
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
    ppa.id                              as award_id,
    ebc.id                              as bonus_code_id,
    ebc.name                            as bonus_code_name,
    ebc.description                     as bonus_code_description,
    ppa.points_awarded                  as points_awarded,
    ppa.awarded_at                      as awarded_at,
    ebc.is_active                       as bonus_code_is_active
  from public.participant_point_awards ppa
  left join public.event_bonus_codes ebc
    on ebc.id = ppa.source_id
   and ebc.event_id = ppa.event_id
  where ppa.event_id = p_event_id
    and ppa.participant_id = p_passport_id
    and ppa.award_type = 'bonus'
  order by ppa.awarded_at desc, ppa.id desc;
end;
$$;

revoke all on function public.get_admin_participant_bonus_claims(uuid, uuid) from public;
grant execute on function public.get_admin_participant_bonus_claims(uuid, uuid) to authenticated;

-- =====================================================================
-- Verification
-- =====================================================================
--   select * from public.get_admin_participant_bonus_claims(
--     '<event_id>'::uuid, '<passport_id>'::uuid
--   );
