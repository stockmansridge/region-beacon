-- Diagnose + fix: per-venue bonus save appears to succeed (204) but the
-- follow-up SELECT on event_bonus_code_venues returns []. Two things could
-- cause that: (1) the SELECT policy doesn't include the caller's role, or
-- (2) the RPC didn't actually insert rows for some reason. This migration
-- addresses both by:
--
--   1. Re-applying (idempotently) the SELECT policy that includes
--      agency_admin as well as agency_member and platform_admin.
--   2. Changing save_per_venue_bonus_venues to RETURN the resulting set of
--      active venue rows for the bonus code. The admin client will then use
--      the RPC's return value directly, bypassing the SELECT policy for the
--      just-saved state so the UI reflects reality no matter what.
--
-- Safe to re-run. Apply in the Supabase SQL editor.

begin;

-- 1. SELECT policy — include agency_admin.
drop policy if exists event_bonus_code_venues_select on public.event_bonus_code_venues;
create policy event_bonus_code_venues_select
  on public.event_bonus_code_venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

-- 2. Drop old void-returning signature so we can change the return type.
drop function if exists public.save_per_venue_bonus_venues(uuid, uuid[]);

create or replace function public.save_per_venue_bonus_venues(
  _bonus_code_id uuid,
  _venue_ids uuid[]
)
returns table (
  id uuid,
  bonus_code_id uuid,
  venue_id uuid,
  qr_code_token text,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b record;
  v_id uuid;
  v_token text;
begin
  select bc.id, bc.agency_id, bc.event_id, bc.scope
    into b
  from public.event_bonus_codes bc
  where bc.id = _bonus_code_id;

  if b.id is null then
    raise exception 'Bonus code not found';
  end if;

  if not (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), b.agency_id)
  ) then
    raise exception 'Forbidden';
  end if;

  update public.event_bonus_code_venues ebv
     set is_active = false, updated_at = now()
   where ebv.bonus_code_id = b.id
     and (_venue_ids is null or not (ebv.venue_id = any(_venue_ids)))
     and ebv.is_active = true;

  if _venue_ids is not null then
    update public.event_bonus_code_venues ebv
       set is_active = true, updated_at = now()
     where ebv.bonus_code_id = b.id
       and ebv.venue_id = any(_venue_ids)
       and ebv.is_active = false;

    foreach v_id in array _venue_ids loop
      if not exists (
        select 1 from public.event_bonus_code_venues ebv
        where ebv.bonus_code_id = b.id and ebv.venue_id = v_id
      ) then
        v_token := encode(extensions.gen_random_bytes(18), 'base64');
        v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
        insert into public.event_bonus_code_venues (
          agency_id, event_id, bonus_code_id, venue_id, qr_code_token, is_active
        ) values (
          b.agency_id, b.event_id, b.id, v_id, v_token, true
        );
      end if;
    end loop;
  end if;

  return query
    select ebv.id, ebv.bonus_code_id, ebv.venue_id, ebv.qr_code_token, ebv.is_active
    from public.event_bonus_code_venues ebv
    where ebv.bonus_code_id = b.id
      and ebv.is_active = true
    order by ebv.created_at;
end;
$$;

revoke all on function public.save_per_venue_bonus_venues(uuid, uuid[]) from public;
grant execute on function public.save_per_venue_bonus_venues(uuid, uuid[]) to authenticated;

commit;
