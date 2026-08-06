import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { Link } from "@tanstack/react-router";

/**
 * Navigation mode for the shared public landing renderer.
 *
 * The public customer pages are served from the event's own host, where every
 * in-page link is root-relative ("/join", "/venues") and the route resolves
 * the event from the hostname. The admin draft preview renders the exact same
 * components on the admin host, where those root-relative paths would resolve
 * to the marketing site instead. Rather than fork the markup, the renderer
 * emits <PublicLink> and this context decides how each path is realised.
 *
 *  - mode "live"    → root-relative client-side <Link> (default; unchanged).
 *  - mode "preview" → absolute link into /live/<subdomain>/… when the event
 *                     has a subdomain, otherwise an inert, clearly-disabled
 *                     control (a draft event without a domain has no
 *                     customer-facing pages to link to yet).
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

/** Absolute path for a public page in preview mode, or null when unavailable. */
export function previewPathFor(subdomain: string | null, to: string): string | null {
  if (!subdomain) return null;
  const suffix = to === "/" ? "" : to.startsWith("/") ? to : `/${to}`;
  return `/live/${subdomain}${suffix}`;
}

export function PublicLink({
  to,
  children,
  onClick,
  ...rest
}: {
  to: string;
  children: ReactNode;
  onClick?: () => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { mode, subdomain, disabledTitle } = usePublicNav();

  if (mode === "live") {
    return (
      <Link to={to as never} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }

  const href = previewPathFor(subdomain, to);
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
