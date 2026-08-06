-- Make clone_event carry the shared design/engagement configuration.
--
-- Cloning previously skipped event_branding and leaderboard_settings, so a
-- clone of a fully configured event lost its brand kit (falling back to the
-- legacy palette) and its leaderboard. Both are ordinary per-event config
-- rows, so they belong in the generic child-copy loop.
--
-- Implemented as a source patch so the rest of the current clone_event body
-- (public_slug generation, FK nulling, venue/bonus code handling) is preserved
-- exactly as deployed.

do $$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
    into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'clone_event'
  limit 1;

  if v_src is null then
    raise exception 'public.clone_event not found — apply the clone_event migrations first';
  end if;

  if position('''event_branding''' in v_src) > 0 then
    raise notice 'clone_event already copies event_branding — nothing to do';
    return;
  end if;

  v_new := replace(
    v_src,
    '''event_checkin_settings'',',
    '''event_checkin_settings'',' || chr(10) ||
    '      ''event_branding'',' || chr(10) ||
    '      ''leaderboard_settings'','
  );

  if v_new = v_src then
    raise exception 'could not locate the child-table list in clone_event; patch manually';
  end if;

  execute v_new;
end
$$;
