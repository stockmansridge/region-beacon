import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
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
  Eye,
  Gift,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDatePicker } from "@/components/analytics-date-picker";
import { analyticsDateRange, awardQualified, venueEngagement, type AnalyticsDateFilter } from "@/lib/analytics-metrics";
import { regionalBreakdown } from "@/lib/analytics-regions";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [
    { title: "Event Analytics | GetStampd" },
    { name: "description", content: "Review event registrations, venue visits and visitor engagement in GetStampd." },
    { property: "og:title", content: "Event Analytics | GetStampd" },
    { property: "og:description", content: "Review event registrations, venue visits and visitor engagement in GetStampd." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
type BonusScanRow = {
  id: string;
  event_id: string;
  participant_id: string;
  source_id: string | null;
  points_awarded: number;
  created_at: string;
  metadata: { bonus_code_name?: string | null; venue_id?: string | null } | null;
};

type BonusCodeRow = { id: string; event_id: string; name: string };
type BonusCodeVenueRow = { id: string; bonus_code_id: string; venue_id: string | null };

type PageViewRow = {
  id: string;
  event_id: string;
  path: string;
  device_id: string;
  created_at: string;
};

type AwardRow = { id: string; event_id: string; title: string; points_required: number; requires_all_locations: boolean };
type PointRow = { event_id: string; participant_id: string; points_awarded: number; created_at: string };

function Analytics() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [events, setEvents] = useState<EventRow[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [passports, setPassports] = useState<PassportRow[]>([]);
  const [prizeRules, setPrizeRules] = useState<PrizeRule[]>([]);
  const [bonusScans, setBonusScans] = useState<BonusScanRow[]>([]);
  const [bonusCodes, setBonusCodes] = useState<BonusCodeRow[]>([]);
  const [bonusCodeVenues, setBonusCodeVenues] = useState<BonusCodeVenueRow[]>([]);
  const [pageViews, setPageViews] = useState<PageViewRow[]>([]);
  const [pageViewsError, setPageViewsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<AnalyticsDateFilter>("all");
  const [drilldown, setDrilldown] = useState<null | "visitors" | "checkins" | "bonus" | "venues">(null);
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const [postcodeTab, setPostcodeTab] = useState<"postcode" | "area" | "state">("postcode");
  const [showZeroVenues, setShowZeroVenues] = useState(false);
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [legacyPools, setLegacyPools] = useState<Array<{ ruleId: string; passport_id: string; stamps: number; entries: number }>>([]);
  const [awardError, setAwardError] = useState<string | null>(null);
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
      const [awRes, ptRes] = await Promise.all([
        supabase.from("event_awards").select("id, event_id, title, points_required, requires_all_locations").eq("agency_id", agencyId).eq("status", "active").is("deleted_at", null),
        (async () => {
          const rows: PointRow[] = [];
          for (let offset = 0; !cancelled; offset += 1000) {
            const result = await supabase.from("participant_point_awards").select("event_id, participant_id, points_awarded, created_at:awarded_at").eq("agency_id", agencyId).order("id").range(offset, offset + 999);
            if (result.error) return { data: null, error: result.error };
            rows.push(...(result.data ?? []) as PointRow[]);
            if ((result.data?.length ?? 0) < 1000) break;
          }
          return { data: rows, error: null };
        })(),
      ]);
      // Bonus scans — the ledger timestamps rows with `awarded_at`; older
      // schemas may only have `created_at`, so fall back when needed.
      let bRes = await supabase
        .from("participant_point_awards")
        .select(
          "id, event_id, participant_id, source_id, points_awarded, created_at:awarded_at, metadata",
        )
        .eq("agency_id", agencyId)
        .eq("award_type", "bonus");
      if (bRes.error) {
        bRes = await supabase
          .from("participant_point_awards")
          .select(
            "id, event_id, participant_id, source_id, points_awarded, created_at, metadata",
          )
          .eq("agency_id", agencyId)
          .eq("award_type", "bonus");
      }
      // Bonus code names for the bonus-scan matrix: event-level codes and
      // per-venue code rows (an award's source_id may be either). Both are
      // readable by agency members; tolerate missing tables/policies.
      const [bcRes, bcvRes] = await Promise.all([
        supabase
          .from("event_bonus_codes")
          .select("id, event_id, name")
          .eq("agency_id", agencyId),
        supabase
          .from("event_bonus_code_venues")
          .select("id, bonus_code_id, venue_id")
          .eq("agency_id", agencyId),
      ]);
      // Page views — tolerate a missing table on schemas without the
      // event-page-views migration applied.
      const pvRes = await supabase
        .from("event_page_views")
        .select("id, event_id, path, device_id, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(50000);
      const legacyResults = await Promise.all((prRes.data ?? []).map(async r => {
        const result = await supabase.rpc("admin_get_prize_draw_pool", { _prize_rule_id: r.id });
        return { ruleId: r.id, ...result };
      }));
      if (cancelled) return;
      setLegacyPools(legacyResults.flatMap(r => (r.data ?? []).map((entry: { passport_id: string; stamps: number; entries: number }) => ({ ...entry, ruleId: r.ruleId }))));
      const anyErr =
        evRes.error || vRes.error || cRes.error || viRes.error || pRes.error;
      if (anyErr) {
        setError("Could not load analytics data.");
        setLoading(false);
        return;
      }
      setAwards((awRes.data ?? []) as AwardRow[]);
      setPoints((ptRes.data ?? []) as PointRow[]);
      setAwardError(awRes.error || ptRes.error || prRes.error || legacyResults.some(r => r.error) ? "Prize eligibility could not be fully loaded. Refresh to try again." : null);
      setEvents((evRes.data ?? []) as EventRow[]);
      setVenues((vRes.data ?? []) as VenueRow[]);
      setCheckins((cRes.data ?? []) as CheckinRow[]);
      setVisitors((viRes.data ?? []) as VisitorRow[]);
      setPassports((pRes.data ?? []) as PassportRow[]);
      setPrizeRules((prRes.data ?? []) as PrizeRule[]);
      setBonusScans((bRes.error ? [] : (bRes.data ?? [])) as BonusScanRow[]);
      setBonusCodes((bcRes.error ? [] : (bcRes.data ?? [])) as BonusCodeRow[]);
      setBonusCodeVenues(
        (bcvRes.error ? [] : (bcvRes.data ?? [])) as BonusCodeVenueRow[],
      );
      setPageViews((pvRes.error ? [] : (pvRes.data ?? [])) as PageViewRow[]);
      setPageViewsError(pvRes.error ? pvRes.error.message : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, reloadKey]);

  const { from: fromDate, to: toDate } = useMemo(() => analyticsDateRange(dateFilter, new Date(), { from: customFrom, to: customTo }), [dateFilter, customFrom, customTo, reloadKey]);
  const validRange = !fromDate || !toDate || fromDate <= toDate;

  const filteredEvents = useMemo(
    () => (eventFilter === "all" ? events : events.filter((e) => e.id === eventFilter)),
    [events, eventFilter],
  );
  const filteredEventIds = useMemo(
    () => new Set(filteredEvents.map((e) => e.id)),
    [filteredEvents],
  );

  const inEvent = (eid: string) => filteredEventIds.has(eid);
  const inRange = (ts: string) => validRange && (!fromDate || new Date(ts) >= fromDate) && (!toDate || new Date(ts) <= toDate);

  const fVisitors = useMemo(
    () => visitors.filter((v) => inEvent(v.event_id) && inRange(v.created_at)),
    [visitors, filteredEventIds, fromDate, toDate, validRange],
  );
  const fCheckins = useMemo(
    () => checkins.filter((c) => inEvent(c.event_id) && inRange(c.created_at)),
    [checkins, filteredEventIds, fromDate, toDate, validRange],
  );
  const fVenues = useMemo(
    () => venues.filter((v) => inEvent(v.event_id)),
    [venues, filteredEventIds],
  );
  const fPassports = useMemo(
    () => passports.filter((p) => inEvent(p.event_id) && inRange(p.created_at)),
    [passports, filteredEventIds, fromDate, toDate, validRange],
  );
  const fBonusScans = useMemo(
    () => bonusScans.filter((b) => inEvent(b.event_id) && inRange(b.created_at)),
    [bonusScans, filteredEventIds, fromDate, toDate, validRange],
  );

  // Summary metrics
  const totalEvents = filteredEvents.length;
  const publishedEvents = filteredEvents.filter((e) => e.status === "published").length;
  const totalVenues = fVenues.length;
  const totalPassports = fPassports.length;
  const totalCheckins = fCheckins.length;
  const totalBonusScans = fBonusScans.length;
  const totalBonusPoints = fBonusScans.reduce((s, b) => s + (b.points_awarded ?? 0), 0);
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

  // Page views — anonymous traffic on the public event pages.
  const fPageViews = useMemo(
    () => pageViews.filter((v) => inEvent(v.event_id) && inRange(v.created_at)),
    [pageViews, filteredEventIds, fromDate, toDate, validRange],
  );

  const pageViewStats = useMemo(() => {
    const devices = new Set<string>();
    const byDay = new Map<string, number>();
    const byPath = new Map<string, { count: number; devices: Set<string> }>();
    for (const v of fPageViews) {
      devices.add(v.device_id);
      const day = v.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const entry = byPath.get(v.path) ?? { count: 0, devices: new Set<string>() };
      entry.count += 1;
      entry.devices.add(v.device_id);
      byPath.set(v.path, entry);
    }
    const total = fPageViews.length;
    return {
      total,
      uniqueDevices: devices.size,
      byDay: Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)),
      paths: Array.from(byPath.entries())
        .map(([path, e]) => ({
          path,
          count: e.count,
          unique: e.devices.size,
          pct: total ? (e.count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [fPageViews]);

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


  const regionalRows = useMemo(() => regionalBreakdown(postcodeStats.rows, postcodeTab === "state" ? "state" : "area"), [postcodeStats.rows, postcodeTab]);
  const displayedPostcodes = postcodeTab === "postcode" ? postcodeStats.rows.map(r => ({ ...r, label: r.postcode })) : regionalRows;

  const allVenueStats = useMemo(() => venueEngagement(fVenues, fCheckins, fBonusScans, bonusCodeVenues), [fVenues, fCheckins, fBonusScans, bonusCodeVenues]);
  const venueStats = allVenueStats.filter(v => showZeroVenues || v.count > 0);

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
    const visitorMap = new Map(visitors.map(v => [v.id, v]));
    const activeVenueIds = new Set(fVenues.map(v => v.id));
    const visits = new Map<string, Set<string>>();
    for (const c of checkins) {
      if (!activeVenueIds.has(c.venue_id)) continue;
      const set = visits.get(c.passport_id) ?? new Set<string>();
      set.add(c.venue_id); visits.set(c.passport_id, set);
    }
    const totals = new Map<string, number>();
    for (const p of points) totals.set(`${p.event_id}:${p.participant_id}`, (totals.get(`${p.event_id}:${p.participant_id}`) ?? 0) + p.points_awarded);
    const selectedPassports = new Set(fPassports.map(p => p.id));
    for (const c of fCheckins) selectedPassports.add(c.passport_id);
    for (const p of points) if (inEvent(p.event_id) && inRange(p.created_at)) selectedPassports.add(p.participant_id);
    const rules = awards.filter(a => inEvent(a.event_id));
    const out: Array<{ ruleId: string; rule: string; event_id: string; visitor: VisitorRow | undefined; passport_id: string; stamps: number; points: number; requirement: string }> = [];
    for (const p of passports) {
      if (!inEvent(p.event_id) || !selectedPassports.has(p.id)) continue;
      const stamps = visits.get(p.id)?.size ?? 0;
      const total = totals.get(`${p.event_id}:${p.id}`) ?? 0;
      for (const a of rules.filter(a => a.event_id === p.event_id)) {
        if (awardQualified(total, stamps, venuesByEvent.get(p.event_id) ?? 0, a)) out.push({ ruleId: a.id, rule: a.title, event_id: p.event_id, visitor: visitorMap.get(p.visitor_id), passport_id: p.id, stamps, points: total, requirement: `${a.points_required} points${a.requires_all_locations ? " + all active venues" : ""}` });
      }
      // Keep older events' stamp-based prize rules, without mixing them with current points-based prizes.
      if (!rules.some(a => a.event_id === p.event_id)) for (const r of activePrizeRules.filter(r => r.event_id === p.event_id)) {
        const entry = legacyPools.find(e => e.ruleId === r.id && e.passport_id === p.id);
        if (entry) out.push({ ruleId: r.id, rule: r.name, event_id: p.event_id, visitor: visitorMap.get(p.visitor_id), passport_id: p.id, stamps: entry.stamps, points: total, requirement: `${entry.entries} draw entries (legacy rule)` });
      }
    }
    return out.sort((a, b) => a.rule.localeCompare(b.rule) || displayNameOf(a.visitor).localeCompare(displayNameOf(b.visitor)));
  }, [awards, legacyPools, points, checkins, passports, visitors, fVenues, fPassports, fCheckins, activePrizeRules, venuesByEvent, filteredEventIds, fromDate, toDate, validRange]);

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
  const passportById = useMemo(
    () => new Map(passports.map((p) => [p.id, p])),
    [passports],
  );
  // Resolve a bonus award's source_id to a readable code label. A source_id
  // may be an event-level code id or a per-venue code row id.
  const bonusCodeLabelBySourceId = useMemo(() => {
    const codeById = new Map(bonusCodes.map((c) => [c.id, c]));
    const venueRowById = new Map(bonusCodeVenues.map((r) => [r.id, r]));
    const m = new Map<string, string>();
    for (const b of bonusScans) {
      if (!b.source_id || m.has(b.source_id)) continue;
      const code = codeById.get(b.source_id);
      if (code) {
        m.set(b.source_id, code.name);
        continue;
      }
      const venueRow = venueRowById.get(b.source_id);
      if (venueRow) {
        const parent = codeById.get(venueRow.bonus_code_id);
        const venueName = venueRow.venue_id
          ? venueNameById.get(venueRow.venue_id)
          : null;
        const base = parent?.name ?? b.metadata?.bonus_code_name ?? "Bonus code";
        m.set(b.source_id, venueName ? `${base} — ${venueName}` : base);
        continue;
      }
      if (b.metadata?.bonus_code_name) m.set(b.source_id, b.metadata.bonus_code_name);
    }
    return m;
  }, [bonusScans, bonusCodes, bonusCodeVenues, venueNameById]);

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
      allVenueStats.map((s) => ({
        venue: s.name,
        event: eventNameById.get(s.event_id) ?? "",
        check_ins: s.count,
        bonus_scans: s.bonus,
        total_scans: s.scans,
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
        total_points: e.points,
        qualification: e.requirement,
      })),
    );

  const exportPageViews = () =>
    downloadCsv(
      `page-views-${Date.now()}.csv`,
      pageViewStats.paths.map((r) => ({
        path: r.path,
        views: r.count,
        unique_devices: r.unique,
        share_pct: r.pct.toFixed(1),
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
    " rounded-[16px] border border-[#D9E2EF] bg-white";
  const thClass =
    "sticky top-0 z-10 bg-[#F8FAFC] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]";
  const tdClass = "px-4 py-3 text-sm text-[#334155]";

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track registrations, venue visits, check-ins and visitor engagement."
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={loading}
              className={`${secondaryBtn} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <RefreshCw className={`h-4 w-4${loading ? " animate-spin" : ""}`} />
              {loading ? "Refreshing…" : "Refresh"}
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
              <SelectContent className="max-h-64">
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
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as AnalyticsDateFilter)}>
              <SelectTrigger className="h-10 rounded-[10px] border-[#D9E2EF] bg-white text-sm text-[#111827] focus:ring-2 focus:ring-[#2F6FE4]/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="1d">Last 1 day</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {dateFilter === "custom" && <div className="mb-5 flex flex-wrap items-center gap-3">
        <AnalyticsDatePicker label="Start date" value={customFrom} onChange={setCustomFrom} />
        <AnalyticsDatePicker label="End date" value={customTo} onChange={setCustomTo} />
        {!validRange && <p role="alert" className="text-sm text-destructive">End date must be on or after start date.</p>}
      </div>}
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
            <Stat label="Events" value={totalEvents} icon={Calendar} onClick={() => navigate({ to: "/admin/events" })} />
            <Stat label="Published events" value={publishedEvents} icon={CheckCircle2} onClick={() => navigate({ to: "/admin/events" })} />
            <Stat label="Venues" value={totalVenues} icon={MapPin} onClick={() => setDrilldown("venues")} />
            <Stat label="Registered visitors" value={totalPassports} icon={Users} onClick={() => { setExpandedVisitor(null); setDrilldown("visitors"); }} />
            <Stat label="Total check-ins" value={totalCheckins} icon={QrCode} onClick={() => setDrilldown("checkins")} />
            <Stat label="Bonus scans" value={totalBonusScans} icon={QrCode} onClick={() => setDrilldown("bonus")} />
            <Stat label="Bonus points earned" value={totalBonusPoints} icon={Trophy} />
            <Stat label="Unique visitors checked in" value={uniqueCheckedIn} icon={Users} onClick={() => { setExpandedVisitor(null); setDrilldown("visitors"); }} />
            <Stat
              label="Avg venues / passport"
              value={avgVenuesPerPassport.toFixed(1)}
              icon={TrendingUp}
            />
            <Stat label="Completed trails" value={completedCount} icon={Trophy} onClick={() => { setExpandedVisitor(null); setDrilldown("visitors"); }} />
            <Stat label="Page views" value={pageViewStats.total} icon={Eye} />
            <Stat label="Unique devices" value={pageViewStats.uniqueDevices} icon={TrendingUp} />
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
                  <RegistrationChart days={regsByDay} />
                </div>
                <div role="region" aria-label="Registration dates" tabIndex={0} className={`mt-4 max-h-64 overflow-auto overscroll-contain ${tableWrap}`}>
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

          {/* Page views */}
          <section className={cardClass}>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Page views</h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  Anonymous traffic on your public event pages, including people who never register.
                  Counted once per page per device every 30 minutes.
                </p>
              </div>
              <button type="button" onClick={exportPageViews} className={secondaryBtn}>
                <Download className="h-4 w-4" /> Page views CSV
              </button>
            </div>
            {pageViewsError ? (
              <div className="rounded-[12px] border border-amber-300 bg-amber-50 px-5 py-5 text-sm text-amber-900">
                Page views could not be read: {pageViewsError}
              </div>
            ) : pageViewStats.total === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No page views recorded yet for this selection. Views are collected from
                now on as visitors browse your public event pages.
              </div>
            ) : (
              <>
                <div className="rounded-[14px] border border-[#E6ECF4] bg-[#F8FAFC] p-4">
                  <PageViewsChart days={pageViewStats.byDay} />
                </div>
                <div role="region" aria-label="Page view list" tabIndex={0} className={`mt-4 max-h-72 overflow-auto overscroll-contain ${tableWrap}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thClass}>Page</th>
                        <th className={`${thClass} text-right`}>Views</th>
                        <th className={`${thClass} text-right`}>Unique devices</th>
                        <th className={`${thClass} text-right`}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageViewStats.paths.map((r) => (
                        <tr key={r.path} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                          <td className={tdClass}>{r.path}</td>
                          <td className={`${tdClass} text-right font-medium text-[#111827]`}>{r.count}</td>
                          <td className={`${tdClass} text-right`}>{r.unique}</td>
                          <td className={`${tdClass} text-right`}>{r.pct.toFixed(1)}%</td>
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
                  onClick={() => postcodeTab === "postcode" ? exportPostcodes() : downloadCsv(`${postcodeTab}-breakdown.csv`, regionalRows.map(r => ({ [postcodeTab]: r.label, visitors: r.count, share_pct: r.pct.toFixed(1) })))}
                  disabled={postcodeStats.rows.length === 0}
                  className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
            </div>
            <Tabs value={postcodeTab} onValueChange={v => { if (v === "postcode" || v === "area" || v === "state") setPostcodeTab(v); }} className="mb-4">
              <TabsList><TabsTrigger value="postcode">Postcodes</TabsTrigger><TabsTrigger value="area">State / Area</TabsTrigger><TabsTrigger value="state">States</TabsTrigger></TabsList>
            </Tabs>
            {postcodeTab !== "postcode" && <p className="mb-4 text-xs leading-5 text-muted-foreground">Approximate areas from <a href="https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/non-abs-structures/postal-areas" target="_blank" rel="noreferrer" className="underline">ABS 2021 postcode geography</a>. Greater Sydney excludes the assigned Blue Mountains area. Shares are of visitors with a postcode; unknown codes remain included.</p>}
            {postcodeStats.rows.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#64748B]">
                No postcode data yet for the current filters.
              </div>
            ) : (
              <div className="max-h-96 overflow-auto overscroll-contain rounded-[12px] border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-[#F9FAFB] text-left text-xs uppercase tracking-wide text-[#64748B]">
                    <tr>
                      <th className="px-4 py-2">{postcodeTab === "postcode" ? "Postcode" : postcodeTab === "state" ? "State / Territory" : "Area · State"}</th>
                      <th className="px-4 py-2">Visitors</th>
                      <th className="px-4 py-2">Share</th>
                      <th className="px-4 py-2 w-1/2">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPostcodes.map((r) => (
                      <tr key={r.label} className="border-t border-[#F1F5F9]">
                        <td className="px-4 py-2 font-medium text-[#111827]">{r.label}</td>
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
              <div role="region" aria-label="Marketing opt-in list" tabIndex={0} className={`max-h-96 overflow-auto overscroll-contain ${tableWrap}`}>
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
                <p className="text-sm leading-6 text-[#64748B]">Venue check-ins for the selected event and date range.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={showZeroVenues} onCheckedChange={setShowZeroVenues} />Show venues with 0 check-ins</label>
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
              <div className={`max-h-96 overflow-auto ${tableWrap}`}>
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
                <p className="text-sm leading-6 text-[#64748B]">Current eligibility including all venue and bonus points. Date filters select visitors registered or active in that range; qualification uses their lifetime event totals.</p>
              </div>
              {(activePrizeRules.length > 0 || awards.some(a => inEvent(a.event_id))) && (
                <button type="button" onClick={exportEntrants} className={secondaryBtn}>
                  <Download className="h-4 w-4" /> Entrants CSV
                </button>
              )}
            </div>
            {awardError ? <p role="alert" className="text-sm text-destructive">{awardError}</p> : activePrizeRules.length === 0 && !awards.some(a => inEvent(a.event_id)) ? (
              <div className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#334155]">
                Prize eligibility is not configured for the selected event(s).
              </div>
            ) : prizeEntrants.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
                No qualified entrants yet for active prize rules.
              </div>
            ) : (
              <div className={`max-h-96 overflow-auto ${tableWrap}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={thClass}>Prize</th><th className={thClass}>Event</th><th className={thClass}>Requirement</th>
                      <th className={thClass}>Visitor</th>
                      <th className={thClass}>Email</th>
                      <th className={`${thClass} text-right`}>Stamps</th><th className={`${thClass} text-right`}>Total points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prizeEntrants.map((e) => (
                      <tr key={`${e.passport_id}-${e.ruleId}`} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                        <td className={tdClass}>{e.rule}</td><td className={tdClass}>{eventNameById.get(e.event_id) ?? "—"}</td><td className={tdClass}>{e.requirement}</td>
                        <td className={tdClass}>
                          {e.visitor?.full_name ||
                            `${e.visitor?.first_name ?? ""} ${e.visitor?.last_name ?? ""}`.trim() ||
                            "—"}
                        </td>
                        <td className={`${tdClass} text-[#64748B]`}>{e.visitor?.email ?? "—"}</td>
                        <td className={`${tdClass} text-right font-medium text-[#111827]`}>{e.stamps}</td><td className={`${tdClass} text-right`}>{e.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {drilldown && drilldown !== "bonus" && drilldown !== "venues" && (
        <DrilldownModal
          mode={drilldown}
          onClose={() => setDrilldown(null)}
          visitors={fVisitors}
          checkins={fCheckins}
          eventNameById={eventNameById}
          venueNameById={venueNameById}
          visitorById={visitorById}
          expandedVisitor={expandedVisitor}
          setExpandedVisitor={setExpandedVisitor}
          onExport={drilldown === "visitors" ? exportVisitors : exportCheckins}
        />
      )}
      {drilldown === "venues" && <VenueEngagementModal rows={allVenueStats} eventNames={eventNameById} onClose={() => setDrilldown(null)} onExport={exportVenuePerf} />}
      {drilldown === "bonus" && (
        <BonusMatrixModal
          onClose={() => setDrilldown(null)}
          bonusScans={fBonusScans}
          passportById={passportById}
          visitorById={visitorById}
          eventNameById={eventNameById}
          codeLabelBySourceId={bonusCodeLabelBySourceId}
        />
      )}
    </>
  );
}

const PANEL_MIN_WIDTH = 520;
const PANEL_MIN_HEIGHT = 340;

function usePanelResize() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const drag = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  return {
    ref,
    style: size ? { width: size.w, height: size.h } : undefined,
    onHandlePointerDown: (e: React.PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      drag.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onHandlePointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setSize({
        w: Math.min(window.innerWidth * 0.98, Math.max(PANEL_MIN_WIDTH, d.w + e.clientX - d.x)),
        h: Math.min(window.innerHeight * 0.94, Math.max(PANEL_MIN_HEIGHT, d.h + e.clientY - d.y)),
      });
    },
    onHandlePointerUp: () => {
      drag.current = null;
    },
  };
}

function PanelResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      title="Drag to resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute bottom-0 right-0 z-20 flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-end rounded-br-[16px] p-1.5 text-[#94A3B8] hover:text-[#2F6FE4]"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
        <circle cx="14" cy="14" r="1.5" />
        <circle cx="14" cy="9" r="1.5" />
        <circle cx="9" cy="14" r="1.5" />
      </svg>
    </div>
  );
}

type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir };

function displayNameOf(v: VisitorRow | null | undefined): string {
  return v?.full_name || `${v?.first_name ?? ""} ${v?.last_name ?? ""}`.trim() || "—";
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sort.key === sortKey;
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`bg-[#F8FAFC] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B] ${alignCls}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 hover:text-[#2F6FE4] ${active ? "text-[#2F6FE4]" : ""}`}
      >
        {label}
        <span aria-hidden="true" className="text-[9px] leading-none">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function IconSortHeader({
  label,
  sortKey,
  sort,
  onSort,
  children,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="w-10 bg-[#F8FAFC] px-1 py-2 text-center text-[#64748B]">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`${label} — click to sort`}
        aria-label={`Sort by ${label}`}
        className={`relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ${
          active
            ? "bg-[#2F6FE4] text-white"
            : "bg-[#EAF2FF] text-[#2F6FE4] hover:bg-[#DCE9FF]"
        }`}
      >
        {children}
        {active && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 rounded-full bg-white px-0.5 text-[8px] leading-[10px] text-[#2F6FE4] shadow-sm"
          >
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    </th>
  );
}

function DrilldownModal({
  mode,
  onClose,
  visitors,
  checkins,
  eventNameById,
  venueNameById,
  visitorById,
  expandedVisitor,
  setExpandedVisitor,
  onExport,
}: {
  mode: "visitors" | "checkins";
  onClose: () => void;
  visitors: VisitorRow[];
  checkins: CheckinRow[];
  eventNameById: Map<string, string>;
  venueNameById: Map<string, string>;
  visitorById: Map<string, VisitorRow>;
  expandedVisitor: string | null;
  setExpandedVisitor: (v: string | null) => void;
  onExport: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: "desc" });
  const toggleSort = (key: string) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const checkinsByVisitor = useMemo(() => {
    const m = new Map<string, CheckinRow[]>();
    for (const c of checkins) {
      const arr = m.get(c.visitor_id) ?? [];
      arr.push(c);
      m.set(c.visitor_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return m;
  }, [checkins]);

  const q = query.trim().toLowerCase();
  const filteredVisitors = useMemo(() => {
    const sorted = visitors.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!q) return sorted;
    return sorted.filter((v) => {
      const name = (v.full_name || `${v.first_name ?? ""} ${v.last_name ?? ""}`).toLowerCase();
      return (
        name.includes(q) ||
        v.email.toLowerCase().includes(q) ||
        (v.postcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [visitors, q]);

  // Column sorting for the visitors list; empty key keeps the default (newest first) order.
  const sortedVisitors = useMemo(() => {
    if (!sort.key) return filteredVisitors;
    const dir = sort.dir === "asc" ? 1 : -1;
    const rows = filteredVisitors.slice();
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "name":
          cmp = displayNameOf(a).localeCompare(displayNameOf(b));
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "postcode":
          cmp = (a.postcode ?? "").localeCompare(b.postcode ?? "");
          break;
        case "event":
          cmp = (eventNameById.get(a.event_id) ?? "").localeCompare(
            eventNameById.get(b.event_id) ?? "",
          );
          break;
        case "checkins":
          cmp =
            (checkinsByVisitor.get(a.id)?.length ?? 0) -
            (checkinsByVisitor.get(b.id)?.length ?? 0);
          break;
        case "registered":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      if (cmp === 0) cmp = b.created_at.localeCompare(a.created_at);
      return cmp * dir;
    });
    return rows;
  }, [filteredVisitors, sort, checkinsByVisitor, eventNameById]);

  // Check-in matrix: one narrow column per venue, one row per visitor.
  const venueColumns = useMemo(() => {
    const byVenue = new Map<string, string>();
    for (const c of checkins) {
      if (!byVenue.has(c.venue_id)) {
        byVenue.set(c.venue_id, venueNameById.get(c.venue_id) ?? "Unknown venue");
      }
    }
    return Array.from(byVenue.entries())
      .map(([venueId, label]) => ({ venueId, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [checkins, venueNameById]);

  const checkinMatrixRows = useMemo(() => {
    const byVisitor = new Map<
      string,
      { visitor: VisitorRow | null; scans: Map<string, CheckinRow[]>; total: number; latest: string }
    >();
    for (const c of checkins) {
      let row = byVisitor.get(c.visitor_id);
      if (!row) {
        row = {
          visitor: visitorById.get(c.visitor_id) ?? null,
          scans: new Map(),
          total: 0,
          latest: c.created_at,
        };
        byVisitor.set(c.visitor_id, row);
      }
      const arr = row.scans.get(c.venue_id) ?? [];
      arr.push(c);
      row.scans.set(c.venue_id, arr);
      row.total += 1;
      if (c.created_at > row.latest) row.latest = c.created_at;
    }
    return Array.from(byVisitor.entries())
      .map(([visitorId, r]) => ({ visitorId, ...r }))
      .sort((a, b) => b.latest.localeCompare(a.latest));
  }, [checkins, visitorById]);

  const filteredCheckinRows = useMemo(() => {
    if (!q) return checkinMatrixRows;
    return checkinMatrixRows.filter((r) => {
      const v = r.visitor;
      const name = (v?.full_name || `${v?.first_name ?? ""} ${v?.last_name ?? ""}`).toLowerCase();
      return name.includes(q) || (v?.email ?? "").toLowerCase().includes(q);
    });
  }, [checkinMatrixRows, q]);

  // Column sorting for the check-in matrix; empty key keeps the default (most recent) order.
  const sortedCheckinRows = useMemo(() => {
    if (!sort.key) return filteredCheckinRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const rows = filteredCheckinRows.slice();
    rows.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") cmp = displayNameOf(a.visitor).localeCompare(displayNameOf(b.visitor));
      else if (sort.key === "email")
        cmp = (a.visitor?.email ?? "").localeCompare(b.visitor?.email ?? "");
      else if (sort.key === "total") cmp = a.total - b.total;
      else if (sort.key.startsWith("col:")) {
        const venueId = sort.key.slice(4);
        cmp =
          (a.scans.get(venueId)?.length ?? 0) - (b.scans.get(venueId)?.length ?? 0);
      }
      if (cmp === 0) cmp = b.latest.localeCompare(a.latest);
      return cmp * dir;
    });
    return rows;
  }, [filteredCheckinRows, sort]);

  const panelResize = usePanelResize();
  const title = mode === "visitors" ? "Registered visitors" : "All check-ins";
  const desc =
    mode === "visitors"
      ? "Click a visitor to see their check-in history."
      : "Who has checked in at each venue. Click any column heading to sort; hover a column icon for the venue name and a tick for the date and time.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={panelResize.ref}
        style={panelResize.style}
        className="relative flex max-h-[94vh] w-full max-w-6xl flex-col rounded-[16px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-t-[16px] border-b border-[#E6ECF4] bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
            <p className="text-sm text-[#64748B]">{desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, venue…"
              className="h-9 w-64 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20"
            />
            <button
              type="button"
              onClick={onExport}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-medium text-[#111827] hover:bg-[#F8FAFC]"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-[10px] bg-[#2F6FE4] px-3 text-sm font-semibold text-white hover:bg-[#1F56C5]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {mode === "visitors" ? (
            filteredVisitors.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#64748B]">No visitors match.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <SortHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Postcode" sortKey="postcode" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Event" sortKey="event" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Check-ins" sortKey="checkins" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Registered" sortKey="registered" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedVisitors.map((v) => {
                    const scans = checkinsByVisitor.get(v.id) ?? [];
                    const isOpen = expandedVisitor === v.id;
                    const displayName =
                      v.full_name ||
                      `${v.first_name ?? ""} ${v.last_name ?? ""}`.trim() ||
                      "—";
                    return (
                      <React.Fragment key={v.id}>
                        <tr
                          className="cursor-pointer border-t border-[#E6ECF4] hover:bg-[#F8FAFC]"
                          onClick={() => setExpandedVisitor(isOpen ? null : v.id)}
                        >
                          <td className="px-3 py-2 font-medium text-[#111827]">
                            <span className="mr-1 inline-block w-3 text-[#64748B]">{isOpen ? "▾" : "▸"}</span>
                            {displayName}
                          </td>
                          <td className="px-3 py-2 text-[#334155]">{v.email}</td>
                          <td className="px-3 py-2 text-[#64748B]">{v.postcode ?? "—"}</td>
                          <td className="px-3 py-2 text-[#64748B]">{eventNameById.get(v.event_id) ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-medium text-[#111827]">{scans.length}</td>
                          <td className="px-3 py-2 text-[#64748B]">{new Date(v.created_at).toLocaleString()}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-[#E6ECF4] bg-[#F8FAFC]">
                            <td colSpan={6} className="px-3 py-3">
                              {scans.length === 0 ? (
                                <p className="text-xs text-[#64748B]">No check-ins yet.</p>
                              ) : (
                                <div className="overflow-hidden rounded-[10px] border border-[#E6ECF4] bg-white">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-[#F1F5F9] text-left text-[#64748B]">
                                        <th className="px-3 py-2">#</th>
                                        <th className="px-3 py-2">Venue</th>
                                        <th className="px-3 py-2">Date & time</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {scans.map((c, i) => (
                                        <tr key={c.id} className="border-t border-[#E6ECF4]">
                                          <td className="px-3 py-1.5 text-[#64748B]">{i + 1}</td>
                                          <td className="px-3 py-1.5 font-medium text-[#111827]">
                                            {venueNameById.get(c.venue_id) ?? "Unknown venue"}
                                          </td>
                                          <td className="px-3 py-1.5 text-[#334155]">
                                            {new Date(c.created_at).toLocaleString()}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : filteredCheckinRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#64748B]">
              {checkinMatrixRows.length === 0
                ? "No check-ins recorded for this selection yet."
                : "No visitors match."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <SortHeader label="Visitor" sortKey="name" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                  {venueColumns.map((c) => (
                    <IconSortHeader
                      key={c.venueId}
                      label={c.label}
                      sortKey={`col:${c.venueId}`}
                      sort={sort}
                      onSort={toggleSort}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </IconSortHeader>
                  ))}
                  <SortHeader label="Total" sortKey="total" sort={sort} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedCheckinRows.map((r) => {
                  const v = r.visitor;
                  const displayName =
                    v?.full_name ||
                    `${v?.first_name ?? ""} ${v?.last_name ?? ""}`.trim() ||
                    "—";
                  return (
                    <tr key={r.visitorId} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2 font-medium text-[#111827]">{displayName}</td>
                      <td className="px-3 py-2 text-[#334155]">{v?.email ?? "—"}</td>
                      {venueColumns.map((c) => {
                        const scans = r.scans.get(c.venueId) ?? [];
                        if (scans.length === 0) {
                          return <td key={c.venueId} className="px-1 py-2 text-center text-[#CBD5E1]">—</td>;
                        }
                        const details = scans
                          .map((s) =>
                            [
                              c.label,
                              new Date(s.created_at).toLocaleString(),
                              eventNameById.get(s.event_id) ?? "",
                            ]
                              .filter(Boolean)
                              .join("\n"),
                          )
                          .join("\n\n");
                        return (
                          <td key={c.venueId} className="px-1 py-2 text-center">
                            <span
                              title={details}
                              className="inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full bg-[#EAF2FF] text-[#2F6FE4]"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </span>
                            {scans.length > 1 && (
                              <span className="ml-1 text-xs text-[#64748B]">×{scans.length}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-medium text-[#111827]">{r.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <PanelResizeHandle
          onPointerDown={panelResize.onHandlePointerDown}
          onPointerMove={panelResize.onHandlePointerMove}
          onPointerUp={panelResize.onHandlePointerUp}
        />
      </div>
    </div>
  );
}



function BonusMatrixModal({
  onClose,
  bonusScans,
  passportById,
  visitorById,
  eventNameById,
  codeLabelBySourceId,
}: {
  onClose: () => void;
  bonusScans: BonusScanRow[];
  passportById: Map<string, PassportRow>;
  visitorById: Map<string, VisitorRow>;
  eventNameById: Map<string, string>;
  codeLabelBySourceId: Map<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: "desc" });
  const toggleSort = (key: string) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  // Columns: one per distinct bonus code (by source id), ordered by label.
  const columns = useMemo(() => {
    const bySource = new Map<string, string>();
    for (const b of bonusScans) {
      const key = b.source_id ?? `unknown:${b.event_id}`;
      if (!bySource.has(key)) {
        bySource.set(
          key,
          (b.source_id && codeLabelBySourceId.get(b.source_id)) ||
            b.metadata?.bonus_code_name ||
            "Unknown code",
        );
      }
    }
    return Array.from(bySource.entries())
      .map(([sourceKey, label]) => ({ sourceKey, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bonusScans, codeLabelBySourceId]);

  // Rows: one per visitor with at least one bonus scan.
  const rows = useMemo(() => {
    const byVisitor = new Map<
      string,
      { visitor: VisitorRow | null; scans: Map<string, BonusScanRow[]>; total: number; latest: string }
    >();
    for (const b of bonusScans) {
      const passport = passportById.get(b.participant_id);
      const visitorId = passport?.visitor_id ?? `passport:${b.participant_id}`;
      let row = byVisitor.get(visitorId);
      if (!row) {
        row = {
          visitor: visitorById.get(visitorId) ?? null,
          scans: new Map(),
          total: 0,
          latest: b.created_at,
        };
        byVisitor.set(visitorId, row);
      }
      const key = b.source_id ?? `unknown:${b.event_id}`;
      const arr = row.scans.get(key) ?? [];
      arr.push(b);
      row.scans.set(key, arr);
      row.total += 1;
      if (b.created_at > row.latest) row.latest = b.created_at;
    }
    return Array.from(byVisitor.entries())
      .map(([visitorId, r]) => ({ visitorId, ...r }))
      .sort((a, b) => b.latest.localeCompare(a.latest));
  }, [bonusScans, passportById, visitorById]);

  const panelResize = usePanelResize();
  const q = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      const v = r.visitor;
      const name = (v?.full_name || `${v?.first_name ?? ""} ${v?.last_name ?? ""}`).toLowerCase();
      return name.includes(q) || (v?.email ?? "").toLowerCase().includes(q);
    });
  }, [rows, q]);

  // Column sorting for the bonus-scan matrix; empty key keeps the default (most recent) order.
  const sortedRows = useMemo(() => {
    if (!sort.key) return filteredRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const out = filteredRows.slice();
    out.sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") cmp = displayNameOf(a.visitor).localeCompare(displayNameOf(b.visitor));
      else if (sort.key === "email")
        cmp = (a.visitor?.email ?? "").localeCompare(b.visitor?.email ?? "");
      else if (sort.key === "total") cmp = a.total - b.total;
      else if (sort.key.startsWith("col:")) {
        const key = sort.key.slice(4);
        cmp = (a.scans.get(key)?.length ?? 0) - (b.scans.get(key)?.length ?? 0);
      }
      if (cmp === 0) cmp = b.latest.localeCompare(a.latest);
      return cmp * dir;
    });
    return out;
  }, [filteredRows, sort]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={panelResize.ref}
        style={panelResize.style}
        className="relative flex max-h-[94vh] w-full max-w-7xl flex-col rounded-[16px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-t-[16px] border-b border-[#E6ECF4] bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#111827]">Bonus scans</h3>
            <p className="text-sm text-[#64748B]">
              Who has scanned each bonus code. Click any column heading to sort; hover a tick for the date, time and details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="h-9 w-64 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20"
            />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-[10px] bg-[#2F6FE4] px-3 text-sm font-semibold text-white hover:bg-[#1F56C5]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#64748B]">
              {rows.length === 0
                ? "No bonus scans recorded for this selection yet."
                : "No visitors match."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <SortHeader label="Visitor" sortKey="name" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                  {columns.map((c) => (
                    <IconSortHeader
                      key={c.sourceKey}
                      label={c.label}
                      sortKey={`col:${c.sourceKey}`}
                      sort={sort}
                      onSort={toggleSort}
                    >
                      <Gift className="h-3.5 w-3.5" />
                    </IconSortHeader>
                  ))}
                  <SortHeader label="Total" sortKey="total" sort={sort} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const v = r.visitor;
                  const displayName =
                    v?.full_name ||
                    `${v?.first_name ?? ""} ${v?.last_name ?? ""}`.trim() ||
                    "—";
                  return (
                    <tr key={r.visitorId} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2 font-medium text-[#111827]">{displayName}</td>
                      <td className="px-3 py-2 text-[#334155]">{v?.email ?? "—"}</td>
                      {columns.map((c) => {
                        const scans = r.scans.get(c.sourceKey) ?? [];
                        if (scans.length === 0) {
                          return <td key={c.sourceKey} className="px-1 py-2 text-center text-[#CBD5E1]">—</td>;
                        }
                        const details = scans
                          .map((s) => {
                            const parts = [
                              c.label,
                              new Date(s.created_at).toLocaleString(),
                              `+${s.points_awarded ?? 0} points`,
                              eventNameById.get(s.event_id) ?? "",
                            ].filter(Boolean);
                            return parts.join("\n");
                          })
                          .join("\n\n");
                        return (
                          <td key={c.sourceKey} className="px-1 py-2 text-center">
                            <span
                              title={details}
                              className="inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full bg-[#EAF2FF] text-[#2F6FE4]"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </span>
                            {scans.length > 1 && (
                              <span className="ml-1 text-xs text-[#64748B]">×{scans.length}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-medium text-[#111827]">{r.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <PanelResizeHandle
          onPointerDown={panelResize.onHandlePointerDown}
          onPointerMove={panelResize.onHandlePointerMove}
          onPointerUp={panelResize.onHandlePointerUp}
        />
      </div>
    </div>
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

export function RegistrationChart({ days }: { days: Array<[string, number]> }) {
  return <DailyCountChart days={days} label="Registrations" />;
}

export function PageViewsChart({ days }: { days: Array<[string, number]> }) {
  return <DailyCountChart days={days} label="Page views" />;
}

function DailyCountChart({ days, label }: { days: Array<[string, number]>; label: string }) {
  const data = days.map(([day, count]) => ({
    date: Date.parse(`${day}T00:00:00Z`),
    count,
  }));
  const formatDate = (value: number) => new Date(value).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
  return (
    <div className="min-w-0 text-muted-foreground" role="img" aria-label={`Daily ${label.toLowerCase()} chart. Horizontal axis: date. Vertical axis: number of ${label.toLowerCase()}.`}>
      <div className="mb-2 text-xs font-medium">{label}</div>
      <ResponsiveContainer width="100%" height={240} minWidth={0}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date" type="number" scale="time" domain={["dataMin", "dataMax"]}
            tickFormatter={formatDate} minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            stroke="var(--border)" tickMargin={10}
          />
          <YAxis
            allowDecimals={false} domain={[0, "auto"]} width={48}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            stroke="var(--border)" tickMargin={8}
          />
          <Tooltip
            labelFormatter={(value) => new Date(Number(value)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
          />
          <Line dataKey="count" name={label} type="linear" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-center text-xs font-medium">Date</div>
    </div>
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

function VenueEngagementModal({ rows, eventNames, onClose, onExport }: { rows: ReturnType<typeof venueEngagement>; eventNames: Map<string, string>; onClose: () => void; onExport: () => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "scans", dir: "desc" });
  const sorted = rows.filter(r => `${r.name} ${eventNames.get(r.event_id) ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    const key = sort.key;
    const value = (r: typeof a) => key === "event" ? eventNames.get(r.event_id) ?? "" : key === "name" ? r.name : key === "last" ? r.last : key === "count" ? r.count : key === "bonus" ? r.bonus : key === "unique" ? r.unique : r.scans;
    const av = value(a), bv = value(b);
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * (sort.dir === "asc" ? 1 : -1);
  });
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-foreground/50 p-4 sm:p-8" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="Venue engagement" className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border bg-card text-card-foreground shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-lg font-semibold">Venue engagement</h2><p className="text-sm text-muted-foreground">All active venues, including zero scans. Bonus scans include only codes attributed to a venue.</p></div><div className="flex gap-2"><Button variant="outline" onClick={onExport}><Download className="size-4" />CSV</Button><Button variant="outline" onClick={onClose}>Close</Button></div></div>
      <div className="p-4"><input aria-label="Search venues" placeholder="Search venues or events…" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
      <div className="min-h-0 overflow-auto"><table className="w-full text-sm"><thead><tr>{[["Venue", "name"], ["Event", "event"], ["Check-ins", "count"], ["Bonus scans", "bonus"], ["Total scans", "scans"], ["Unique visitors", "unique"], ["Last scan", "last"]].map(([label, key]) => <th key={key} className="sticky top-0 bg-muted p-3 text-left"><Button variant="ghost" size="sm" onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}>{label}{sort.key === key ? sort.dir === "asc" ? " ↑" : " ↓" : ""}</Button></th>)}</tr></thead><tbody>{sorted.map(r => <tr key={r.venue_id} className="border-t"><td className="p-3">{r.name}</td><td className="p-3">{eventNames.get(r.event_id)}</td><td className="p-3">{r.count}</td><td className="p-3">{r.bonus}</td><td className="p-3">{r.scans}</td><td className="p-3">{r.unique}</td><td className="p-3 whitespace-nowrap">{r.last ? new Date(r.last).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!sorted.length && <p className="p-5 text-sm text-muted-foreground">No venues match this selection.</p>}</div>
    </div>
  </div>;
}
