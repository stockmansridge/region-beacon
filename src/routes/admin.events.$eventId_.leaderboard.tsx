import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/events/$eventId_/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: LeaderboardPage,
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  status: string;
};

type LeaderboardSettings = {
  is_enabled: boolean;
  display_mode: string;
  show_first_name: boolean;
  show_last_initial: boolean;
  show_visit_count: boolean;
  hide_below_checkins: number;
};

type Visitor = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type CheckinRow = {
  visitor_id: string;
  venue_id: string;
  entry_value: number | null;
};

type Row = {
  visitor_id: string;
  display: string;
  stamps: number;
  points: number;
  tier: string | null;
  is_completed: boolean;
  rank: number;
};

type PrizeRule = {
  id: string;
  name: string;
  prize_type: string;
  prize_name: string | null;
  threshold_checkins: number | null;
  requires_completion: boolean;
  max_entries_per_passport: number | null;
  is_active: boolean;
};

type PoolRow = {
  passport_id: string;
  visitor_id: string;
  display_name: string;
  stamps: number;
  entries: number;
};

type DrawResult = {
  result_id: string;
  winner_passport_id: string;
  winner_visitor_id: string;
  winner_display_name: string;
  winner_entries: number;
  pool_size: number;
  total_entries: number;
  seed: string;
  selected_entry_number: number;
  selected_hash: string;
  drawn_at: string;
};

type PriorDraw = {
  id: string;
  prize_rule_id: string;
  winner_display_name: string;
  winner_entries: number;
  total_eligible_passports: number;
  total_entries: number;
  seed: string;
  selected_entry_number: number;
  selected_hash: string;
  drawn_at: string;
};

function defaultTier(stamps: number, totalVenues: number): string | null {
  if (totalVenues > 0 && stamps >= totalVenues) return "Complete";
  if (stamps >= Math.min(8, Math.max(totalVenues, 1))) return "Gold";
  if (stamps >= 5) return "Silver";
  if (stamps >= 3) return "Bronze";
  return null;
}

