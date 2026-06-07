-- Enforce one-organisation-per-user on the self-serve signup RPC.
--
-- Adds an explicit guard inside public.create_customer_agency(text, text, text)
-- so a signed-in user who already has an accepted agency_members row cannot
-- create a second organisation via /signup or any future client bug.
--
-- Idempotent. Safe to re-run. Mirrors the 3-arg signature introduced by
-- migrations-agency-signup-intention/apply.sql.

set search_path = public;

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

  -- Product rule: one self-serve organisation per user. The admin portal is
  -- not designed for one email to manage multiple organisations. Platform
  -- admins create additional organisations through other tools, not this RPC.
  if exists (
    select 1
    from public.agency_members am
    where am.user_id = v_user_id
      and am.accepted_at is not null
  ) then
    raise exception 'user_already_has_organisation' using errcode = '23505';
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
  'its agency_owner. Refuses with user_already_has_organisation if the caller '
  'already has an accepted agency_members row. SECURITY DEFINER; validates '
  'auth.uid() and slug shape. Never grants platform_admin.';
