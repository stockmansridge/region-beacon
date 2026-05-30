// Supabase browser client.
//
// Configuration is read from Vite env vars at BUILD time:
//   - VITE_SUPABASE_URL
//   - VITE_SUPABASE_PUBLISHABLE_KEY  (publishable / anon key — safe in browser)
//
// Environment model (post-promotion):
//   The Supabase project hardcoded as a fallback below is the PRODUCTION /
//   LIVE database. Lovable preview/dev is currently connected to the same
//   project. A separate staging/dev Supabase project will be created later,
//   after Cloudflare production is stable.
//
//   - Lovable preview/dev: env vars unset → uses the fallback below
//     (= production project). This is intentional during the temporary
//     shared-project window.
//   - Cloudflare builds (test or prod): MUST set both VITE_SUPABASE_URL and
//     VITE_SUPABASE_PUBLISHABLE_KEY at build time. The build-time guard
//     below enforces that, so a Cloudflare deploy can never silently rely
//     on the hardcoded fallback.
//
// SECURITY:
//   - The publishable key is designed by Supabase to ship to browsers; it is
//     gated by RLS.
//   - NEVER replace these values with a service_role key, sb_secret_*, or any
//     server-only secret. Service-role access must live in a server-only
//     module (.server.ts) and read from process.env.
//
// Vite replaces import.meta.env.VITE_* at build time. process.env.* is NOT
// read at runtime in the browser bundle.

import { createClient } from "@supabase/supabase-js";

// Current connected Supabase project = PRODUCTION / LIVE database.
// Kept here so Lovable preview/dev continues to work without env wiring
// during the temporary shared-project window. Cloudflare builds MUST
// override these via env vars (enforced by the build-time guard below).
const CURRENT_PROJECT_URL = "https://kyjwifumacnrpgyextzz.supabase.co";
const CURRENT_PROJECT_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5andpZnVtYWNucnBneWV4dHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzA4NjAsImV4cCI6MjA5NTYwNjg2MH0.VpyqPPjkKchTsCCQCyCVvy370x_QNoz_eUS8_byN__A";

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const deployTarget = import.meta.env.VITE_DEPLOY_TARGET as string | undefined;

// Build-time guard: any Cloudflare build (test or production) MUST set both
// Supabase env vars explicitly. This keeps Cloudflare deployments
// configuration-driven and prevents accidental coupling to whatever project
// happens to be hardcoded in this file.
if (deployTarget === "cloudflare" && (!envUrl || !envKey)) {
  throw new Error(
    "[supabase/client] VITE_DEPLOY_TARGET=cloudflare requires both " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to be set at build time. " +
      "Refusing to bake the hardcoded fallback into a Cloudflare deployment.",
  );
}

export const SUPABASE_URL = envUrl ?? CURRENT_PROJECT_URL;
export const SUPABASE_PUBLISHABLE_KEY = envKey ?? CURRENT_PROJECT_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "[supabase/client] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Set both in the build environment.",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
