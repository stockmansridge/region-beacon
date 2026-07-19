import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Download,
  RefreshCw,
  TrendingUp,
  MapPin,
  Users,
  QrCode,
  Calendar,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics" }] }),
  component: Analytics,
});

type EventRow = {
  id: string;
  name: string;
  status: string | null;
  agency_id: string;
};
type VisitorRow = {
  id: string;
  event_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  postcode: string | null;
  marketing_opt_in: boolean | null;
  created_at: string;
};
type CheckinRow = {
  id: string;
  event_id: string;
  visitor_id: string;
  venue_id: string;
  passport_id: string;
  created_at: string;
};
type VenueRow = { id: string; name: string; event_id: string };
type PassportRow = {
  id: string;
  event_id: string;
  visitor_id: string;
  status: string | null;
  completed_at: string | null;
  created_at: string;
};
type PrizeRule = {
  id: string;
  event_id: string;
  name: string;
  threshold_checkins: number | null;
  requires_completion: boolean | null;
  is_active: boolean | null;
};

type DateFilter = "all" | "7d" | "30d";

function startDateFor(filter: DateFilter): Date | null {
  if (filter === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (filter === "7d" ? 7 : 30));
  return d;
}

function Analytics() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [events, setEvents] = useState<EventRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [passports, setPassports] = useState<PassportRow[]>([]);
  const [prizeRules, setPrizeRules] = useState<PrizeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [drilldown, setDrilldown] = useState<null | "visitors" | "checkins">(null);
  const [expandedVisitor, setExpandedVisitor] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const [evRes, vRes, cRes, viRes, pRes, prRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, status, agency_id")
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("venues")
          .select("id, name, event_id")
          .eq("agency_id", agencyId)
          .eq("status", "active")
          .is("deleted_at", null),
        supabase
          .from("checkins")
          .select("id, event_id, visitor_id, venue_id, passport_id, created_at")
          .eq("agency_id", agencyId),
        supabase
          .from("visitors")
          .select(
            "id, event_id, email, first_name, last_name, full_name, postcode, marketing_opt_in, created_at",
          )
          .eq("agency_id", agencyId)
          .is("deleted_at", null),
        supabase
          .from("passports")
          .select("id, event_id, visitor_id, status, completed_at, created_at")
          .eq("agency_id", agencyId),
        supabase
          .from("prize_rules")
          .select(
            "id, event_id, name, threshold_checkins, requires_completion, is_active",
          )
          .eq("agency_id", agencyId)
          .eq("is_active", true),
      ]);
      if (cancelled) return;
      const anyErr =
        evRes.error || vRes.error || cRes.error || viRes.error || pRes.error;
      if (anyErr) {
        setError("Could not load analytics data.");
        setLoading(false);
        return;
      }
      setEvents((evRes.data ?? []) as EventRow[]);
      setVenues((vRes.data ?? []) as VenueRow[]);
      setCheckins((cRes.data ?? []) as CheckinRow[]);
      setVisitors((viRes.data ?? []) as VisitorRow[]);
      setPassports((pRes.data ?? []) as PassportRow[]);
      setPrizeRules((prRes.data ?? []) as PrizeRule[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, reloadKey]);

  const fromDate = useMemo(() => startDateFor(dateFilter), [dateFilter]);

  const filteredEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.id === eventFilter)),
    [events, eventFilter],
  );
  const filteredEventIds = useMemo(
    () => new Set(filteredEvents.map((e) => e.id)),
    [filteredEvents],
  );

  const inEvent = (eid: string) => filteredEventIds.has(eid);
  const inRange = (ts: string) => !fromDate || new Date(ts) >= fromDate;

  const fVisitors = useMemo(
    () => visitors.filter((v) => inEvent(v.event_id) && inRange(v.created_at)),
    [visitors, filteredEventIds, fromDate],
  );
  const fCheckins = useMemo(
    () => checkins.filter((c) => inEvent(c.event_id) && inRange(c.created_at)),
    [checkins, filteredEventIds, fromDate],
  );
  const fVenues = useMemo(
    () => venues.filter((v) => inEvent(v.event_id)),
    [venues, filteredEventIds],
  );
  const fPassports = useMemo(
    () => passports.filter((p) => inEvent(p.event_id) && inRange(p.created_at)),
    [passports, filteredEventIds, fromDate],
  );

  // Summary metrics
  const totalEvents = filteredEvents.length;
  const publishedEvents = filteredEvents.filter((e) => e.status === "published").length;
  const totalVenues = fVenues.length;
  const totalPassports = fPassports.length;
  const totalCheckins = fCheckins.length;
  const uniqueCheckedIn = new Set(fCheckins.map((c) => c.passport_id)).size;
  const avgVenuesPerPassport =
    totalPassports > 0 ? (uniqueCheckedIn ? totalCheckins / totalPassports : 0) : 0;

  // Completion: by event (uses venues count per event)
  const venuesByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of fVenues) m.set(v.event_id, (m.get(v.event_id) ?? 0) + 1);
    return m;
  }, [fVenues]);

  // Per-passport stamps (distinct venues)
  const passportStamps = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of fCheckins) {
      const s = m.get(c.passport_id) ?? new Set<string>();
      s.add(c.venue_id);
      m.set(c.passport_id, s);
    }
    return m;
  }, [fCheckins]);

  const completedCount = useMemo(() => {
    let n = 0;
    for (const p of fPassports) {
      const need = venuesByEvent.get(p.event_id) ?? 0;
      const got = passportStamps.get(p.id)?.size ?? 0;
      if (need > 0 && got >= need) n += 1;
    }
    return n;
  }, [fPassports, venuesByEvent, passportStamps]);

  // Registrations per day
  const regsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of fVisitors) {
      const day = v.created_at.slice(0, 10);
      m.set(day, (m.get(day) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fVisitors]);

  // Postcode breakdown — where are visitors coming from?
  const postcodeStats = useMemo(() => {
    let withPostcode = 0;
    let withoutPostcode = 0;
    const byCode = new Map<string, number>();
    for (const v of fVisitors) {
      const raw = (v.postcode ?? "").trim();
      if (!raw) {
        withoutPostcode += 1;
        continue;
      }
      withPostcode += 1;
      const key = raw.toUpperCase();
      byCode.set(key, (byCode.get(key) ?? 0) + 1);
    }
    const total = withPostcode || 1;
    const rows = Array.from(byCode.entries())
      .map(([postcode, count]) => ({
        postcode,
        count,
        pct: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
    return { rows, withPostcode, withoutPostcode };
  }, [fVisitors]);


  // Check-ins by venue
  const venueStats = useMemo(() => {
    const byVenue = new Map<
      string,
      { count: number; unique: Set<string>; last: string }
    >();
    for (const c of fCheckins) {
      const r = byVenue.get(c.venue_id) ?? {
        count: 0,
        unique: new Set<string>(),
        last: "",
      };
      r.count += 1;
      r.unique.add(c.passport_id);
      if (c.created_at > r.last) r.last = c.created_at;
      byVenue.set(c.venue_id, r);
    }
    const nameById = new Map(fVenues.map((v) => [v.id, v.name]));
    const total = fCheckins.length || 1;
    return Array.from(byVenue.entries())
      .map(([id, s]) => ({
        venue_id: id,
        name: nameById.get(id) ?? "Unknown venue",
        count: s.count,
        unique: s.unique.size,
        last: s.last,
        pct: (s.count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }, [fCheckins, fVenues]);

  // Funnel
  const funnel = useMemo(() => {
    const reg = totalPassports;
    const one = uniqueCheckedIn;
    let two = 0;
    for (const s of passportStamps.values()) if (s.size >= 2) two += 1;
    const completed = completedCount;
    return { reg, one, two, completed };
  }, [totalPassports, uniqueCheckedIn, passportStamps, completedCount]);

  // Prize entrants
  const activePrizeRules = useMemo(
    () => prizeRules.filter((r) => filteredEventIds.has(r.event_id)),
    [prizeRules, filteredEventIds],
  );

  const prizeEntrants = useMemo(() => {
    if (activePrizeRules.length === 0) return [];
    const visitorById = new Map(visitors.map((v) => [v.id, v]));
    const out: Array<{
      rule: string;
      visitor: VisitorRow | undefined;
      passport_id: string;
      stamps: number;
      eligible: boolean;
    }> = [];
    for (const rule of activePrizeRules) {
      const need = rule.threshold_checkins ?? 0;
      const eventVenues = venuesByEvent.get(rule.event_id) ?? 0;
      const target = rule.requires_completion ? eventVenues : need;
      const passportsForEvent = fPassports.filter((p) => p.event_id === rule.event_id);
      for (const p of passportsForEvent) {
        const stamps = passportStamps.get(p.id)?.size ?? 0;
        const eligible = target > 0 && stamps >= target;
        if (eligible) {
          out.push({
            rule: rule.name,
            visitor: visitorById.get(p.visitor_id),
            passport_id: p.id,
            stamps,
            eligible,
          });
        }
      }
    }
    return out;
  }, [activePrizeRules, fPassports, passportStamps, venuesByEvent, visitors]);

  // CSV
  const eventNameById = useMemo(
    () => new Map(events.map((e) => [e.id, e.name])),
    [events],
  );
  const venueNameById = useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  );
  const visitorById = useMemo(
    () => new Map(visitors.map((v) => [v.id, v])),
    [visitors],
  );

  const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) {
      window.alert("Nothing to export for the current filter.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv =
      headers.join(",") +
      "\n" +
      rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVisitors = () =>
    downloadCsv(
      `visitors-${Date.now()}.csv`,
      fVisitors.map((v) => ({
        event: eventNameById.get(v.event_id) ?? v.event_id,
        first_name: v.first_name ?? "",
        last_name: v.last_name ?? "",
        full_name: v.full_name ?? "",
        email: v.email,
        postcode: v.postcode ?? "",
        marketing_opt_in: v.marketing_opt_in ? "yes" : "no",
        registered_at: v.created_at,
      })),
    );

  const exportCheckins = () =>
    downloadCsv(
      `checkins-${Date.now()}.csv`,
      fCheckins.map((c) => {
        const v = visitorById.get(c.visitor_id);
        return {
          event: eventNameById.get(c.event_id) ?? c.event_id,
          venue: venueNameById.get(c.venue_id) ?? c.venue_id,
          visitor_name: v?.full_name ?? "",
          visitor_email: v?.email ?? "",
          passport_id: c.passport_id,
          checked_in_at: c.created_at,
        };
      }),
    );

  const exportVenuePerf = () =>
    downloadCsv(
      `venue-performance-${Date.now()}.csv`,
      venueStats.map((s) => ({
        venue: s.name,
        check_ins: s.count,
        unique_visitors: s.unique,
        share_pct: s.pct.toFixed(1),
        last_check_in: s.last,
      })),
    );

  const exportEntrants = () =>
    downloadCsv(
      `prize-entrants-${Date.now()}.csv`,
      prizeEntrants.map((e) => ({
        prize_rule: e.rule,
        first_name: e.visitor?.first_name ?? "",
        last_name: e.visitor?.last_name ?? "",
        email: e.visitor?.email ?? "",
        event:
          (e.visitor && eventNameById.get(e.visitor.event_id)) ??
          "",
        passport_id: e.passport_id,
        stamps: e.stamps,
      })),
    );

  const exportPostcodes = () =>
    downloadCsv(
      `postcodes-${Date.now()}.csv`,
      postcodeStats.rows.map((r) => ({
        postcode: r.postcode,
        visitors: r.count,
        share_pct: r.pct.toFixed(1),
      })),
    );

  if (!agencyId) {
    return (
      <>
        <PageHeader title="Analytics" description="Select an organisation to view analytics." />
      </>
    );
  }

  const primaryBtn =
    "inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]";
  const secondaryBtn =
    "inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]";
  const cardClass =
    "rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]";
  const tableWrap =
    "overflow-hidden rounded-[16px] border border-[#D9E2EF] bg-white";
  const thClass =
    "bg-[#F8FAFC] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]";
  const tdClass = "px-4 py-3 text-sm text-[#334155]";

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track registrations, venue visits, check-ins and visitor engagement."
        actions={
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={secondaryBtn}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <Link to="/admin" className={secondaryBtn}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className={`mb-5 ${cardClass}`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] space-y-2">
            <label className="text-sm font-medium text-[#334155]">Event</label>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-10 rounded-[10px] border-[#D9E2EF] bg-white text-sm text-[#111827] focus:ring-2 focus:ring-[#2F6FE4]/20">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] space-y-2">
            <label className="text-sm font-medium text-[#334155]">Date range</label>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="h-10 rounded-[10px] border-[#D9E2EF] bg-white text-sm text-[#111827] focus:ring-2 focus:ring-[#2F6FE4]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm leading-6 text-[#B91C1C]">
          {error}
        </div>
      )}

      {loading && !events.length ? (
        <div className={`${cardClass} text-center text-sm text-[#64748B]`}>Loading analytics…</div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          message="Create your first event to start collecting registrations and check-ins."
          to="/admin/events"
          cta="Go to Events"
        />
      ) : (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Events" value={totalEvents} icon={Calendar} />
            <Stat label="Published events" value={publishedEvents} icon={CheckCircle2} />
            <Stat label="Venues" value={totalVenues} icon={MapPin} />
            <Stat label="Registered visitors" value={totalPassports} icon={Users} onClick={() => { setExpandedVisitor(null); setDrilldown("visitors"); }} />
            <Stat label="Total check-ins" value={totalCheckins} icon={QrCode} onClick={() => setDrilldown("checkins")} />
            <Stat label="Unique visitors checked in" value={uniqueCheckedIn} icon={Users} />
            <Stat
              label="Avg venues / passport"
              value={avgVenuesPerPassport.toFixed(1)}
              icon={TrendingUp}
            />
            <Stat label="Completed trails" value={completedCount} icon={Trophy} />
          </div>

          {/* Registrations over time */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Registrations over time</h3>
                <p className="text-sm leading-6 text-[#64748B]">Daily visitor registrations across selected events.</p>
              </div>
              <button type="button" onClick={exportVisitors} className={secondaryBtn}>
                <Download className="h-4 w-4" /> Visitors CSV
              </button>
            </div>
            {regsByDay.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No analytics data is available yet. Visitor activity will appear here once people start checking in.
              </div>
            ) : (
              <>
                <div className="rounded-[14px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
                  <Sparkline data={regsByDay.map(([, n]) => n)} />
                </div>
                <div className={`mt-4 max-h-64 overflow-auto ${tableWrap}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thClass}>Date</th>
                        <th className={`${thClass} text-right`}>Registrations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regsByDay.slice().reverse().map(([day, n]) => (
                        <tr key={day} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                          <td className={tdClass}>{day}</td>
                          <td className={`${tdClass} text-right font-medium text-[#111827]`}>{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Postcode breakdown */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Postcode breakdown</h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  Where visitors are travelling from. Make postcode mandatory in Event → Registration form to improve coverage.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                <span>{postcodeStats.withPostcode} with postcode · {postcodeStats.withoutPostcode} without</span>
                <button
                  type="button"
                  onClick={exportPostcodes}
                  disabled={postcodeStats.rows.length === 0}
                  className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
            </div>
            {postcodeStats.rows.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#64748B]">
                No postcode data yet for the current filters.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB]">
                <table className="w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-xs uppercase tracking-wide text-[#64748B]">
                    <tr>
                      <th className="px-4 py-2">Postcode</th>
                      <th className="px-4 py-2">Visitors</th>
                      <th className="px-4 py-2">Share</th>
                      <th className="px-4 py-2 w-1/2">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postcodeStats.rows.slice(0, 25).map((r) => (
                      <tr key={r.postcode} className="border-t border-[#F1F5F9]">
                        <td className="px-4 py-2 font-medium text-[#111827]">{r.postcode}</td>
                        <td className="px-4 py-2 text-[#111827]">{r.count}</td>
                        <td className="px-4 py-2 text-[#64748B]">{r.pct.toFixed(1)}%</td>
                        <td className="px-4 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                            <div
                              className="h-full rounded-full bg-[#2563EB]"
                              style={{ width: `${Math.min(100, r.pct)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {postcodeStats.rows.length > 25 && (
                  <div className="border-t border-[#F1F5F9] bg-[#F9FAFB] px-4 py-2 text-xs text-[#64748B]">
                    Showing top 25 of {postcodeStats.rows.length} postcodes. Export CSV for the full list.
                  </div>
                )}
              </div>
            )}
          </section>


          {/* Marketing opt-ins */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Marketing opt-ins</h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  Visitors who ticked “I’d like to receive more information” when creating their passport.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                <span>
                  {fVisitors.filter((v) => v.marketing_opt_in).length} opted in ·{" "}
                  {fVisitors.length} total
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `marketing-optins-${Date.now()}.csv`,
                      fVisitors
                        .filter((v) => v.marketing_opt_in)
                        .map((v) => ({
                          event: eventNameById.get(v.event_id) ?? v.event_id,
                          first_name: v.first_name ?? "",
                          last_name: v.last_name ?? "",
                          full_name: v.full_name ?? "",
                          email: v.email,
                          postcode: v.postcode ?? "",
                          registered_at: v.created_at,
                        })),
                    )
                  }
                  disabled={fVisitors.filter((v) => v.marketing_opt_in).length === 0}
                  className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
            </div>
            {fVisitors.filter((v) => v.marketing_opt_in).length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#64748B]">
                No opt-ins yet for the current filters.
              </div>
            ) : (
              <div className={`max-h-96 overflow-auto ${tableWrap}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>Name</th>
                      <th className={thClass}>Email</th>
                      <th className={thClass}>Postcode</th>
                      <th className={thClass}>Event</th>
                      <th className={thClass}>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fVisitors
                      .filter((v) => v.marketing_opt_in)
                      .slice()
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((v) => (
                        <tr key={v.id} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                          <td className={`${tdClass} font-medium text-[#111827]`}>
                            {v.full_name ||
                              `${v.first_name ?? ""} ${v.last_name ?? ""}`.trim() ||
                              "—"}
                          </td>
                          <td className={`${tdClass} text-[#334155]`}>{v.email}</td>
                          <td className={`${tdClass} text-[#64748B]`}>{v.postcode ?? "—"}</td>
                          <td className={`${tdClass} text-[#64748B]`}>
                            {eventNameById.get(v.event_id) ?? "—"}
                          </td>
                          <td className={`${tdClass} text-[#64748B]`}>
                            {new Date(v.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>


          {/* Funnel */}
          <section className={cardClass}>
            <div className="mb-5">
              <h3 className="text-base font-semibold text-[#111827]">Completion funnel</h3>
              <p className="text-sm leading-6 text-[#64748B]">From registration through trail completion.</p>
            </div>
            <FunnelBars
              rows={[
                { label: "Registered", count: funnel.reg },
                { label: "Checked in at 1+ venue", count: funnel.one },
                { label: "Checked in at 2+ venues", count: funnel.two },
                { label: "Completed trail", count: funnel.completed },
              ]}
            />
          </section>

          {/* Check-ins by venue */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Check-ins by venue</h3>
                <p className="text-sm leading-6 text-[#64748B]">Top-performing venues for the selected filter.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={exportVenuePerf} className={secondaryBtn}>
                  <Download className="h-4 w-4" /> Venues CSV
                </button>
                <button type="button" onClick={exportCheckins} className={secondaryBtn}>
                  <Download className="h-4 w-4" /> Check-ins CSV
                </button>
              </div>
            </div>
            {venueStats.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No check-ins yet. Venue performance will appear here once visitors start scanning.
              </div>
            ) : (
              <div className={`overflow-auto ${tableWrap}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>#</th>
                      <th className={thClass}>Venue</th>
                      <th className={`${thClass} text-right`}>Check-ins</th>
                      <th className={`${thClass} text-right`}>Unique</th>
                      <th className={`${thClass} text-right`}>Share</th>
                      <th className={thClass}>Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venueStats.map((s, i) => (
                      <tr key={s.venue_id} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                        <td className={`${tdClass} text-[#64748B]`}>{i + 1}</td>
                        <td className={`${tdClass} font-medium text-[#111827]`}>{s.name}</td>
                        <td className={`${tdClass} text-right font-medium text-[#111827]`}>{s.count}</td>
                        <td className={`${tdClass} text-right`}>{s.unique}</td>
                        <td className={`${tdClass} text-right`}>{s.pct.toFixed(1)}%</td>
                        <td className={`${tdClass} text-[#64748B]`}>{s.last ? new Date(s.last).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Prize entrants */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Qualified prize entrants</h3>
                <p className="text-sm leading-6 text-[#64748B]">Visitors meeting active prize-rule thresholds.</p>
              </div>
              {activePrizeRules.length > 0 && (
                <button type="button" onClick={exportEntrants} className={secondaryBtn}>
                  <Download className="h-4 w-4" /> Entrants CSV
                </button>
              )}
            </div>
            {activePrizeRules.length === 0 ? (
              <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#334155]">
                Prize eligibility is not configured for the selected event(s).
              </div>
            ) : prizeEntrants.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No qualified entrants yet for active prize rules.
              </div>
            ) : (
              <div className={`overflow-auto ${tableWrap}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>Prize rule</th>
                      <th className={thClass}>Visitor</th>
                      <th className={thClass}>Email</th>
                      <th className={`${thClass} text-right`}>Stamps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prizeEntrants.map((e, i) => (
                      <tr key={`${e.passport_id}-${i}`} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                        <td className={tdClass}>{e.rule}</td>
                        <td className={tdClass}>
                          {e.visitor?.full_name ||
                            `${e.visitor?.first_name ?? ""} ${e.visitor?.last_name ?? ""}`.trim() ||
                            "—"}
                        </td>
                        <td className={`${tdClass} text-[#64748B]`}>{e.visitor?.email ?? "—"}</td>
                        <td className={`${tdClass} text-right font-medium text-[#111827]`}>{e.stamps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}


function Stat({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const clickable = typeof onClick === "function";
  const cls =
    "text-left w-full rounded-[16px] border border-[#D9E2EF] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.045)]" +
    (clickable
      ? " cursor-pointer transition hover:border-[#2F6FE4]/40 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE4]/30"
      : "");
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          {label}
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#EAF2FF] text-[#2F6FE4]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">{value}</div>
      {clickable && (
        <div className="mt-1 text-xs font-medium text-[#2F6FE4]">View details →</div>
      )}
    </>
  );
  if (clickable) {
    return (
      <button type="button" onClick={onClick} className={cls}>{inner}</button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const w = 600;
  const h = 80;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * (h - 10) - 2}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full text-[#2F6FE4]" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function FunnelBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-[#64748B]">{r.label}</span>
            <span className="font-medium text-[#111827]">{r.count}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
            <div
              className="h-full rounded-full bg-[#2F6FE4]"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  message,
  to,
  cta,
}: {
  title: string;
  message: string;
  to: "/admin/events";
  cta: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#D9E2EF] bg-white p-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <p className="text-base font-semibold text-[#111827]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748B]">{message}</p>
      <Link
        to={to}
        className="mt-5 inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
      >
        {cta}
      </Link>
    </div>
  );
}
