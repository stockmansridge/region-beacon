import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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

type Row = {
  visitor_id: string;
  display: string;
  count: number;
  rank: number;
};

function LeaderboardPage() {
  const { eventId } = Route.useParams();
  const agency = useAgencyContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [settings, setSettings] = useState<LeaderboardSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

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

      const [settingsRes, checkinsRes] = await Promise.all([
        supabase
          .from("leaderboard_settings")
          .select(
            "is_enabled, display_mode, show_first_name, show_last_initial, show_visit_count, hide_below_checkins",
          )
          .eq("event_id", eventId)
          .maybeSingle(),
        supabase
          .from("checkins")
          .select("visitor_id")
          .eq("event_id", eventId),
      ]);
      if (cancelled) return;

      const s = (settingsRes.data ?? null) as LeaderboardSettings | null;
      setSettings(s);

      if (checkinsRes.error) {
        setRows([]);
        setLoading(false);
        return;
      }

      const counts = new Map<string, number>();
      for (const c of (checkinsRes.data ?? []) as { visitor_id: string }[]) {
        counts.set(c.visitor_id, (counts.get(c.visitor_id) ?? 0) + 1);
      }

      const visitorIds = Array.from(counts.keys());
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

      const mode = s?.display_mode ?? "first_name_last_initial";
      const hideBelow = Math.max(1, s?.hide_below_checkins ?? 1);

      const sorted = visitorIds
        .map((id) => ({ id, count: counts.get(id) ?? 0 }))
        .filter((r) => r.count >= hideBelow)
        .sort((a, b) => b.count - a.count);

      const out: Row[] = sorted.map((r, idx) => {
        const v = vById.get(r.id);
        return {
          visitor_id: r.id,
          display: formatDisplay(mode, v),
          count: r.count,
          rank: idx + 1,
        };
      });

      setRows(out);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, eventId]);

  const showCount = settings?.show_visit_count ?? true;

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description={event ? `${event.name} · status: ${event.status}` : undefined}
        actions={
          <Link
            to="/admin/events/$eventId"
            params={{ eventId }}
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Back to event
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-6 lg:col-span-1">
          <h3 className="text-sm font-semibold">Settings summary</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Enabled" v={settings?.is_enabled ? "yes" : "no"} />
            <Row k="Display mode" v={settings?.display_mode ?? "—"} />
            <Row k="Hide below" v={String(settings?.hide_below_checkins ?? 1)} />
            <Row k="Show visit count" v={settings?.show_visit_count ? "yes" : "no"} />
          </dl>
          <p className="mt-4 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Privacy: email, mobile, postcode and full name are never shown publicly.
            This preview applies the same display rules.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Preview</h3>
            <span className="text-xs text-muted-foreground">Read-only · admin view</span>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="mt-6 text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No check-ins yet. The leaderboard will populate once visitors start collecting stamps.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-14">Rank</th>
                    <th className="px-3 py-2">Display name</th>
                    {showCount && <th className="px-3 py-2 w-24 text-right">Stamps</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.visitor_id} className="border-t">
                      <td className="px-3 py-2 font-mono">{r.rank}</td>
                      <td className="px-3 py-2">{r.display}</td>
                      {showCount && (
                        <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            A public leaderboard page is not yet enabled. This admin preview uses the same
            privacy-safe projection.
          </p>
        </section>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
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
