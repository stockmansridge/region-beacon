-- DRAFT — do not execute.
-- Replaces public.resolve_event_by_host so its hardcoded host constants point
-- at getstamped.com.au instead of easypassport.com.au.
--
-- This file is intentionally a CREATE OR REPLACE of the existing function with
-- IDENTICAL signature, return type, language, volatility, security mode and
-- search_path — only the two constants and the admin host literal change.
--
-- Source of truth for the surrounding logic: supabase/migrations-draft/32_rpcs_public.sql.
-- When this draft is approved, copy the full body from that file, change ONLY
-- the three literals below, then apply.

begin;

-- TODO before applying: paste the current body of public.resolve_event_by_host
-- here verbatim, then change:
--   v_root   := 'easypassport.com.au'    -> 'getstamped.com.au'
--   v_suffix := '.easypassport.com.au'   -> '.getstamped.com.au'
--   any literal 'app.easypassport.com.au' -> 'app.getstamped.com.au'
--
-- Skeleton (do NOT execute as-is — the real body must be pasted in):
--
-- create or replace function public.resolve_event_by_host(p_host text)
-- returns table (...same columns as today...)
-- language plpgsql
-- stable
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_root   constant citext := 'getstamped.com.au';
--   v_suffix constant text   := '.getstamped.com.au';
-- begin
--   ...existing logic, with 'app.easypassport.com.au' replaced by 'app.getstamped.com.au'...
-- end;
-- $$;

commit;
