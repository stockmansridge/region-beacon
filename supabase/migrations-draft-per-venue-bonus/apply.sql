-- Per-venue bonus codes.
--
-- Adds a scope to event bonus codes so the same bonus configuration
-- (name, description, points_value) can be issued as one QR per
-- participating venue rather than a single event-wide QR. Customers
-- claim once per (venue, passport) at the full points_value.
--
-- Draft only. Apply manually in the Supabase SQL editor. Safe to re-run
-- (idempotent — CREATE OR REPLACE + IF NOT EXISTS).

begin;

-- =====================================================================
-- 1. Schema
-- =====================================================================

alter table public.event_bonus_codes
  add column if not exists scope text not null default 'event';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_bonus_codes_scope_check'
  ) then
    alter table public.event_bonus_codes
      add constraint event_bonus_codes_scope_check
      check (scope in ('event','per_venue'));
  end if;
end$$;

create table if not exists public.event_bonus_code_venues (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  event_id uuid not null,
  bonus_code_id uuid not null,
  venue_id uuid not null,
  qr_code_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_bonus_code_venues_bonus_fk
    foreign key (agency_id, event_id, bonus_code_id)
    references public.event_bonus_codes (agency_id, event_id, id) on delete cascade,
  constraint event_bonus_code_venues_venue_fk
    foreign key (agency_id, event_id, venue_id)
    references public.venues (agency_id, event_id, id) on delete cascade,
  constraint event_bonus_code_venues_unique unique (bonus_code_id, venue_id),
  constraint event_bonus_code_venues_tenant_unique unique (agency_id, event_id, id),
  constraint event_bonus_code_venues_token_length check (length(qr_code_token) >= 22)
);

create index if not exists idx_event_bonus_code_venues_bonus
  on public.event_bonus_code_venues (bonus_code_id) where is_active = true;
create index if not exists idx_event_bonus_code_venues_venue
  on public.event_bonus_code_venues (venue_id) where is_active = true;
create index if not exists idx_event_bonus_code_venues_event
  on public.event_bonus_code_venues (event_id);

drop trigger if exists set_updated_at on public.event_bonus_code_venues;
create trigger set_updated_at
  before update on public.event_bonus_code_venues
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.event_bonus_code_venues to authenticated;
grant all on public.event_bonus_code_venues to service_role;

alter table public.event_bonus_code_venues enable row level security;

drop policy if exists deny_all on public.event_bonus_code_venues;
create policy deny_all on public.event_bonus_code_venues
  as restrictive for all to public using (false) with check (false);

drop policy if exists event_bonus_code_venues_select on public.event_bonus_code_venues;
create policy event_bonus_code_venues_select
  on public.event_bonus_code_venues for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
    or public.is_agency_member(auth.uid(), agency_id)
  );

drop policy if exists event_bonus_code_venues_write on public.event_bonus_code_venues;
create policy event_bonus_code_venues_write
  on public.event_bonus_code_venues for all to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.is_agency_admin(auth.uid(), agency_id)
  );

-- =====================================================================
-- 2. save_per_venue_bonus_venues
--    Server helper that syncs the venue selection for a per_venue bonus.
--    Called by the admin UI after upsert of event_bonus_codes.
-- =====================================================================

create or replace function public.save_per_venue_bonus_venues(
  _bonus_code_id uuid,
  _venue_ids uuid[]
)
returns void
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

  -- Deactivate rows for venues no longer selected (keeps history + tokens).
  update public.event_bonus_code_venues ebv
     set is_active = false, updated_at = now()
   where ebv.bonus_code_id = b.id
     and (_venue_ids is null or not (ebv.venue_id = any(_venue_ids)))
     and ebv.is_active = true;

  if _venue_ids is null then
    return;
  end if;

  -- Re-activate existing rows for venues in selection.
  update public.event_bonus_code_venues ebv
     set is_active = true, updated_at = now()
   where ebv.bonus_code_id = b.id
     and ebv.venue_id = any(_venue_ids)
     and ebv.is_active = false;

  -- Insert missing rows.
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
end;
$$;

revoke all on function public.save_per_venue_bonus_venues(uuid, uuid[]) from public;
grant execute on function public.save_per_venue_bonus_venues(uuid, uuid[]) to authenticated;

-- =====================================================================
-- 3. claim_bonus_code — extend to resolve per-venue tokens too.
-- =====================================================================

