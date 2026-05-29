import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/placeholder";
import { QrCode, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/venues")({
  head: () => ({ meta: [{ title: "Venues" }] }),
  component: Venues,
});

const venues = [
  { name: "Vineyard No. 1", event: "Wine Trail", checkins: 0 },
  { name: "Harbour Cellar", event: "Wine Trail", checkins: 0 },
  { name: "Stone Mill Tasting Room", event: "Wine Trail", checkins: 0 },
];

function Venues() {
  return (
    <>
      <PageHeader
        title="Venues"
        description="Manage participating venues and their unique QR codes."
        actions={
          <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Add venue
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((v) => (
          <div key={v.name} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold">{v.name}</h3>
                <p className="text-xs text-muted-foreground">{v.event}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <QrCode className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
              <span className="text-muted-foreground">Check-ins</span>
              <span className="font-medium">{v.checkins}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
