import { createFileRoute } from "@tanstack/react-router";
import { VisitorShell } from "@/components/visitor-shell";
import { Check, QrCode } from "lucide-react";

export const Route = createFileRoute("/passport")({
  head: () => ({ meta: [{ title: "My passport" }, { name: "description", content: "Track your check-ins and progress." }] }),
  component: Passport,
});

const stops = [
  { name: "Vineyard No. 1", done: true },
  { name: "Harbour Cellar", done: true },
  { name: "Stone Mill Tasting Room", done: false },
  { name: "Sunset Distillery", done: false },
  { name: "Old Town Brewery", done: false },
];

function Passport() {
  const completed = stops.filter((s) => s.done).length;
  const pct = Math.round((completed / stops.length) * 100);
  return (
    <VisitorShell>
      <div className="rounded-2xl border bg-card p-5">
        <div className="text-xs font-medium text-muted-foreground">Your progress</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{completed}</span>
          <span className="text-sm text-muted-foreground">of {stops.length} stops</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-hero-gradient" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-muted-foreground">Stops</h2>
      <ul className="mt-3 space-y-2">
        {stops.map((s) => (
          <li key={s.name} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
              {s.done ? <Check className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.done ? "Checked in" : "Scan QR at venue"}</div>
            </div>
          </li>
        ))}
      </ul>
    </VisitorShell>
  );
}
