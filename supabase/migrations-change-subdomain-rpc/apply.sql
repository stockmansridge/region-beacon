-- change_event_subdomain — server-side "Change address" for an event's
-- claimed GetStampd subdomain.
--
-- Why: the admin UI updated event_domains.public_subdomain directly, but RLS
-- on event_domains blocks that UPDATE for normal users. PostgREST returns no
-- error for a 0-row update, so the UI said "updated" and the address reverted.
--
-- Same permission rule as claim_event_subdomain: platform admin OR accepted
-- agency_owner / agency_admin of the event's agency. Only changes the label
-- on the event's existing event_subdomain row; status / primary / activation
-- are untouched. Validation delegates to validate_public_subdomain.
--
-- Idempotent. Safe to re-run. Rollback: drop function public.change_event_subdomain(uuid, text, uuid);

set search_path = public;

drop function if exists public.change_event_subdomain(uuid, text);

create or replace function public.change_event_subdomain(
  _event_id uuid,
  _subdomain text,
  _domain_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_row public.event_domains%rowtype;
  v_label citext;
  v_valid record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated', 'message', 'You must be signed in.');
  end if;

  select * into v_event from public.events e where e.id = _event_id and e.deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found', 'message', 'Event not found.');
  end if;

  if not (
    public.has_role(v_uid, 'platform_admin'::app_role)
    or exists (
      select 1 from public.agency_members am
       where am.user_id = v_uid
         and am.agency_id = v_event.agency_id
         and am.accepted_at is not null
         and am.role in ('agency_owner','agency_admin')
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized',
      'message', 'You do not have permission to change this event''s public address.');
  end if;

  select * into v_row from public.event_domains d
   where d.event_id = _event_id and d.agency_id = v_event.agency_id
     and d.domain_type = 'event_subdomain'
     and (_domain_id is null or d.id = _domain_id)
   order by d.is_primary desc, d.updated_at desc nulls last, d.created_at desc
   limit 1;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_subdomain', 'message', 'No public address claimed for this event yet.');
  end if;

  v_label := lower(btrim(coalesce(_subdomain, '')));
  if v_label = v_row.public_subdomain then
    return jsonb_build_object('ok', true, 'subdomain', v_row.public_subdomain, 'status', v_row.status, 'unchanged', true);
  end if;

  select * into v_valid from public.validate_public_subdomain(v_label::text);
  if not coalesce(v_valid.ok, false) then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_valid.reason, 'invalid'),
      'message', case coalesce(v_valid.reason, 'invalid')
        when 'length'   then 'Must be 3–63 characters.'
        when 'format'   then 'Invalid format.'
        when 'reserved' then 'That label is reserved by GetStampd.'
        when 'taken'    then 'That public address is already in use. Please choose another.'
        else 'That public address is not available.' end);
  end if;

  update public.event_domains
     set public_subdomain = v_label, updated_at = now()
   where id = v_row.id
   returning * into v_row;

  return jsonb_build_object('ok', true, 'subdomain', v_row.public_subdomain, 'status', v_row.status);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'taken',
    'message', 'That public address is already in use. Please choose another.');
end;
$$;

revoke all on function public.change_event_subdomain(uuid, text, uuid) from public, anon;
grant execute on function public.change_event_subdomain(uuid, text, uuid) to authenticated;

-- Make the new function visible to the app immediately.
notify pgrst, 'reload schema';
