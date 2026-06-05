-- Admin RPC to save FAQ entries for an event in a single transaction.
-- Uses SECURITY DEFINER to bypass RLS once the caller has been verified
-- by the same helper used by event setup RLS: platform admin or agency admin.

create or replace function public.save_event_faq_entries(
  p_event_id uuid,
  p_entries jsonb
)
returns setof public.event_faq_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_user_id uuid := auth.uid();
  v_entry jsonb;
  v_question text;
  v_answer text;
  v_index integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select e.agency_id
    into v_agency_id
    from public.events e
   where e.id = p_event_id;

  if v_agency_id is null then
    raise exception 'Event not found';
  end if;

  if not (
    public.is_platform_admin(v_user_id)
    or public.is_agency_admin(v_user_id, v_agency_id)
  ) then
    raise exception 'You do not have permission to manage FAQ entries for this event';
  end if;

  delete from public.event_faq_entries
   where event_id = p_event_id;

  for v_entry in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
  loop
    v_question := nullif(trim(coalesce(v_entry->>'question', '')), '');
    v_answer := nullif(trim(coalesce(v_entry->>'answer', '')), '');

    if v_question is null and v_answer is null then
      continue;
    end if;

    if v_question is null or v_answer is null then
      raise exception 'Each FAQ entry needs both a question and an answer';
    end if;

    if char_length(v_question) > 500 then
      raise exception 'Questions must be 500 characters or fewer';
    end if;

    if char_length(v_answer) > 5000 then
      raise exception 'Answers must be 5000 characters or fewer';
    end if;

    insert into public.event_faq_entries (
      event_id,
      agency_id,
      question,
      answer,
      order_index,
      created_by
    )
    values (
      p_event_id,
      v_agency_id,
      v_question,
      v_answer,
      v_index,
      v_user_id
    );

    v_index := v_index + 1;
  end loop;

  return query
    select *
      from public.event_faq_entries
     where event_id = p_event_id
     order by order_index asc, created_at asc;
end;
$$;

grant execute on function public.save_event_faq_entries(uuid, jsonb) to authenticated;
