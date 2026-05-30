import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { matchRootDomain, extractSubdomain } from "@/lib/domains";
import { isAgencyEligibleSubdomain, isReservedSubdomain, RESERVED_SUBDOMAINS } from "@/lib/reserved-subdomains";

/**
 * Host-based routing for the published GetStampd domains.
 *
 * Recognised roots (see `src/lib/domains.ts`):
 *   - getstampd.com       (canonical)
 *   - getstampd.com.au    (transition)
 *
 * Classification:
 *   root                  → apex / www → coming-soon (the / route handles it)
 *   app                   → app.<root>  → "/" → /admin
 *   demo                  → demo.<root> → "/" → /demo
 *   reserved              → admin/api/www/events/support/billing/login/signup/
 *                            dashboard/system/assets/static/cdn/mail → no rewrite
 *   tenant                → {sub}.<root>, sub is valid + not reserved
 *   other                 → not a known root (e.g. lovable preview, localhost) → no rewrite
 *
 * On a tenant host the following path mappings apply (the destination route
 * is responsible for resolving the agency, falling back to a legacy
 * `event_domains` row, or rendering a branded not-found):
 *
 *   /                       → /t/{sub}
 *   /e/{slug}               → /t/{sub}/e/{slug}
 *   /e/{slug}/...           → /t/{sub}/e/{slug}/... (future child routes)
 *   /join                   → /live/{sub}/join         (legacy event-subdomain)
 *   /venues, /leaderboard   → /live/{sub}/...          (legacy event-subdomain)
 *   /terms, /privacy        → /live/{sub}/...          (legacy event-subdomain)
 *   /checkin/..., /admin,
 *   /api/..., /_...         → untouched
 *
 * SSR is not host-aware; the rewrite happens client-side after hydration,
 * before first meaningful paint of the wrong content.
 */

export { RESERVED_SUBDOMAINS };

export type HostKind =
  | { kind: "root" }
  | { kind: "app" }
  | { kind: "demo" }
  | { kind: "reserved"; sub: string }
  | { kind: "tenant"; subdomain: string }
  | { kind: "other" };

export function classifyHost(hostname: string): HostKind {
  const extracted = extractSubdomain(hostname);
  if (!extracted) return { kind: "other" };
  const { sub } = extracted;
  if (sub === "" || sub === "www") return { kind: "root" };
  if (sub === "app") return { kind: "app" };
  if (sub === "demo") return { kind: "demo" };
  // Multi-label or invalid → ignore (don't pretend it's a tenant).
  if (!isAgencyEligibleSubdomain(sub)) {
    if (isReservedSubdomain(sub)) return { kind: "reserved", sub };
    return { kind: "other" };
  }
  return { kind: "tenant", subdomain: sub };
}

type Rewrite = { to: string; replace: boolean } | null;

export function computeHostRewrite(hostname: string, pathname: string): Rewrite {
  // Never rewrite admin or asset paths — they must work on every host.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/_") ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }

  const host = classifyHost(hostname);

  switch (host.kind) {
    case "app": {
      if (pathname === "/" || pathname === "") return { to: "/admin", replace: true };
      return null;
    }
    case "demo": {
      if (pathname === "/" || pathname === "") return { to: "/demo", replace: true };
      return null;
    }
    case "tenant": {
      const sub = host.subdomain;
      if (pathname.startsWith("/checkin/")) return null;
      if (pathname.startsWith("/live/") || pathname.startsWith("/t/")) return null;

      // New /e/{eventSlug}[/...] mapping → tenant event page.
      if (pathname === "/e" || pathname.startsWith("/e/")) {
        const rest = pathname.slice(2); // keep leading "/" of the slug part, drop "/e"
        return { to: `/t/${sub}/e${rest}`, replace: true };
      }

      // Legacy event-subdomain paths — keep working during transition.
      const legacyPrefixes: Array<[string, (rest: string) => string]> = [
        ["/join", () => `/live/${sub}/join`],
        ["/venues", (rest) => `/live/${sub}/venues${rest}`],
        ["/leaderboard", () => `/live/${sub}/leaderboard`],
        ["/terms", () => `/live/${sub}/terms`],
        ["/privacy", () => `/live/${sub}/privacy`],
      ];
      for (const [prefix, build] of legacyPrefixes) {
        if (pathname === prefix || pathname.startsWith(prefix + "/")) {
          const rest = pathname.slice(prefix.length);
          return { to: build(rest), replace: true };
        }
      }

      if (pathname === "/" || pathname === "") {
        return { to: `/t/${sub}`, replace: true };
      }
      return null;
    }
    case "root":
    case "reserved":
    case "other":
    default:
      return null;
  }
}

/** Diagnostic snapshot for the platform_admin-only diagnostic panel. */
export function describeHost(hostname: string, pathname: string) {
  const host = classifyHost(hostname);
  const rewrite = computeHostRewrite(hostname, pathname);
  const root = matchRootDomain(hostname);
  return {
    hostname,
    pathname,
    rootDomain: root,
    classification: host.kind,
    subdomain:
      host.kind === "tenant" ? host.subdomain : host.kind === "reserved" ? host.sub : null,
    rewriteTo: rewrite?.to ?? null,
  };
}

export function HostRouter() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rewrite = computeHostRewrite(window.location.hostname, location.pathname);
    if (!rewrite) return;
    if (rewrite.to === location.pathname) return;
    // Full navigation: rewrite targets cross a different route subtree
    // (e.g. /t/{sub} or /live/{sub}); a hard replace is the safest way to
    // remount with the correct route match.
    window.location.replace(rewrite.to);
  }, [location.pathname]);

  return null;
}
