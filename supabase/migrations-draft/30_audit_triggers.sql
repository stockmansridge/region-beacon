-- 30_audit_triggers.sql
-- Draft only. Do not execute.
-- A single SECURITY DEFINER trigger function writes to audit_logs.
-- audit_logs itself is NEVER attached (no recursive audit).

create or replace function public.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_agency uuid;
  v_event uuid;
  v_target uuid;
  v_action text;
begin
  -- Pick agency_id/event_id/id from NEW or OLD if those columns exist.
  v_action := lower(tg_op);  -- 'insert' | 'update' | 'delete'

  if tg_op = 'DELETE' then
    begin v_agency := (to_jsonb(old)->>'agency_id')::uuid; exception when others then v_agency := null; end;
    begin v_event  := (to_jsonb(old)->>'event_id')::uuid;  exception when others then v_event  := null; end;
    begin v_target := (to_jsonb(old)->>'id')::uuid;        exception when others then v_target := null; end;
  else
    begin v_agency := (to_jsonb(new)->>'agency_id')::uuid; exception when others then v_agency := null; end;
    begin v_event  := (to_jsonb(new)->>'event_id')::uuid;  exception when others then v_event  := null; end;
    begin v_target := (to_jsonb(new)->>'id')::uuid;        exception when others then v_target := null; end;
  end if;

  insert into public.audit_logs (
    agency_id, event_id, actor_user_id, action,
    target_table, target_id, metadata
  ) values (
    v_agency, v_event, v_actor,
    tg_table_name || '.' || v_action,
    tg_table_schema || '.' || tg_table_name,
    v_target,
    jsonb_build_object('op', tg_op)
  );

  return coalesce(new, old);
end;
$$;

-- Attach to every audited table. NOT attached to audit_logs (recursive).
-- NOT attached to checkins/visitor_consents/export_logs/event_terms_versions —
-- those tables ARE the audit themselves; their writes are already traceable.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agencies','user_roles','agency_members',
    'events','event_domains','event_branding',
    'event_checkin_settings','leaderboard_settings',
    'venues','venue_qr_codes','venue_offers',
    'visitors','passports',
    'reward_rules','prize_rules'
  ]
  loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format(
      'create trigger audit_row after insert or update or delete on public.%I
       for each row execute function public.tg_audit_row()',
      t
    );
  end loop;
end $$;