function LeaderboardPage() {
  const { eventId } = Route.useParams();
  const agency = useAgencyContext();
  const canAdmin =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [settings, setSettings] = useState<LeaderboardSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [prizeRules, setPrizeRules] = useState<PrizeRule[]>([]);
  const [priorDraws, setPriorDraws] = useState<PriorDraw[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (agency.status !== "ready") return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const eventRes = await supabase
        .from("events")
        .select("id, agency_id, name, status")
        .eq("id", eventId)
        .maybeSingle();

      if (cancelled) return;
      if (eventRes.error || !eventRes.data) {
        setError("Could not load event.");
        setLoading(false);
        return;
      }
      const ev = eventRes.data as EventRow;
      setEvent(ev);

      const [settingsRes, checkinsRes, venuesRes, rulesRes, priorRes] =
        await Promise.all([
          supabase
            .from("leaderboard_settings")
            .select(
              "is_enabled, display_mode, show_first_name, show_last_initial, show_visit_count, hide_below_checkins",
            )
            .eq("event_id", eventId)
            .maybeSingle(),
          supabase
            .from("checkins")
            .select("visitor_id, venue_id, entry_value")
            .eq("event_id", eventId),
          supabase
            .from("venues")
            .select("id")
            .eq("event_id", eventId)
            .eq("status", "active")
            .is("deleted_at", null),
          supabase
            .from("prize_rules")
            .select(
              "id, name, prize_type, prize_name, threshold_checkins, requires_completion, max_entries_per_passport, is_active",
            )
            .eq("event_id", eventId)
            .eq("is_active", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("prize_draw_results")
            .select(
              "id, prize_rule_id, winner_display_name, winner_entries, total_eligible_passports, total_entries, seed, selected_entry_number, selected_hash, drawn_at",
            )
            .eq("event_id", eventId)
            .order("drawn_at", { ascending: false })
            .limit(20),
        ]);
      if (cancelled) return;

      setSettings((settingsRes.data ?? null) as LeaderboardSettings | null);
      setPrizeRules((rulesRes.data ?? []) as PrizeRule[]);
      setPriorDraws((priorRes.data ?? []) as PriorDraw[]);

      if (checkinsRes.error) {
        setRows([]);
        setLoading(false);
        return;
      }

      const totalVenues = (venuesRes.data ?? []).length;
      const checkins = (checkinsRes.data ?? []) as CheckinRow[];

      // Aggregate per visitor: distinct venues (stamps) + sum entry_value (points).
      const perVisitor = new Map<
        string,
        { stamps: Set<string>; points: number }
      >();
      for (const c of checkins) {
        const agg = perVisitor.get(c.visitor_id) ?? {
          stamps: new Set<string>(),
          points: 0,
        };
        agg.stamps.add(c.venue_id);
        agg.points += Math.max(1, c.entry_value ?? 1);
        perVisitor.set(c.visitor_id, agg);
      }

      const visitorIds = Array.from(perVisitor.keys());
      let visitors: Visitor[] = [];
      if (visitorIds.length > 0) {
        const vRes = await supabase
          .from("visitors")
          .select("id, first_name, last_name")
          .in("id", visitorIds);
        if (cancelled) return;
        visitors = (vRes.data ?? []) as Visitor[];
      }
      const vById = new Map(visitors.map((v) => [v.id, v]));

      const s = (settingsRes.data ?? null) as LeaderboardSettings | null;
      const mode = s?.display_mode ?? "first_name_last_initial";
      const hideBelow = Math.max(1, s?.hide_below_checkins ?? 1);

      const aggregated = visitorIds
        .map((id) => {
          const a = perVisitor.get(id)!;
          return {
            visitor_id: id,
            stamps: a.stamps.size,
            points: a.points,
          };
        })
        .filter((r) => r.stamps >= hideBelow)
        .sort(
          (a, b) => b.points - a.points || b.stamps - a.stamps,
        );

      const out: Row[] = aggregated.map((r, idx) => {
        const v = vById.get(r.visitor_id);
        return {
          visitor_id: r.visitor_id,
          display: formatDisplay(mode, v),
          stamps: r.stamps,
          points: r.points,
          tier: defaultTier(r.stamps, totalVenues),
          is_completed: totalVenues > 0 && r.stamps >= totalVenues,
          rank: idx + 1,
        };
      });

      setRows(out);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, eventId, reloadKey]);

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description={event ? `${event.name} · status: ${event.status}` : undefined}
        actions={
          <Link
            to="/admin/events/$eventId"
            params={{ eventId }}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
          >
            Back to event
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] lg:col-span-1">
          <h3 className="text-sm font-semibold">Settings summary</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <KV k="Enabled" v={settings?.is_enabled ? "yes" : "no"} />
            <KV k="Display mode" v={settings?.display_mode ?? "—"} />
            <KV k="Hide below" v={String(settings?.hide_below_checkins ?? 1)} />
            <KV k="Show visit count" v={settings?.show_visit_count ? "yes" : "no"} />
          </dl>
          <p className="mt-4 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-xs leading-5 text-[#334155]">
            Privacy: email, mobile, postcode and full name are never shown
            publicly. This admin preview uses the same display rules and
            adds tier + points computed from snapshotted check-in values.
          </p>
        </section>

        <section className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Preview</h3>
            <span className="text-xs text-muted-foreground">Read-only · admin view</span>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="mt-6 text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <div className="mt-6 rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-6 text-center text-sm text-[#475569]">
              No check-ins yet. The leaderboard will populate once visitors
              start collecting stamps.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[16px] border border-[#D9E2EF] bg-white">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-14">Rank</th>
                    <th className="px-3 py-2">Display name</th>
                    <th className="px-3 py-2 w-20 text-right">Stamps</th>
                    <th className="px-3 py-2 w-20 text-right">Points</th>
                    <th className="px-3 py-2 w-24">Tier</th>
                    <th className="px-3 py-2 w-24">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.visitor_id} className="border-t">
                      <td className="px-3 py-2 font-mono">{r.rank}</td>
                      <td className="px-3 py-2">{r.display}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.stamps}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.points}</td>
                      <td className="px-3 py-2 text-xs">{r.tier ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.is_completed ? "yes" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Points are summed from <code>checkins.entry_value</code>
            (snapshotted at scan time). Tier uses event reward rules with
            the default Bronze/Silver/Gold/Complete ladder as a fallback.
          </p>
        </section>
      </div>

      <PrizeDrawSection
        eventId={eventId}
        canAdmin={canAdmin}
        rules={prizeRules}
        priorDraws={priorDraws}
        onDrawCompleted={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function formatDisplay(mode: string, v: Visitor | undefined): string {
  const first = (v?.first_name ?? "").trim();
  const last = (v?.last_name ?? "").trim();
  const initial = last ? `${last[0]!.toUpperCase()}.` : "";
  switch (mode) {
    case "anonymous":
      return "Anonymous";
    case "alias_only":
      return "Visitor";
    case "first_name_only":
      return first || "Visitor";
    case "first_name_last_initial":
    default:
      if (first && initial) return `${first} ${initial}`;
      return first || "Visitor";
  }
}

// =============================================================================
// Prize draw section
// =============================================================================

function PrizeDrawSection({
  eventId,
  canAdmin,
  rules,
  priorDraws,
  onDrawCompleted,
}: {
  eventId: string;
  canAdmin: boolean;
  rules: PrizeRule[];
  priorDraws: PriorDraw[];
  onDrawCompleted: () => void;
}) {
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    rules[0]?.id ?? null,
  );
  const [pool, setPool] = useState<PoolRow[] | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

  const [seed, setSeed] = useState<string>("");
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [winner, setWinner] = useState<DrawResult | null>(null);

  useEffect(() => {
    if (rules.length > 0 && !rules.find((r) => r.id === selectedRuleId)) {
      setSelectedRuleId(rules[0].id);
    }
    if (rules.length === 0) setSelectedRuleId(null);
  }, [rules, selectedRuleId]);

  useEffect(() => {
    if (!canAdmin || !selectedRuleId) {
      setPool(null);
      return;
    }
    let cancelled = false;
    setPoolLoading(true);
    setPoolError(null);
    setWinner(null);
    (async () => {
      const { data, error } = await supabase.rpc(
        "admin_get_prize_draw_pool",
        { _event_id: eventId, _prize_rule_id: selectedRuleId },
      );
      if (cancelled) return;
      if (error) {
        setPool(null);
        setPoolError("Could not load entrant pool.");
      } else {
        setPool((data ?? []) as PoolRow[]);
      }
      setPoolLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canAdmin, eventId, selectedRuleId]);

  async function draw() {
    if (!canAdmin || !selectedRuleId) return;
    setDrawing(true);
    setDrawError(null);
    setWinner(null);
    const trimmed = seed.trim();
    const seedArg = trimmed.length > 0 ? trimmed : null;
    const { data, error } = await supabase.rpc("admin_draw_prize_winner", {
      _event_id: eventId,
      _prize_rule_id: selectedRuleId,
      _seed: seedArg,
    });
    setDrawing(false);
    if (error) {
      setDrawError("Could not draw a winner. Please try again.");
      return;
    }
    const rows = (data ?? []) as DrawResult[];
    if (rows.length === 0) {
      setDrawError("No winner returned.");
      return;
    }
    setWinner(rows[0]);
    onDrawCompleted();
  }

  if (!canAdmin) return null;

  return (
    <section className="mt-6 rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Prize draw</h3>
        <span className="text-xs text-muted-foreground">Admin · uses RPC</span>
      </div>

      {rules.length === 0 ? (
        <div className="mt-4 rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-6 text-center text-sm text-[#475569]">
          <p className="font-medium text-foreground">Prize rules setup coming soon</p>
          <p className="mt-1 text-xs">
            No active prize rules are configured for this event yet. Once an
            admin defines a prize rule, eligible entrants and a draw control
            will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Prize rule
            </label>
            <select
              value={selectedRuleId ?? ""}
              onChange={(e) => setSelectedRuleId(e.currentTarget.value)}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
            >
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.prize_name ? ` — ${r.prize_name}` : ""}
                </option>
              ))}
            </select>

            <div className="rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] px-4 py-3 text-xs leading-5 text-[#334155]">
              {poolLoading ? (
                <p className="text-muted-foreground">Loading pool…</p>
              ) : poolError ? (
                <p className="text-destructive">{poolError}</p>
              ) : pool ? (
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Eligible passports</dt>
                    <dd className="font-mono">{pool.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total weighted entries</dt>
                    <dd className="font-mono">
                      {pool.reduce((acc, p) => acc + p.entries, 0)}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Seed (optional UUID)
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.currentTarget.value)}
              placeholder="leave empty to auto-generate"
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 font-mono text-xs text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
            />

            <button
              type="button"
              onClick={draw}
              disabled={drawing || !pool || pool.length === 0}
              className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:opacity-50"
            >
              {drawing ? "Drawing…" : "Draw winner"}
            </button>
            {drawError && (
              <p className="text-xs text-destructive">{drawError}</p>
            )}
          </div>

          <div>
            {winner ? (
              <div className="rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] px-4 py-3 text-sm leading-6 text-[#047857]">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Winner
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {winner.winner_display_name}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Winner entries</dt>
                  <dd className="font-mono">{winner.winner_entries}</dd>
                  <dt className="text-muted-foreground">Pool size</dt>
                  <dd className="font-mono">{winner.pool_size}</dd>
                  <dt className="text-muted-foreground">Total entries</dt>
                  <dd className="font-mono">{winner.total_entries}</dd>
                  <dt className="text-muted-foreground">Selected entry #</dt>
                  <dd className="font-mono">{winner.selected_entry_number}</dd>
                  <dt className="text-muted-foreground">Seed</dt>
                  <dd className="break-all font-mono">{winner.seed}</dd>
                  <dt className="text-muted-foreground">Selected hash</dt>
                  <dd className="break-all font-mono">
                    {winner.selected_hash.slice(0, 16)}…
                  </dd>
                </dl>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Audit record written to <code>prize_draw_results</code>.
                  Re-running with the same seed and an unchanged pool will
                  reproduce this winner.
                </p>
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-center text-xs text-[#475569]">
                Select a prize rule and click <strong>Draw winner</strong>.
              </div>
            )}
          </div>
        </div>
      )}

      {priorDraws.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Previous draws
          </h4>
          <div className="mt-2 overflow-hidden rounded-[16px] border border-[#D9E2EF] bg-white">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Winner</th>
                  <th className="px-3 py-2 text-right">Entries</th>
                  <th className="px-3 py-2 text-right">Pool</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Seed</th>
                </tr>
              </thead>
              <tbody>
                {priorDraws.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(d.drawn_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {d.winner_display_name}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {d.winner_entries}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {d.total_eligible_passports}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {d.total_entries}
                    </td>
                    <td className="px-3 py-2 break-all font-mono text-muted-foreground">
                      {d.seed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
