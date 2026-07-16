import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Lock, Trophy } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_AWARDS, DEMO_EVENT, useDemoPassport } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/rewards")({
  head: () => ({ meta: [{ title: `Prizes — ${DEMO_EVENT.name} demo` }] }),
  component: DemoRewards,
});

function DemoRewards() {
  const passport = useDemoPassport();
  const points = passport.points;
  const nextAward = DEMO_AWARDS.find((a) => a.points_required > points) ?? null;

  return (
    <DemoShell activeNav="rewards">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Prizes
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Collect stamps and points to unlock prize-draw entries.
        </p>

        {/* Progress banner */}
        <section
          className="mt-4 rounded-2xl border p-4"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--event-accent) 18%, transparent)",
                color: "var(--event-accent)",
              }}
            >
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--event-muted)" }}>
                Your points
              </div>
              <div className="text-2xl font-semibold" style={{ color: "var(--event-card-heading)" }}>
                {points}
              </div>
            </div>
            {nextAward ? (
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--event-muted)" }}>
                  Next prize
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--event-primary)" }}>
                  {nextAward.points_required - points} pts to go
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <ul className="mt-5 space-y-3">
          {DEMO_AWARDS.map((a) => {
            const unlocked = points >= a.points_required;
            return (
              <li
                key={a.award_id}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: "var(--event-card-border)",
                  backgroundColor: "var(--event-card-bg)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: unlocked
                        ? "color-mix(in srgb, var(--event-accent) 20%, transparent)"
                        : "color-mix(in srgb, var(--event-card-border) 60%, transparent)",
                      color: unlocked ? "var(--event-accent)" : "var(--event-card-muted)",
                    }}
                  >
                    {a.points_required}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold" style={{ color: "var(--event-card-heading)" }}>
                        {a.title}
                      </div>
                      {unlocked ? (
                        <Check className="h-4 w-4" style={{ color: "var(--event-primary)" }} />
                      ) : (
                        <Lock className="h-4 w-4" style={{ color: "var(--event-card-muted)" }} />
                      )}
                    </div>
                    <p className="mt-1 text-sm" style={{ color: "var(--event-card-text)" }}>
                      {a.description}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 text-center">
          <Link
            to="/demo/wineries"
            className="inline-flex rounded-full px-5 py-3 text-sm font-semibold shadow"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            Collect more stamps
          </Link>
        </div>
      </main>
    </DemoShell>
  );
}
