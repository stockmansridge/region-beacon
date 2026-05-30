/**
 * Central registry of GetStampd root domains.
 *
 * - `getstampd.com` is the canonical long-term brand domain.
 * - `getstampd.com.au` is the currently-bound production tenant suffix
 *   (Cloudflare zone, wildcard tenant routing, Lovable custom domain).
 *
 * Phase C1 cleanup: the legacy `getstamped.com.au` typo has been removed
 * from product/UI code. The ONLY remaining reference is the deliberate
 * backward-compat fallback in `src/lib/tenant-resolution.ts`, which keeps
 * historical `event_domains` rows written with the typo resolvable. Do not
 * reintroduce the literal string anywhere else — use the helpers below.
 */

export const ROOT_DOMAINS = ["getstampd.com", "getstampd.com.au"] as const;
export type RootDomain = (typeof ROOT_DOMAINS)[number];

export const PRIMARY_ROOT_DOMAIN: RootDomain = "getstampd.com";

/**
 * Public-facing root domain for tenant subdomains
 * (`<sub>.getstampd.com.au`). This is what user-facing links, posters,
 * announcement banners, and admin-generated URLs render today.
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

/**
 * RPC-compatibility host for the legacy `public.resolve_event_by_host` (and
 * its siblings: `get_public_event_by_domain`, `get_public_venues_by_domain`,
 * `get_public_event_venues_by_domain`, `get_public_leaderboard_by_domain`,
 * `get_public_event_announcements_by_domain`).
 *
 * The currently-deployed SQL function hardcodes the legacy spelling
 * `.getstamped.com.au` as its suffix check. Until a DB migration replaces
 * that suffix with `.getstampd.com.au`, any `*.getstampd.com.au` host
 * passed to those RPCs falls into the custom-domain branch and returns
 * `not_found`, which surfaces in the UI as "Event not live yet".
 *
 * Until that migration lands, public `/live/*` routes MUST pass this
 * legacy host into `_hostname` so the RPC resolves correctly. This is the
 * ONLY place in product code allowed to mint a `getstamped.com.au` host —
 * customer-facing URLs, QR codes, posters, share links, and admin
 * preview links all continue to use `PUBLIC_TENANT_ROOT_DOMAIN`
 * (`getstampd.com.au`).
 */
const LEGACY_RPC_ROOT_DOMAIN = "getstamped.com.au" as const;

export function rpcEventHost(subdomain: string): string {
  return `${subdomain}.${LEGACY_RPC_ROOT_DOMAIN}`;
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

