// Supabase browser client — STAGING environment.
//
// SECURITY NOTES — READ BEFORE EDITING:
// - The two constants below are PUBLIC client values:
//     * SUPABASE_URL  — the project's public API URL.
//     * SUPABASE_PUBLISHABLE_KEY — the `anon` / publishable JWT. It is designed
//       by Supabase to be shipped to browsers and is gated by Row Level Security.
// - DO NOT replace either value with a `service_role` key, an `sb_secret_*`
//   key, a database password, or any other server-only secret. Service role
//   keys bypass RLS and MUST NEVER appear in frontend code or in this repo.
// - DO NOT swap these for the production project's URL or key. This file is
//   wired to STAGING (region-beacon-staging) only.
// - Server-only Supabase access (admin operations, service role) must live in
//   a separate server-only module and read its credentials from server
//   environment variables, never from this file.

import { createClient } from "@supabase/supabase-js";

// Public — safe to commit. STAGING project: region-beacon-staging.
export const SUPABASE_URL = "https://kyjwifumacnrpgyextzz.supabase.co";

// Public — safe to commit. `anon` / publishable key for the STAGING project.
// This is NOT a secret. Do not replace with a service role or sb_secret key.
export const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5andpZnVtYWNucnBneWV4dHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzA4NjAsImV4cCI6MjA5NTYwNjg2MH0.VpyqPPjkKchTsCCQCyCVvy370x_QNoz_eUS8_byN__A";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
