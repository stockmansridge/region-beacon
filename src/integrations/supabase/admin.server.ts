// Server-only Supabase client using the service-role key. Bypasses RLS.
// Never import from client code. The .server.ts suffix keeps this out of
// the browser bundle.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import process from "node:process";

function pickEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = pickEnv(
    "GETSTAMPD_SUPABASE_URL",
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
  );
  const serviceKey = pickEnv(
    "GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  if (!url || !serviceKey) {
    throw new Error(
      "Missing GetStampd Supabase server config. Set GETSTAMPD_SUPABASE_URL and GETSTAMPD_SUPABASE_SERVICE_ROLE_KEY in Lovable Cloud secrets.",
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
  );
  const anonKey = pickEnv(
    "GETSTAMPD_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
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
