import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { usePublicStyleTarget } from "@/components/public-style-scope";

/** Compact promo card that links to the Prizes page with the Bonus Points tab open. */
export function BonusPointsPromo({ subdomain }: { subdomain?: string | null }) {
  const surfaceStyle = usePublicStyleTarget("home.bonusPromo.surface", { selectable: true });
  const iconStyle = usePublicStyleTarget("home.bonusPromo.icon", { selectable: true });
  const headingStyle = usePublicStyleTarget("home.bonusPromo.heading", { selectable: true });
  const bodyStyle = usePublicStyleTarget("home.bonusPromo.body", { selectable: true });
  const AnyLink = Link as unknown as React.ComponentType<Record<string, unknown>>;
  const linkProps: Record<string, unknown> = subdomain
    ? {
        to: "/live/$subdomain/prizes",
        params: { subdomain },
        search: { tab: "bonus" },
      }
    : { to: "/prizes", search: { tab: "bonus" } };

  return (
    <AnyLink
      {...linkProps}
      {...surfaceStyle}
      style={surfaceStyle.style}
      className="group flex items-center gap-3 rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-gradient-to-br from-[var(--event-primary,#1F3D2B)] to-[var(--event-primary,#1F3D2B)]/85 px-4 py-3 text-[var(--event-primary-fg,#FFF)] shadow-sm transition-transform hover:-translate-y-0.5"
    >
      <span {...iconStyle} style={iconStyle.style} aria-hidden className="text-2xl leading-none">⭐</span>
      <div className="min-w-0 flex-1">
        <h3 {...headingStyle} style={headingStyle.style} className="text-sm font-bold leading-tight sm:text-base">Bonus points available!</h3>
        <p {...bodyStyle} style={bodyStyle.style} className="text-[12px] opacity-90 sm:text-xs">
          Scan special bonus QR codes at venues to earn extra points.
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
        More <ArrowRight className="h-3 w-3" />
      </span>
    </AnyLink>
  );
}
