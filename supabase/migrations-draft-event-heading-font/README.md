# Event heading font

Adds a separate `heading_font_family` column to `event_branding` so organisers
can pick a different font for the main event hero/title from the body font
used everywhere else.

Apply order:

1. `01_event_branding_heading_font_family_column.sql` — adds column.
2. `02_extend_get_public_event_by_domain_heading_font.sql` — exposes column
   on the public RPC so live pages can read it.

Both files are additive and backward-compatible: existing events render
unchanged until an organiser saves a heading font from the admin Branding UI.
The frontend already falls back to the body font when `heading_font_family`
is NULL.
