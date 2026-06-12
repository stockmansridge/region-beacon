import { MapPin, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePassportHomeData, pickNextReward } from "@/lib/use-passport-home-data";

/**
 * Large app-style progress summary card. Shows visitor's current passport
 * progress (visited / total venues), points earned, and a hint toward the
 * next configured reward.
 *
 * Container-style component: fetches its own data from
 * `usePassportHomeData`, which is module-cached so multiple consumers on
 * the same page (this card + stamp grid + next-reward card) share a
 * single load.
 */
export function PassportProgressCard({
  eventId,
  venueLabelPlural = "venues",
  canRegister = true,
}: {
  eventId: string | null;
  venueLabelPlural?: string;
  canRegister?: boolean;
}) {
  const data = usePassportHomeData(eventId);

  if (data.loading) return null;

  if (!data.hasPassport) {
    if (!canRegister) return null;
    return (
      <section className="px-4">
        <div
          className="flex items-center justify-between gap-3 rounded-3xl border bg-[var(--event-card-bg,#FBF5E8)] p-4 shadow-sm"
          style={{ borderColor: "var(--event-border,#E6DCC7)" }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              Your passport
            </p>
            <p className="mt-1 text-[14px] font-medium text-[var(--event-card-fg,var(--event-text,#3D372C))]">
              Start collecting stamps at participating {venueLabelPlural.toLowerCase()}.
            </p>
          </div>
          <Link
            to="/join"
            className="shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em]"
            style={{
              backgroundColor: "var(--event-primary,#1F3D2B)",
              color: "var(--event-primary-fg,#F6EFE2)",
            }}
          >
            Start
          </Link>
        </div>
      </section>
    );
  }

  const { visited, total, points, awards, passportHref } = data;
  const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
  const href = passportHref ?? "/passport";
  const next = pickNextReward(awards);
  const nextRewardLabel = next?.title ?? null;
  const nextRewardRemaining = next ? Math.max(0, next.points_remaining) : null;

  return (
    <section className="px-4">
      <a
        href={href}
        className="block rounded-3xl border bg-[var(--event-card-bg,#FBF5E8)] p-5 shadow-sm transition hover:shadow-md"
        style={{ borderColor: "var(--event-border,#E6DCC7)" }}
      >
        <div className="flex items-center gap-5">
          <ProgressRing pct={pct} visited={visited} total={total} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              Progress
            </p>
            <p
              className="mt-0.5 text-[17px] font-semibold leading-tight text-[var(--event-card-fg,var(--event-text,#1F3D2B))]"
              style={{ fontFamily: "var(--event-font)" }}
            >
              {visited} / {total} {venueLabelPlural.toLowerCase()} visited
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              {points !== null && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-semibold text-[var(--event-card-fg,var(--event-text,#1F3D2B))]">
                    {points}
                  </span>{" "}
                  points earned
                </span>
              )}
              {nextRewardLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {nextRewardRemaining && nextRewardRemaining > 0
                    ? `${nextRewardRemaining} pts to ${nextRewardLabel}`
                    : `Next: ${nextRewardLabel}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>
    </section>
  );
}

function ProgressRing({
  pct,
  visited,
  total,
}: {
  pct: number;
  visited: number;
  total: number;
}) {
  const size = 84;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke="var(--event-border,#E6DCC7)"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke="var(--event-accent,#B5572A)"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="46%"
        dominantBaseline="central"
        textAnchor="middle"
        style={{
          fontSize: 22,
          fontWeight: 700,
          fill: "var(--event-card-fg, var(--event-text,#1F3D2B))",
        }}
      >
        {visited}
      </text>
      <text
        x="50%"
        y="68%"
        dominantBaseline="central"
        textAnchor="middle"
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 1.5,
          fill: "var(--event-card-muted, var(--event-muted,#8A7E66))",
        }}
      >
        of {Math.max(0, total | 0)}
      </text>
    </svg>
  );
}
