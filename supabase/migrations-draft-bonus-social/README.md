# Bonus codes: Social kind + @location + hashtags

Adds `kind` (points|social), `social_location`, and `social_hashtags` columns
to `public.event_bonus_codes`, and extends
`public.get_public_event_bonus_challenges` to return those fields so the
public venue detail page can render the "Share on socials" CTA and tag
guidance.

Run `apply.sql` in the Supabase SQL editor.
