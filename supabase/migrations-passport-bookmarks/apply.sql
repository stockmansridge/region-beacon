-- ---------------------------------------------------------------------------
-- Passport bookmarks
--
-- Lets a visitor who has created a passport save venues and offers for later.
-- Bookmarks hang off the passport, so they follow the visitor's passport link
-- on any device. Public access is only ever through the two security-definer
-- RPCs below, which authenticate by the raw passport access token (same
-- pattern as get_passport_by_token).
-- ---------------------------------------------------------------------------

create table if not exists public.passport_bookmarks (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('venue', 'offer')),
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (passport_id, kind, venue_id)
);

create index if not exists passport_bookmarks_passport_idx
  on public.passport_bookmarks (passport_id, created_at desc);
create index if not exists passport_bookmarks_event_idx
  on public.passport_bookmarks (event_id);

grant select on public.passport_bookmarks to authenticated;
grant all on public.passport_bookmarks to service_role;

alter table public.passport_bookmarks enable row level security;

-- Agency members / platform admins may read bookmarks for their own events.
drop policy if exists "agency members read passport bookmarks" on public.passport_bookmarks;
create policy "agency members read passport bookmarks"
on public.passport_bookmarks
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    join public.agency_members m on m.agency_id = e.agency_id
    where e.id = passport_bookmarks.event_id
      and m.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- toggle_passport_bookmark: adds the bookmark when missing, removes it when
-- present. Returns true when the item is bookmarked after the call.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_passport_bookmark(
  _raw_token text,
  _kind text,
  _venue_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  existing uuid;
begin
  if _kind not in ('venue', 'offer') then
    raise exception 'invalid_kind';
  end if;

  select id, event_id into p
  from public.passports
  where access_token_hash = extensions.digest(_raw_token, 'sha256')
  limit 1;

  if p.id is null then
    raise exception 'passport_not_found';
  end if;

  if not exists (
    select 1 from public.venues v
    where v.id = _venue_id and v.event_id = p.event_id
  ) then
    raise exception 'venue_not_found';
  end if;

  select b.id into existing
  from public.passport_bookmarks b
  where b.passport_id = p.id and b.kind = _kind and b.venue_id = _venue_id
  limit 1;

  if existing is not null then
    delete from public.passport_bookmarks where id = existing;
    return false;
  end if;

  insert into public.passport_bookmarks (passport_id, event_id, kind, venue_id)
  values (p.id, p.event_id, _kind, _venue_id)
  on conflict (passport_id, kind, venue_id) do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_passport_bookmarks: everything the visitor has saved, newest first.
-- ---------------------------------------------------------------------------
create or replace function public.get_passport_bookmarks(_raw_token text)
returns table (
  kind text,
  venue_id uuid,
  venue_name text,
  logo_path text,
  cover_path text,
  offer_summary text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.kind,
    b.venue_id,
    v.name,
    v.logo_path,
    v.cover_path,
    v.offer_summary,
    b.created_at
  from public.passport_bookmarks b
  join public.passports p on p.id = b.passport_id
  join public.venues v on v.id = b.venue_id
  where p.access_token_hash = extensions.digest(_raw_token, 'sha256')
  order by b.created_at desc
$$;

revoke all on function public.toggle_passport_bookmark(text, text, uuid) from public;
revoke all on function public.get_passport_bookmarks(text) from public;
grant execute on function public.toggle_passport_bookmark(text, text, uuid) to anon, authenticated;
grant execute on function public.get_passport_bookmarks(text) to anon, authenticated;

notify pgrst, 'reload schema';
