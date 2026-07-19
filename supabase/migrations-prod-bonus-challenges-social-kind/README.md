# Prod fix: bonus challenges RPC includes `kind` / social fields

The columns `kind`, `social_location`, `social_hashtags` already exist on
`public.event_bonus_codes` (from `migrations-prod-bonus-codes-columns-fix`),
but `public.get_public_event_bonus_challenges` was never redeployed to
return them. Without `kind`, the public venue page can't tell a Social
bonus from a Points bonus, so the "Take photo & share" button never
appears — it just shows "Not completed".

Run `apply.sql` in the Supabase SQL editor. Safe to re-run.
