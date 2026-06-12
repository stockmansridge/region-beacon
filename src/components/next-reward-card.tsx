import { Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { usePassportHomeData, pickNextReward } from "@/lib/use-passport-home-data";

/**
 * Surfaces the next configured award the visitor is working toward.
 * Hidden entirely when no awards are configured — never shows synthetic
 * Bronze/Silver/Gold tiers.
 */
export function NextRewardCard({ eventId }: { eventId: string | null }) {
  const data = usePassportHomeData(eventId);
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
      <Link
        to="/awards"
        className="block rounded-3xl border p-4 shadow-sm transition hover:shadow-md"
        style={{
          borderColor: "var(--event-card-border)",
          backgroundColor: "var(--event-card-bg)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{
              backgroundColor: "var(--event-hero-accent, var(--event-accent))",
              color:
                "var(--event-button-primary-fg, var(--event-primary-fg))",
            }}
          >
            <Gift className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "var(--event-card-muted)" }}
            >
              Next reward
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
            className="h-2 w-full overflow-hidden rounded-full"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--event-card-border) 80%, transparent)",
            }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor:
                  "var(--event-hero-accent, var(--event-accent))",
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
      </Link>
    </section>
  );
}
