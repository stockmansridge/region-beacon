-- 02_verify.sql
-- Draft only. Manual verification queries; do not execute.

-- 1. Columns exist with correct defaults
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'event_branding'
  and column_name in ('venue_label_singular','venue_label_plural');

-- 2. Check constraints present
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.event_branding'::regclass
  and conname in (
    'event_branding_venue_label_singular_chk',
    'event_branding_venue_label_plural_chk'
  );

-- 3. Sample expected-failure cases (run only in a scratch env)
-- insert ... venue_label_singular = ''               -> should fail
-- insert ... venue_label_singular = '   Winery'      -> should fail (not trimmed)
-- insert ... venue_label_plural   = repeat('x', 41)  -> should fail (>40)
