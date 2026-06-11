-- Fix "column reference agency_id is ambiguous" in get_venue_tasting_qr_codes.
--
-- The function declares RETURNS TABLE(... agency_id uuid, event_id uuid, ...).
-- Inside PL/pgSQL those output column names are in scope, so the line
--   select agency_id into v_agency from public.events where id = _event_id;
-- is ambiguous between the output columns and public.events columns.
-- All column references are now fully qualified.

create or replace function public.get_venue_tasting_qr_codes(
  _event_id uuid,
  _venue_id uuid
)
returns table (
  id uuid,
  agency_id uuid,
  event_id uuid,
  venue_id uuid,
  label text,
  description text,
  points integer,
  status text,
  qr_token text,
  scan_limit_per_passport integer,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  claim_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agency uuid;
begin
  select e.agency_id into v_agency
    from public.events e
   where e.id = _event_id;

  if v_agency is null then
    raise exception 'event_not_found';
  end if;

  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_member(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  return query
  select
    t.id,
    t.agency_id,
    t.event_id,
    t.venue_id,
    t.label,
    t.description,
    t.points,
    t.status,
    t.qr_token,
    t.scan_limit_per_passport,
    t.starts_at,
    t.ends_at,
    t.created_at,
    t.updated_at,
    coalesce(c.cnt, 0)::bigint as claim_count
  from public.venue_tasting_qr_codes t
  left join lateral (
    select count(*) as cnt
    from public.venue_tasting_qr_claims cc
    where cc.tasting_qr_id = t.id
  ) c on true
  where t.event_id = _event_id
    and t.venue_id = _venue_id
    and t.deleted_at is null
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_venue_tasting_qr_codes(uuid, uuid) to authenticated;
