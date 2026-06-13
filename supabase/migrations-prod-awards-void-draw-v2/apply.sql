-- Production hotfix: ensure public.void_event_award_draw(p_draw_id uuid, p_reason text)
-- exists with the exact parameter names PostgREST expects, then reload schema cache.
--
-- Symptom this fixes:
--   PGRST202 — Could not find the function public.void_event_award_draw(p_draw_id, p_reason)
--   in the schema cache.
--
-- Safe to re-run.

begin;

-- 1. Schema columns (idempotent) ---------------------------------------------
alter table public.event_award_draws
  add column if not exists voided_at   timestamptz null,
  add column if not exists voided_by   uuid        null references auth.users(id),
  add column if not exists void_reason text        null;

create index if not exists idx_event_award_draws_active
  on public.event_award_draws (award_id, drawn_at desc)
  where voided_at is null;

-- 2. Drop ANY existing overload so the signature is unambiguous --------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'void_event_award_draw'
  loop
    execute format('drop function %s', r.sig);
  end loop;
end$$;

-- 3. Recreate with the canonical signature -----------------------------------
create function public.void_event_award_draw(
  p_draw_id uuid,
  p_reason  text default null
)
returns table (
  id          uuid,
  award_id    uuid,
  event_id    uuid,
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  select ead.id, ead.event_id, ead.voided_at
    into d
  from public.event_award_draws ead
  where ead.id = p_draw_id;

  if d.id is null then
    raise exception 'draw_not_found';
  end if;

  if not public.can_admin_event(d.event_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if d.voided_at is not null then
    raise exception 'draw_already_voided';
  end if;

  return query
  update public.event_award_draws ead
     set voided_at   = now(),
         voided_by   = auth.uid(),
         void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where ead.id = p_draw_id
   returning ead.id, ead.award_id, ead.event_id,
             ead.voided_at, ead.voided_by, ead.void_reason;
end;
$$;

revoke all on function public.void_event_award_draw(uuid, text) from public;
grant execute on function public.void_event_award_draw(uuid, text) to authenticated;

commit;

-- 4. Force PostgREST to reload its schema cache ------------------------------
notify pgrst, 'reload schema';

-- 5. Verification (inspect output after running) -----------------------------
select
  n.nspname  as schema_name,
  p.proname  as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'void_event_award_draw';
-- Expected: exactly one row,
--   public | void_event_award_draw | p_draw_id uuid, p_reason text DEFAULT NULL::text
