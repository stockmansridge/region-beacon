-- Supabase SQL editor compatible verifier (no psql \set directives).
-- Safe: wrapped in a transaction that ends with ROLLBACK, so no rows persist.
--
-- Fixture values (from the live support report):
--   event_id            = 41ebf116-6e70-428f-8dcb-bda56f73fb8a
--   terms_version_id    = 08af0c96-e476-4600-ab95-ad209e057fe1
--
-- Paste this entire script into the SQL editor and run it once.

begin;

-- 1. pgcrypto installed in extensions schema.
select e.extname, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- 2. Required functions resolve in extensions schema.
select n.nspname as function_schema,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('gen_random_bytes', 'digest')
  and n.nspname in ('extensions', 'public')
order by p.proname, n.nspname, arguments;

-- 3. With locked search_path = public, schema-qualified pgcrypto calls work.
set local search_path = public;

select encode(extensions.gen_random_bytes(8), 'hex') as qualified_random_bytes_hex,
       encode(extensions.digest('register_visitor_pgcrypto_verify', 'sha256'), 'hex') as qualified_digest_hex;

-- 4. register_visitor still has SECURITY DEFINER, search_path = public,
--    and uses schema-qualified pgcrypto calls.
select p.prosecdef as security_definer,
       p.proconfig as function_config,
       position('extensions.gen_random_bytes(32)' in pg_get_functiondef(p.oid)) > 0 as uses_qualified_gen_random_bytes,
       position('extensions.digest(v_raw, ''sha256'')' in pg_get_functiondef(p.oid)) > 0 as uses_qualified_digest
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'register_visitor'
  and pg_get_function_identity_arguments(p.oid)
      = 'uuid, citext, text, text, text, text, text, boolean, uuid, text, inet, text';

-- 5. Fixture event is currently valid for registration.
select e.id,
       e.status,
       e.current_terms_version_id,
       public.event_is_publishable(e.id) as is_publishable
from public.events e
where e.id = '41ebf116-6e70-428f-8dcb-bda56f73fb8a'::uuid;

-- 6. End-to-end: register_visitor succeeds (deterministic test identity).
create temporary table verify_register_visitor_result on commit drop as
select *
from public.register_visitor(
  _event_id := '41ebf116-6e70-428f-8dcb-bda56f73fb8a'::uuid,
  _email := 'qa+pgcrypto-41ebf1166e70428f8dcbbda56f73fb8a@getstampd.test'::citext,
  _full_name := 'QA pgcrypto rollback test',
  _first_name := 'QA',
  _last_name := 'Pgcrypto',
  _mobile := null,
  _postcode := null,
  _marketing_opt_in := false,
  _accepted_terms_version_id := '08af0c96-e476-4600-ab95-ad209e057fe1'::uuid,
  _locale := 'en-AU',
  _client_ip := null,
  _user_agent := 'register_visitor_pgcrypto_verify'
);

select passport_id,
       length(access_token) > 20 as returned_access_token_present
from verify_register_visitor_result;

-- 7. Visitor + passport + consents written as expected during the transaction.
select v.id as visitor_id,
       p.id as passport_id,
       octet_length(p.access_token_hash) as access_token_hash_bytes,
       array_agg(vc.consent_type order by vc.consent_type) as consent_types
from public.visitors v
join public.passports p on p.visitor_id = v.id
left join public.visitor_consents vc on vc.passport_id = p.id
where v.event_id = '41ebf116-6e70-428f-8dcb-bda56f73fb8a'::uuid
  and v.email = 'qa+pgcrypto-41ebf1166e70428f8dcbbda56f73fb8a@getstampd.test'::citext
group by v.id, p.id, p.access_token_hash;

-- 8. EXECUTE grants remain on anon + authenticated.
select has_function_privilege(
         'anon',
         'public.register_visitor(uuid,citext,text,text,text,text,text,boolean,uuid,text,inet,text)',
         'EXECUTE'
       ) as anon_can_execute,
       has_function_privilege(
         'authenticated',
         'public.register_visitor(uuid,citext,text,text,text,text,text,boolean,uuid,text,inet,text)',
         'EXECUTE'
       ) as authenticated_can_execute;

rollback;
