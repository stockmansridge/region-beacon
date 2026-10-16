-- Returning-visitor "email me my passport link" login.
-- Run once in the SQL editor. Safe to re-run.
-- Codes are stored only as SHA-256 hashes, single use, 30 minute expiry.
-- Both functions are service-role only (called from the server).

create table if not exists public.passport_login_codes (
  id uuid primary key default gen_random_uuid(),
  passport_id uuid not null references public.passports(id) on delete cascade,
  event_id uuid not null,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists passport_login_codes_passport_idx
  on public.passport_login_codes (passport_id, created_at desc);
alter table public.passport_login_codes enable row level security;
revoke all on public.passport_login_codes from anon, authenticated;

create or replace function public.issue_passport_login_code(_event_id uuid, _email citext)
returns table (code text, first_name text, rate_limited boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_passport uuid;
  v_first text;
  v_raw text;
begin
  select p.id, v.first_name into v_passport, v_first
  from public.visitors v
  join public.passports p on p.visitor_id = v.id and p.event_id = v.event_id
  where v.event_id = _event_id and v.email = _email
  limit 1;
  if v_passport is null then
    return; -- zero rows: not registered
  end if;
  if (select count(*) from public.passport_login_codes c
      where c.passport_id = v_passport and c.created_at > now() - interval '1 hour') >= 3 then
    return query select null::text, v_first, true;
    return;
  end if;
  v_raw := encode(gen_random_bytes(24), 'hex');
  insert into public.passport_login_codes (passport_id, event_id, code_hash, expires_at)
  values (v_passport, _event_id, digest(v_raw, 'sha256'), now() + interval '30 minutes');
  return query select v_raw, v_first, false;
end;
$$;

-- Redeems a code: marks it used and issues a fresh passport link for this device.
-- Note: like re-registering, this replaces the passport key, so older links stop working.
create or replace function public.redeem_passport_login_code(_code text)
returns table (event_id uuid, access_token text)
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
  v_raw text;
begin
  update public.passport_login_codes c
     set used_at = now()
   where c.code_hash = digest(_code, 'sha256')
     and c.used_at is null
     and c.expires_at > now()
  returning c.passport_id, c.event_id into v_row;
  if v_row.passport_id is null then
    return;
  end if;
  v_raw := encode(gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');
  update public.passports
     set access_token_hash = digest(v_raw, 'sha256'), updated_at = now()
   where id = v_row.passport_id;
  return query select v_row.event_id, v_raw;
end;
$$;

revoke all on function public.issue_passport_login_code(uuid, citext) from public, anon, authenticated;
revoke all on function public.redeem_passport_login_code(text) from public, anon, authenticated;
grant execute on function public.issue_passport_login_code(uuid, citext) to service_role;
grant execute on function public.redeem_passport_login_code(text) to service_role;
