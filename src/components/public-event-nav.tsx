import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Ticket, MapPin, Trophy, Map as MapIcon, MoreHorizontal, Home, FileText, ShieldCheck, X, Tag, HelpCircle } from "lucide-react";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { useEventFaqByDomain } from "@/lib/use-event-faq";
import { useEventHasMap } from "@/lib/use-event-has-map";

type ActiveTarget = "home" | "join" | "passport" | "map" | "venues" | "offers" | "leaderboard" | "more";

/**
 * Public event navigation.
 *
 * Renders clean tenant URLs (`/`, `/join`, `/venues`, `/leaderboard`,
 * `/passport/<token>`) so the browser address bar stays free of internal
 * `/live/$subdomain/...` paths. The Passport item automatically resolves
 * to the visitor's saved /passport/<token> URL when a passport for the
 * current tenant is stored in localStorage; otherwise it falls back to
 * `/join`.
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
  passportHref: passportHrefOverride,
  eventId,
}: {
  subdomain: string;
  eventName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  canRegister?: boolean;
  /** When set, forces this nav item to render as active, regardless of pathname. */
  activeOverride?: ActiveTarget | "join";
  /** Explicit passport href override; if omitted, derived from localStorage. */
  passportHref?: string;
  /** Current public event id for event-scoped saved passport lookup. */
  eventId?: string | null;
}) {
  const primary = primaryColor ?? "#1F3D2B";
  const accent = accentColor ?? "#B5572A";
  const location = useLocation();
  const pathname = location.pathname;
  const { passportHref: derivedPassportHref } = useCurrentEventPassport(eventId);
  const passportHref = passportHrefOverride ?? derivedPassportHref ?? null;
  const [moreOpen, setMoreOpen] = useState(false);
  const faqState = useEventFaqByDomain(subdomain);
  const hasFaq = faqState.kind === "ok" && faqState.entries.length > 0;
  const { hasMap } = useEventHasMap(subdomain);

  // Normalise legacy "join" override → "passport".
  const normalisedOverride: ActiveTarget | undefined =
    activeOverride === "join" ? "passport" : (activeOverride as ActiveTarget | undefined);

  const isActive = (target: ActiveTarget) => {
    if (normalisedOverride) return target === normalisedOverride;
    if (target === "home") return pathname === "/" || pathname === "";
    if (target === "passport")
      return pathname === "/join" || pathname.startsWith("/passport");
    if (target === "map") return pathname === "/map";
    if (target === "venues")
      return pathname === "/venues" || pathname.startsWith("/venues/");
    if (target === "offers") return pathname === "/offers";
    if (target === "leaderboard") return pathname === "/leaderboard";
    return false;
  };

  const passportLabel = passportHref ? "Passport" : "Start passport";

  const PassportLink = ({
    className,
    style,
    children,
  }: {
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }) => {
    if (!canRegister && !passportHref) {
      return (
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Registration closed"
          className={className}
          style={{ ...style, opacity: 0.4 }}
        >
          {children}
        </button>
      );
    }
    if (passportHref) {
      return (
        <a
          href={passportHref}
          className={className}
          style={style}
          aria-current={isActive("passport") ? "page" : undefined}
        >
          {children}
        </a>
      );
    }
    return (
      <Link
        to="/join"
        className={className}
        style={style}
        aria-current={isActive("passport") ? "page" : undefined}
      >
        {children}
      </Link>
    );
  };

  const desktopItems: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: "home",
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
    {
      key: "passport",
      node: (
        <PassportLink
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          {passportLabel}
        </PassportLink>
      ),
    },
    ...(hasMap
      ? [{
          key: "map",
          node: (
            <Link
              to="/map"
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              Trail Map
            </Link>
          ),
        }]
      : []),
    {
      key: "venues",
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
      key: "offers",
      node: (
        <Link
          to="/offers"
          className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
          style={{ color: primary }}
        >
          Offers
        </Link>
      ),
    },
    {
      key: "leaderboard",
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
    ...(hasFaq
      ? [{
          key: "faq",
          node: (
            <Link
              to="/faq"
              className="text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
              style={{ color: primary }}
            >
              FAQ / Info
            </Link>
          ),
        }]
      : []),
    ...(hasTerms
      ? [{
          key: "terms",
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

  const moreActive =
    isActive("home") ||
    isActive("leaderboard") ||
    isActive("offers") ||
    pathname === "/terms" ||
    pathname === "/privacy";

  return (
    <>
      {/* Top header: event name + desktop inline nav */}
      <nav
        aria-label="Event navigation"
        className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-between rounded-2xl border px-4 py-3 shadow-sm backdrop-blur"
        style={{
          borderColor: "var(--event-border, #E6DCC7)",
          background:
            "color-mix(in srgb, var(--event-card-bg, #FBF5E8) 90%, transparent)",
        }}
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

      {/* Fixed bottom mobile nav: Passport / Trail Map / Venues / More */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          borderColor: "var(--event-border, #E6DCC7)",
          background:
            "color-mix(in srgb, var(--event-card-bg, #FBF5E8) 95%, transparent)",
        }}
      >
        <ul className="mx-auto flex h-14 max-w-md items-stretch">
          <BottomItem active={isActive("passport")} accent={accent} primary={primary}>
            <PassportLink
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("passport") ? accent : primary }}
            >
              <Ticket className="h-5 w-5" />
              <span>Passport</span>
            </PassportLink>
          </BottomItem>
          {hasMap && (
            <BottomItem active={isActive("map")} accent={accent} primary={primary}>
              <Link
                to="/map"
                aria-current={isActive("map") ? "page" : undefined}
                className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: isActive("map") ? accent : primary }}
              >
                <MapIcon className="h-5 w-5" />
                <span>Trail Map</span>
              </Link>
            </BottomItem>
          )}
          <BottomItem active={isActive("venues")} accent={accent} primary={primary}>
            <Link
              to="/venues"
              aria-current={isActive("venues") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: isActive("venues") ? accent : primary }}
            >
              <MapPin className="h-5 w-5" />
              <span>Venues</span>
            </Link>
          </BottomItem>
          <BottomItem active={moreActive} accent={accent} primary={primary}>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: moreActive ? accent : primary }}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </BottomItem>
        </ul>
      </nav>

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          primary={primary}
          accent={accent}
          hasTerms={hasTerms}
          hasFaq={hasFaq}
          hasMap={hasMap}
          hasPrivacy={hasPrivacy}
          passportHref={passportHref}
          passportLabel={passportLabel}
          canRegister={canRegister}
        />
      )}

      {/* Bottom-nav clearance: only on mobile while this nav is mounted */}
      <style>{`
        @media (max-width: 767px) {
          body { padding-bottom: calc(56px + env(safe-area-inset-bottom)); }
        }
      `}</style>
    </>
  );
}

