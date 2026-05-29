import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/placeholder";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  BarChart3,
  Funnel,
  MapPin,
  Gift,
  Download,
  ArrowRight,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics" }] }),
  component: Analytics,
});

const plannedFeatures = [
  { icon: TrendingUp, label: "Registrations over time", desc: "Daily sign-ups and visitor growth curves per event." },
  { icon: BarChart3, label: "Check-ins by venue", desc: "Heat-map and bar charts showing scan volume per venue." },
  { icon: Funnel, label: "Completion funnel", desc: "Passport progress from first check-in to completion rate." },
  { icon: MapPin, label: "Most visited venues", desc: "Leaderboard of top-performing venues by unique scans." },
  { icon: Gift, label: "Qualified prize entrants", desc: "Visitors who met the reward rules and are eligible for prizes." },
  { icon: Download, label: "CSV exports", desc: "Download raw check-in, visitor and completion data for reporting." },
];

function Analytics() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track engagement across events, venues and visitors."
        actions={
          <Button asChild variant="outline">
            <Link to="/admin">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          </Button>
        }
      />

      <Card className="mb-6 border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-semibold">Analytics are coming later</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Deep reporting is not wired yet. Basic event, venue and visitor counts are
              already live on the{" "}
              <Link to="/admin" className="font-medium underline underline-offset-2 hover:text-primary">
                Dashboard
              </Link>{" "}
              and inside each{" "}
              <Link to="/admin/events" className="font-medium underline underline-offset-2 hover:text-primary">
                Event
              </Link>
              .
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/events">
              Go to Events <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Planned analytics
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plannedFeatures.map((f) => (
          <Card key={f.label} className="opacity-60">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <f.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-sm font-medium">{f.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{f.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
