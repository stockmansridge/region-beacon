import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, QrCode, Users } from "lucide-react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import {
  getPlanByCode,
  getVenueUsageMessage,
  getNextPlanAfter,
  getNextPlanForVenueCount,
  formatVenueLimit,
} from "@/lib/getstampd-pricing";


export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin dashboard" }] }),
  component: Dashboard,
});


type Counts = { events: number; venues: number; checkins: number; visitors: number };

type SubscriptionRow = {
  id: string;
  plan_code: string | null;
  status: string;
};

function Dashboard() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const [counts, setCounts] = useState<Counts | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
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
        <div className="mb-5 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm leading-6 text-[#B91C1C]">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(({ label, value, icon: Icon, to, ariaLabel }) => (
          <Link
            key={label}
            to={to}
            aria-label={ariaLabel}
            title={ariaLabel}
            className="group block rounded-[16px] border border-[#D9E2EF] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition hover:border-[#2F6FE4]/40 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE4]/30"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                {label}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EAF2FF] text-[#2F6FE4]">
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">
              {loading || value === undefined ? "…" : value}
            </div>
            <div className="mt-1 text-sm text-[#64748B]">
              {loading ? "Loading…" : "Live"}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
