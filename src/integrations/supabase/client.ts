// Supabase browser client.
//
// Configuration is read from Vite env vars at BUILD time:
//   - VITE_SUPABASE_URL
//   - VITE_SUPABASE_PUBLISHABLE_KEY  (publishable / anon key — safe in browser)
//
// Environment separation:
//   - Lovable preview/dev: env vars default to the STAGING project values
//     below if the build env doesn't set them. This keeps the in-IDE preview
//     working without extra setup.
//   - Cloudflare production build: MUST set both VITE_SUPABASE_URL and
//     VITE_SUPABASE_PUBLISHABLE_KEY to the production project values in the
//     CI/build environment. The build will fail fast (see assertions below)
//     if production-ish hosts are detected without a real config.
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

// STAGING fallback values — kept here ONLY so Lovable preview/dev builds
// continue to work without env wiring. Production builds MUST override via
// env vars; the runtime guard below enforces that on non-preview hosts.
const STAGING_FALLBACK_URL = "https://kyjwifumacnrpgyextzz.supabase.co";
const STAGING_FALLBACK_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5andpZnVtYWNucnBneWV4dHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMzA4NjAsImV4cCI6MjA5NTYwNjg2MH0.VpyqPPjkKchTsCCQCyCVvy370x_QNoz_eUS8_byN__A";

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const deployTarget = import.meta.env.VITE_DEPLOY_TARGET as string | undefined;

// Build-time guard: any Cloudflare build (test or production) MUST set both
// Supabase env vars. This prevents a workers.dev test deploy from silently
// shipping the staging fallback to a non-getstampd hostname where the runtime
// host-check below cannot catch it.
if (deployTarget === "cloudflare" && (!envUrl || !envKey)) {
  throw new Error(
    "[supabase/client] VITE_DEPLOY_TARGET=cloudflare requires both " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to be set at build time. " +
      "Refusing to bake the staging fallback into a Cloudflare deployment.",
  );
}

export const SUPABASE_URL = envUrl ?? STAGING_FALLBACK_URL;
export const SUPABASE_PUBLISHABLE_KEY = envKey ?? STAGING_FALLBACK_PUBLISHABLE_KEY;

// Fail loudly if neither env var nor fallback resolved to a usable value.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "[supabase/client] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Set both in the build environment.",
  );
}


// Production safety net: if the page is running on a getstampd.* host but the
// client is still wired to the staging fallback, refuse to boot. This catches
// the common mistake of deploying the production Worker without setting the
// VITE_* build env. Lovable preview hosts and localhost are always allowed.
if (typeof window !== "undefined" && !envUrl) {
  const host = window.location.hostname;
  const isProdHost =
    host.endsWith("getstampd.com") || host.endsWith("getstampd.com.au");
  const isPreviewHost =
    host === "localhost" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com");
  if (isProdHost && !isPreviewHost) {
    throw new Error(
      "[supabase/client] Production host detected but VITE_SUPABASE_URL was " +
        "not set at build time. Refusing to use staging fallback in production.",
    );
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
