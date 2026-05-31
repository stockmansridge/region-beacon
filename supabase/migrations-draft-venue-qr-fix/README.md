# Venue QR generation fix

Fixes: `function gen_random_bytes(integer) does not exist` when admins
click **Generate QR** on a venue.

## What changed

- `01_fix_rotate_venue_qr_gen_random_bytes.sql`
  - Ensures `pgcrypto` is installed in the `extensions` schema.
  - Adds `extensions` to the `rotate_venue_qr(uuid)` function's
    `search_path` so the existing body can resolve
    `gen_random_bytes(N)` to `extensions.gen_random_bytes(integer)`.

## Scope

- No tables created or altered.
- No data read or written.
- No RLS or grant changes.
- Function body is **not** redefined — only the search_path setting.

## Apply

Run `01_fix_rotate_venue_qr_gen_random_bytes.sql` in the Supabase SQL
editor. Then retry **Generate QR** on a venue.
