import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  Stamp,
  Trophy,
  Map as MapIcon,
  Menu,
  Home,
  FileText,
  X,
  Tag,
  HelpCircle,
  Award,
  MoreHorizontal,
  MapPin,
  Ticket,
  Share2,
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
 * mobile nav with Home, Map, Passport (prominent), Leaderboard, More.
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
  transparentHeader = false,
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
  /**
   * When true, the top header renders with no background fill, no border,
   * and no bottom margin so it can overlay a hero image. The bottom nav and
   * drawer behaviour are unchanged.
   */
  transparentHeader?: boolean;
}) {
  void subdomain;
  // Header / bottom-nav / drawer surfaces consume the nav tokens so they
  // can be themed independently of buttons. Tokens fall back to the
  // primary colour when no nav background has been configured, which
  // matches the historical behaviour for existing events.
  const navBg = `var(--event-nav-bg, ${primaryColor ?? "var(--event-primary,#1F3D2B)"})`;
  const navFg = `var(--event-nav-fg, var(--event-primary-fg,#F6EFE2))`;
  const navMuted = `var(--event-nav-muted, var(--event-nav-muted, var(--event-on-primary-muted, color-mix(in srgb, #F6EFE2 72%, transparent))))`;
  const navActiveFg = `var(--event-nav-active-fg, ${accentColor ?? "var(--event-accent,#B5572A)"})`;
  
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

  const passportLabel = passportHref ? "View passport" : "Start passport";
  const passportTarget = passportHref ?? "/join";

  return (
    <>
      {/* Sticky app-style header */}
      <header
        className={
          transparentHeader
            ? "sticky top-0 z-40 -mx-4"
            : "sticky top-0 z-40 -mx-4 mb-5 border-b backdrop-blur"
        }
        style={{
          background: transparentHeader ? "transparent" : navBg,
          borderColor: transparentHeader
            ? "transparent"
            : "color-mix(in oklab, white 12%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div
          className="mx-auto grid h-14 max-w-2xl grid-cols-[44px_1fr_auto] items-center px-3"
          style={{ color: navFg }}
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
                style={{ color: navFg }}
              >
                {eventName ?? "Event"}
              </span>
            )}
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={async () => {
                // Share only the public event root — never the current URL,
                // which on /passport/$token would leak the private token.
                const url =
                  typeof window !== "undefined"
                    ? `${window.location.protocol}//${window.location.host}/`
                    : "";
                const title = eventName ?? "Check this out";
                const text = eventName
                  ? `Come join me at ${eventName} on GetStampd`
                  : "Check this out on GetStampd";
                if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                  try {
                    await navigator.share({ title, text, url });
                    return;
                  } catch (err) {
                    if ((err as DOMException)?.name === "AbortError") return;
                  }
                }
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  try {
                    await navigator.clipboard.writeText(url);
                    return;
                  } catch {
                    /* fall through */
                  }
                }
                const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text} — ${url}`)}`;
                window.location.href = mailto;
              }}
              aria-label="Share"
              title="Share"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
            >
              <Share2 className="h-5 w-5" />
            </button>
            {canRegister || passportHref ? (
              <a
                href={passportTarget}
                aria-label={passportLabel}
                title={passportLabel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
              >
                <Stamp className="h-5 w-5" />
              </a>
            ) : (
              <span aria-hidden className="h-10 w-10" />
            )}
          </div>
        </div>
      </header>

      {/* Slide-in hamburger menu */}
      {menuOpen && (
        <MenuDrawer
          onClose={() => setMenuOpen(false)}
          navBg={navBg}
          navFg={navFg}
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

      {/* Fixed bottom mobile nav: Passport · Map · Leaders · Offers · More */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          background: navBg,
          borderColor: "color-mix(in oklab, white 10%, transparent)",
          color: navFg,
        }}
      >
        <ul
          className="mx-auto grid h-16 max-w-md"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
        >
          <li className="h-full min-w-0">
            <a
              href={passportTarget}
              aria-label={passportLabel}
              aria-current={isActive("passport") ? "page" : undefined}
              className={bottomItemClass}
              style={{ color: isActive("passport") ? navActiveFg : navMuted }}
            >
              <BottomItemContent icon={<Stamp className="h-5 w-5" />} label="Passport" />
            </a>
          </li>

          <li className="h-full min-w-0">
            {hasMap ? (
              <Link
                to="/map"
                aria-current={isActive("map") ? "page" : undefined}
                className={bottomItemClass}
                style={{ color: isActive("map") ? navActiveFg : navMuted }}
              >
                <BottomItemContent icon={<MapIcon className="h-5 w-5" />} label="Map" />
              </Link>
            ) : (
              <Link
                to="/venues"
                aria-current={isActive("venues") ? "page" : undefined}
                className={bottomItemClass}
                style={{ color: isActive("venues") ? navActiveFg : navMuted }}
              >
                <BottomItemContent icon={<MapPin className="h-5 w-5" />} label="Venues" />
              </Link>
            )}
          </li>

          <li className="h-full min-w-0">
            <Link
              to="/leaderboard"
              aria-current={isActive("leaderboard") ? "page" : undefined}
              className={bottomItemClass}
              style={{ color: isActive("leaderboard") ? navActiveFg : navMuted }}
            >
              <BottomItemContent icon={<Trophy className="h-5 w-5" />} label="Leaders" />
            </Link>
          </li>

          <li className="h-full min-w-0">
            <Link
              to="/offers"
              aria-current={isActive("offers") ? "page" : undefined}
              className={bottomItemClass}
              style={{ color: isActive("offers") ? navActiveFg : navMuted }}
            >
              <BottomItemContent icon={<Tag className="h-5 w-5" />} label="Offers" />
            </Link>
          </li>

          <li className="h-full min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="More"
              className={bottomItemClass}
              style={{ color: menuOpen ? navActiveFg : navMuted }}
            >
              <BottomItemContent icon={<MoreHorizontal className="h-5 w-5" />} label="More" />
            </button>
          </li>
        </ul>
      </nav>

      {/* Bottom-nav clearance: only on mobile while this nav is mounted */}
      <style>{`
        @media (max-width: 767px) {
          body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
        }
      `}</style>
    </>
  );
}

/**
 * Shared classes for every bottom-nav item (links and the More button alike).
 * One fixed-height column: 24px icon row + 16px label row, identical padding,
 * no margins/transforms, colour is the only thing that changes when active.
 */
const bottomItemClass =
  "flex h-full w-full appearance-none flex-col items-center justify-center border-0 bg-transparent p-0 m-0 font-semibold uppercase tracking-[0.12em] transition-colors";

function BottomItemContent({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <>
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      <span className="h-4 text-[10px] leading-4 whitespace-nowrap">{label}</span>
    </>
  );
}


function MenuDrawer({
  onClose,
  navBg,
  navFg,
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
  navBg: string;
  navFg: string;
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
          background: navBg,
          color: navFg,
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
                    <Stamp className="h-5 w-5 opacity-80" />
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
                  Prizes
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
