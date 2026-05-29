-- 01_extensions.sql
-- Draft only. Do not execute.
-- Required PG extensions.

create extension if not exists "pgcrypto";   -- gen_random_uuid, digest
create extension if not exists "citext";     -- case-insensitive text
