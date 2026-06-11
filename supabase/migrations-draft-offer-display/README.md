# migrations-draft-offer-display

Draft migration. Adds three nullable columns to `public.venues` and
extends the two public venue RPCs to project them so admins can
customise the icon and colours of the public offer badge per venue.

Apply order:

1. `01_venue_offer_display_columns.sql`
2. `02_extend_public_rpcs_offer_display.sql`

Both files are additive and safe to roll back (see footer of file 1).
Existing offers continue to render with the event theme defaults until
admins configure custom display values.
