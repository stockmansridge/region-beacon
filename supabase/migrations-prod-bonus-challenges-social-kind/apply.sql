-- Prod: extend public.get_public_event_bonus_challenges to return
-- kind / social_location / social_hashtags so the public venue page can
-- render the "Take photo & share" CTA for Social bonuses (and show
-- Completed once the bonus QR is scanned by staff).
--
-- Safe to re-run. Requires the columns from
-- migrations-prod-bonus-codes-columns-fix to exist.

create or replace function public.get_public_event_bonus_challenges(
  _hostname text,
  _passport_token text default null,
  _venue_id uuid default null
)
returns table (
  bonus_code_id uuid,
  name text,
  description text,
  points_value integer,
  is_claimed boolean,
  kind text,
  social_location text,
  social_hashtags text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_passport_id uuid := null;
begin
  select rh.kind, rh.event_id into r
  from public.resolve_event_by_host(_hostname) rh;

  if r.kind <> 'event' then
    return;
  end if;

  if _passport_token is not null and length(_passport_token) > 0 then
    select pp.id
      into v_passport_id
    from public.passports pp
    where pp.event_id = r.event_id
      and pp.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text)
    limit 1;
  end if;

  return query
    select
      bc.id,
      bc.name,
      bc.description,
      bc.points_value,
      case
        when v_passport_id is null then false
        else exists (
          select 1
          from public.participant_point_awards ppa
          where ppa.award_type = 'bonus'
            and ppa.source_id = bc.id
            and ppa.participant_id = v_passport_id
        )
      end as is_claimed,
      coalesce(bc.kind, 'points') as kind,
      bc.social_location,
      bc.social_hashtags
    from public.event_bonus_codes bc
    join public.events e on e.id = bc.event_id
    where bc.event_id = r.event_id
      and bc.is_active = true
      and coalesce(bc.scope, 'event') = 'event'
      and e.status = 'published'
    order by bc.created_at asc;

  if _venue_id is not null then
    return query
      select
        bc.id,
        bc.name,
        bc.description,
        bc.points_value,
        case
          when v_passport_id is null then false
          else exists (
            select 1
            from public.participant_point_awards ppa
            where ppa.award_type = 'bonus'
              and ppa.source_id = ebv.id
              and ppa.participant_id = v_passport_id
          )
        end as is_claimed,
        coalesce(bc.kind, 'points') as kind,
        bc.social_location,
        bc.social_hashtags
      from public.event_bonus_code_venues ebv
      join public.event_bonus_codes bc on bc.id = ebv.bonus_code_id
      join public.events e on e.id = bc.event_id
      where bc.event_id = r.event_id
        and bc.scope = 'per_venue'
        and bc.is_active = true
        and ebv.is_active = true
        and ebv.venue_id = _venue_id
        and e.status = 'published'
      order by bc.created_at asc;
  end if;
end;
$$;

revoke all on function public.get_public_event_bonus_challenges(text, text, uuid) from public;
grant execute on function public.get_public_event_bonus_challenges(text, text, uuid) to anon, authenticated;
