-- System Admin: User Auth Diagnostics
--
-- Adds three platform-admin-only SECURITY DEFINER RPCs that let the
-- System Admin UI search for an auth user, view a sanitised auth
-- timeline (from auth.users timestamps + auth.audit_log_entries when
-- available), and surface a simple email-confirmation diagnostic.
--
-- All functions:
--   * gate on public.is_platform_admin(auth.uid()) and raise 42501 if false
--   * read from the `auth` schema using SECURITY DEFINER (frontend never
--     touches auth.* directly)
--   * never return tokens, OTPs, refresh tokens, password hashes, or
--     any sensitive identity provider secrets
--
-- Idempotent: safe to re-run.

set search_path = public;

-- Guard ------------------------------------------------------------------

create or replace function public._require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin(auth.uid()) then
    raise exception 'forbidden: platform_admin required'
      using errcode = '42501';
  end if;
end;
$$;

-- 1) Find auth user ------------------------------------------------------

create or replace function public.system_admin_find_auth_user(p_search text)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  confirmation_sent_at timestamptz,
  invited_at timestamptz,
  recovery_sent_at timestamptz,
  email_change text,
  email_change_sent_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  banned_until timestamptz,
  provider text,
  providers text[],
  is_platform_admin boolean,
  has_organisation boolean,
  agency_id uuid,
  agency_name text,
  agency_role text,
  accepted_at timestamptz,
  invited_member_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_needle text := lower(trim(coalesce(p_search, '')));
begin
  perform public._require_platform_admin();
  if v_needle = '' then
    return;
  end if;

  -- If it parses as a uuid, try direct id match first.
  begin
    v_id := v_needle::uuid;
  exception when others then
    v_id := null;
  end;

  return query
  with u as (
    select au.*
    from auth.users au
    where (v_id is not null and au.id = v_id)
       or (v_id is null and lower(coalesce(au.email, '')) like '%' || v_needle || '%')
    order by au.created_at desc
    limit 25
  ),
  m as (
    select
      am.user_id,
      am.agency_id,
      am.role::text as agency_role,
      am.accepted_at,
      am.invited_at as invited_member_at,
      a.name as agency_name,
      row_number() over (
        partition by am.user_id
        order by (am.accepted_at is null), am.accepted_at desc nulls last, am.invited_at desc nulls last
      ) as rn
    from public.agency_members am
    left join public.agencies a on a.id = am.agency_id
  )
  select
    u.id as user_id,
    u.email::text,
    u.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    u.confirmation_sent_at,
    u.invited_at,
    u.recovery_sent_at,
    nullif(u.email_change, '')::text,
    u.email_change_sent_at,
    u.phone::text,
    u.phone_confirmed_at,
    u.banned_until,
    (u.raw_app_meta_data ->> 'provider')::text,
    case
      when jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
      then array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers'))
      else null
    end,
    public.is_platform_admin(u.id),
    (m.user_id is not null and m.accepted_at is not null),
    m.agency_id,
    m.agency_name,
    m.agency_role,
    m.accepted_at,
    m.invited_member_at
  from u
  left join m on m.user_id = u.id and m.rn = 1
  order by u.created_at desc;
end;
$$;

revoke all on function public.system_admin_find_auth_user(text) from public;
grant execute on function public.system_admin_find_auth_user(text) to authenticated;

-- 2) Auth timeline -------------------------------------------------------

