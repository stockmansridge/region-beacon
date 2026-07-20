import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";

/** Promo card that links to the Prizes page with the Bonus Points tab open. */
export function BonusPointsPromo({ subdomain }: { subdomain?: string | null }) {
  // Cast Link to a permissive component to avoid TanStack's strict typed-route
  // inference here (we conditionally target /prizes or /live/$subdomain/prizes).
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
      className="group block overflow-hidden rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-gradient-to-br from-[var(--event-primary,#1F3D2B)] to-[var(--event-primary,#1F3D2B)]/85 p-5 text-[var(--event-primary-fg,#FFF)] shadow-md transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--event-accent,#C7A96B)] text-[var(--event-primary,#1F3D2B)]">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">
            Bonus Points
          </div>
          <h3 className="mt-0.5 text-lg font-bold leading-tight">Bonus points available!</h3>
          <p className="mt-1 text-sm opacity-90">
            Scan special bonus QR codes at venues to earn extra points fast.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] sm:inline-flex">
          How it works <ArrowRight className="h-3 w-3" />
        </div>
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] sm:hidden">
        How it works <ArrowRight className="h-3 w-3" />
      </div>
    </AnyLink>
  );
}
