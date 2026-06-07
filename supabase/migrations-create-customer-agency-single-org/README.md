# Enforce single self-serve organisation per user

Hardens `public.create_customer_agency` to refuse creating a second
organisation when the caller already has an accepted `agency_members`
row. Returns the error `user_already_has_organisation` (sqlstate 23505).

This is the database-level safeguard for the /signup flow rule: a normal
GetStampd user/email should only have one organisation through self-serve
signup. Frontend maps this error to:

  "You already have an organisation. Go to your admin portal instead."

Idempotent. Apply against the Supabase project.
