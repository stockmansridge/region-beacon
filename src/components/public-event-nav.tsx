import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  Ticket,
  MapPin,
  Trophy,
  Map as MapIcon,
  Menu,
  Home,
  FileText,
  X,
  Tag,
  HelpCircle,
  Award,
} from "lucide-react";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { useEventFaqByDomain } from "@/lib/use-event-faq";
import { useEventHasMap } from "@/lib/use-event-has-map";
import { useEventHasAwards } from "@/lib/use-event-has-awards";

type ActiveTarget =
  | "home"
  | "join"
  | "passport"
  | "map"
  | "venues"
  | "offers"
  | "leaderboard"
  | "more";

/**
 * Public event navigation.
 *
 * Renders a premium, app-style sticky top header (hamburger left, centred
 * event logo or name, passport shortcut on the right) plus a fixed bottom
 * mobile nav. The hamburger opens a slide-in drawer with all public
 * sections.
 */
export function PublicEventNav({
  subdomain,
  eventName,
  primaryColor,
  accentColor,
  logoUrl,
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
  /** Public URL for the event logo. Shown centred in the header when set. */
  logoUrl?: string | null;
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  canRegister?: boolean;
  activeOverride?: ActiveTarget | "join";
  passportHref?: string;
  eventId?: string | null;
}) {
  void subdomain;
  const primary = primaryColor ?? "var(--event-primary,#1F3D2B)";
  const accent = accentColor ?? "var(--event-accent,#B5572A)";
  const location = useLocation();
  const pathname = location.pathname;
  const { passportHref: derivedPassportHref } = useCurrentEventPassport(eventId);
  const passportHref = passportHrefOverride ?? derivedPassportHref ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const faqState = useEventFaqByDomain(subdomain);
  const hasFaq = faqState.kind === "ok" && faqState.entries.length > 0;
  const { hasMap } = useEventHasMap(subdomain);
  const { hasAwards } = useEventHasAwards(subdomain);

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
  const passportTarget = passportHref ?? "/join";

  return (
    <>
      {/* Sticky app-style header */}
      <header
        className="sticky top-0 z-40 -mx-4 mb-5 border-b backdrop-blur"
        style={{
          background: primary,
          borderColor: "color-mix(in oklab, white 12%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          className="mx-auto grid h-14 max-w-2xl grid-cols-[44px_1fr_44px] items-center px-3"
          style={{ color: "var(--event-primary-fg,#F6EFE2)" }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/"
            aria-label={eventName ?? "Home"}
            className="mx-auto flex h-10 max-w-[70%] items-center justify-center"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={eventName ?? ""}
                className="max-h-9 w-auto max-w-full object-contain"
              />
            ) : (
              <span
                className="truncate text-center text-[14px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "var(--event-primary-fg,#F6EFE2)" }}
              >
                {eventName ?? "Event"}
              </span>
            )}
          </Link>

          {canRegister || passportHref ? (
            <a
              href={passportTarget}
              aria-label="View passport"
              title={passportLabel}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
            >
              <Ticket className="h-5 w-5" />
            </a>
          ) : (
            <span aria-hidden className="ml-auto h-10 w-10" />
          )}
        </div>
      </header>

      {/* Slide-in hamburger menu (works on mobile + desktop) */}
      {menuOpen && (
        <MenuDrawer
          onClose={() => setMenuOpen(false)}
          primary={primary}
          hasTerms={hasTerms}
          hasFaq={hasFaq}
          hasMap={hasMap}
          hasAwards={hasAwards}
          hasPrivacy={hasPrivacy}
          passportHref={passportHref}
          passportLabel={passportLabel}
          canRegister={canRegister}
          eventName={eventName ?? null}
          logoUrl={logoUrl ?? null}
        />
      )}

      {/* Fixed bottom mobile nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          background: primary,
          borderColor: "color-mix(in oklab, white 10%, transparent)",
          color: "var(--event-primary-fg,#F6EFE2)",
        }}
      >
        <ul className="mx-auto flex h-14 max-w-md items-stretch">
          <BottomItem active={isActive("passport")} accent={accent}>
            <a
              href={passportTarget}
              aria-current={isActive("passport") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                color: isActive("passport")
                  ? accent
                  : "var(--event-primary-fg,#F6EFE2)",
              }}
            >
              <Ticket className="h-5 w-5" />
              <span>Passport</span>
            </a>
          </BottomItem>
          {hasMap && (
            <BottomItem active={isActive("map")} accent={accent}>
              <Link
                to="/map"
                aria-current={isActive("map") ? "page" : undefined}
                className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  color: isActive("map")
                    ? accent
                    : "var(--event-primary-fg,#F6EFE2)",
                }}
              >
                <MapIcon className="h-5 w-5" />
                <span>Trail Map</span>
              </Link>
            </BottomItem>
          )}
          <BottomItem active={isActive("venues")} accent={accent}>
            <Link
              to="/venues"
              aria-current={isActive("venues") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                color: isActive("venues")
                  ? accent
                  : "var(--event-primary-fg,#F6EFE2)",
              }}
            >
              <MapPin className="h-5 w-5" />
              <span>Venues</span>
            </Link>
          </BottomItem>
          <BottomItem active={isActive("offers")} accent={accent}>
            <Link
              to="/offers"
              aria-current={isActive("offers") ? "page" : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{
                color: isActive("offers")
                  ? accent
                  : "var(--event-primary-fg,#F6EFE2)",
              }}
            >
              <Tag className="h-5 w-5" />
              <span>Offers</span>
            </Link>
          </BottomItem>
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

function BottomItem({
  active,
  accent,
  children,
}: {
  active: boolean;
  accent: string;
  children: React.ReactNode;
}) {
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

function MenuDrawer({
  onClose,
  primary,
  hasTerms,
  hasFaq,
  hasMap,
  hasAwards,
  hasPrivacy,
  passportHref,
  passportLabel,
  canRegister,
  eventName,
  logoUrl,
}: {
  onClose: () => void;
  primary: string;
  hasTerms: boolean;
  hasFaq: boolean;
  hasMap: boolean;
  hasAwards: boolean;
  hasPrivacy: boolean;
  passportHref: string | null;
  passportLabel: string;
  canRegister: boolean;
  eventName: string | null;
  logoUrl: string | null;
}) {
  const rowClass =
    "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition hover:bg-white/10 active:bg-white/15";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 animate-in fade-in" />
      <aside
        className="absolute inset-y-0 left-0 flex h-full w-[82%] max-w-sm flex-col shadow-2xl animate-in slide-in-from-left"
        style={{
          background: primary,
          color: "var(--event-primary-fg,#F6EFE2)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <span className="truncate text-[13px] font-semibold uppercase tracking-[0.22em]">
                {eventName ?? "Menu"}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          <ul className="flex flex-col gap-1">
            <li>
              <Link to="/" onClick={onClose} className={rowClass}>
                <Home className="h-5 w-5 opacity-80" />
                Home
              </Link>
            </li>
            {(canRegister || passportHref) && (
              <li>
                {passportHref ? (
                  <a href={passportHref} onClick={onClose} className={rowClass}>
                    <Ticket className="h-5 w-5 opacity-80" />
                    {passportLabel}
                  </a>
                ) : (
                  <Link to="/join" onClick={onClose} className={rowClass}>
                    <Ticket className="h-5 w-5 opacity-80" />
                    {passportLabel}
                  </Link>
                )}
              </li>
            )}
            <li>
              <Link to="/venues" onClick={onClose} className={rowClass}>
                <MapPin className="h-5 w-5 opacity-80" />
                Venues
              </Link>
            </li>
            <li>
              <Link to="/offers" onClick={onClose} className={rowClass}>
                <Tag className="h-5 w-5 opacity-80" />
                Offers
              </Link>
            </li>
            {hasMap && (
              <li>
                <Link to="/map" onClick={onClose} className={rowClass}>
                  <MapIcon className="h-5 w-5 opacity-80" />
                  Trail Map
                </Link>
              </li>
            )}
            <li>
              <Link to="/leaderboard" onClick={onClose} className={rowClass}>
                <Trophy className="h-5 w-5 opacity-80" />
                Leaderboard
              </Link>
            </li>
            {hasAwards && (
              <li>
                <Link to="/awards" onClick={onClose} className={rowClass}>
                  <Award className="h-5 w-5 opacity-80" />
                  Awards
                </Link>
              </li>
            )}
            {hasFaq && (
              <li>
                <Link to="/faq" onClick={onClose} className={rowClass}>
                  <HelpCircle className="h-5 w-5 opacity-80" />
                  FAQ / Info
                </Link>
              </li>
            )}
            {(hasTerms || hasPrivacy) && (
              <li>
                <Link to="/terms-privacy" onClick={onClose} className={rowClass}>
                  <FileText className="h-5 w-5 opacity-80" />
                  Terms &amp; Privacy
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
