import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";
import { loadPassportStampState } from "@/lib/passport-stamps";

/**
 * Compact, app-like progress summary card. Shows visited / total venues
 * for the current passport on this event, or a CTA to start a passport.
 *
 * Uses central event theme variables so it inherits the event's branding.
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
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "no_passport" }
    | { kind: "ready"; visited: number; total: number; href: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!eventId) {
      setState({ kind: "no_passport" });
      return;
    }
    (async () => {
      const passport = await resolveCurrentEventPassport(eventId);
      if (cancelled) return;
      if (!passport.token) {
        setState({ kind: "no_passport" });
        return;
      }
      const stamps = await loadPassportStampState(passport.token);
      if (cancelled) return;
      setState({
        kind: "ready",
        visited: stamps.visitedCount,
        total: stamps.totalVenueCount || stamps.allVenues.length,
        href: passport.passportHref ?? `/passport/${passport.token}`,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (state.kind === "loading") return null;

  if (state.kind === "no_passport") {
    if (!canRegister) return null;
    return (
      <div className="mx-auto mt-4 flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-muted,#8A7E66)]">
            Your passport
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--event-body,#3D372C)]">
            Start collecting stamps at participating {venueLabelPlural.toLowerCase()}.
          </p>
        </div>
        <Link
          to="/join"
          className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--event-primary-fg,#F6EFE2)]"
          style={{ backgroundColor: "var(--event-primary,#1F3D2B)" }}
        >
          Start
        </Link>
      </div>
    );
  }

  const { visited, total, href } = state;
  const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;

  return (
    <a
      href={href}
      className="mx-auto mt-4 flex max-w-md items-center gap-3 rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-4 py-3 shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/40 hover:shadow-md"
    >
      <ProgressRing pct={pct} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-muted,#8A7E66)]">
          Trail progress
        </p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-[var(--event-primary,#1F3D2B)]">
          {visited} of {total} {venueLabelPlural.toLowerCase()} visited
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-[var(--event-primary,#1F3D2B)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--event-primary-fg,#F6EFE2)]"
      >
        Passport →
      </span>
    </a>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 44;
  const stroke = 4;
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
        className="text-[var(--event-border,#E6DCC7)]"
        stroke="currentColor"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke="var(--event-primary,#1F3D2B)"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-[var(--event-primary,#1F3D2B)]"
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {pct}%
      </text>
    </svg>
  );
}
