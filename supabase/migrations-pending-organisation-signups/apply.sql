-- Pending organisation signups — production hardening
--
-- Stores organisation details server-side during email-confirmation signup so
-- confirmation links opened in another browser/profile/webview can still
-- create the organisation after sign-in.
--
-- Idempotent. Additive. Uses SECURITY DEFINER RPCs so unauthenticated signup
-- can save pending details, authenticated users can only read/complete their
-- own pending signup by email, and platform admins can view diagnostics.

set search_path = public;

create table if not exists public.pending_organisation_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  organisation_name text not null,
  organisation_slug text,
  signup_intention text,
  auth_user_id uuid null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  completed_agency_id uuid null references public.agencies(id),
  last_error text null,
  constraint pending_organisation_signups_status_check
    check (status in ('pending', 'completed', 'cancelled', 'failed')),
  constraint pending_organisation_signups_email_not_blank
    check (btrim(email) <> ''),
  constraint pending_organisation_signups_name_not_blank
    check (btrim(organisation_name) <> '')
);

grant select on public.pending_organisation_signups to authenticated;
grant all on public.pending_organisation_signups to service_role;

create unique index if not exists pending_organisation_signups_pending_email_key
  on public.pending_organisation_signups (lower(email))
  where status = 'pending';

create index if not exists pending_organisation_signups_auth_user_id_idx
  on public.pending_organisation_signups (auth_user_id)
  where auth_user_id is not null;

alter table public.pending_organisation_signups enable row level security;

drop policy if exists "Users can read own pending organisation signup" on public.pending_organisation_signups;
create policy "Users can read own pending organisation signup"
on public.pending_organisation_signups
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public._normalise_agency_signup_slug(
  _input text,
  _max_length integer default 60
)
returns text
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  v_max integer := greatest(1, least(coalesce(_max_length, 60), 63));
  v_slug text;
  v_reserved text[] := array[
    'app','admin','api','www','events','support','billing',
    'login','signup','dashboard','system','assets','static',
    'cdn','demo','mail','auth','platform'
  ];
begin
  v_slug := lower(coalesce(_input, ''));
  v_slug := replace(v_slug, '&', ' and ');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  v_slug := left(v_slug, v_max);
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');

  if v_slug = '' then
    return null;
  end if;

  if v_slug = any(v_reserved) then
    v_slug := left(v_slug || '-org', v_max);
    v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  end if;

  return nullif(v_slug, '');
end;
$$;

revoke all on function public._normalise_agency_signup_slug(text, integer) from public;

create or replace function public.save_pending_organisation_signup(
  _email text,
  _full_name text,
  _organisation_name text,
  _organisation_slug text default null,
  _signup_intention text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(_email, '')));
  v_full_name text := nullif(btrim(coalesce(_full_name, '')), '');
  v_org_name text := nullif(btrim(coalesce(_organisation_name, '')), '');
  v_org_slug text := nullif(btrim(coalesce(_organisation_slug, '')), '');
  v_intention text := nullif(btrim(coalesce(_signup_intention, '')), '');
  v_auth_user_id uuid;
  v_caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_existing_id uuid;
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_pending_signup_email' using errcode = '22023';
  end if;

  if auth.uid() is not null and v_caller_email <> '' and v_caller_email <> v_email then
    raise exception 'pending_signup_email_mismatch' using errcode = '42501';
  end if;

  if v_org_name is null or char_length(v_org_name) > 200 then
    raise exception 'invalid_pending_signup_organisation_name' using errcode = '22023';
  end if;

  if v_full_name is not null and char_length(v_full_name) > 120 then
    v_full_name := left(v_full_name, 120);
  end if;
  if v_org_slug is not null and char_length(v_org_slug) > 63 then
    v_org_slug := left(v_org_slug, 63);
  end if;
  if v_intention is not null and char_length(v_intention) > 200 then
    v_intention := left(v_intention, 200);
  end if;

  select u.id into v_auth_user_id
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at desc
  limit 1;

  loop
    update public.pending_organisation_signups p
    set
      email = v_email,
      full_name = v_full_name,
      organisation_name = v_org_name,
      organisation_slug = v_org_slug,
      signup_intention = v_intention,
      auth_user_id = coalesce(v_auth_user_id, p.auth_user_id),
      last_error = null
    where p.status = 'pending'
      and lower(p.email) = v_email
    returning p.id into v_existing_id;

    if v_existing_id is not null then
      return v_existing_id;
    end if;

    begin
      insert into public.pending_organisation_signups (
        email,
        full_name,
        organisation_name,
        organisation_slug,
        signup_intention,
        auth_user_id,
        status
      ) values (
        v_email,
        v_full_name,
        v_org_name,
        v_org_slug,
        v_intention,
        v_auth_user_id,
        'pending'
      ) returning id into v_existing_id;
      return v_existing_id;
    exception when unique_violation then
      v_existing_id := null;
    end;
  end loop;
