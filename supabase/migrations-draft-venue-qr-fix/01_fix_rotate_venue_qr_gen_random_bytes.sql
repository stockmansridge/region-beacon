-- Fix: rotate_venue_qr fails with
--   "function gen_random_bytes(integer) does not exist"
--
-- Root cause: pgcrypto in Supabase lives in the `extensions` schema,
-- but the SECURITY DEFINER function's `search_path` was set to just
-- `public`, so the unqualified call `gen_random_bytes(N)` cannot be
-- resolved at runtime. We add `extensions` to the function's search
-- path so the call resolves to `extensions.gen_random_bytes(integer)`.
--
-- Safe to re-run: ALTER FUNCTION ... SET only updates the setting.
-- No data is read or written.

-- Make sure pgcrypto is installed (no-op if it already is).
create extension if not exists pgcrypto with schema extensions;

-- Patch the existing function's search_path. We intentionally do NOT
-- redefine the function body here — we only adjust the schema
-- resolution so the existing implementation can find gen_random_bytes.
alter function public.rotate_venue_qr(uuid)
  set search_path = public, extensions;
