/**
 * Central registry of GetStampd root domains.
 *
 * - `getstampd.com` is the canonical long-term brand domain.
 * - `getstampd.com.au` is kept for transition / existing DNS bindings.
 *
 * NOTE: spell-check. The repo historically used `getstamped.com.au` (extra
 * "e"). That is a typo: the actual bound custom domain in Lovable is
 * `getstampd.com.au` (no "e"). New code should use these constants instead
 * of literal strings. Lingering `getstamped.com.au` references are tracked
 * in the audit report and will be cleaned up incrementally — changing them
 * blindly risks breaking `event_domains` rows that may have been written
 * with the typo.
 */

export const ROOT_DOMAINS = ["getstampd.com", "getstampd.com.au"] as const;
export type RootDomain = (typeof ROOT_DOMAINS)[number];

export const PRIMARY_ROOT_DOMAIN: RootDomain = "getstampd.com";

/** Returns the matching root domain (without subdomain) for a hostname, or null. */
export function matchRootDomain(hostname: string): RootDomain | null {
  const host = hostname.toLowerCase().split(":")[0];
  for (const root of ROOT_DOMAINS) {
    if (host === root || host.endsWith(`.${root}`)) return root;
  }
  return null;
}

/** Extracts the subdomain label for a known root domain. Returns "" for apex. */
export function extractSubdomain(hostname: string): { root: RootDomain; sub: string } | null {
  const host = hostname.toLowerCase().split(":")[0];
  const root = matchRootDomain(host);
  if (!root) return null;
  if (host === root) return { root, sub: "" };
  return { root, sub: host.slice(0, -1 * (`.${root}`.length)) };
}
