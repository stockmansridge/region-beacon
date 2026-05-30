import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

/**
 * Mobile-first public navigation rendered on every /live/$subdomain/* page.
 *
 * Desktop (md+): inline horizontal nav.
 * Mobile: hamburger button that opens a full-screen slide-down sheet.
 *
 * Links use TanStack typed routes so they survive the route-restructure and
 * keep navigation tenant-aware. Inbound pretty URLs (/join, /venues, ...)
 * are rewritten by HostRouter before these routes mount, so the canonical
 * /live/$subdomain/... links here are correct.
 */
export function PublicEventNav({
  subdomain,
  eventName,
  primaryColor,
  accentColor,
  hasTerms = true,
  hasPrivacy = true,
  canRegister = true,
}: {
  subdomain: string;
  eventName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  hasTerms?: boolean;
  hasPrivacy?: boolean;
  canRegister?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const primary = primaryColor ?? "#1F3D2B";
  const accent = accentColor ?? "#B5572A";

  const items: Array<{ label: string; to: string; show: boolean }> = [
    { label: "Home", to: "home", show: true },
    { label: "Start passport", to: "join", show: canRegister },
    { label: "Venues", to: "venues", show: true },
    { label: "Leaderboard", to: "leaderboard", show: true },
    { label: "Terms", to: "terms", show: hasTerms },
    { label: "Privacy", to: "privacy", show: hasPrivacy },
  ];

  function renderLink(item: { label: string; to: string }, onClick?: () => void) {
    const common = {
      params: { subdomain },
      onClick,
      className:
        "text-sm font-medium uppercase tracking-[0.18em] transition-opacity hover:opacity-70",
      style: { color: primary },
    } as const;
    switch (item.to) {
      case "home":
        return <Link to="/live/$subdomain" {...common}>{item.label}</Link>;
      case "join":
        return <Link to="/live/$subdomain/join" {...common}>{item.label}</Link>;
      case "venues":
        return <Link to="/live/$subdomain/venues" {...common}>{item.label}</Link>;
      case "leaderboard":
        return <Link to="/live/$subdomain/leaderboard" {...common}>{item.label}</Link>;
      case "terms":
        return <Link to="/live/$subdomain/terms" {...common}>{item.label}</Link>;
      case "privacy":
        return <Link to="/live/$subdomain/privacy" {...common}>{item.label}</Link>;
      default:
        return null;
    }
  }

  return (
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

      {/* Desktop links */}
      <div className="hidden items-center gap-5 md:flex">
        {items.filter((i) => i.show).map((i) => (
          <span key={i.to}>{renderLink(i)}</span>
        ))}
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border md:hidden"
        style={{ borderColor: `${primary}33`, color: primary }}
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile sheet */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 top-0 flex h-full w-[80%] max-w-xs flex-col gap-1 bg-[#FBF5E8] p-5 shadow-2xl"
            style={{ borderLeft: `1px solid ${primary}22` }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span
                className="text-xs font-semibold uppercase tracking-[0.22em]"
                style={{ color: accent }}
              >
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: `${primary}33`, color: primary }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {items.filter((i) => i.show).map((i) => (
                <span key={i.to} className="border-b border-[#E6DCC7] pb-3">
                  {renderLink(i, () => setOpen(false))}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
