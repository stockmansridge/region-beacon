# Draft: event_branding.nav_background_color

Adds a single nullable column `event_branding.nav_background_color` plus a
hex-format check constraint, and extends `get_public_event_by_domain` to
return it.

When NULL, the public mobile header / bottom nav / drawer continue to use
`primary_color`, so existing events look identical until an organiser
explicitly picks a nav background colour.

Apply order:
1. `01_event_branding_nav_background_color.sql`
2. `02_extend_get_public_event_by_domain_nav_background_color.sql`

Until applied, the admin Branding page will retry saves without the new
column and surface a friendly message; public pages keep working because
all consumers fall back to `--event-primary`.