create or replace function public.system_admin_user_auth_timeline(p_user_id uuid)
returns table (
  occurred_at timestamptz,
  event_type text,
  status text,
  summary text,
  source text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audit_exists boolean;
  v_user auth.users%rowtype;
begin
  perform public._require_platform_admin();
  if p_user_id is null then
    return;
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return;
  end if;

  -- Synthesised timestamps from auth.users
  return query
  select * from (values
    (v_user.created_at,
     'signup',
     'completed',
     'Account created in auth.users',
     'auth.users',
     jsonb_build_object('email', v_user.email)),
    (v_user.confirmation_sent_at,
     'confirmation_email_handoff',
     'sent',
     'Supabase generated a confirmation email (handoff — delivery not confirmed)',
     'auth.users',
     jsonb_build_object('note', 'Supabase recorded confirmation_sent_at. This does not guarantee inbox delivery.')),
    (v_user.email_confirmed_at,
     'email_confirmed',
     'completed',
     'User confirmed their email address',
     'auth.users',
     '{}'::jsonb),
    (v_user.invited_at,
     'invite_sent',
     'sent',
     'Invite email was generated',
     'auth.users',
     '{}'::jsonb),
    (v_user.recovery_sent_at,
     'password_recovery_sent',
     'sent',
     'Password recovery email was generated (handoff)',
     'auth.users',
     '{}'::jsonb),
    (v_user.email_change_sent_at,
     'email_change_sent',
     'sent',
     'Email-change confirmation email was generated',
     'auth.users',
     jsonb_build_object('email_change', nullif(v_user.email_change, ''))),
    (v_user.phone_confirmed_at,
     'phone_confirmed',
     'completed',
     'Phone number confirmed',
     'auth.users',
     '{}'::jsonb),
    (v_user.last_sign_in_at,
     'last_sign_in',
     'completed',
     'Most recent successful sign-in',
     'auth.users',
     '{}'::jsonb),
    (v_user.banned_until,
     'banned',
     'blocked',
     'User is banned until this timestamp',
     'auth.users',
     '{}'::jsonb)
  ) as t(occurred_at, event_type, status, summary, source, metadata)
  where t.occurred_at is not null;

  -- auth.audit_log_entries (only if present)
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'audit_log_entries'
  ) into v_audit_exists;

  if v_audit_exists then
    return query
    execute $q$
      select
        ale.created_at as occurred_at,
        coalesce(ale.payload ->> 'action', 'auth_event') as event_type,
        coalesce(ale.payload ->> 'log_type', 'info') as status,
        concat_ws(' · ',
          coalesce(ale.payload ->> 'action', 'auth event'),
          nullif(ale.payload ->> 'log_type', '')
        ) as summary,
        'auth.audit_log_entries' as source,
        jsonb_strip_nulls(jsonb_build_object(
          'action', ale.payload ->> 'action',
          'log_type', ale.payload ->> 'log_type',
          'actor_username', ale.payload ->> 'actor_username',
          'ip_address', ale.ip_address::text
        )) as metadata
      from auth.audit_log_entries ale
      where (ale.payload ->> 'actor_id') = $1::text
         or (ale.payload -> 'traits' ->> 'user_id') = $1::text
      order by ale.created_at desc
      limit 200
    $q$
    using p_user_id;
  end if;
end;
$$;

revoke all on function public.system_admin_user_auth_timeline(uuid) from public;
grant execute on function public.system_admin_user_auth_timeline(uuid) to authenticated;

-- 3) Email diagnostics ---------------------------------------------------

create or replace function public.system_admin_auth_email_diagnostics(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_likely_issue text;
  v_next_action text;
begin
  perform public._require_platform_admin();
  if p_user_id is null then
    return jsonb_build_object('user_exists', false);
  end if;

  select * into v_user from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('user_exists', false);
  end if;

  if v_user.email_confirmed_at is not null and v_user.last_sign_in_at is not null then
    v_likely_issue := 'No issue detected — user has confirmed email and has signed in.';
    v_next_action  := 'No action required.';
  elsif v_user.email_confirmed_at is not null and v_user.last_sign_in_at is null then
    v_likely_issue := 'User has confirmed email but has never logged in.';
    v_next_action  := 'Ask the user to try logging in. If login fails, offer a password reset.';
  elsif v_user.email_confirmed_at is null and v_user.confirmation_sent_at is not null then
    v_likely_issue := 'Confirmation email was generated by Supabase but the user has not confirmed.';
    v_next_action  := 'Ask the user to check spam/junk. Verify SMTP provider logs. Resend confirmation if needed.';
  elsif v_user.email_confirmed_at is null and v_user.confirmation_sent_at is null then
    v_likely_issue := 'No confirmation sent timestamp found. Supabase may not have generated the email, or the field is unavailable.';
    v_next_action  := 'Check Supabase Auth email template configuration and SMTP provider. Manually resend confirmation.';
  else
    v_likely_issue := 'Unknown state.';
    v_next_action  := 'Inspect the auth timeline below for details.';
  end if;

  return jsonb_build_object(
    'user_exists', true,
    'user_id', v_user.id,
    'email', v_user.email,
    'created_at', v_user.created_at,
    'email_confirmed', v_user.email_confirmed_at is not null,
    'email_confirmed_at', v_user.email_confirmed_at,
    'confirmation_sent_at', v_user.confirmation_sent_at,
    'last_sign_in_at', v_user.last_sign_in_at,
    'banned_until', v_user.banned_until,
    'likely_issue', v_likely_issue,
    'recommended_next_action', v_next_action
  );
end;
$$;

revoke all on function public.system_admin_auth_email_diagnostics(uuid) from public;
grant execute on function public.system_admin_auth_email_diagnostics(uuid) to authenticated;
