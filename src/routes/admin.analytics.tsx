import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
            "id, event_id, email, first_name, last_name, full_name, marketing_opt_in, created_at",
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
      setPrizeRules(((prRes.data ?? []) as PrizeRule[]) ?? []);
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

  if (!agencyId) {
    return (
      <>
        <PageHeader title="Analytics" description="Select an organisation to view analytics." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track registrations, venue visits, check-ins and visitor engagement."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Event
          </label>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger>
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
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Date range
          </label>
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger>
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

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !events.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading analytics…
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          message="Create your first event to start collecting registrations and check-ins."
          to="/admin/events"
          cta="Go to Events"
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Events" value={totalEvents} icon={Calendar} />
            <Stat label="Published events" value={publishedEvents} icon={CheckCircle2} />
            <Stat label="Venues" value={totalVenues} icon={MapPin} />
            <Stat label="Registered visitors" value={totalPassports} icon={Users} />
            <Stat label="Total check-ins" value={totalCheckins} icon={QrCode} />
            <Stat label="Unique visitors checked in" value={uniqueCheckedIn} icon={Users} />
            <Stat
              label="Avg venues / passport"
              value={avgVenuesPerPassport.toFixed(1)}
              icon={TrendingUp}
            />
            <Stat label="Completed trails" value={completedCount} icon={Trophy} />
          </div>

          {/* Registrations over time */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Registrations over time</CardTitle>
              <Button size="sm" variant="outline" onClick={exportVisitors}>
                <Download className="h-4 w-4" /> Visitors CSV
              </Button>
            </CardHeader>
            <CardContent>
              {regsByDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">No registrations in this range.</p>
              ) : (
                <>
                  <Sparkline data={regsByDay.map(([, n]) => n)} />
                  <div className="mt-3 max-h-48 overflow-auto rounded border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2 text-right">Registrations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regsByDay
                          .slice()
                          .reverse()
                          .map(([day, n]) => (
                            <tr key={day} className="border-t">
                              <td className="px-3 py-1.5">{day}</td>
                              <td className="px-3 py-1.5 text-right font-medium">{n}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Completion funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <FunnelBars
                rows={[
                  { label: "Registered", count: funnel.reg },
                  { label: "Checked in at 1+ venue", count: funnel.one },
                  { label: "Checked in at 2+ venues", count: funnel.two },
                  { label: "Completed trail", count: funnel.completed },
                ]}
              />
            </CardContent>
          </Card>

          {/* Check-ins by venue / most visited */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Check-ins by venue</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportVenuePerf}>
                  <Download className="h-4 w-4" /> Venues CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportCheckins}>
                  <Download className="h-4 w-4" /> Check-ins CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {venueStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No check-ins yet.</p>
              ) : (
                <div className="overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Venue</th>
                        <th className="px-3 py-2 text-right">Check-ins</th>
                        <th className="px-3 py-2 text-right">Unique</th>
                        <th className="px-3 py-2 text-right">Share</th>
                        <th className="px-3 py-2">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {venueStats.map((s, i) => (
                        <tr key={s.venue_id} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium">{s.name}</td>
                          <td className="px-3 py-1.5 text-right">{s.count}</td>
                          <td className="px-3 py-1.5 text-right">{s.unique}</td>
                          <td className="px-3 py-1.5 text-right">{s.pct.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {s.last ? new Date(s.last).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prize entrants */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Qualified prize entrants</CardTitle>
              {activePrizeRules.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportEntrants}>
                  <Download className="h-4 w-4" /> Entrants CSV
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activePrizeRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Prize eligibility is not configured for the selected event(s).
                </p>
              ) : prizeEntrants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No qualified entrants yet for active prize rules.
                </p>
              ) : (
                <div className="overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Prize rule</th>
                        <th className="px-3 py-2">Visitor</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2 text-right">Stamps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prizeEntrants.map((e, i) => (
                        <tr key={`${e.passport_id}-${i}`} className="border-t">
                          <td className="px-3 py-1.5">{e.rule}</td>
                          <td className="px-3 py-1.5">
                            {e.visitor?.full_name ??
                              `${e.visitor?.first_name ?? ""} ${e.visitor?.last_name ?? ""}`.trim() ||
                              "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {e.visitor?.email ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right">{e.stamps}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
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
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
        points={points}
      />
    </svg>
  );
}

function FunnelBars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 flex justify-between text-xs">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.count}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
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
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        <Button asChild>
          <Link to={to}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
