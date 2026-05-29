import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderCard } from "@/components/placeholder";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics" }] }),
  component: Analytics,
});

function Analytics() {
  return (
    <>
      <PageHeader title="Analytics" description="Track engagement across events, venues and visitors." />
      <div className="grid gap-4 sm:grid-cols-3">
        {["Total scans", "Unique visitors", "Completion rate"].map((m) => (
          <div key={m} className="rounded-xl border bg-card p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{m}</div>
            <div className="mt-3 text-2xl font-semibold">—</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PlaceholderCard title="Scans over time">Time-series chart will render here.</PlaceholderCard>
        <PlaceholderCard title="Top venues">Venue leaderboard will render here.</PlaceholderCard>
      </div>
    </>
  );
}
