import { Link, useLocation } from "@tanstack/react-router";
import { Ticket, MapPin, Trophy, Map as MapIcon } from "lucide-react";


/**
 * Public event navigation.
 *
 * Renders clean tenant URLs (`/`, `/join`, `/venues`, `/leaderboard`) so
 * the browser address bar stays free of internal `/live/$subdomain/...`
 * paths on tenant hosts. The clean routes derive the subdomain from
 * window.location.hostname, so the `subdomain` prop here is only used
 * for active-state matching and labels.
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
  activeOverride?: "home" | "join" | "map" | "venues" | "leaderboard";
  /** When set, the Passport item renders as a plain <a href> to this URL instead of the /join route. */
  passportHref?: string;
}) {
  void subdomain;
  const primary = primaryColor ?? "#1F3D2B";
  const accent = accentColor ?? "#B5572A";
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (target: "home" | "join" | "map" | "venues" | "leaderboard") => {
    if (activeOverride) return target === activeOverride;
    if (target === "home") return pathname === "/" || pathname === "";
    if (target === "join") return pathname === "/join";
    if (target === "map") return pathname === "/map";
    if (target === "venues")
      return pathname === "/venues" || pathname.startsWith("/venues/");
    if (target === "leaderboard") return pathname === "/leaderboard";
    return false;
  };

  const desktopItems: Array<{ key: string; label: string; node: React.ReactNode }> = [
    {
      key: "home",
      label: "Home",
      node: (
        <Link
          to="/"
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
              to="/join"
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Start passport
            </Link>
          ),
        }]
      : []),
    {
      key: "map",
      label: "Trail Map",
      node: (
        <Link
          to="/map"
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          Trail Map
        </Link>
      ),
    },
    {
      key: "venues",
      label: "Venues",
      node: (
        <Link
          to="/venues"
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
          to="/leaderboard"
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
              to="/terms"
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
              to="/privacy"
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Privacy
            </Link>
          ),
        }]
      : []),
  ];

  return (
    <>
      {/* Top header: event name + desktop inline nav */}
      <nav
        aria-label="Event navigation"
        className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-between rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8]/90 px-4 py-3 shadow-sm backdrop-blur"
      >
        <Link
          to="/"
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
              to="/map"
              aria-current={isActive("map") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("map") ? accent : primary }}
            >
              <MapIcon className="h-5 w-5" />
              <span>Trail Map</span>
            </Link>
            {isActive("map") && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
                style={{ backgroundColor: accent }}
              />
            )}
          </li>
          <li className="relative flex flex-1">
            {canRegister ? (
              passportHref ? (
                <a
                  href={passportHref}
                  aria-current={isActive("join") ? "page" : undefined}
                  className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: isActive("join") ? accent : primary }}
                >
                  <Ticket className="h-5 w-5" />
                  <span>Passport</span>
                </a>
              ) : (
                <Link
                  to="/join"
                  aria-current={isActive("join") ? "page" : undefined}
                  className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: isActive("join") ? accent : primary }}
                >
                  <Ticket className="h-5 w-5" />
                  <span>Passport</span>
                </Link>
              )
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
              to="/venues"
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
              to="/leaderboard"
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
