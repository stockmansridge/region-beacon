import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";

/**
 * Host-based routing for the published GetStampd domains.
 *
 * Mapping (only takes effect when running on a *.getstamped.com.au host —
 * Lovable previews and localhost are unaffected and continue to use the
 * normal route tree, including /live/$subdomain for staging simulation):
 *
 *   getstamped.com.au          → Coming Soon (the / route already handles this)
 *   www.getstamped.com.au      → Coming Soon
 *   app.getstamped.com.au      → "/" should land in /admin
 *   demo.getstamped.com.au     → "/" should land in /demo
 *   {sub}.getstamped.com.au    → rewrite the public event paths onto
 *                                /live/{sub}/... so existing route handlers
 *                                render unchanged. Existing top-level
 *                                /checkin/$qrToken keeps working as-is.
 *
 * Implementation note: this runs client-side after hydration. SSR is not
 * host-aware here, but the published deployment serves a static HTML shell
 * and TanStack hydrates routes on the client; the redirect happens before
 * the first meaningful paint of the wrong content.
 */

const ROOT_DOMAIN = "getstamped.com.au";

// Hostnames that should NOT be treated as a public-event subdomain.
const RESERVED_SUBDOMAINS = new Set<string>([
  "www",
  "app",
  "demo",
  "admin",
  "api",
  "mail",
  "static",
  "assets",
  "cdn",
]);

type HostKind =
  | { kind: "root" }
  | { kind: "app" }
  | { kind: "demo" }
  | { kind: "event"; subdomain: string }
  | { kind: "other" };

export function classifyHost(hostname: string): HostKind {
  const host = hostname.toLowerCase().split(":")[0];
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return { kind: "root" };
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return { kind: "other" };
  const sub = host.slice(0, -1 * (`.${ROOT_DOMAIN}`.length));
  if (sub === "app") return { kind: "app" };
  if (sub === "demo") return { kind: "demo" };
  if (RESERVED_SUBDOMAINS.has(sub)) return { kind: "other" };
  // Single-label subdomain only; ignore deep ones like x.y.getstamped.com.au.
  if (sub.includes(".")) return { kind: "other" };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return { kind: "other" };
  return { kind: "event", subdomain: sub };
}

type Rewrite = { to: string; replace: boolean } | null;

export function computeHostRewrite(hostname: string, pathname: string): Rewrite {
  const host = classifyHost(hostname);
  // Never rewrite admin or asset paths — they must work on every host.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/_") ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }

  switch (host.kind) {
    case "app": {
      if (pathname === "/" || pathname === "") {
        return { to: "/admin", replace: true };
      }
      return null;
    }
    case "demo": {
      if (pathname === "/" || pathname === "") {
        return { to: "/demo", replace: true };
      }
      return null;
    }
    case "event": {
      const sub = host.subdomain;
      // /checkin/$qrToken already exists at top level; do not rewrite.
      if (pathname.startsWith("/checkin/")) return null;
      // Already on /live/... — nothing to do.
      if (pathname.startsWith("/live/")) return null;

      const mapPrefixes: Array<[string, (rest: string) => string]> = [
        ["/join", () => `/live/${sub}/join`],
        ["/venues", (rest) => `/live/${sub}/venues${rest}`],
        ["/leaderboard", () => `/live/${sub}/leaderboard`],
        ["/terms", () => `/live/${sub}/terms`],
        ["/privacy", () => `/live/${sub}/privacy`],
      ];

      for (const [prefix, build] of mapPrefixes) {
        if (pathname === prefix || pathname.startsWith(prefix + "/")) {
          const rest = pathname.slice(prefix.length);
          return { to: build(rest), replace: true };
        }
      }
      if (pathname === "/" || pathname === "") {
        return { to: `/live/${sub}`, replace: true };
      }
      return null;
    }
    case "root":
    case "other":
    default:
      return null;
  }
}

export function HostRouter() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rewrite = computeHostRewrite(window.location.hostname, location.pathname);
    if (!rewrite) return;
    if (rewrite.to === location.pathname) return;
    // Use a full navigation: the rewrite targets cross a different route
    // subtree (e.g. /live/$subdomain), so a hard replace is the safest
    // way to remount with the correct route match.
    window.location.replace(rewrite.to);
  }, [location.pathname]);

  return null;
}
