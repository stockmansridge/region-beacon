// Server-only Supabase client using the service-role key. Bypasses RLS.
// Never import from client code. The .server.ts suffix keeps this out of
// the browser bundle.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pickServerEnv } from "@/lib/server-env.server";

const CURRENT_PROJECT_URL = "https://kyjwifumacnrpgyextzz.supabase.co";
const CURRENT_PROJECT_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5andpZnVtYWNucnBneWV4dHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzA4NjAsImV4cCI6MjA5NTYwNjg2MH0.VpyqPPjkKchTsCCQCyCVvy370x_QNoz_eUS8_byN__A";

function pickEnv(...names: string[]): string | undefined {
  return pickServerEnv(...names);
}

export function getSupabaseAdmin(): SupabaseClient {
  // The project URL is public, so fall back to it rather than failing: only the
  // service-role key genuinely has to be supplied by the runtime.
  const url =
    pickEnv("GETSTAMPD_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL") ??
    CURRENT_PROJECT_URL;
  const serviceKey = pickEnv(
    "GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!serviceKey) {
    throw new Error(
      "Missing service-role key on the server. On Cloudflare Worker \"region-beacon\" → Settings → Variables and Secrets, add GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY), then redeploy the Worker.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Auth-aware client that runs as the signed-in user (RLS applies). Used to
// validate the caller's identity and agency membership inside server fns.
export function getSupabaseAsUser(accessToken: string): SupabaseClient {
  const url = pickEnv(
    "GETSTAMPD_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  ) ?? CURRENT_PROJECT_URL;
  const anonKey = pickEnv(
    "GETSTAMPD_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ) ?? CURRENT_PROJECT_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing GetStampd Supabase user config. Set GETSTAMPD_SUPABASE_URL and GETSTAMPD_SUPABASE_PUBLISHABLE_KEY in Lovable Cloud secrets.",
    );
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
