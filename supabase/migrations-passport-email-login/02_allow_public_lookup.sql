-- Lets the Join page "Log in" box call the email lookup directly, the same
-- way the sign-up form calls register_participant. Run once; safe to re-run.
-- (Owner-approved: email alone opens the passport. Rate limit stays in the function.)
grant execute on function public.lookup_passport_by_email(uuid, citext) to anon, authenticated;
notify pgrst, 'reload schema';
