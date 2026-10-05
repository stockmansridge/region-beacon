-- REVIEW ONLY. Atomic event-scoped V2 draft save and optional activation.
-- SECURITY INVOKER intentionally retains existing event_branding RLS.

begin;

create or replace function public.save_event_v2_branding(
  _agency_id uuid,
  _event_id uuid,
  _config jsonb,
  _activate boolean default false
)
returns table(public_template_version text, v2_style_config jsonb)
language plpgsql security invoker set search_path = public as $$
begin
  if _config is null or jsonb_typeof(_config) <> 'object'
    or _config->>'version' <> '1' or jsonb_typeof(_config->'items') <> 'object'
    or pg_column_size(_config) > 131072 then
    raise exception 'Invalid V2 style configuration';
  end if;

  update public.event_branding b
  set v2_style_config = _config,
      public_template_version = case when _activate then 'v2' else b.public_template_version end
  where b.agency_id = _agency_id and b.event_id = _event_id
  returning case when b.public_template_version = 'v2' then 'v2' else 'v1' end,
            b.v2_style_config
  into public_template_version, v2_style_config;

  if not found then raise exception 'Event branding row not found or not writable'; end if;
  return next;
end;
$$;

revoke all on function public.save_event_v2_branding(uuid, uuid, jsonb, boolean) from public;
grant execute on function public.save_event_v2_branding(uuid, uuid, jsonb, boolean) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Rollback:
-- drop function if exists public.save_event_v2_branding(uuid, uuid, jsonb, boolean);