import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, QrCode, Users } from "lucide-react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin dashboard" }] }),
  component: Dashboard,
});

type TileTarget =
  | { to: "/admin/events" }
  | { to: "/admin/analytics" };

type Counts = { events: number; venues: number; checkins: number; visitors: number };

function Dashboard() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Per-table count queries scoped to the selected agency. RLS enforces tenancy;
      // the explicit agency_id filter keeps the query well-formed and indexed.
      const head = { count: "exact" as const, head: true };
      const [events, venues, checkins, visitors] = await Promise.all([
        supabase.from("events").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
        supabase.from("venues").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
        supabase.from("checkins").select("id", head).eq("agency_id", agencyId),
        supabase.from("visitors").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
      ]);

      if (cancelled) return;
      const anyError = events.error || venues.error || checkins.error || visitors.error;
      if (anyError) {
        setError("Could not load dashboard stats.");
        setLoading(false);
        return;
      }
      setCounts({
        events: events.count ?? 0,
        venues: venues.count ?? 0,
        checkins: checkins.count ?? 0,
        visitors: visitors.count ?? 0,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  const items = [
    {
      label: "Events",
      value: counts?.events,
      icon: Calendar,
      to: "/admin/events" as const,
      ariaLabel: "Open Events",
    },
    {
      label: "Venues",
      value: counts?.venues,
      icon: MapPin,
      to: "/admin/events" as const,
      ariaLabel: "Open Events to manage venues",
    },
    {
      label: "Check-ins",
      value: counts?.checkins,
      icon: QrCode,
      to: "/admin/analytics" as const,
      ariaLabel: "Open Analytics for check-ins",
    },
    {
      label: "Visitors",
      value: counts?.visitors,
      icon: Users,
      to: "/admin/analytics" as const,
      ariaLabel: "Open Analytics for visitors",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          agency.selected
            ? `Live overview for ${agency.selected.name}.`
            : "Overview of your white-label event passports."
        }
      />
      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ label, value, icon: Icon, to, ariaLabel }) => (
          <Link
            key={label}
            to={to}
            aria-label={ariaLabel}
            title={ariaLabel}
            className="group block rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                {label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="mt-3 text-2xl font-semibold">
              {loading || value === undefined ? "…" : value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {loading ? "Loading…" : "Live"}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
