-- REVIEW ONLY. Do not apply from this repository task.
-- Adds an explicit renderer selection and one sparse V2 configuration to the
-- existing event-owned branding row. NULL/unknown versions resolve as V1.

begin;

alter table public.event_branding
  add column if not exists public_template_version text,
  add column if not exists v2_style_config jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_branding_public_template_version'
  ) then
    alter table public.event_branding
      add constraint event_branding_public_template_version check (
        public_template_version is null or public_template_version in ('v1', 'v2')
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'event_branding_v2_style_config_shape'
  ) then
    alter table public.event_branding
      add constraint event_branding_v2_style_config_shape check (
        v2_style_config is null
        or (
          jsonb_typeof(v2_style_config) = 'object'
          and v2_style_config->>'version' = '1'
          and jsonb_typeof(v2_style_config->'items') = 'object'
          and (v2_style_config->'records' is null or jsonb_typeof(v2_style_config->'records') = 'object')
          and (v2_style_config->'theme' is null or jsonb_typeof(v2_style_config->'theme') = 'object')
          and pg_column_size(v2_style_config) <= 131072
        )
      );
  end if;
end $$;

comment on column public.event_branding.public_template_version is
  'Per-event public renderer selection. NULL and unknown application values safely render V1.';
comment on column public.event_branding.v2_style_config is
  'Event-owned sparse V2 theme and allowlisted item overrides. Independent of V1 branding columns.';

-- Existing table grants and RLS policies continue to govern this column.
-- Public reads remain through SECURITY DEFINER event RPCs; do not grant anon
-- direct table access. App code validates element IDs, properties and values.

commit;

-- Rollback (destructive only to the new override document):
-- alter table public.event_branding
--   drop constraint if exists event_branding_v2_style_config_shape,
--   drop constraint if exists event_branding_public_template_version,
--   drop column if exists v2_style_config,
--   drop column if exists public_template_version;