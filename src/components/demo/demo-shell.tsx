import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { DEMO_EVENT, useDemoPassport } from "@/lib/demo-cargo-road";
import { DemoEventNav } from "./demo-event-nav";
import { getEventAssetPublicUrl } from "@/lib/event-assets";

/**
 * Persistent bar shown at the very top of every /demo/* page.
 * - Left: link back to the GetStampd promotional/marketing home.
 * - Right: short "This is a demo" info note.
 */
export function DemoTopBar() {
  return (
    <div className="sticky top-0 z-50 w-full border-b border-black/10 bg-neutral-900 text-white">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-3 py-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to GetStampd
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          <Info className="h-3.5 w-3.5" />
          You're viewing a demo
        </span>
      </div>
    </div>
  );
}

/**
 * Shared shell for every /demo/* route. Sets up the palette, renders the
 * top header + bottom nav, and shows the "Demo mode" banner. Individual
 * routes only render their page-specific body inside.
 */
export function DemoShell({
  children,
  activeNav,
  transparentHeader = false,
  showBanner = true,
}: {
  children: ReactNode;
  activeNav?:
    | "home"
    | "passport"
    | "map"
    | "venues"
    | "offers"
    | "leaderboard"
    | "more"
    | "rewards";
  transparentHeader?: boolean;
  showBanner?: boolean;
}) {
  const passport = useDemoPassport();
  const logoUrl = getEventAssetPublicUrl(DEMO_EVENT.logo_path);

  return (
    <EventPaletteScope
      paletteKey={null}
      backgroundKey={null}
      primaryColor={DEMO_EVENT.primary_color}
      accentColor={DEMO_EVENT.accent_color}
      pageBackgroundColor={null}
      cardBackgroundColor={null}
      textColor={null}
      mutedTextColor={null}
      cardTextColor={null}
      cardMutedTextColor={null}
      borderColor={null}
      primaryTextColor={null}
      navBackgroundColor={null}
      brandKitKey={null}
      linkColor={null}
      cardBorderColor={null}
      buttonPrimaryBg={null}
      buttonPrimaryFg={null}
      buttonSecondaryBg={null}
      buttonSecondaryFg={null}
      navFgColor={null}
      navMutedColor={null}
      navActiveFgColor={null}
      heroBgColor={null}
      heroFgColor={null}
      heroAccentColor={null}
      fontFamily={DEMO_EVENT.font_family}
      headingFontFamily={null}
      className="min-h-screen"
    >
      {transparentHeader ? (
        <div className="relative">
          <DemoTopBar />
          <div className="absolute inset-x-0 top-[40px] z-40 px-4">
            <DemoEventNav
              eventName={DEMO_EVENT.name}
              primaryColor={DEMO_EVENT.primary_color}
              accentColor={DEMO_EVENT.accent_color}
              logoUrl={logoUrl}
              hasPassport={passport.registered}
              activeOverride={activeNav}
              transparentHeader
            />
          </div>
          {children}
        </div>
      ) : (
        <>
          <DemoTopBar />
          <div className="mx-auto w-full max-w-md px-4">
            <DemoEventNav
              eventName={DEMO_EVENT.name}
              primaryColor={DEMO_EVENT.primary_color}
              accentColor={DEMO_EVENT.accent_color}
              logoUrl={logoUrl}
              hasPassport={passport.registered}
              activeOverride={activeNav}
            />
            {showBanner && <DemoBanner />}
            {children}
          </div>
        </>
      )}
    </EventPaletteScope>
  );
}

export function DemoBanner() {
  return (
    <div
      className="mb-4 rounded-2xl border border-dashed px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.2em]"
      style={{
        borderColor: "color-mix(in srgb, var(--event-accent,#B5572A) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--event-accent,#B5572A) 8%, transparent)",
        color: "var(--event-accent,#B5572A)",
      }}
    >
      Demo mode · nothing is saved to the real event
    </div>
  );
}
