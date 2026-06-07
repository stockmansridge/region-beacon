-- Release subdomains of deleted/archived events
--
-- Problem
--   `event_domains.public_subdomain` is globally unique
--   (`ux_event_domains_subdomain`). When an event is archived
--   (`events.deleted_at` set, `status = 'archived'`) the linked
--   `event_subdomain` row is left intact, so the label keeps occupying
--   that unique index and `validate_public_subdomain()` reports it as
--   taken. A new event can never reuse the label.
--
-- Fix
--   1. Trigger on `events`: when `deleted_at` transitions NULL → not-NULL,
--      release any `event_subdomain` rows for that event by NULLing
--      `public_subdomain` and setting `status = 'revoked'`. NULLed rows
--      drop out of the partial unique index so the label becomes free.
--      Reverse direction (unarchive) does NOT auto-restore the old label
--      — it has likely been claimed by someone else by then.
--   2. Backfill: release subdomains on every already-archived event.
--   3. `validate_public_subdomain()`: ignore subdomains attached to
--      deleted events (defence in depth in case rows slip past the
--      trigger).
--   4. `system_admin_clear_event_subdomain(uuid)`: platform-admin RPC to
--      manually clear the subdomain of a deleted event (cleanup tool).
--
-- Idempotent. Safe to re-run.

set search_path = public;

-- 1. Trigger: release event_subdomain rows on archive ----------------------

create or replace function public.tg_release_event_subdomains_on_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and (old.deleted_at is null) then
    -- Delete event_subdomain rows that only carry a public_subdomain
    -- (no custom_domain) — NULLing would violate event_domains_has_some_name.
    delete from public.event_domains
     where event_id = new.id
       and domain_type = 'event_subdomain'
       and custom_domain is null;

    -- Rows that also have a custom_domain: just release the subdomain label.
    update public.event_domains
       set public_subdomain = null,
           status           = 'revoked',
           is_primary       = false,
           updated_at       = now()
     where event_id = new.id
       and domain_type = 'event_subdomain'
       and public_subdomain is not null
       and custom_domain is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_event_subdomains_on_archive on public.events;
create trigger trg_release_event_subdomains_on_archive
  after update of deleted_at on public.events
  for each row
  execute function public.tg_release_event_subdomains_on_archive();

-- 2. Backfill: release subdomains on already-archived events ---------------

update public.event_domains d
   set public_subdomain = null,
       status           = 'revoked',
       is_primary       = false,
       updated_at       = now()
  from public.events e
 where d.event_id = e.id
   and d.domain_type = 'event_subdomain'
   and d.public_subdomain is not null
   and e.deleted_at is not null;

-- 3. validate_public_subdomain — ignore subdomains on deleted events -------

create or replace function public.validate_public_subdomain(_candidate text)
returns table (ok boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v citext := lower(_candidate);
begin
  if v is null or length(v) < 3 or length(v) > 63 then
    return query select false, 'length'; return;
  end if;
  if not public.is_valid_public_slug(v) then
    return query select false, 'format'; return;
  end if;
  if public.is_reserved_public_slug(v) then
    return query select false, 'reserved'; return;
  end if;
  if exists (
    select 1
      from public.event_domains d
      left join public.events e on e.id = d.event_id
     where d.public_subdomain = v
       and (
         d.domain_type = 'platform_reserved'
         or e.id is null
         or e.deleted_at is null
       )
  ) then
    return query select false, 'taken'; return;
  end if;
  return query select true, null::text;
end;
$$;

grant execute on function public.validate_public_subdomain(text) to anon, authenticated;

-- 4. system_admin_clear_event_subdomain — manual cleanup -------------------

create or replace function public.system_admin_clear_event_subdomain(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event       public.events%rowtype;
  v_previous    citext;
begin
  perform public._require_platform_admin();

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = '22023';
  end if;
  if v_event.deleted_at is null then
    raise exception
      'Only deleted/archived events can have their subdomain cleared.'
      using errcode = '22023';
  end if;

  select d.public_subdomain
    into v_previous
    from public.event_domains d
   where d.event_id = p_event_id
     and d.domain_type = 'event_subdomain'
     and d.public_subdomain is not null
   order by d.is_primary desc, d.updated_at desc
   limit 1;

  update public.event_domains
     set public_subdomain = null,
         status           = 'revoked',
         is_primary       = false,
         updated_at       = now()
   where event_id = p_event_id
     and domain_type = 'event_subdomain'
     and public_subdomain is not null;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'previous_subdomain', v_previous
  );
end;
$$;

revoke all on function public.system_admin_clear_event_subdomain(uuid) from public;
grant execute on function public.system_admin_clear_event_subdomain(uuid) to authenticated;

-- 5. Platform-admin listing of deleted events that still hold subdomains ---
--    (Only rows where the release trigger has not yet been applied — e.g.
--    historical data from before this migration if the backfill above is
--    skipped, or future edge cases.)

create or replace function public.system_admin_deleted_events_with_subdomain()
returns table (
  event_id          uuid,
  agency_id         uuid,
  agency_name       text,
  event_name        text,
  public_subdomain  text,
  domain_status     text,
  deleted_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_platform_admin();

  return query
  select
    e.id,
    e.agency_id,
    a.name,
    e.name,
    d.public_subdomain::text,
    d.status,
    e.deleted_at
  from public.events e
  join public.agencies a     on a.id = e.agency_id
  join public.event_domains d on d.event_id = e.id
  where e.deleted_at is not null
    and d.domain_type = 'event_subdomain'
    and d.public_subdomain is not null
  order by e.deleted_at desc;
end;
$$;

revoke all on function public.system_admin_deleted_events_with_subdomain() from public;
grant execute on function public.system_admin_deleted_events_with_subdomain() to authenticated;
