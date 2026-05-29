import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/placeholder";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/admin/events/")({
  head: () => ({ meta: [{ title: "Events" }] }),
  component: Events,
});

const sample = [
  { id: "wine-trail-2026", name: "Summer Wine Trail 2026", status: "Draft", venues: 12 },
  { id: "food-fest", name: "Harbour Food Festival", status: "Live", venues: 8 },
  { id: "craft-beer", name: "Craft Beer Passport", status: "Ended", venues: 15 },
];

function Events() {
  return (
    <>
      <PageHeader
        title="Events"
        description="Manage every passport across your agency."
        actions={
          <Link
            to="/admin/events/$eventId"
            params={{ eventId: "new" }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New event
          </Link>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Venues</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sample.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.venues}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/admin/events/$eventId" params={{ eventId: e.id }} className="text-sm font-medium text-primary hover:underline">
                    Configure
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
