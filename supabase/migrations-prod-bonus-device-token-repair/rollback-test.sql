-- NOT EXECUTED. Runs against existing Orange Wine Quest records without returning tokens.
-- Temporary device aliases and awards are transaction-local and always rolled back.
-- Use a single session; ON_ERROR_STOP for psql. No external network calls occur.
begin;
set local statement_timeout = '30s';
do $$
declare
  v record;
  p record;
  a record;
  raw_a text := encode(extensions.gen_random_bytes(32),'hex');
  raw_b text := encode(extensions.gen_random_bytes(32),'hex');
  original_hash bytea;
  before_count bigint;
begin
  select ebv.id as child_id, ebv.venue_id, ebv.qr_code_token as child_token,
         bc.id as parent_id, bc.qr_code_token as parent_token,
         bc.agency_id, bc.event_id, bc.points_value
    into v
  from public.event_bonus_code_venues ebv
  join public.event_bonus_codes bc on bc.id=ebv.bonus_code_id
    and bc.agency_id=ebv.agency_id and bc.event_id=ebv.event_id
  join public.events e on e.id=bc.event_id and e.agency_id=bc.agency_id
  where e.name='Orange Wine Quest' and e.status='published'
    and bc.is_active and ebv.is_active
  order by ebv.id limit 1;
  if v.child_id is null then raise exception 'No eligible Orange Wine Quest bonus pair; no test performed'; end if;

  select pp.id, pp.access_token_hash into p
  from public.passports pp
  where pp.event_id=v.event_id and pp.agency_id=v.agency_id
    and not exists (select 1 from public.participant_point_awards pa
      where pa.event_id=v.event_id and pa.participant_id=pp.id
        and pa.award_type='bonus' and pa.source_id in (v.child_id,v.parent_id))
  order by pp.id limit 1 for update;
  if p.id is null then raise exception 'No unclaimed existing passport; no test performed'; end if;
  original_hash := p.access_token_hash;
  select count(*) into before_count from public.participant_point_awards
    where participant_id=p.id and event_id=v.event_id;
  insert into public.passport_device_tokens(passport_id,event_id,token_hash)
    values (p.id,v.event_id,extensions.digest(raw_a,'sha256')),
           (p.id,v.event_id,extensions.digest(raw_b,'sha256'));
  if public.resolve_passport_id_by_token(raw_a) is distinct from p.id
    or public.resolve_passport_id_by_token(raw_b) is distinct from p.id then
    raise exception 'Device alias resolution failed';
  end if;

  select * into a from public.claim_bonus_code(v.child_token,raw_a);
  if a.success is not true or a.already_collected is not false
    or a.points_awarded is distinct from coalesce(v.points_value,0) then
    raise exception 'First per-venue claim failed';
  end if;
  if not exists(select 1 from public.participant_point_awards pa
    where pa.event_id=v.event_id and pa.participant_id=p.id and pa.award_type='bonus'
      and pa.source_id=v.child_id and pa.metadata->>'venue_id'=v.venue_id::text
      and pa.metadata->>'bonus_code_id'=v.parent_id::text) then
    raise exception 'Per-venue source or metadata failed';
  end if;
  select * into a from public.claim_bonus_code(v.child_token,raw_b);
  if a.success is not true or a.already_collected is not true or a.points_awarded<>0 then
    raise exception 'Per-venue duplicate failed';
  end if;
  select * into a from public.claim_bonus_code(v.parent_token,raw_b);
  if a.success is not true or a.already_collected is not false
    or a.points_awarded is distinct from coalesce(v.points_value,0) then
    raise exception 'Event-wide claim failed';
  end if;
  select * into a from public.claim_bonus_code(v.parent_token,raw_a);
  if a.success is not true or a.already_collected is not true or a.points_awarded<>0 then
    raise exception 'Event-wide duplicate failed';
  end if;
  if (select count(*) from public.participant_point_awards
      where participant_id=p.id and event_id=v.event_id) <> before_count+2 then
    raise exception 'Unexpected award count';
  end if;
  if (select access_token_hash from public.passports where id=p.id) is distinct from original_hash then
    raise exception 'Original passport hash changed';
  end if;
  raise notice 'PASS: real venue/event claims, A/B duplicates, metadata and unchanged original hash. ROLLBACK follows.';
end;
$$;
rollback;
