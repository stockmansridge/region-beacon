-- Fix: clone_event still failed on events_current_terms_fk because the
-- previous version inserted stale FK values first, then nulled them after.
-- Immediate FK constraints are checked during the INSERT, so nulling after
-- insert is too late. This version excludes/nuls event FK columns DURING the
-- INSERT, including FK columns that are part of composite constraints like
-- (agency_id, id, current_terms_version_id).

begin;

create or replace function public.clone_event(
  _source_event_id uuid,
  _new_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_agency uuid;
  v_new_event uuid;
  v_cols text;
  v_new_slug text;
  v_new_public_slug text;
  v_fk_cols text[];
  v_copy_cols text;
  v_select_cols text;
  v_venue_map jsonb := '{}'::jsonb;
  v_bonus_map jsonb := '{}'::jsonb;
  v_old_venue uuid;
  v_new_venue uuid;
  v_old_bonus uuid;
  v_new_bonus uuid;
  r record;
begin
  if _new_name is null or length(trim(_new_name)) = 0 then
    raise exception 'name_required';
  end if;

  select agency_id into v_agency from public.events where id = _source_event_id;
  if v_agency is null then
    raise exception 'event_not_found';
  end if;

  if not (public.is_platform_admin(auth.uid())
          or public.is_agency_admin(auth.uid(), v_agency)) then
    raise exception 'forbidden';
  end if;

  -- Slug (per-agency unique)
  v_new_slug := regexp_replace(lower(trim(_new_name)), '[^a-z0-9]+', '-', 'g');
  v_new_slug := regexp_replace(v_new_slug, '(^-+|-+$)', '', 'g');
  if v_new_slug is null or length(v_new_slug) = 0 then
    v_new_slug := 'event';
  end if;
  v_new_slug := left(v_new_slug, 60);
  if exists (
    select 1 from public.events
    where agency_id = v_agency and slug = v_new_slug
  ) then
    v_new_slug := v_new_slug || '-' || substr(md5(random()::text), 1, 6);
  end if;

  -- Public slug (globally unique).
  v_new_public_slug := v_new_slug || '-' || substr(md5(random()::text), 1, 6);
  while exists (
    select 1 from public.events where public_slug = v_new_public_slug
  ) loop
    v_new_public_slug := v_new_slug || '-' || substr(md5(random()::text), 1, 6);
  end loop;

  v_new_event := gen_random_uuid();

  -- Discover FK columns on public.events that must NOT be copied from the
  -- source event. This includes columns in composite FKs, e.g.
  -- events_current_terms_fk: (agency_id, id, current_terms_version_id).
  -- agency_id is intentionally copied; id is set explicitly for the clone.
  select coalesce(array_agg(distinct att.attname::text), array[]::text[])
    into v_fk_cols
  from pg_constraint c
  join pg_attribute att
    on att.attrelid = c.conrelid
   and att.attnum = any(c.conkey)
  where c.conrelid = 'public.events'::regclass
    and c.contype = 'f'
    and att.attname not in ('agency_id', 'id');

  -- Copyable columns for events. FK columns that point at child rows from the
  -- source event are included in the INSERT column list but selected as NULL,
  -- so immediate FK checks pass.
  select
      string_agg(quote_ident(column_name), ', ' order by ordinal_position),
      string_agg(
        case
          when column_name = any(v_fk_cols) then 'null::' || udt_name
          else quote_ident(column_name)
        end,
        ', ' order by ordinal_position
      )
    into v_copy_cols, v_select_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'events'
    and column_name not in (
      'id', 'name', 'slug', 'public_slug', 'status',
      'created_at', 'updated_at', 'deleted_at'
    );

  execute format(
    'insert into public.events (id, name, slug, public_slug, status, %s)
     select $1, $2, $3, $4, ''draft'', %s
     from public.events where id = $5',
    v_copy_cols, v_select_cols
  ) using v_new_event, _new_name, v_new_slug, v_new_public_slug, _source_event_id;

  -- ----- venues -----
  if to_regclass('public.venues') is not null then
    select string_agg(quote_ident(column_name), ', ')
      into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name not in ('id', 'event_id', 'created_at', 'updated_at', 'deleted_at');

    for r in
      select id from public.venues
      where event_id = _source_event_id and deleted_at is null
    loop
      v_old_venue := r.id;
      v_new_venue := gen_random_uuid();
      execute format(
        'insert into public.venues (id, event_id, %s)
         select $1, $2, %s from public.venues where id = $3',
        v_cols, v_cols
      ) using v_new_venue, v_new_event, v_old_venue;
      v_venue_map := v_venue_map || jsonb_build_object(v_old_venue::text, v_new_venue);
    end loop;
  end if;

  if to_regclass('public.venue_qr_codes') is not null then
    for r in
      select venue_id, entry_value
      from public.venue_qr_codes
      where event_id = _source_event_id and status = 'active'
    loop
      v_new_venue := nullif(v_venue_map->>r.venue_id::text, '')::uuid;
      if v_new_venue is not null then
        insert into public.venue_qr_codes (
          agency_id, event_id, venue_id, token, status, entry_value, created_by
        ) values (
          v_agency, v_new_event, v_new_venue,
          replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+','-'),'/','_'),'=',''),
          'active', coalesce(r.entry_value, 1), auth.uid()
        );
      end if;
    end loop;
  end if;

  if to_regclass('public.event_bonus_codes') is not null then
    select string_agg(quote_ident(column_name), ', ')
      into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_bonus_codes'
      and column_name not in ('id', 'event_id', 'qr_code_token', 'created_at', 'updated_at');

    for r in
      select id from public.event_bonus_codes where event_id = _source_event_id
    loop
      v_old_bonus := r.id;
      v_new_bonus := gen_random_uuid();
      execute format(
        'insert into public.event_bonus_codes (id, event_id, qr_code_token, %s)
         select $1, $2,
                replace(replace(replace(encode(extensions.gen_random_bytes(18), ''base64''), ''+'',''-''),''/'',''_''),''='',''''),
                %s
         from public.event_bonus_codes where id = $3',
        v_cols, v_cols
      ) using v_new_bonus, v_new_event, v_old_bonus;
      v_bonus_map := v_bonus_map || jsonb_build_object(v_old_bonus::text, v_new_bonus);
    end loop;
  end if;

  if to_regclass('public.event_bonus_code_venues') is not null then
    for r in
      select bonus_code_id, venue_id, is_active
      from public.event_bonus_code_venues
      where event_id = _source_event_id
    loop
      v_new_bonus := nullif(v_bonus_map->>r.bonus_code_id::text, '')::uuid;
      v_new_venue := nullif(v_venue_map->>r.venue_id::text, '')::uuid;
      if v_new_bonus is not null and v_new_venue is not null then
        insert into public.event_bonus_code_venues (
          agency_id, event_id, bonus_code_id, venue_id, qr_code_token, is_active
        ) values (
          v_agency, v_new_event, v_new_bonus, v_new_venue,
          replace(replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '+','-'),'/','_'),'=',''),
          coalesce(r.is_active, true)
        );
      end if;
    end loop;
  end if;

  for r in
    select unnest(array[
      'event_checkin_settings',
      'event_faq',
      'event_awards',
      'prize_rules',
      'event_announcements',
      'event_terms',
      'event_privacy'
    ]) as tbl
  loop
    if to_regclass('public.' || r.tbl) is not null then
      select string_agg(quote_ident(column_name), ', ')
        into v_cols
      from information_schema.columns
      where table_schema = 'public'
        and table_name = r.tbl
        and column_name not in ('id', 'event_id', 'created_at', 'updated_at');

      if v_cols is not null and length(v_cols) > 0 then
        execute format(
          'insert into public.%I (id, event_id, %s)
           select gen_random_uuid(), $1, %s from public.%I where event_id = $2',
          r.tbl, v_cols, v_cols, r.tbl
        ) using v_new_event, _source_event_id;
      end if;
    end if;
  end loop;

  return v_new_event;
end;
$$;

revoke all on function public.clone_event(uuid, text) from public;
grant execute on function public.clone_event(uuid, text) to authenticated;

commit;
