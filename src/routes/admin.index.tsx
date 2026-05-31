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
    { label: "Events", value: counts?.events, icon: Calendar },
    { label: "Venues", value: counts?.venues, icon: MapPin },
    { label: "Check-ins", value: counts?.checkins, icon: QrCode },
    { label: "Visitors", value: counts?.visitors, icon: Users },
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
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-2xl font-semibold">
              {loading || value === undefined ? "…" : value}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {loading ? "Loading…" : "Live"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
