import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { Stamp, Map as MapIcon, Wine, Gift, MoreHorizontal } from "lucide-react";

type NavKey = "passport" | "map" | "wineries" | "rewards" | "more";

export function TrailShell({
  children,
  eventName,
  monogram,
  primaryColor = "#1F3D2B",
  accentColor = "#B5572A",
  showBottomNav = false,
  activeNav,
  topRight,
  topLeft,
  contentClassName = "",
}: {
  children: ReactNode;
  eventName?: string;
  monogram?: string;
  primaryColor?: string;
  accentColor?: string;
  showBottomNav?: boolean;
  activeNav?: NavKey;
  topRight?: ReactNode;
  topLeft?: ReactNode;
  contentClassName?: string;
}) {
  const initials = (monogram ?? eventName ?? "EP")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-trail-cream text-[#2A2620]">
      <header className="sticky top-0 z-40 border-b border-[#E6DCC7] bg-[#F6EFE2]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {topLeft ?? (
              <Link to="/demo" className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold tracking-wider text-[#F6EFE2]"
                  style={{ backgroundColor: primaryColor }}
                >
                  {initials}
                </div>
                <span className="font-trail-serif text-base font-semibold" style={{ color: primaryColor }}>
                  {eventName ?? "GetStampd"}
                </span>
              </Link>
            )}
          </div>
          {topRight}
        </div>
      </header>
      <main className={`mx-auto max-w-md px-4 pt-5 ${showBottomNav ? "pb-28" : "pb-12"} ${contentClassName}`}>
        {children}
      </main>
      {showBottomNav && (
        <BottomNav primaryColor={primaryColor} accentColor={accentColor} active={activeNav ?? "passport"} />
      )}
    </div>
  );
}

function BottomNav({
  primaryColor,
  accentColor,
  active,
}: {
  primaryColor: string;
  accentColor: string;
  active: NavKey;
}) {
  const items: { key: NavKey; label: string; icon: typeof Stamp; to: string }[] = [
    { key: "passport", label: "Passport", icon: Stamp, to: "/demo/passport" },
    { key: "map", label: "Trail Map", icon: MapIcon, to: "/demo/passport" },
    { key: "wineries", label: "Wineries", icon: Wine, to: "/demo/passport" },
    { key: "rewards", label: "Rewards", icon: Gift, to: "/demo/passport" },
    { key: "more", label: "More", icon: MoreHorizontal, to: "/demo/passport" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E6DCC7] bg-[#F6EFE2]/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        {items.map((it) => {
          const isActive = it.key === active;
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              to={it.to}
              className="flex flex-col items-center gap-1 py-1 text-[10px] font-medium"
              style={{ color: isActive ? primaryColor : "#7A6F5C" }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full transition"
                style={{
                  backgroundColor: isActive ? `${primaryColor}14` : "transparent",
                  color: isActive ? primaryColor : "#7A6F5C",
                  boxShadow: isActive ? `inset 0 0 0 1px ${accentColor}33` : undefined,
                }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="tracking-wide">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
