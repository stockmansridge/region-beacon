import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Stamp, Lock, RotateCcw } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import {
  DEMO_EVENT,
  DEMO_VENUES,
  DEMO_AWARDS,
  useDemoPassport,
} from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/passport")({
  head: () => ({ meta: [{ title: `My passport — ${DEMO_EVENT.name} demo` }] }),
  component: DemoPassport,
});

function DemoPassport() {
  const passport = useDemoPassport();
  const total = DEMO_VENUES.length;
  const visited = passport.visited;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
  const ringSize = 132;
  const ringStroke = 10;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (pct / 100) * ringCirc;

  return (
    <DemoShell activeNav="passport">
      <main className="pb-20">
        {/* Progress hero */}
        <section
          className="rounded-3xl border p-6 text-center shadow-sm"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-[0.28em]"
            style={{ color: "var(--event-accent)" }}
          >
            Your Passport
          </div>
          <h1
            className="mt-1 text-2xl font-semibold"
            style={{ color: "var(--event-card-heading)" }}
          >
            {DEMO_EVENT.name}
          </h1>

          <div className="relative mx-auto mt-5" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} aria-hidden>
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="var(--event-card-border)"
                strokeWidth={ringStroke}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="var(--event-accent)"
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={`${ringDash} ${ringCirc}`}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-semibold" style={{ color: "var(--event-card-heading)" }}>
                {visited}
                <span className="text-base" style={{ color: "var(--event-card-muted)" }}>
                  /{total}
                </span>
              </div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "var(--event-card-muted)" }}
              >
                Stamps
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm" style={{ color: "var(--event-text)" }}>
            {visited === 0
              ? "Scan the QR at any winery to earn your first stamp."
              : visited >= total
                ? "Trail complete — you've collected every stamp!"
                : `${total - visited} stops to go until the trail is complete.`}
          </p>
          <div className="mt-2 text-sm font-semibold" style={{ color: "var(--event-primary)" }}>
            {passport.points} points earned
          </div>
        </section>

        {/* Rewards */}
        <section className="mt-5">
          <SectionTitle>Prizes</SectionTitle>
          <div className="mt-2 space-y-2">
            {DEMO_AWARDS.map((r) => {
              const unlocked = passport.points >= r.points_required;
              return (
                <div
                  key={r.award_id}
                  className="flex items-center gap-3 rounded-2xl border p-3"
                  style={{
                    borderColor: "var(--event-card-border)",
                    backgroundColor: "var(--event-card-bg)",
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: unlocked
                        ? "color-mix(in srgb, var(--event-accent) 20%, transparent)"
                        : "color-mix(in srgb, var(--event-card-border) 60%, transparent)",
                      color: unlocked ? "var(--event-accent)" : "var(--event-card-muted)",
                    }}
                  >
                    {r.points_required}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: "var(--event-card-heading)" }}>
                      {r.title}
                    </div>
                    <div
                      className="text-[11px] uppercase tracking-[0.18em]"
                      style={{ color: "var(--event-card-muted)" }}
                    >
                      {unlocked ? "Unlocked" : `At ${r.points_required} pts`}
                    </div>
                  </div>
                  {unlocked ? (
                    <Check className="h-4 w-4" style={{ color: "var(--event-primary)" }} />
                  ) : (
                    <Lock className="h-4 w-4" style={{ color: "var(--event-card-muted)" }} />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Stops */}
        <section className="mt-6">
          <SectionTitle>Stops</SectionTitle>
          <ul className="mt-2 space-y-2">
            {DEMO_VENUES.map((v, i) => {
              const done = passport.hasStamp(v.venue_id);
              return (
                <li key={v.venue_id}>
                  <Link
                    to="/demo/wineries/$venueId"
                    params={{ venueId: v.venue_id }}
                    className="flex items-center gap-3 rounded-2xl border p-3 transition hover:shadow-sm"
                    style={{
                      borderColor: "var(--event-card-border)",
                      backgroundColor: "var(--event-card-bg)",
                    }}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: done
                          ? "var(--event-primary)"
                          : "color-mix(in srgb, var(--event-card-border) 60%, transparent)",
                        color: done ? "var(--event-accent)" : "var(--event-card-muted)",
                      }}
                    >
                      {done ? (
                        <Stamp className="h-4 w-4" />
                      ) : (
                        <span className="text-[11px] font-semibold">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: "var(--event-card-heading)" }}
                      >
                        {v.name}
                      </div>
                      <div
                        className="text-[11px] uppercase tracking-[0.18em]"
                        style={{ color: "var(--event-card-muted)" }}
                      >
                        {done ? "Stamped" : "Scan QR at venue"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Reset demo */}
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => passport.reset()}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{
              borderColor: "var(--event-card-border)",
              color: "var(--event-muted)",
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset demo
          </button>
        </div>
      </main>
    </DemoShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1" style={{ backgroundColor: "var(--event-card-border)" }} />
      <h2
        className="text-sm font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--event-primary)" }}
      >
        {children}
      </h2>
      <div className="h-px flex-1" style={{ backgroundColor: "var(--event-card-border)" }} />
    </div>
  );
}
