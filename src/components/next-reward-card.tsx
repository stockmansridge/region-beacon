import { PublicLink } from "@/components/public-nav-context";

import { Gift } from "lucide-react";
import { usePassportHomeData, pickNextReward } from "@/lib/use-passport-home-data";
import type { PublicEventAward } from "@/lib/event-awards";
import { usePublicStyleTarget } from "@/components/public-style-scope";

/**
 * Surfaces the next configured award the visitor is working toward.
 * Hidden entirely when no awards are configured — never shows synthetic
 * Bronze/Silver/Gold tiers.
 */
export function NextRewardCard({
  eventId,
  previewAwards,
}: {
  eventId: string | null;
  /** Editor preview only: awards to show without loading a visitor passport. */
  previewAwards?: PublicEventAward[] | null;
}) {
  const cardStyle = usePublicStyleTarget("home.nextPrize.surface", { selectable: true });
  const iconStyle = usePublicStyleTarget("home.nextPrize.icon", { selectable: true });
  const headingStyle = usePublicStyleTarget("home.nextPrize.heading", { selectable: true });
  const progressStyle = usePublicStyleTarget("home.nextPrize.progress", { selectable: true });
  const live = usePassportHomeData(previewAwards ? null : eventId);
  const data = previewAwards
    ? { ...live, loading: false, hasPassport: true, awards: previewAwards }
    : live;
  if (data.loading) return null;
  const next = pickNextReward(data.awards) ?? data.awards[0];
  if (!next) return null;

  const required = Math.max(0, next.points_required);
  const have = Math.max(0, next.passport_points);
  const pct =
    required > 0 ? Math.min(100, Math.round((have / required) * 100)) : 100;
  const remaining = Math.max(0, next.points_remaining);

  return (
    <section className="px-4">
      <PublicLink
        {...cardStyle}
        to="/prizes"
        className="block rounded-3xl border p-4 shadow-sm transition hover:shadow-md"
        style={{ ...cardStyle.style,
          borderColor: "var(--event-card-border)",
          backgroundColor: "var(--event-card-bg)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            {...iconStyle}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ ...iconStyle.style,
              backgroundColor: "var(--item-icon-bg, var(--event-hero-accent, var(--event-accent)))",
              color: "var(--item-icon-color, var(--event-button-primary-fg, var(--event-primary-fg)))",
            }}
          >
            <Gift className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              {...headingStyle}
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "var(--event-card-muted)", ...headingStyle.style }}
            >
              Next prize
            </p>
            <p
              className="mt-0.5 truncate text-[15px] font-semibold"
              style={{ color: "var(--event-card-heading)" }}
            >
              {next.title}
            </p>
            {next.description && (
              <p
                className="mt-0.5 line-clamp-2 text-[12px]"
                style={{ color: "var(--event-card-muted)" }}
              >
                {next.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div
            {...progressStyle}
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ ...progressStyle.style,
              backgroundColor:
                "var(--item-progress-track, color-mix(in srgb, var(--event-card-border) 80%, transparent))",
            }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor:
                  "var(--item-progress-fill, var(--event-hero-accent, var(--event-accent)))",
              }}
            />
          </div>
          <div
            className="mt-1.5 flex items-center justify-between text-[11px] font-medium"
            style={{ color: "var(--event-card-muted)" }}
          >
            <span>
              {have} / {required} pts
            </span>
            <span>
              {data.hasPassport
                ? next.is_eligible
                  ? "Ready to claim"
                  : `${remaining} to go`
                : "Start your passport"}
            </span>
          </div>
          {next.requires_all_locations && !next.is_eligible && (
            <p
              className="mt-1 text-[10px] uppercase tracking-[0.18em]"
              style={{ color: "var(--event-card-muted)" }}
            >
              Requires all locations
            </p>
          )}
        </div>
      </PublicLink>
    </section>
  );
}
