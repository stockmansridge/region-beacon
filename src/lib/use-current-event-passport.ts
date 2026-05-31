import { useEffect, useState } from "react";
import { readTenantSubdomain } from "@/lib/tenant-host";

type StoredPassport = {
  passport_id?: string;
  access_token?: string;
  event_id?: string;
  subdomain?: string;
  created_at?: string;
};

function readForCurrentTenant(): StoredPassport | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const sub = readTenantSubdomain();
  if (!sub) return null;
  let best: StoredPassport | null = null;
  let bestAt = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("gs.passport.")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as StoredPassport;
        if (!parsed?.access_token) continue;
        if (parsed.subdomain && parsed.subdomain !== sub) continue;
        const at = parsed.created_at ? Date.parse(parsed.created_at) : 0;
        if (!best || at > bestAt) {
          best = parsed;
          bestAt = at;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    return null;
  }
  return best;
}

/**
 * Returns the My Passport URL for the active saved passport on the current
 * tenant host, or null if none is stored. Does not expose the token in any
 * visible label; consumers should only use the returned `passportHref` as
 * an `href` value.
 */
export function useCurrentEventPassport(): {
  passportHref: string | null;
  hasPassport: boolean;
} {
  const [href, setHref] = useState<string | null>(() => {
    const found = readForCurrentTenant();
    return found?.access_token ? `/passport/${found.access_token}` : null;
  });
  useEffect(() => {
    const found = readForCurrentTenant();
    setHref(found?.access_token ? `/passport/${found.access_token}` : null);
  }, []);
  return { passportHref: href, hasPassport: !!href };
}
