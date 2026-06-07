-- Agency signup intention
--
-- Adds `agencies.signup_intention` (free-text business-type / intent the
-- founder picked during self-service signup) and threads it through:
--   * public.create_customer_agency  (new optional _signup_intention arg)
--   * public.system_admin_organisations  (returns the new column)
--   * a one-shot backfill from auth.users.raw_user_meta_data.experience_type
--     for existing agencies whose earliest agency_owner has it set.
--
-- Idempotent. Safe to re-run. Additive: existing 2-arg callers still work
-- because the new parameter is defaulted to null.

set search_path = public;

-- 1) Column ----------------------------------------------------------------

alter table public.agencies
  add column if not exists signup_intention text;

comment on column public.agencies.signup_intention is
  'Free-text business type / intent captured during self-service signup. '
  'Optional. Populated by create_customer_agency from the pending signup '
  'payload, or backfilled from auth.users.raw_user_meta_data.experience_type.';

-- 2) create_customer_agency  (drop 2-arg, recreate 3-arg w/ default) -------

drop function if exists public.create_customer_agency(text, text);
drop function if exists public.create_customer_agency(text, text, text);

create or replace function public.create_customer_agency(
  _agency_name      text,
  _agency_slug      text,
  _signup_intention text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_name       text := nullif(btrim(_agency_name), '');
  v_slug       text := lower(btrim(_agency_slug));
  v_intention  text := nullif(btrim(coalesce(_signup_intention, '')), '');
  v_agency_id  uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid_agency_name' using errcode = '22023';
  end if;

  if v_slug is null
     or char_length(v_slug) < 2
     or char_length(v_slug) > 60
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_agency_slug' using errcode = '22023';
  end if;

  if v_intention is not null and char_length(v_intention) > 200 then
    v_intention := substr(v_intention, 1, 200);
  end if;

  if exists (select 1 from public.agencies where slug = v_slug) then
    raise exception 'agency_slug_taken' using errcode = '23505';
  end if;

  insert into public.agencies (name, slug, status, signup_intention)
  values (v_name, v_slug, 'active', v_intention)
  returning id into v_agency_id;

  insert into public.agency_members (agency_id, user_id, role, accepted_at)
  values (v_agency_id, v_user_id, 'agency_owner'::public.agency_role, now());

  return v_agency_id;
end;
$$;

revoke all on function public.create_customer_agency(text, text, text) from public;
grant execute on function public.create_customer_agency(text, text, text) to authenticated;

comment on function public.create_customer_agency(text, text, text) is
  'Self-service signup: creates a customer agency and makes the calling user '
  'its agency_owner. Optional _signup_intention persists the free-text '
  'business-type captured at signup. SECURITY DEFINER; validates auth.uid() '
  'and slug shape. Never grants platform_admin.';

-- 3) system_admin_organisations: expose signup_intention --------------------

drop function if exists public.system_admin_organisations();

create or replace function public.system_admin_organisations()
returns table (
  agency_id uuid,
  name text,
  slug text,
  status text,
  billing_email text,
  created_at timestamptz,
  owner_email text,
  member_count bigint,
  event_count bigint,
  published_event_count bigint,
  venue_count bigint,
  passport_count bigint,
  checkin_count bigint,
  effective_plan_code text,
  plan_source text,
  manual_plan_override text,
  manual_plan_override_at timestamptz,
  signup_intention text
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
    a.id,
    a.name,
    a.slug::text,
    a.status,
    a.billing_email::text,
    a.created_at,
    (
      select u.email::text
      from public.agency_members am
      join auth.users u on u.id = am.user_id
      where am.agency_id = a.id
        and am.role = 'agency_owner'
        and am.accepted_at is not null
      order by am.created_at asc
      limit 1
    ) as owner_email,
    (select count(*) from public.agency_members am
       where am.agency_id = a.id and am.accepted_at is not null) as member_count,
    (select count(*) from public.events e
       where e.agency_id = a.id and e.deleted_at is null) as event_count,
    (select count(*) from public.events e
       where e.agency_id = a.id and e.deleted_at is null and e.status = 'published') as published_event_count,
    (select count(*) from public.venues v
       where v.agency_id = a.id and v.deleted_at is null) as venue_count,
    (select count(*) from public.passports p
       where p.agency_id = a.id) as passport_count,
    (select count(*) from public.checkins c
       where c.agency_id = a.id) as checkin_count,
    (plan.limits ->> 'plan_code')::text as effective_plan_code,
    (plan.limits ->> 'plan_source')::text as plan_source,
    a.manual_plan_override::text,
    a.manual_plan_override_at,
    a.signup_intention
  from public.agencies a
  left join lateral (
    select public.get_agency_plan_limits(a.id) as limits
  ) plan on true
  where a.deleted_at is null
  order by a.created_at desc;
end
$$;

revoke all on function public.system_admin_organisations() from public;
grant execute on function public.system_admin_organisations() to authenticated;

-- 4) Backfill from earliest agency_owner's auth metadata --------------------
--
-- Relationship used: take the earliest accepted agency_member with role
-- 'agency_owner' for each agency (matches owner_email logic in
-- system_admin_organisations), then pull raw_user_meta_data->>'experience_type'
-- from auth.users. Only fills rows where signup_intention is currently null.

with owners as (
  select distinct on (am.agency_id)
    am.agency_id,
    am.user_id
  from public.agency_members am
  where am.role = 'agency_owner'
    and am.accepted_at is not null
  order by am.agency_id, am.created_at asc
),
backfill as (
  select
    o.agency_id,
    nullif(btrim(u.raw_user_meta_data->>'experience_type'), '') as intention
  from owners o
  join auth.users u on u.id = o.user_id
)
update public.agencies a
   set signup_intention = b.intention
  from backfill b
 where a.id = b.agency_id
   and a.signup_intention is null
   and b.intention is not null;

-- Verify:
--   select agency_id, name, signup_intention
--     from public.system_admin_organisations()
--     where signup_intention is not null
--     order by created_at desc limit 20;
