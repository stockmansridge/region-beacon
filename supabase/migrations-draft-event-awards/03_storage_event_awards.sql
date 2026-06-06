-- 03_storage_event_awards.sql — DRAFT only.
--
-- Extend public.event_assets_path_parts so the existing `event-assets`
-- bucket and its storage.objects RLS policies accept the new
-- `awards/` kind in addition to `logo/` and `cover/`.
--
-- No new bucket. No new policies. The existing
-- event_assets_insert_write / _update_write / _delete_write policies
-- already use can_write_event_asset(name), which in turn relies on
-- this helper.

begin;

create or replace function public.event_assets_path_parts(_name text)
returns table (agency_id uuid, event_id uuid, kind text)
language sql
immutable
as $$
  with parts as (
    select string_to_array(coalesce(_name, ''), '/') as p
  ),
  shaped as (
    select
      p,
      array_length(p, 1)               as n,
      case when array_length(p, 1) >= 4 then (p)[1] else null end as s1,
      case when array_length(p, 1) >= 4 then (p)[2] else null end as s2,
      case when array_length(p, 1) >= 4 then (p)[3] else null end as s3,
      case when array_length(p, 1) >= 4 then (p)[4] else null end as s4
    from parts
  )
  select
    (s1)::uuid as agency_id,
    (s2)::uuid as event_id,
    s3         as kind
  from shaped
  where n >= 4
    and s3 in ('logo', 'cover', 'awards')
    and s4 is not null
    and length(s4) > 0
    and s1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and s2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

grant execute on function public.event_assets_path_parts(text) to authenticated, anon;

commit;
