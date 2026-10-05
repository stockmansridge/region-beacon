-- REVIEW ONLY. Do not apply from this repository task.
-- Adds one sparse, versioned document to the existing event_branding row.
-- NULL means no item overrides and preserves the existing theme byte-for-byte.

begin;

alter table public.event_branding
  add column if not exists style_overrides jsonb;

alter table public.event_branding
  drop constraint if exists event_branding_style_overrides_shape;

alter table public.event_branding
  add constraint event_branding_style_overrides_shape check (
    style_overrides is null
    or (
      jsonb_typeof(style_overrides) = 'object'
      and style_overrides->>'version' = '1'
      and jsonb_typeof(style_overrides->'items') = 'object'
      and (style_overrides->'records' is null or jsonb_typeof(style_overrides->'records') = 'object')
      and pg_column_size(style_overrides) <= 131072
    )
  );

comment on column public.event_branding.style_overrides is
  'Sparse allowlisted public-passport item style overrides. Version 1. NULL preserves existing theme rendering.';

-- Existing table grants and RLS policies continue to govern this column.
-- Public reads remain through SECURITY DEFINER event RPCs; do not grant anon
-- direct table access. App code validates element IDs, properties and values.

commit;

-- Rollback (destructive only to the new override document):
-- alter table public.event_branding
--   drop constraint if exists event_branding_style_overrides_shape,
--   drop column if exists style_overrides;