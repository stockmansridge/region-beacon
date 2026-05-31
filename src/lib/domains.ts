/**
 * Central registry of GetStampd root domains.
 *
 * - `getstampd.com` is the canonical long-term brand domain.
 * - `getstampd.com.au` is the currently-bound production tenant suffix
 *   (Cloudflare zone, wildcard tenant routing, Lovable custom domain).
 *
 * Use the helpers below — never hard-code root strings inline.
 */

export const ROOT_DOMAINS = ["getstampd.com", "getstampd.com.au"] as const;
export type RootDomain = (typeof ROOT_DOMAINS)[number];

export const PRIMARY_ROOT_DOMAIN: RootDomain = "getstampd.com";

/**
 * Public-facing root domain for tenant subdomains
 * (`<sub>.getstampd.com.au`). This is what user-facing links, posters,
 * announcement banners, admin-generated URLs, and public-RPC `_hostname`
 * arguments all use.
 */
export const PUBLIC_TENANT_ROOT_DOMAIN: RootDomain = "getstampd.com.au";

/** Builds the public host for a tenant subdomain, e.g. `demo.getstampd.com.au`. */
export function tenantHost(subdomain: string): string {
  return `${subdomain}.${PUBLIC_TENANT_ROOT_DOMAIN}`;
}

/** Builds a public https URL for a tenant subdomain + optional path. */
export function tenantUrl(subdomain: string, path: string = ""): string {
  const suffix = path.startsWith("/") || path === "" ? path : `/${path}`;
  return `https://${tenantHost(subdomain)}${suffix}`;
}

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
