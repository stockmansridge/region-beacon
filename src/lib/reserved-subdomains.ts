/**
 * Subdomains that are reserved by the platform and must never resolve to an
 * agency tenant. Used by:
 *   - HostRouter classification
 *   - Future agency-slug signup validation
 *   - The (draft) `resolve_agency_by_subdomain` RPC, which mirrors this list.
 */
export const RESERVED_SUBDOMAINS = new Set<string>([
  "app",
  "admin",
  "api",
  "www",
  "events",
  "support",
  "billing",
  "login",
  "signup",
  "dashboard",
  "system",
  "assets",
  "static",
  "cdn",
  // Kept from earlier router config:
  "demo",
  "mail",
]);

const SUB_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidSubdomainLabel(sub: string): boolean {
  return typeof sub === "string" && SUB_RE.test(sub) && !sub.includes(".");
}

export function isReservedSubdomain(sub: string): boolean {
  return RESERVED_SUBDOMAINS.has(sub.toLowerCase());
}

export function isAgencyEligibleSubdomain(sub: string): boolean {
  return isValidSubdomainLabel(sub) && !isReservedSubdomain(sub);
}
