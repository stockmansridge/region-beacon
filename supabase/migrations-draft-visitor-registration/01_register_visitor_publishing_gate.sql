-- DRAFT — do not execute.
--
-- Patches public.register_visitor to enforce server-side publishing and terms
-- gates. The /live/:subdomain route gate is convenience; this RPC is the
-- authoritative boundary because anon clients can call it directly.
--
-- Builds on supabase/migrations-draft/33_rpcs_visitor.sql (already applied
-- on staging). Substantive changes vs that version:
--
--   1. Event existence check uses deleted_at IS NULL.
--   2. Gate on public.event_is_publishable(_event_id) = true.
--      Failure → raise 'event_not_available' (P0001). Same error code as the
--      existing "not published" path, so the client never learns whether the
--      block was lifecycle, domain, or billing.
--   3. Require events.current_terms_version_id IS NOT NULL.
--      Failure → raise 'terms_not_configured' (P0001).
--   4. Require _accepted_terms_version_id = events.current_terms_version_id.
--      Failure → raise 'terms_version_invalid' (P0001). This is stricter
--      than the previous "belongs to this event" check; only the CURRENT
--      version is accepted at registration time.
--
-- UNCHANGED:
--   - Function name, argument list, argument types, default values.
--   - Return type (passport_id uuid, access_token text).
--   - language plpgsql / security definer / search_path = public.
--   - Visitor upsert on (event_id, email).
--   - Passport upsert on (event_id, visitor_id) with access_token_hash only.
--     Raw token returned once; never stored.
--   - Terms + privacy consent rows always written; marketing consent row
--     written only when _marketing_opt_in is true.
--   - EXECUTE grants to anon, authenticated (CREATE OR REPLACE preserves).
--
-- Does NOT modify: get_passport_by_token, update_marketing_consent,
-- redeem_checkin, passport_token_hash, event_is_publishable.

begin;

create or replace function public.register_visitor(
  _event_id uuid,
  _email citext,
  _full_name text,
  _first_name text,
  _last_name text,
  _mobile text,
  _postcode text,
  _marketing_opt_in boolean,
  _accepted_terms_version_id uuid,
  _locale text default null,
  _client_ip inet default null,
  _user_agent text default null
)
returns table (
  passport_id uuid,
  access_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency uuid;
  v_current_terms uuid;
  v_visitor uuid;
  v_passport uuid;
  v_raw text;
  v_hash bytea;
begin
  -- 1. Event must exist and not be soft-deleted. Look up agency + current
  --    terms in the same row read so we can apply the gates below.
  select e.agency_id, e.current_terms_version_id
    into v_agency, v_current_terms
  from public.events e
  where e.id = _event_id
    and e.deleted_at is null;

  if v_agency is null then
    -- Event missing / soft-deleted. Use the same opaque error as the
    -- publishing-gate failure so callers cannot probe for existence.
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;

  -- 2. Publishing gate: event lifecycle + active primary domain + paid/comp
  --    activation. Centralised in event_is_publishable so this RPC stays
  --    in sync with resolve_event_by_host.
  if not public.event_is_publishable(_event_id) then
    raise exception 'event_not_available' using errcode = 'P0001';
  end if;

  -- 3. Event must have a current terms/privacy version configured.
  if v_current_terms is null then
    raise exception 'terms_not_configured' using errcode = 'P0001';
  end if;

  -- 4. Client must accept the CURRENT terms version. Older/other versions
  --    are rejected to keep the consent ledger pinned to live copy.
  if _accepted_terms_version_id is null
     or _accepted_terms_version_id <> v_current_terms then
    raise exception 'terms_version_invalid' using errcode = 'P0001';
  end if;

  -- 5. Visitor upsert on (event_id, email). Unchanged from prior version.
  insert into public.visitors (
    agency_id, event_id, email, full_name, first_name, last_name,
    mobile, postcode, marketing_opt_in, locale
  )
  values (
    v_agency, _event_id, _email, _full_name, _first_name, _last_name,
    _mobile, _postcode, coalesce(_marketing_opt_in, false), _locale
  )
  on conflict (event_id, email) do update
    set full_name = excluded.full_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        mobile = coalesce(excluded.mobile, public.visitors.mobile),
        postcode = coalesce(excluded.postcode, public.visitors.postcode),
        marketing_opt_in = excluded.marketing_opt_in
  returning id into v_visitor;

  -- 6. Generate opaque token. URL-safe base64. Raw value returned ONCE in
  --    the result set and never persisted. Only the SHA-256 hash lands in
  --    the passports table.
  v_raw  := encode(gen_random_bytes(32), 'base64');
  v_raw  := replace(replace(replace(v_raw, '+','-'), '/','_'), '=','');
  v_hash := digest(v_raw, 'sha256');

  insert into public.passports (
    agency_id, event_id, visitor_id, access_token_hash
  ) values (
    v_agency, _event_id, v_visitor, v_hash
  )
  on conflict (event_id, visitor_id) do update
    set access_token_hash = excluded.access_token_hash,
        updated_at = now()
  returning id into v_passport;

  -- 7. Consent ledger. Terms + privacy are required and pinned to the
  --    accepted (== current) terms version. Marketing is a separate,
  --    optional row with no terms_version_id link.
  insert into public.visitor_consents (
    agency_id, event_id, visitor_id, passport_id,
    consent_type, decision, terms_version_id,
    client_ip, user_agent
  ) values
    (v_agency, _event_id, v_visitor, v_passport, 'terms',   'granted', _accepted_terms_version_id, _client_ip, _user_agent),
    (v_agency, _event_id, v_visitor, v_passport, 'privacy', 'granted', _accepted_terms_version_id, _client_ip, _user_agent);

  if coalesce(_marketing_opt_in, false) then
    insert into public.visitor_consents (
      agency_id, event_id, visitor_id, passport_id,
      consent_type, decision, terms_version_id,
      client_ip, user_agent
    ) values (
      v_agency, _event_id, v_visitor, v_passport,
      'marketing', 'granted', null, _client_ip, _user_agent
    );
  end if;

  return query select v_passport, v_raw;
end;
$$;

-- Re-state EXECUTE grants. CREATE OR REPLACE preserves them, but restating
-- protects against accidental DROP/CREATE later.
grant execute on function public.register_visitor(
  uuid, citext, text, text, text, text, text, boolean, uuid, text, inet, text
) to anon, authenticated;

commit;
