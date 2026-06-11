import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, QrCode, Users } from "lucide-react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useDiagnosticsEnabled } from "@/lib/diagnostics";
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

function Dashboard() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const [diagnosticsEnabled] = useDiagnosticsEnabled();
  const [counts, setCounts] = useState<Counts | null>(null);
  type PlanDiag = {
    code: string;
    source: string | null;
    venueLimit: number | null;
    manualOverride: string | null;
    subscriptionCode: string | null;
    fetchedAt: string;
  };
  const [planInfo, setPlanInfo] = useState<PlanDiag | null>(null);
  const [planRaw, setPlanRaw] = useState<string | null>(null);
  const [planRpcError, setPlanRpcError] = useState<string | null>(null);
  const [agencyRowRaw, setAgencyRowRaw] = useState<string | null>(null);
  const [agencyRowError, setAgencyRowError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh plan-sensitive data when System Admin changes a plan override.
  useEffect(() => {
    const onPlanChanged = () => setPlanRefreshKey((k) => k + 1);
    window.addEventListener("getstampd:plan-changed", onPlanChanged);
    return () => window.removeEventListener("getstampd:plan-changed", onPlanChanged);
  }, []);


  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Per-table count queries scoped to the selected agency. RLS enforces tenancy;
      // the explicit agency_id filter keeps the query well-formed and indexed.
      // Plan resolution goes through get_agency_plan_limits so manual plan
      // overrides (e.g. Enterprise comp) take effect even without an
      // agency_subscriptions row.
      const head = { count: "exact" as const, head: true };
      const [events, venues, checkins, visitors, planRes, agencyRes, userRes] = await Promise.all([
        supabase.from("events").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
        supabase.from("venues").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
        supabase.from("checkins").select("id", head).eq("agency_id", agencyId),
        supabase.from("visitors").select("id", head).eq("agency_id", agencyId).is("deleted_at", null),
        supabase.rpc("get_agency_plan_limits", { _agency_id: agencyId }),
        supabase
          .from("agencies")
          .select("id, name, slug, manual_plan_override, status")
          .eq("id", agencyId)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;

      // --- Plan resolver diagnostic capture (raw, unsummarised) ---
      setUserEmail(userRes.data?.user?.email ?? null);
      setPlanRaw(planRes.data != null ? JSON.stringify(planRes.data, null, 2) : null);
      setPlanRpcError(
        planRes.error
          ? JSON.stringify(
              {
                message: planRes.error.message,
                code: planRes.error.code,
                details: planRes.error.details,
                hint: planRes.error.hint,
              },
              null,
              2,
            )
          : null,
      );
      setAgencyRowRaw(agencyRes.data != null ? JSON.stringify(agencyRes.data, null, 2) : null);
      setAgencyRowError(
        agencyRes.error
          ? JSON.stringify(
              {
                message: agencyRes.error.message,
                code: agencyRes.error.code,
                details: agencyRes.error.details,
                hint: agencyRes.error.hint,
              },
              null,
              2,
            )
          : null,
      );
      console.log("[plan-resolver-diagnostic]", {
        agencyId,
        agencyName: agency.selected?.name,
        agencySlug: agency.selected?.slug,
        rpcData: planRes.data,
        rpcError: planRes.error,
        agencyRow: agencyRes.data,
        agencyRowError: agencyRes.error,
      });
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
      if (!planRes.error && planRes.data && typeof planRes.data === "object") {
        const d = planRes.data as Record<string, unknown>;
        setPlanInfo({
          code: String(d.plan_code ?? "free").toLowerCase().replace(/-/g, "_"),
          source: d.plan_source != null ? String(d.plan_source) : null,
          venueLimit: typeof d.venue_limit === "number" ? d.venue_limit : null,
          manualOverride: d.manual_plan_override != null ? String(d.manual_plan_override) : null,
          subscriptionCode: d.subscription_plan_code != null ? String(d.subscription_plan_code) : null,
          fetchedAt: new Date().toISOString(),
        });
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, planRefreshKey]);

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

  const currentPlan = getPlanByCode(planInfo?.code ?? null);
  const venueCount = counts?.venues ?? 0;
  const venueUsageMessage = getVenueUsageMessage(venueCount, currentPlan);
  const nextPlan =
    getNextPlanAfter(currentPlan.code) ?? getNextPlanForVenueCount(venueCount);
  // Trust the RPC's venue_limit (null = unlimited, e.g. Enterprise); fall
  // back to the static plan table only before the RPC has resolved.
  const limit = planInfo ? planInfo.venueLimit : currentPlan.venueLimit;

  let venueNotice: { tone: "info" | "warn" | "danger"; message: string } | null = null;
  if (limit !== null) {
    if (venueCount > limit) {
      venueNotice = {
        tone: "danger",
        message: `This organisation is over the ${currentPlan.name} plan venue limit.${
          nextPlan ? ` Upgrade to ${nextPlan.name} or higher.` : ""
        }`,
      };
    } else if (venueCount >= limit) {
      venueNotice = {
        tone: "warn",
        message: `You have reached the ${currentPlan.name} plan venue limit.${
          nextPlan ? ` Upgrade to ${nextPlan.name} to add more venues.` : ""
        }`,
      };
    } else if (limit - venueCount <= 1) {
      venueNotice = {
        tone: "info",
        message: `You are close to your ${currentPlan.name} plan venue limit.${
          nextPlan ? ` ${nextPlan.name} includes ${formatVenueLimit(nextPlan.venueLimit).toLowerCase()}.` : ""
        }`,
      };
    }
  }

  // True when the plan resolver did not produce a usable result and the UI
  // is therefore rendering the static Free defaults.
  const planFetchSettled = planRaw !== null || planRpcError !== null;
  const rpcFailed = planRpcError !== null || (planFetchSettled && planInfo === null);
  const fallingBackToFree = planInfo === null;

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

      {/* Plan resolver diagnostic — rendered FIRST, directly under the page
          title, whenever the Diagnostics toggle is ON. Never hidden by RPC
          errors, missing data, plan value or admin status. */}
      {diagnosticsEnabled && (
        <div className="mb-5 rounded-[12px] border-2 border-[#2F6FE4] bg-white px-4 py-3 font-mono text-[11px] leading-5 text-[#475569] shadow-[0_4px_16px_rgba(47,111,228,0.15)]">
          <div className="mb-1 text-sm font-bold text-[#111827]">Plan resolver diagnostic</div>
          {rpcFailed && (
            <div className="mb-2 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 font-sans text-xs font-semibold text-[#B91C1C]">
              RPC failed — UI is falling back to Free
            </div>
          )}
          {!planFetchSettled && (
            <div className="mb-2 rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800">
              Plan RPC has not returned yet (loading or no workspace agency selected).
            </div>
          )}
          <div>diagnosticsEnabled: {String(diagnosticsEnabled)}</div>
          <div>route_file: src/routes/admin.index.tsx</div>
          <div>workspace_org_name: {agency.selected?.name ?? "—"}</div>
          <div>workspace_agency_id: {agencyId ?? "— (no workspace agency selected)"}</div>
          <div>workspace_agency_slug: {agency.selected?.slug ?? "—"}</div>
          <div>logged_in_user_email: {userEmail ?? "—"}</div>
          <div>resolver: supabase.rpc(&quot;get_agency_plan_limits&quot;, {"{"} _agency_id: workspace_agency_id {"}"})</div>
          <div>fetched_at: {planInfo?.fetchedAt ?? "—"}</div>
          <div className="mt-2 font-semibold text-[#111827]">get_agency_plan_limits raw response:</div>
          <pre className="whitespace-pre-wrap break-all">{planRaw ?? "(no data returned)"}</pre>
          <div className="mt-2 font-semibold text-[#B91C1C]">get_agency_plan_limits RPC error:</div>
          <pre className="whitespace-pre-wrap break-all text-[#B91C1C]">{planRpcError ?? "(none)"}</pre>
          <div className="mt-2 font-semibold text-[#111827]">direct agencies row (id, name, slug, manual_plan_override, status):</div>
          <pre className="whitespace-pre-wrap break-all">{agencyRowRaw ?? "(no row returned — RLS may block direct read; compare agency_id above against System Admin row)"}</pre>
          <div className="mt-2 font-semibold text-[#B91C1C]">agencies lookup error:</div>
          <pre className="whitespace-pre-wrap break-all text-[#B91C1C]">{agencyRowError ?? "(none)"}</pre>
          <div className="mt-2 font-semibold text-[#111827]">values the venue banner is actually using:</div>
          <div>banner_plan_code: {currentPlan.code}</div>
          <div>banner_plan_name: {currentPlan.name}</div>
          <div>banner_venue_limit: {limit === null ? "unlimited" : limit}</div>
          <div>banner_plan_came_from: {planInfo ? "rpc (get_agency_plan_limits)" : "static fallback (Free defaults)"}</div>
          <div className="mt-2">
            parsed → effective_plan_code: {planInfo?.code ?? "(rpc not parsed — fell back to free)"} · plan_source:{" "}
            {planInfo?.source ?? "—"} · venue_limit:{" "}
            {planInfo ? (planInfo.venueLimit === null ? "unlimited" : planInfo.venueLimit) : "—"} ·
            manual_plan_override: {planInfo?.manualOverride ?? "—"} · subscription_plan_code:{" "}
            {planInfo?.subscriptionCode ?? "—"}
          </div>
        </div>
      )}


      {/* Venue usage plan banner */}
      {agencyId && (
        <div className="mb-5 rounded-[12px] border border-[#D9E2EF] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center rounded-full bg-[#EAF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#2F6FE4]">
                {currentPlan.name}
              </span>
              <span className="text-[#64748B]">{venueUsageMessage}</span>
            </div>
            {venueNotice && (
              <div
                className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                  venueNotice.tone === "danger"
                    ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
                    : venueNotice.tone === "warn"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                      : "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300"
                }`}
              >
                {venueNotice.message}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0">
            <Link
              to="/admin/account"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#D9E2EF] bg-white px-4 text-sm font-medium text-[#111827] hover:bg-[#F8FAFC]"
            >
              View plans
            </Link>
            {currentPlan.code !== "enterprise" && limit !== null && (
              <button
                type="button"
                disabled
                title="Online billing is coming soon. You can continue setting up and testing GetStampd."
                className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-lg border bg-[#F1F5F9] px-4 text-sm font-medium text-[#64748B] opacity-70"
              >
                Upgrade plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Temporary plan diagnostics — behind the global Diagnostics toggle */}
      {agencyId && diagnosticsEnabled && (
        <div className="mb-5 rounded-[12px] border border-[#D9E2EF] bg-white px-4 py-3 font-mono text-[11px] leading-5 text-[#64748B]">
          <div className="mb-1 font-semibold text-[#111827]">Plan resolver diagnostic</div>
          <div>workspace_org_name: {agency.selected?.name ?? "—"}</div>
          <div>workspace_agency_id: {agencyId}</div>
          <div>workspace_agency_slug: {agency.selected?.slug ?? "—"}</div>
          <div>logged_in_user_email: {userEmail ?? "—"}</div>
          <div>resolver: supabase.rpc(&quot;get_agency_plan_limits&quot;, {"{"} _agency_id: workspace_agency_id {"}"})</div>
          <div>fetched_at: {planInfo?.fetchedAt ?? "—"}</div>
          <div className="mt-2 font-semibold text-[#111827]">get_agency_plan_limits raw response:</div>
          <pre className="whitespace-pre-wrap break-all">{planRaw ?? "(no data returned)"}</pre>
          {planRpcError && (
            <>
              <div className="mt-2 font-semibold text-[#B91C1C]">get_agency_plan_limits RPC error:</div>
              <pre className="whitespace-pre-wrap break-all text-[#B91C1C]">{planRpcError}</pre>
            </>
          )}
          <div className="mt-2 font-semibold text-[#111827]">direct agencies row (id, name, slug, manual_plan_override, status):</div>
          <pre className="whitespace-pre-wrap break-all">{agencyRowRaw ?? "(no row returned — RLS may block direct read; compare agency_id above against System Admin row)"}</pre>
          {agencyRowError && (
            <>
              <div className="mt-2 font-semibold text-[#B91C1C]">agencies lookup error:</div>
              <pre className="whitespace-pre-wrap break-all text-[#B91C1C]">{agencyRowError}</pre>
            </>
          )}
          <div className="mt-2">
            parsed → effective_plan_code: {planInfo?.code ?? "(rpc not parsed — fell back to free)"} · plan_source:{" "}
            {planInfo?.source ?? "—"} · venue_limit:{" "}
            {planInfo ? (planInfo.venueLimit === null ? "unlimited" : planInfo.venueLimit) : "—"} ·
            manual_plan_override: {planInfo?.manualOverride ?? "—"} · subscription_plan_code:{" "}
            {planInfo?.subscriptionCode ?? "—"}
          </div>
        </div>
      )}

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
