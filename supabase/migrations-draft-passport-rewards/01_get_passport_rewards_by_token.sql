-- 01_get_passport_rewards_by_token.sql
-- DRAFT ONLY. Do not execute against production.
--
-- Adds public.get_passport_rewards_by_token(_raw_token text).
--
-- Returns ONLY the owning passport's aggregated rewards state so the
-- /passport/{token} screen can display tier + points consistent with
-- public.get_public_leaderboard_by_domain.
--
-- Privacy model:
--   * Resolves the passport by sha256(_raw_token) via access_token_hash.
--     The raw token is never stored or returned.
--   * Returns ONLY the matched passport's aggregate row.
--   * Never returns: other visitors, other passport ids, QR tokens,
--     access_token_hash, admin data, billing data, PII (email, phone, etc).
--   * SECURITY DEFINER so the function can read passports/checkins/
--     reward_rules without granting anon broad table access.
--
-- Depends on:
--   * public.passports (access_token_hash, event_id)
--   * public.checkins (passport_id, venue_id, entry_value)
--   * public.venues (event_id, status, deleted_at)
--   * public.reward_rules (event_id, is_active, rule_type, threshold, reward_label)
--   * public.event_branding (venue_label_singular, venue_label_plural) — optional
--   * supabase/migrations-draft-rewards-prize-draw/01_qr_and_checkin_entry_value.sql

begin;

drop function if exists public.get_passport_rewards_by_token(text);

create function public.get_passport_rewards_by_token(_raw_token text)
returns table (
  passport_id           uuid,
  event_id              uuid,
  stamps                int,
  points                int,
  total_venues          int,
  tier                  text,
  is_completed          boolean,
  venue_label_singular  text,
  venue_label_plural    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_passport_id uuid;
  v_event_id    uuid;
  v_stamps      int;
  v_points      int;
  v_total       int;
  v_tier        text;
  v_completed   boolean;
  v_has_custom_tiers boolean;
  v_label_sing  text;
  v_label_plur  text;
begin
  if _raw_token is null or length(btrim(_raw_token)) = 0 then
    return;
  end if;

  -- 1) Resolve passport by hashed token. Return zero rows on no match.
  select p.id, p.event_id
    into v_passport_id, v_event_id
  from public.passports p
  where p.access_token_hash = digest(_raw_token, 'sha256')
  limit 1;

  if v_passport_id is null then
    return;
  end if;

  -- 2) Aggregate this passport's stamps and points.
  select
    coalesce(count(distinct c.venue_id), 0)::int,
    coalesce(sum(c.entry_value), 0)::int
    into v_stamps, v_points
  from public.checkins c
  where c.passport_id = v_passport_id;

  -- 3) Total active venues for the event (used for tier ladder + completion).
  select count(*)::int into v_total
  from public.venues v
  where v.event_id = v_event_id
    and v.status = 'active'
    and v.deleted_at is null;

  -- 4) Tier resolution mirrors get_public_leaderboard_by_domain so the
  --    passport view and the public leaderboard always agree.
  select exists (
    select 1 from public.reward_rules
    where event_id = v_event_id
      and is_active = true
      and rule_type = 'min_checkins'
      and threshold is not null
  ) into v_has_custom_tiers;

  if v_has_custom_tiers then
    select rr.reward_label
      into v_tier
    from public.reward_rules rr
    where rr.event_id = v_event_id
      and rr.is_active = true
      and rr.rule_type = 'min_checkins'
      and rr.threshold is not null
      and v_stamps >= rr.threshold
    order by rr.threshold desc
    limit 1;
  else
    v_tier := case
      when v_total > 0 and v_stamps >= v_total                       then 'Complete'
      when v_stamps >= least(8, greatest(v_total, 1))                then 'Gold'
      when v_stamps >= 5                                             then 'Silver'
      when v_stamps >= 3                                             then 'Bronze'
      else null
    end;
  end if;

  v_completed := (v_total > 0 and v_stamps >= v_total);

  -- 5) Venue labels (fallbacks identical to other public RPCs).
  select
    coalesce(nullif(btrim(b.venue_label_singular), ''), 'Venue'),
    coalesce(nullif(btrim(b.venue_label_plural),   ''), 'Venues')
    into v_label_sing, v_label_plur
  from public.event_branding b
  where b.event_id = v_event_id
  limit 1;

  if v_label_sing is null then v_label_sing := 'Venue'; end if;
  if v_label_plur is null then v_label_plur := 'Venues'; end if;

  return query select
    v_passport_id,
    v_event_id,
    v_stamps,
    v_points,
    v_total,
    v_tier,
    v_completed,
    v_label_sing,
    v_label_plur;
end;
$$;

grant execute on function public.get_passport_rewards_by_token(text)
  to anon, authenticated;

commit;

-- Rollback:
--   drop function if exists public.get_passport_rewards_by_token(text);
