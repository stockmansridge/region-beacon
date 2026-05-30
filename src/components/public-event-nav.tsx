import { Link, useLocation } from "@tanstack/react-router";
import { Home, Ticket, MapPin, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Public event navigation.
 *
 * - Desktop (md+): inline top nav rendered in the page header.
 * - Mobile: top header shows only the event name; navigation moves to a
 *   fixed bottom bar with four icon+label buttons (Home, Passport, Venues,
 *   Leaderboard). Respects iOS safe-area inset. Page bottom padding is
 *   injected via a scoped <style> tag so content isn't hidden by the nav.
 *
 * No hamburger / drawer. Terms & Privacy stay as footer text links.
 */
export function PublicEventNav({
  subdomain,
  eventName,
  primaryColor,
  accentColor,
  hasTerms = true,
  hasPrivacy = true,
  canRegister = true,
  activeOverride,
  passportHref,
}: {
  subdomain: string;
  eventName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  canRegister?: boolean;
  /** When set, forces this nav item to render as active, regardless of pathname. */
  activeOverride?: "home" | "join" | "venues" | "leaderboard";
  /** When set, the Passport item renders as a plain <a href> to this URL instead of the /join route. */
  passportHref?: string;
}) {
  const primary = primaryColor ?? "#1F3D2B";
  const accent = accentColor ?? "#B5572A";
  const location = useLocation();
  const pathname = location.pathname;

  const baseHome = `/live/${subdomain}`;
  const isActive = (target: "home" | "join" | "venues" | "leaderboard") => {
    if (activeOverride) return target === activeOverride;
    if (target === "home") return pathname === baseHome || pathname === `${baseHome}/`;
    if (target === "venues")
      return pathname === `${baseHome}/venues` || pathname.startsWith(`${baseHome}/venues/`);
    return pathname === `${baseHome}/${target}`;
  };

  const desktopItems: Array<{ key: string; label: string; node: React.ReactNode }> = [
    {
      key: "home",
      label: "Home",
      node: (
        <Link
          to="/live/$subdomain"
          params={{ subdomain }}
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          Home
        </Link>
      ),
    },
    ...(canRegister
      ? [{
          key: "join",
          label: passportHref ? "Passport" : "Start passport",
          node: passportHref ? (
            <a
              href={passportHref}
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
              aria-current={isActive("join") ? "page" : undefined}
            >
              Passport
            </a>
          ) : (
            <Link
              to="/live/$subdomain/join"
              params={{ subdomain }}
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Start passport
            </Link>
          ),
        }]
      : []),
    {
      key: "venues",
      label: "Venues",
      node: (
        <Link
          to="/live/$subdomain/venues"
          params={{ subdomain }}
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          Venues
        </Link>
      ),
    },
    {
      key: "leaderboard",
      label: "Leaderboard",
      node: (
        <Link
          to="/live/$subdomain/leaderboard"
          params={{ subdomain }}
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          Leaderboard
        </Link>
      ),
    },
    ...(hasTerms
      ? [{
          key: "terms",
          label: "Terms",
          node: (
            <Link
              to="/live/$subdomain/terms"
              params={{ subdomain }}
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Terms
            </Link>
          ),
        }]
      : []),
    ...(hasPrivacy
      ? [{
          key: "privacy",
          label: "Privacy",
          node: (
            <Link
              to="/live/$subdomain/privacy"
              params={{ subdomain }}
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Privacy
            </Link>
          ),
        }]
      : []),
  ];

  // Mobile bottom nav item helper
  function BottomItem({
    active,
    label,
    icon,
    disabled,
    children,
  }: {
    active: boolean;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
    children: (className: string, style: React.CSSProperties) => React.ReactNode;
  }) {
    const color = active ? accent : primary;
    const opacity = disabled ? 0.4 : 1;
    const className = cn(
      "flex h-full flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
      active && "relative",
    );
    const style: React.CSSProperties = { color, opacity };
    return (
      <>
        {children(className, style)}
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-[3px] w-10 rounded-b-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <span className="sr-only">{label}</span>
      </>
    );
  }

  return (
    <>
      {/* Top header: event name + desktop inline nav */}
      <nav
        aria-label="Event navigation"
        className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-between rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8]/90 px-4 py-3 shadow-sm backdrop-blur"
      >
        <Link
          to="/live/$subdomain"
          params={{ subdomain }}
          className="truncate text-sm font-semibold tracking-wide"
          style={{ color: primary }}
        >
          {eventName ?? "Event"}
        </Link>
        <div className="hidden items-center gap-5 md:flex">
          {desktopItems.map((i) => (
            <span key={i.key}>{i.node}</span>
          ))}
        </div>
      </nav>

      {/* Fixed bottom mobile nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E6DCC7] bg-[#FBF5E8]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto flex h-14 max-w-md items-stretch">
          <li className="relative flex flex-1">
            <Link
              to="/live/$subdomain"
              params={{ subdomain }}
              aria-current={isActive("home") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("home") ? accent : primary }}
            >
              <Home className="h-5 w-5" />
              <span>Home</span>
            </Link>
            {isActive("home") && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
                style={{ backgroundColor: accent }}
              />
            )}
          </li>
          <li className="relative flex flex-1">
            {canRegister ? (
              <Link
                to="/live/$subdomain/join"
                params={{ subdomain }}
                aria-current={isActive("join") ? "page" : undefined}
                className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: isActive("join") ? accent : primary }}
              >
                <Ticket className="h-5 w-5" />
                <span>Passport</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Registration closed"
                className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: primary, opacity: 0.4 }}
              >
                <Ticket className="h-5 w-5" />
                <span>Passport</span>
              </button>
            )}
            {canRegister && isActive("join") && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
                style={{ backgroundColor: accent }}
              />
            )}
          </li>
          <li className="relative flex flex-1">
            <Link
              to="/live/$subdomain/venues"
              params={{ subdomain }}
              aria-current={isActive("venues") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("venues") ? accent : primary }}
            >
              <MapPin className="h-5 w-5" />
              <span>Venues</span>
            </Link>
            {isActive("venues") && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
                style={{ backgroundColor: accent }}
              />
            )}
          </li>
          <li className="relative flex flex-1">
            <Link
              to="/live/$subdomain/leaderboard"
              params={{ subdomain }}
              aria-current={isActive("leaderboard") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("leaderboard") ? accent : primary }}
            >
              <Trophy className="h-5 w-5" />
              <span>Board</span>
            </Link>
            {isActive("leaderboard") && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
                style={{ backgroundColor: accent }}
              />
            )}
          </li>
        </ul>
      </nav>

      {/* Bottom-nav clearance: only on mobile while this nav is mounted */}
      <style>{`
        @media (max-width: 767px) {
          body { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }
        }
      `}</style>
    </>
  );
}