function BottomItem({
  active,
  accent,
  primary,
  children,
}: {
  active: boolean;
  accent: string;
  primary: string;
  children: React.ReactNode;
}) {
  void primary;
  return (
    <li className="relative flex flex-1">
      {children}
      {active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[3px] w-10 rounded-b-full"
          style={{ backgroundColor: accent }}
        />
      )}
    </li>
  );
}

function MoreSheet({
  onClose,
  primary,
  accent,
  hasTerms,
  hasFaq,
  hasMap,
  hasPrivacy,
  passportHref,
  passportLabel,
  canRegister,
}: {
  onClose: () => void;
  primary: string;
  accent: string;
  hasTerms: boolean;
  hasFaq: boolean;
  hasMap: boolean;
  hasPrivacy: boolean;
  passportHref: string | null;
  passportLabel: string;
  canRegister: boolean;
}) {
  void accent;
  const rowClass =
    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-[#1F3D2B]/5";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 md:hidden"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t p-4 shadow-xl"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          borderColor: "var(--event-border, #E6DCC7)",
          background: "var(--event-card-bg, #FBF5E8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: primary }}
          >
            More
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1 text-[#3D372C] hover:bg-[#1F3D2B]/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-1" style={{ color: primary }}>
          <li>
            <Link to="/" onClick={onClose} className={rowClass}>
              <Home className="h-4 w-4" />
              Home
            </Link>
          </li>
          {(canRegister || passportHref) && (
            <li>
              {passportHref ? (
                <a href={passportHref} onClick={onClose} className={rowClass}>
                  <Ticket className="h-4 w-4" />
                  {passportLabel}
                </a>
              ) : (
                <Link to="/join" onClick={onClose} className={rowClass}>
                  <Ticket className="h-4 w-4" />
                  {passportLabel}
                </Link>
              )}
            </li>
          )}
          {hasMap && (
            <li>
              <Link to="/map" onClick={onClose} className={rowClass}>
                <MapIcon className="h-4 w-4" />
                Trail Map
              </Link>
            </li>
          )}
          <li>
            <Link to="/venues" onClick={onClose} className={rowClass}>
              <MapPin className="h-4 w-4" />
              Venues
            </Link>
          </li>
          <li>
            <Link to="/offers" onClick={onClose} className={rowClass}>
              <Tag className="h-4 w-4" />
              Offers
            </Link>
          </li>
          <li>
            <Link to="/leaderboard" onClick={onClose} className={rowClass}>
              <Trophy className="h-4 w-4" />
              Leaderboard
            </Link>
          </li>
          {hasFaq && (
            <li>
              <Link to="/faq" onClick={onClose} className={rowClass}>
                <HelpCircle className="h-4 w-4" />
                FAQ / Info
              </Link>
            </li>
          )}
          {hasTerms && (
            <li>
              <Link to="/terms" onClick={onClose} className={rowClass}>
                <FileText className="h-4 w-4" />
                Terms
              </Link>
            </li>
          )}
          {hasPrivacy && (
            <li>
              <Link to="/privacy" onClick={onClose} className={rowClass}>
                <ShieldCheck className="h-4 w-4" />
                Privacy
              </Link>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
