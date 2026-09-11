import { createFileRoute } from "@tanstack/react-router";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, DEMO_LEADERBOARD, useDemoPassport } from "@/lib/demo-event";

export const Route = createFileRoute("/demo/leaderboard")({
  head: () => ({
    meta: [
      { title: `Leaderboard — ${DEMO_EVENT.name} demo` },
      {
        name: "description",
        content:
          "Sample leaderboard from the Orange Wine Quest demo passport — see how visitors rank by points and stamps.",
      },
      { property: "og:title", content: `Leaderboard — ${DEMO_EVENT.name} demo` },
      {
        property: "og:description",
        content: "A sample points leaderboard from the GetStampd demo passport.",
      },
    ],
  }),
  component: DemoLeaderboard,
});

function DemoLeaderboard() {
  const passport = useDemoPassport();

  return (
    <DemoShell activeNav="leaderboard">
      <main className="pb-24">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Leaderboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Sample standings — ranked by total points.
        </p>

        <ol
          className="mt-4 overflow-hidden rounded-2xl border"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          {DEMO_LEADERBOARD.map((row) => (
            <li
              key={row.rank}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              style={{ borderColor: "var(--event-card-border)" }}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--event-primary) 14%, transparent)",
                  color: "var(--event-primary)",
                }}
              >
                {row.rank}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold"
                style={{ color: "var(--event-card-heading)" }}
              >
                {row.display_name}
              </span>
              <span className="text-right text-xs" style={{ color: "var(--event-card-muted)" }}>
                {row.stamps} stamps
              </span>
              <span
                className="w-16 text-right text-sm font-bold"
                style={{ color: "var(--event-card-heading)" }}
              >
                {row.points} pts
              </span>
            </li>
          ))}
          {passport.registered && (
            <li
              className="flex items-center gap-3 px-4 py-3"
              style={{
                backgroundColor: "color-mix(in srgb, var(--event-accent) 10%, transparent)",
              }}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--event-accent) 20%, transparent)",
                  color: "var(--event-accent)",
                }}
              >
                —
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold"
                style={{ color: "var(--event-card-heading)" }}
              >
                {passport.firstName ?? "You"} (you)
              </span>
              <span className="text-right text-xs" style={{ color: "var(--event-card-muted)" }}>
                {passport.visited} stamps
              </span>
              <span
                className="w-16 text-right text-sm font-bold"
                style={{ color: "var(--event-card-heading)" }}
              >
                {passport.points} pts
              </span>
            </li>
          )}
        </ol>
      </main>
    </DemoShell>
  );
}
