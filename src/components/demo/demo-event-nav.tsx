import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import {
  Stamp,
  Trophy,
  Map as MapIcon,
  Menu,
  Home,
  X,
  Tag,
  HelpCircle,
  Award,
  MoreHorizontal,
  MapPin,
  Ticket,
  Share2,
} from "lucide-react";

type ActiveTarget =
  | "home"
  | "passport"
  | "map"
  | "venues"
  | "offers"
  | "leaderboard"
  | "more"
  | "rewards";

/**
 * Demo-only clone of PublicEventNav that links to /demo/* routes.
 * Visually identical; no supabase calls, no useCurrentEventPassport, no FAQ.
 */
export function DemoEventNav({
  eventName,
  primaryColor,
  accentColor,
  logoUrl,
  hasPassport,
  activeOverride,
  transparentHeader = false,
}: {
  eventName: string;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  hasPassport: boolean;
  activeOverride?: ActiveTarget;
  transparentHeader?: boolean;
}) {
  const navBg = `var(--event-nav-bg, ${primaryColor ?? "var(--event-primary,#1F3D2B)"})`;
  const navFg = `var(--event-nav-fg, var(--event-primary-fg,#F6EFE2))`;
  const navMuted = `var(--event-nav-muted, color-mix(in srgb, #F6EFE2 72%, transparent))`;
  const navActiveFg = `var(--event-nav-active-fg, ${accentColor ?? "var(--event-accent,#B5572A)"})`;

  const location = useLocation();
  const pathname = location.pathname;
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (target: ActiveTarget) => {
    if (activeOverride) return target === activeOverride;
    if (target === "home") return pathname === "/demo" || pathname === "/demo/";
    if (target === "passport")
      return pathname === "/demo/join" || pathname === "/demo/passport";
    if (target === "map") return pathname === "/demo/trail-map";
    if (target === "venues")
      return pathname === "/demo/wineries" || pathname.startsWith("/demo/wineries/");
    if (target === "offers") return pathname === "/demo/offers";
    if (target === "rewards") return pathname === "/demo/rewards";
    return false;
  };

  const passportLabel = hasPassport ? "View passport" : "Start passport";
  const passportTo = hasPassport ? "/demo/passport" : "/demo/join";

  return (
    <>
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/demo"
            aria-label={eventName}
            className="mx-auto flex h-10 max-w-[70%] items-center justify-center"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={eventName}
                className="max-h-9 w-auto max-w-full object-contain"
              />
            ) : (
              <span
                className="truncate text-center text-[14px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: navFg }}
              >
                {eventName}
              </span>
            )}
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Share (demo)"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
              onClick={() => {
                if (typeof window === "undefined") return;
                const url = window.location.href;
                if (typeof navigator !== "undefined" && "share" in navigator) {
                  navigator.share({ title: eventName, url }).catch(() => undefined);
                } else if (navigator?.clipboard) {
                  navigator.clipboard.writeText(url).catch(() => undefined);
                }
              }}
            >
              <Share2 className="h-5 w-5" />
            </button>
            <Link
              to={passportTo}
              aria-label={passportLabel}
              title={passportLabel}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:bg-white/15"
            >
              <Stamp className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {menuOpen && (
        <DemoMenuDrawer
          onClose={() => setMenuOpen(false)}
          navBg={navBg}
          navFg={navFg}
          eventName={eventName}
          logoUrl={logoUrl ?? null}
          hasPassport={hasPassport}
        />
      )}

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
          <BottomLink
            to={passportTo}
            label="Passport"
            icon={<Stamp className="h-5 w-5" />}
            active={isActive("passport")}
            navActiveFg={navActiveFg}
            navMuted={navMuted}
          />
          <BottomLink
            to="/demo/trail-map"
            label="Map"
            icon={<MapIcon className="h-5 w-5" />}
            active={isActive("map")}
            navActiveFg={navActiveFg}
            navMuted={navMuted}
          />
          <BottomLink
            to="/demo/rewards"
            label="Prizes"
            icon={<Trophy className="h-5 w-5" />}
            active={isActive("rewards")}
            navActiveFg={navActiveFg}
            navMuted={navMuted}
          />
          <BottomLink
            to="/demo/offers"
            label="Offers"
            icon={<Tag className="h-5 w-5" />}
            active={isActive("offers")}
            navActiveFg={navActiveFg}
            navMuted={navMuted}
          />
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

      <style>{`
        @media (max-width: 767px) {
          body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
        }
      `}</style>
    </>
  );
}

const bottomItemClass =
  "flex h-full w-full appearance-none flex-col items-center justify-center border-0 bg-transparent p-0 m-0 font-semibold uppercase tracking-[0.12em] transition-colors";

function BottomItemContent({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <>
      <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      <span className="h-4 text-[10px] leading-4 whitespace-nowrap">{label}</span>
    </>
  );
}

function BottomLink({
  to,
  label,
  icon,
  active,
  navActiveFg,
  navMuted,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  navActiveFg: string;
  navMuted: string;
}) {
  return (
    <li className="h-full min-w-0">
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className={bottomItemClass}
        style={{ color: active ? navActiveFg : navMuted }}
      >
        <BottomItemContent icon={icon} label={label} />
      </Link>
    </li>
  );
}

function DemoMenuDrawer({
  onClose,
  navBg,
  navFg,
  eventName,
  logoUrl,
  hasPassport,
}: {
  onClose: () => void;
  navBg: string;
  navFg: string;
  eventName: string;
  logoUrl: string | null;
  hasPassport: boolean;
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
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <span className="truncate text-[13px] font-semibold uppercase tracking-[0.22em]">
                {eventName}
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
              <Link to="/demo" onClick={onClose} className={rowClass}>
                <Home className="h-5 w-5 opacity-80" /> Home
              </Link>
            </li>
            <li>
              <Link
                to={hasPassport ? "/demo/passport" : "/demo/join"}
                onClick={onClose}
                className={rowClass}
              >
                {hasPassport ? (
                  <Stamp className="h-5 w-5 opacity-80" />
                ) : (
                  <Ticket className="h-5 w-5 opacity-80" />
                )}
                {hasPassport ? "View passport" : "Start passport"}
              </Link>
            </li>
            <li>
              <Link to="/demo/wineries" onClick={onClose} className={rowClass}>
                <MapPin className="h-5 w-5 opacity-80" /> Wineries
              </Link>
            </li>
            <li>
              <Link to="/demo/offers" onClick={onClose} className={rowClass}>
                <Tag className="h-5 w-5 opacity-80" /> Offers
              </Link>
            </li>
            <li>
              <Link to="/demo/trail-map" onClick={onClose} className={rowClass}>
                <MapIcon className="h-5 w-5 opacity-80" /> Trail Map
              </Link>
            </li>
            <li>
              <Link to="/demo/rewards" onClick={onClose} className={rowClass}>
                <Award className="h-5 w-5 opacity-80" /> Prizes
              </Link>
            </li>
            <li>
              <Link to="/demo/more" onClick={onClose} className={rowClass}>
                <HelpCircle className="h-5 w-5 opacity-80" /> FAQ &amp; More
              </Link>
            </li>
          </ul>
        </nav>
      </aside>
    </div>
  );
}
