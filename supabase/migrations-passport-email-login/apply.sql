-- Returning-visitor "Log in" by email — opens the passport directly from the
-- email address. No emailed link or code is sent (owner-approved flow).
-- Run once in the SQL editor. Safe to re-run.
-- Replaces the earlier single-use-code design, which was never applied.
-- Lookups are rate limited per event+email to blunt email enumeration.

drop table if exists public.passport_login_codes cascade;

create table if not exists public.passport_email_logins (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  email_hash bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists passport_email_logins_recent_idx
  on public.passport_email_logins (event_id, email_hash, created_at desc);
alter table public.passport_email_logins enable row level security;
revoke all on public.passport_email_logins from anon, authenticated;

-- Returns the fresh passport key for the given event + email, or zero rows
-- when the email is not registered (or the rate limit is hit).
create or replace function public.lookup_passport_by_email(_event_id uuid, _email citext)
returns table (access_token text)
language plpgsql security definer set search_path = public
as $$
declare
  v_passport uuid;
  v_email_hash bytea;
  v_raw text;
begin
  v_email_hash := digest(lower(_email::text), 'sha256');

  -- Simple rate limit: 10 lookups per event+email per hour.
  if (select count(*) from public.passport_email_logins l
      where l.event_id = _event_id and l.email_hash = v_email_hash
        and l.created_at > now() - interval '1 hour') >= 10 then
    return;
  end if;

  select p.id into v_passport
  from public.visitors v
  join public.passports p on p.visitor_id = v.id and p.event_id = v.event_id
  where v.event_id = _event_id and v.email = _email
  limit 1;
  if v_passport is null then
    insert into public.passport_email_logins (event_id, email_hash) values (_event_id, v_email_hash);
    return; -- zero rows: not registered
  end if;

  -- Rotate the passport key so this device holds the only working link
  -- (same trade-off as re-registering: earlier links stop working).
  v_raw := encode(gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');
  update public.passports
    set access_token_hash = digest(v_raw, 'sha256'), updated_at = now()
  where id = v_passport;

  insert into public.passport_email_logins (event_id, email_hash) values (_event_id, v_email_hash);
  return query select v_raw;
end;
$$;

revoke all on function public.lookup_passport_by_email(uuid, citext) from public, anon, authenticated;
grant execute on function public.lookup_passport_by_email(uuid, citext) to service_role;