create or replace function public.claim_bonus_code(
  _token text,
  _passport_token text
)
returns table (
  success boolean,
  already_collected boolean,
  event_id uuid,
  bonus_code_id uuid,
  bonus_code_name text,
  points_awarded integer,
  total_points integer,
  venue_points integer,
  bonus_points integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b_id uuid;
  b_agency uuid;
  b_event uuid;
  b_name text;
  b_points int;
  b_is_active boolean;
  b_event_status text;
  v_source_id uuid;      -- id used in participant_point_awards.source_id
  v_venue_id uuid := null;
  v_passport_id uuid;
  v_passport_agency uuid;
  v_passport_event uuid;
  v_awarded int := 0;
  v_already boolean := false;
  v_inserted_count int := 0;
  v_total int := 0;
  v_venue_total int := 0;
  v_bonus_total int := 0;
begin
  -- 1. Resolve token — event-wide first, then per-venue.
  select bc.id, bc.agency_id, bc.event_id, bc.name,
         bc.points_value, bc.is_active, e.status
    into b_id, b_agency, b_event, b_name,
         b_points, b_is_active, b_event_status
  from public.event_bonus_codes bc
  join public.events e on e.id = bc.event_id
  where bc.qr_code_token = _token;

  if b_id is not null then
    v_source_id := b_id;
  else
    select bc.id, bc.agency_id, bc.event_id, bc.name,
           bc.points_value, (bc.is_active and ebv.is_active),
           e.status, ebv.id, ebv.venue_id
      into b_id, b_agency, b_event, b_name,
           b_points, b_is_active,
           b_event_status, v_source_id, v_venue_id
    from public.event_bonus_code_venues ebv
    join public.event_bonus_codes bc on bc.id = ebv.bonus_code_id
    join public.events e on e.id = bc.event_id
    where ebv.qr_code_token = _token;
  end if;

  if b_id is null then
    return query select
      false, false, null::uuid, null::uuid, null::text,
      0, 0, 0, 0,
      'Bonus code not found.'::text;
    return;
  end if;

  if not b_is_active then
    return query select
      false, false, b_event, b_id, b_name,
      0, 0, 0, 0,
      'This bonus code is no longer active.'::text;
    return;
  end if;

  if b_event_status <> 'published' then
    return query select
      false, false, b_event, b_id, b_name,
      0, 0, 0, 0,
      'This event is not currently live.'::text;
    return;
  end if;

  -- 2. Resolve passport via access token.
  select p.id, p.agency_id, p.event_id
    into v_passport_id, v_passport_agency, v_passport_event
  from public.passports p
  where p.access_token_hash = extensions.digest(_passport_token::text, 'sha256'::text);

  if v_passport_id is null then
    return query select
      false, false, b_event, b_id, b_name,
      0, 0, 0, 0,
      'Passport not found.'::text;
    return;
  end if;

  if v_passport_event <> b_event or v_passport_agency <> b_agency then
    return query select
      false, false, b_event, b_id, b_name,
      0, 0, 0, 0,
      'This bonus code is for a different event.'::text;
    return;
  end if;

  -- 3. Idempotent insert (unique (event_id, participant_id, award_type, source_id)).
  if not exists (
    select 1 from public.participant_point_awards ppa
    where ppa.event_id = b_event
      and ppa.participant_id = v_passport_id
      and ppa.award_type = 'bonus'
      and ppa.source_id = v_source_id
  ) then
    insert into public.participant_point_awards (
      agency_id, event_id, participant_id,
      award_type, source_id, points_awarded, metadata
    )
    values (
      b_agency, b_event, v_passport_id,
      'bonus', v_source_id, coalesce(b_points, 0),
      jsonb_build_object(
        'bonus_code_id', b_id,
        'bonus_code_name', b_name,
        'venue_id', v_venue_id
      )
    );
    get diagnostics v_inserted_count = row_count;
  else
    v_inserted_count := 0;
  end if;

  if v_inserted_count > 0 then
    v_awarded := coalesce(b_points, 0);
    v_already := false;
  else
    v_awarded := 0;
    v_already := true;
  end if;

  select coalesce(sum(ppa.points_awarded), 0)::int,
         coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'venue'), 0)::int,
         coalesce(sum(ppa.points_awarded) filter (where ppa.award_type = 'bonus'), 0)::int
    into v_total, v_venue_total, v_bonus_total
  from public.participant_point_awards ppa
  where ppa.event_id = b_event and ppa.participant_id = v_passport_id;

  return query select
    true,
    v_already,
    b_event,
    b_id,
    b_name,
    v_awarded,
    v_total,
    v_venue_total,
    v_bonus_total,
    case when v_already then 'Already collected' else 'Bonus points collected' end::text;
end;
$$;

revoke all on function public.claim_bonus_code(text, text) from public;
grant execute on function public.claim_bonus_code(text, text) to anon, authenticated;

-- =====================================================================
-- 4. get_public_event_bonus_challenges — expand with optional _venue_id
--    so per-venue bonuses appear only on their venue page with the
--    correct per-(venue,passport) claim status.
-- =====================================================================

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

  -- Event-wide bonuses: always show for the event.
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
      and coalesce(bc.scope, 'event') = 'event'
      and e.status = 'published'
    order by bc.created_at asc;

  -- Per-venue bonuses: only when a venue context is supplied and the
  -- bonus is active for that venue. is_claimed is scoped to the
  -- specific (venue, passport) child row.
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
        end as is_claimed
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

-- Drop the older 2-arg overload if present so PostgREST calls hit the
-- new signature.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_public_event_bonus_challenges'
      and pg_get_function_identity_arguments(p.oid) = '_hostname text, _passport_token text'
  ) then
    drop function public.get_public_event_bonus_challenges(text, text);
  end if;
end$$;

commit;
