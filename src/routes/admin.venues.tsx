import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/placeholder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, LayoutGrid, Filter, Upload, Download, Tag } from "lucide-react";

export const Route = createFileRoute("/admin/venues")({
  head: () => ({ meta: [{ title: "Venue Library" }] }),
  component: Venues,
});

const comingSoonFeatures = [
  { icon: LayoutGrid, label: "Reusable venue profiles across events" },
  { icon: Filter, label: "Filter by event" },
  { icon: Upload, label: "Bulk import venues" },
  { icon: Download, label: "Export QR posters" },
  { icon: Tag, label: "Manage offers" },
];

function Venues() {
  return (
    <>
      <PageHeader
        title="Venue Library"
        description="Venue Library is coming soon."
      />

      <div className="mx-auto max-w-xl">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Venue Library is coming soon</CardTitle>
            <CardDescription className="text-sm">
              For now, add and manage venues inside each event.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Open <strong className="text-foreground">Events</strong>, choose an event, then
              scroll to <strong className="text-foreground">Venues for this event</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              Future: reusable venue profiles, bulk import, cross-event search, and QR poster exports.
            </p>
            <Button asChild>
              <Link to="/admin/events">
                Go to Events <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="mt-8">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Planned for this page
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {comingSoonFeatures.map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 rounded-lg border bg-card/50 p-3 opacity-60"
              >
                <f.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
