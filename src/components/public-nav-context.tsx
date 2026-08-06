import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { Link, useLocation } from "@tanstack/react-router";

/**
 * Navigation mode for the shared public event renderer.
 *
 * The customer pages exist twice in the route tree:
 *
 *  1. Root-level, hostname-resolved routes ("/venues", "/offers", "/map"…)
 *     used when the event is served from its own tenant host
 *     (my-event.getstampd.com.au). These resolve the event from
 *     window.location.hostname.
 *  2. Path-scoped routes ("/live/<subdomain>/venues"…) used by the admin
 *     preview and by any non-tenant host (app.getstampd.com.au).
 *
 * A root-relative link is only correct on a tenant host. Emitted from a
 * /live/<subdomain>/… page it drops the event context entirely and the
 * root route falls back to <NonTenantNotice /> ("Event passport — open this
 * page from your event link").
 *
 * So every in-app public link goes through one builder, `buildEventHref`,
 * which re-bases the canonical page path onto whatever base the current
 * URL is already using. `<PublicLink>` is the component form.
 *
 *  - mode "live"    → same-tab client-side <Link>, re-based onto the current
 *                     /live/<subdomain> prefix when there is one (otherwise
 *                     unchanged root-relative, i.e. tenant hosts behave
 *                     exactly as before).
 *  - mode "preview" → the renderer is embedded in an admin screen and is NOT
 *                     itself under /live/<subdomain>, so links open the
 *                     path-scoped page in a new tab. Without a subdomain
 *                     (draft, no public address) the control is inert.
 */
export type PublicNavMode = "live" | "preview";

type PublicNavContextValue = {
  mode: PublicNavMode;
  subdomain: string | null;
  /** Tooltip shown on inert links in preview mode. */
  disabledTitle: string;
};

const PublicNavContext = createContext<PublicNavContextValue>({
  mode: "live",
  subdomain: null,
  disabledTitle: "",
});

export function PublicNavProvider({
  mode,
  subdomain,
  disabledTitle = "Publish the event with a public address to open this page",
  children,
}: {
  mode: PublicNavMode;
  subdomain: string | null;
  disabledTitle?: string;
  children: ReactNode;
}) {
  return (
    <PublicNavContext.Provider value={{ mode, subdomain, disabledTitle }}>
      {children}
    </PublicNavContext.Provider>
  );
}

export function usePublicNav() {
  return useContext(PublicNavContext);
}

/**
 * Canonical public page paths that exist BOTH as a root route (tenant host)
 * and as a /live/$subdomain child route. Only these may be re-based.
 *
 * Anything else (e.g. "/scan", "/passport/<token>", external hrefs) is
 * host-level or token-based and is passed through untouched.
 */
const REBASEABLE = [
  "/",
  "/join",
  "/venues",
  "/venues/$venueId",
  "/offers",
  "/map",
  "/leaderboard",
  "/prizes",
  "/faq",
  "/terms",
  "/privacy",
  "/terms-privacy",
];

function isRebaseable(to: string): boolean {
  if (REBASEABLE.includes(to)) return true;
  // Concrete venue detail path, e.g. "/venues/abc-123".
  return /^\/venues\/[^/]+$/.test(to);
}

/**
 * The event-scoped base of a pathname, or "" when the URL is already a
 * tenant-host root path. E.g. "/live/orange-wine-quest/venues" →
 * "/live/orange-wine-quest".
 */
export function eventNavBaseFromPathname(pathname: string): string {
  const match = /^\/live\/([^/]+)/.exec(pathname);
  return match ? `/live/${match[1]}` : "";
}

/** The event-scoped base for the page currently being rendered. */
export function useEventNavBase(): string {
  const location = useLocation();
  return eventNavBaseFromPathname(location.pathname);
}

/**
 * THE link builder. Every public nav target is produced here so no menu or
 * card hardcodes a host-dependent path.
 */
export function buildEventHref({
  to,
  base,
  params,
}: {
  /** Canonical page path, e.g. "/venues" or "/venues/$venueId". */
  to: string;
  /** Event-scoped base ("" on a tenant host, "/live/<subdomain>" otherwise). */
  base: string;
  params?: Record<string, string | undefined>;
}): string {
  let path = to;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`$${key}`, encodeURIComponent(value ?? ""));
    }
  }
  if (!base || !isRebaseable(to)) return path;
  return path === "/" ? base : `${base}${path}`;
}

/** Hook form of {@link buildEventHref} for the current page's context. */
export function useEventHref(
  to: string,
  params?: Record<string, string | undefined>,
): string {
  const base = useEventNavBase();
  return buildEventHref({ to, base, params });
}

/** Absolute path for a public page in preview mode, or null when unavailable. */
export function previewPathFor(
  subdomain: string | null,
  to: string,
  params?: Record<string, string | undefined>,
): string | null {
  if (!subdomain) return null;
  return buildEventHref({ to, base: `/live/${subdomain}`, params });
}

export function PublicLink({
  to,
  params,
  children,
  onClick,
  ...rest
}: {
  to: string;
  params?: Record<string, string | undefined>;
  children: ReactNode;
  onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { mode, subdomain, disabledTitle } = usePublicNav();
  const base = useEventNavBase();

  if (mode === "live") {
    // Re-based onto the current context: identical output on tenant hosts,
    // event-scoped when rendered under /live/<subdomain>.
    const href = buildEventHref({ to, base, params });
    return (
      <Link to={href as never} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }

  const href = previewPathFor(subdomain, to, params);
  if (!href) {
    return (
      <span
        {...rest}
        style={{ ...rest.style, cursor: "not-allowed", opacity: 0.6 }}
        title={disabledTitle}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} {...rest}>
      {children}
    </a>
  );
}
