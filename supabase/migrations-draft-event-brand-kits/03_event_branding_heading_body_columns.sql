-- Phase D — Heading / Body / Muted split columns on event_branding.
--
-- Additive only. Existing rows untouched. When NULL, theme resolver
-- falls back to the existing shared columns (text_color, muted_text_color,
-- card_text_color, card_muted_text_color) so today's rendering is
-- byte-identical.

alter table public.event_branding
  add column if not exists page_heading_color  text,
  add column if not exists page_body_color     text,
  add column if not exists page_muted_color    text,
  add column if not exists card_heading_color  text,
  add column if not exists card_body_color     text,
  add column if not exists card_muted_color    text;

do $$
declare
  col   text;
  cols  text[] := array[
    'page_heading_color','page_body_color','page_muted_color',
    'card_heading_color','card_body_color','card_muted_color'
  ];
  cname text;
begin
  foreach col in array cols loop
    cname := 'event_branding_' || col || '_format';
    if not exists (
      select 1 from pg_constraint
      where conname = cname
        and conrelid = 'public.event_branding'::regclass
    ) then
      execute format(
        'alter table public.event_branding add constraint %I check (%I is null or %I ~* %L)',
        cname, col, col, '^#[0-9a-f]{6}$'
      );
    end if;
  end loop;
end$$;

comment on column public.event_branding.page_heading_color is
  'Phase D: explicit page heading colour. NULL = fall back to text_color.';
comment on column public.event_branding.card_heading_color is
  'Phase D: explicit card heading colour. NULL = fall back to card_text_color.';
