import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/live/$subdomain/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: PublicLeaderboardPage,
});

type LeaderboardRow = {
  rank: number | null;
  display_name: string | null;
  visit_count: number | null;
  is_enabled: boolean | null;
  event_found: boolean | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "disabled" }
  | { kind: "ready"; rows: LeaderboardRow[] };

function PublicLeaderboardPage() {
  const { subdomain } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = `${subdomain}.getstamped.com.au`;
      const { data, error } = await supabase.rpc(
        "get_public_leaderboard_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;

      if (error) {
        setState({ kind: "not_found" });
        return;
      }
      const rows = (data ?? []) as LeaderboardRow[];

      // Sentinel: not found.
      if (rows.length === 0 || rows[0].event_found === false) {
        setState({ kind: "not_found" });
        return;
      }
      // Sentinel: disabled (single row with display_name=null, is_enabled=false).
      if (
        rows.length === 1 &&
        rows[0].is_enabled === false &&
        rows[0].display_name === null
      ) {
        setState({ kind: "disabled" });
        return;
      }
      // Data rows. Filter out any sentinel-shaped rows defensively.
      const dataRows = rows.filter(
        (r) => r.display_name !== null && r.rank !== null,
      );
      setState({ kind: "ready", rows: dataRows });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <Header subdomain={subdomain} />

        {state.kind === "loading" && (
          <Card>
            <p className="text-center text-sm text-[#8A7E66]">Loading…</p>
          </Card>
        )}

        {state.kind === "not_found" && (
          <EmptyState
            title="Event not live yet"
            body="This leaderboard isn't available right now. Please check back closer to the event, or contact the organiser for details."
          />
        )}

        {state.kind === "disabled" && (
          <EmptyState
            title="Leaderboard is not enabled"
            body="The organiser hasn't turned on the public leaderboard for this event."
          />
        )}

        {state.kind === "ready" && state.rows.length === 0 && (
          <EmptyState
            title="No check-ins yet"
            body="As soon as visitors start collecting stamps they'll appear here."
          />
        )}

        {state.kind === "ready" && state.rows.length > 0 && (
          <LeaderboardList rows={state.rows} />
        )}

        <PrivacyNote />

        <div className="mt-8 text-center">
          <Link
            to="/live/$subdomain"
            params={{ subdomain }}
            className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
          >
            ← Back to event
          </Link>
        </div>
      </div>
    </div>
  );
}

function Header({ subdomain }: { subdomain: string }) {
  return (
    <div className="mb-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#B5572A]">
        {subdomain}.getstamped.com.au
      </p>
      <h1 className="font-trail-serif mt-2 text-3xl font-semibold text-[#1F3D2B] sm:text-4xl">
        Leaderboard
      </h1>
      <p className="mt-2 text-sm text-[#3D372C]/80">
        Top stamp collectors at this event.
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 shadow-sm">
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-[#1F3D2B]/10" />
      <h2 className="font-trail-serif text-center text-xl font-semibold text-[#1F3D2B]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-[#3D372C]/80">
        {body}
      </p>
    </Card>
  );
}

function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li
          key={`${r.rank}-${r.display_name}-${i}`}
          className="flex items-center gap-4 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 shadow-sm"
        >
          <RankBadge rank={r.rank ?? i + 1} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-trail-serif text-base font-semibold text-[#1F3D2B]">
              {r.display_name ?? "Guest"}
            </p>
          </div>
          {r.visit_count !== null && r.visit_count !== undefined && (
            <div className="text-right">
              <div className="text-lg font-semibold text-[#B5572A]">
                {r.visit_count}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A7E66]">
                {r.visit_count === 1 ? "stamp" : "stamps"}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const gold = rank === 1;
  const silver = rank === 2;
  const bronze = rank === 3;
  const bg = gold
    ? "#C9A24A"
    : silver
      ? "#B8B0A0"
      : bronze
        ? "#B5572A"
        : "#1F3D2B";
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-[#F6EFE2]"
      style={{ backgroundColor: bg }}
    >
      {rank}
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="mx-auto mt-6 max-w-md text-center text-[11px] leading-relaxed text-[#8A7E66]">
      Names are shown according to the organiser's privacy settings. We never
      publish email, phone, postcode, or full names.
    </p>
  );
}
