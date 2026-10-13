-- Show which bonus code each participant claimed.
--
-- Cause: per-venue bonus claims store the per-venue row id
-- (event_bonus_code_venues.id) as participant_point_awards.source_id, but the
-- admin drill-down and export only joined event_bonus_codes.id, so every
-- per-venue claim showed "Bonus code no longer available".
--
-- Fix: resolve the code through either id; per-venue claims show
-- "<code name> — <venue name>". Return signatures unchanged.
-- Safe to re-run.

begin;

create or replace function public.get_admin_participant_bonus_claims(
  p_event_id uuid, p_passport_id uuid
)
returns table (
  award_id uuid, bonus_code_id uuid, bonus_code_name text,
  bonus_code_description text, points_awarded integer,
  awarded_at timestamptz, bonus_code_is_active boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare v_agency_id uuid;
begin
  select e.agency_id into v_agency_id from public.events e where e.id = p_event_id;
  if v_agency_id is null then raise exception 'event_not_found'; end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), v_agency_id)) then
    raise exception 'forbidden';
  end if;

  return query
  select
    ppa.id,
    coalesce(ebc.id, vbc.id),
    case
      when ebc.id is not null then ebc.name
      when vbc.id is not null then vbc.name || coalesce(' — ' || ven.name, '')
    end,
    coalesce(ebc.description, vbc.description),
    ppa.points_awarded,
    ppa.awarded_at,
    case
      when ebc.id is not null then ebc.is_active
      when vbc.id is not null then (vbc.is_active and ebv.is_active)
    end
  from public.participant_point_awards ppa
  left join public.event_bonus_codes ebc
    on ebc.id = ppa.source_id and ebc.event_id = ppa.event_id
  left join public.event_bonus_code_venues ebv
    on ebc.id is null and ebv.id = ppa.source_id
  left join public.event_bonus_codes vbc
    on vbc.id = ebv.bonus_code_id and vbc.event_id = ppa.event_id
  left join public.venues ven on ven.id = ebv.venue_id
  where ppa.event_id = p_event_id
    and ppa.participant_id = p_passport_id
    and ppa.award_type = 'bonus'
  order by ppa.awarded_at desc, ppa.id desc;
end;
$$;

revoke all on function public.get_admin_participant_bonus_claims(uuid, uuid) from public;
grant execute on function public.get_admin_participant_bonus_claims(uuid, uuid) to authenticated;

create or replace function public.get_admin_event_bonus_claims_export(p_event_id uuid)
returns table (
  passport_id uuid, visitor_id uuid, display_name text, email text, mobile text,
  award_id uuid, bonus_code_id uuid, bonus_code_name text,
  bonus_code_description text, points_awarded integer,
  awarded_at timestamptz, bonus_code_is_active boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare v_agency_id uuid;
begin
  select e.agency_id into v_agency_id from public.events e where e.id = p_event_id;
  if v_agency_id is null then raise exception 'event_not_found'; end if;
  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), v_agency_id)) then
    raise exception 'forbidden';
  end if;

  return query
  select
    p.id, p.visitor_id,
    coalesce(nullif(trim(v.full_name), ''),
             nullif(trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), ''),
             'Guest'),
    v.email::text, v.mobile,
    ppa.id,
    coalesce(ebc.id, vbc.id),
    case
      when ebc.id is not null then ebc.name
      when vbc.id is not null then vbc.name || coalesce(' — ' || ven.name, '')
    end,
    coalesce(ebc.description, vbc.description),
    ppa.points_awarded, ppa.awarded_at,
    case
      when ebc.id is not null then ebc.is_active
      when vbc.id is not null then (vbc.is_active and ebv.is_active)
    end
  from public.participant_point_awards ppa
  join public.passports p on p.id = ppa.participant_id and p.event_id = ppa.event_id
  left join public.visitors v on v.id = p.visitor_id
  left join public.event_bonus_codes ebc
    on ebc.id = ppa.source_id and ebc.event_id = ppa.event_id
  left join public.event_bonus_code_venues ebv
    on ebc.id is null and ebv.id = ppa.source_id
  left join public.event_bonus_codes vbc
    on vbc.id = ebv.bonus_code_id and vbc.event_id = ppa.event_id
  left join public.venues ven on ven.id = ebv.venue_id
  where ppa.event_id = p_event_id and ppa.award_type = 'bonus'
  order by ppa.awarded_at desc, lower(coalesce(v.full_name, '')) asc, ppa.id desc;
end;
$$;

revoke all on function public.get_admin_event_bonus_claims_export(uuid) from public;
grant execute on function public.get_admin_event_bonus_claims_export(uuid) to authenticated;

commit;