end;
$$;

revoke all on function public.save_pending_organisation_signup(text, text, text, text, text) from public;
grant execute on function public.save_pending_organisation_signup(text, text, text, text, text) to anon, authenticated;

create or replace function public.get_my_pending_organisation_signup()
returns table (
  id uuid,
  email text,
  full_name text,
  organisation_name text,
  organisation_slug text,
  signup_intention text,
  status text,
  created_at timestamptz,
  last_error text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.email,
    p.full_name,
    p.organisation_name,
    p.organisation_slug,
    p.signup_intention,
    p.status,
    p.created_at,
    p.last_error
  from public.pending_organisation_signups p
  where p.status = 'pending'
    and lower(p.email) = v_email
  order by p.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_my_pending_organisation_signup() from public;
grant execute on function public.get_my_pending_organisation_signup() to authenticated;

create or replace function public.complete_pending_organisation_signup()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_pending public.pending_organisation_signups%rowtype;
  v_existing_agency_id uuid;
  v_base text;
  v_candidate text;
  v_suffix text;
  v_room integer;
  v_agency_id uuid;
  v_attempt integer;
  v_last_error text;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_pending
  from public.pending_organisation_signups p
  where p.status = 'pending'
    and lower(p.email) = v_email
  order by p.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'pending_organisation_signup_not_found' using errcode = 'P0002';
  end if;

  update public.pending_organisation_signups
  set auth_user_id = v_user_id
  where id = v_pending.id;

  select am.agency_id into v_existing_agency_id
  from public.agency_members am
  where am.user_id = v_user_id
    and am.accepted_at is not null
  order by am.created_at asc
  limit 1;

  if v_existing_agency_id is not null then
    update public.pending_organisation_signups
    set status = 'completed',
        completed_at = now(),
        completed_agency_id = v_existing_agency_id,
        last_error = null
    where id = v_pending.id;
    return v_existing_agency_id;
  end if;

  v_base := public._normalise_agency_signup_slug(coalesce(v_pending.organisation_slug, v_pending.organisation_name), 60);
  if v_base is null then
    v_base := public._normalise_agency_signup_slug(v_pending.organisation_name, 60);
  end if;
  if v_base is null then
    v_base := 'organisation';
  end if;

  for v_attempt in 0..49 loop
    v_suffix := case when v_attempt = 0 then '' else '-' || (v_attempt + 1)::text end;
    v_room := greatest(1, 63 - char_length(v_suffix));
    v_candidate := public._normalise_agency_signup_slug(left(v_base, v_room) || v_suffix, 63);
    if v_candidate is null then
      v_candidate := 'organisation' || v_suffix;
    end if;

    begin
      v_agency_id := public.create_customer_agency(
        v_pending.organisation_name,
        v_candidate,
        v_pending.signup_intention
      );

      update public.pending_organisation_signups
      set status = 'completed',
          completed_at = now(),
          completed_agency_id = v_agency_id,
          last_error = null
      where id = v_pending.id;

      return v_agency_id;
    exception
      when unique_violation then
        v_last_error := SQLERRM;
        if SQLERRM ilike '%agency_slug_taken%' then
          continue;
        end if;
        update public.pending_organisation_signups set last_error = v_last_error where id = v_pending.id;
        return null;
      when others then
        v_last_error := SQLERRM;
        if SQLERRM ilike '%agency_slug_taken%' then
          continue;
        end if;
        update public.pending_organisation_signups set last_error = v_last_error where id = v_pending.id;
        return null;
    end;
  end loop;

  update public.pending_organisation_signups
  set last_error = 'agency_slug_unavailable'
  where id = v_pending.id;
  return null;
end;
$$;

revoke all on function public.complete_pending_organisation_signup() from public;
grant execute on function public.complete_pending_organisation_signup() to authenticated;

create or replace function public.system_admin_pending_organisation_signups()
returns table (
  id uuid,
  email text,
  full_name text,
  organisation_name text,
  organisation_slug text,
  signup_intention text,
  auth_user_id uuid,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  completed_agency_id uuid,
  last_error text
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
    p.id,
    p.email,
    p.full_name,
    p.organisation_name,
    p.organisation_slug,
    p.signup_intention,
    p.auth_user_id,
    p.status,
    p.created_at,
    p.completed_at,
    p.completed_agency_id,
    p.last_error
  from public.pending_organisation_signups p
  order by p.created_at desc
  limit 200;
end;
$$;

revoke all on function public.system_admin_pending_organisation_signups() from public;
grant execute on function public.system_admin_pending_organisation_signups() to authenticated;

comment on table public.pending_organisation_signups is
  'Server-side source of truth for organisation details collected before auth email confirmation.';
comment on function public.complete_pending_organisation_signup() is
  'Completes the signed-in user’s pending organisation signup by email, creates the agency via create_customer_agency with slug retry, and marks the pending row completed.';