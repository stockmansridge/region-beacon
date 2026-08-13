-- 04_admin_event_participants_consents.sql
-- GetStampd — Participants tab + participant export: one row per participant,
-- with postcode and the three consent statuses returned in the SAME query.
--
-- Extends public.get_admin_event_participants_with_points(uuid) with:
--   postcode, terms_status, terms_accepted_at,
--   sms_status, sms_consent_updated_at,
--   marketing_status, marketing_consent_updated_at
--
-- Consent values come from public.participant_consent_state() (file 02), which
-- is the single canonical calculation shared by the table and the CSV export.
-- That helper aggregates to one row per visitor, so no consent join can ever
-- duplicate a participant row.
--
-- display_name now falls back to the email address, then
-- 'Unnamed participant' — no name is ever invented.
--
-- Return type changes, so the function is dropped and recreated. Additive to
-- the caller: all previously returned columns keep their names and types.
--
-- Apply in the Supabase SQL editor AFTER 02.

begin;

drop function if exists public.get_admin_event_participants_with_points(uuid);

create or replace function public.get_admin_event_participants_with_points(
  p_event_id uuid
)
returns table (
  passport_id                  uuid,
  visitor_id                   uuid,
  display_name                 text,
  email                        text,
  mobile                       text,
  postcode                     text,
  passport_stamp_count         integer,
  total_points                 integer,
  venue_points                 integer,
  bonus_points                 integer,
  bonus_codes_claimed          integer,
  latest_activity_at           timestamptz,
  created_at                   timestamptz,
  passport_status              text,
  terms_status                 text,
  terms_accepted_at            timestamptz,
  sms_status                   text,
  sms_consent_updated_at       timestamptz,
  marketing_status             text,
  marketing_consent_updated_at timestamptz
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
  with stamp_counts as (
    select
      c.passport_id,
      count(distinct c.venue_id)::integer as passport_stamp_count,
      max(c.created_at)                   as latest_checkin_at
    from public.checkins c
    where c.event_id = p_event_id
    group by c.passport_id
  ),
  point_counts as (
    select
      ppa.participant_id as passport_id,
      coalesce(sum(ppa.points_awarded), 0)::integer as total_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'venue'), 0)::integer as venue_points,
      coalesce(sum(ppa.points_awarded)
        filter (where ppa.award_type = 'bonus'), 0)::integer as bonus_points,
      count(distinct ppa.source_id)
        filter (where ppa.award_type = 'bonus')::integer as bonus_codes_claimed,
      max(ppa.awarded_at) as latest_award_at
    from public.participant_point_awards ppa
    where ppa.event_id = p_event_id
    group by ppa.participant_id
  ),
  consents as (
    select * from public.participant_consent_state(p_event_id)
  )
  select
    p.id            as passport_id,
    p.visitor_id    as visitor_id,
    coalesce(
      nullif(trim(v.full_name), ''),
      nullif(trim(coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')), ''),
      nullif(v.email::text, ''),
      'Unnamed participant'
    ) as display_name,
    v.email::text   as email,
    v.mobile        as mobile,
    v.postcode      as postcode,
    coalesce(sc.passport_stamp_count, 0)::integer as passport_stamp_count,
    coalesce(pc.total_points, 0)::integer         as total_points,
    coalesce(pc.venue_points, 0)::integer         as venue_points,
    coalesce(pc.bonus_points, 0)::integer         as bonus_points,
    coalesce(pc.bonus_codes_claimed, 0)::integer  as bonus_codes_claimed,
    nullif(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) as latest_activity_at,
    p.created_at    as created_at,
    p.status        as passport_status,
    coalesce(cs.terms_status, 'not_recorded')     as terms_status,
    cs.terms_accepted_at                          as terms_accepted_at,
    coalesce(cs.sms_status, 'not_recorded')       as sms_status,
    cs.sms_consent_updated_at                     as sms_consent_updated_at,
    coalesce(cs.marketing_status, 'not_recorded') as marketing_status,
    cs.marketing_consent_updated_at               as marketing_consent_updated_at
  from public.passports p
  join public.visitors v
    on v.id = p.visitor_id
  left join stamp_counts sc on sc.passport_id = p.id
  left join point_counts pc on pc.passport_id = p.id
  left join consents cs on cs.visitor_id = v.id
  where p.event_id = p_event_id
    and v.deleted_at is null
  order by
    coalesce(pc.total_points, 0) desc,
    coalesce(sc.passport_stamp_count, 0) desc,
    coalesce(
      greatest(
        coalesce(sc.latest_checkin_at, '-infinity'::timestamptz),
        coalesce(pc.latest_award_at,   '-infinity'::timestamptz)
      ),
      'infinity'::timestamptz
    ) asc,
    lower(coalesce(v.full_name, '')) asc;
end;
$$;

revoke all on function public.get_admin_event_participants_with_points(uuid) from public;
grant execute on function public.get_admin_event_participants_with_points(uuid) to authenticated;

commit;

-- Verification
--   select display_name, email, postcode, terms_status, sms_status, marketing_status
--     from public.get_admin_event_participants_with_points('<event_id>'::uuid);
