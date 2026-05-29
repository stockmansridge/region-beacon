-- 03_util.sql
-- Draft only. Do not execute.
-- Shared utility functions. Not SECURITY DEFINER — they touch only their
-- input row.

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Slug / subdomain validator used by CHECK constraints and the
-- validate_public_subdomain RPC.
create or replace function public.is_valid_public_slug(_value text)
returns boolean
language sql
immutable
as $$
  select _value ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'
$$;

-- Hardcoded reserved-name guard (defence in depth on top of seed rows).
create or replace function public.is_reserved_public_slug(_value text)
returns boolean
language sql
immutable
as $$
  select lower(_value) = any (array[
    'app','www','admin','api','support','status','help','mail',
    'docs','blog','dashboard','auth','login','signup','billing',
    'public','static','cdn','assets','dev','staging','test'
  ])
$$;
