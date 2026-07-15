-- Public RPC: list active bonus challenges for the current event, with an
-- optional per-passport "claimed" flag so the venue detail page can render a
-- Bonus Challenge block only when the event has bonus codes configured.
--
-- Bonus codes are event-scoped (public.event_bonus_codes), not venue-scoped,
-- so the same list is rendered on every venue page for the event.
--
-- Safe columns only: id, name, description, points_value. The
-- qr_code_token is NEVER exposed — collection still happens via
-- /collect/bonus/:token (public.claim_bonus_code).

begin;

create or replace function public.get_public_event_bonus_challenges(
  _hostname text,
  _passport_token text default null
)
returns table (
  bonus_code_id uuid,
  name text,
  description text,
  points_value integer,
  is_claimed boolean
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
  select kind, event_id into r
  from public.resolve_event_by_host(_hostname);

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
      end as is_claimed
    from public.event_bonus_codes bc
    join public.events e on e.id = bc.event_id
    where bc.event_id = r.event_id
      and bc.is_active = true
      and e.status = 'published'
    order by bc.created_at asc;
end;
$$;

revoke all on function public.get_public_event_bonus_challenges(text, text) from public;
grant execute on function public.get_public_event_bonus_challenges(text, text) to anon, authenticated;

commit;
