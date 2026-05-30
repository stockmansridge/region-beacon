import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";

export const Route = createFileRoute("/live/$subdomain/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: PublicLeaderboardPage,
});

type LeaderboardRow = {
  rank: number | null;
  display_name: string | null;
  stamps: number | null;
  points: number | null;
  visit_count: number | null;
  tier: string | null;
  is_completed: boolean | null;
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
      const host = `${subdomain}.getstampd.com.au`;
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

      if (rows.length === 0 || rows[0].event_found === false) {
        setState({ kind: "not_found" });
        return;
      }
      if (
        rows.length === 1 &&
        rows[0].is_enabled === false &&
        rows[0].display_name === null
      ) {
        setState({ kind: "disabled" });
        return;
      }
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
      <PublicAnnouncementBar subdomain={subdomain} />
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
        {subdomain}.getstampd.com.au
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

function tierColor(tier: string | null): { bg: string; fg: string } {
  const t = (tier ?? "").toLowerCase();
  if (t === "complete") return { bg: "#1F3D2B", fg: "#F6EFE2" };
  if (t === "gold") return { bg: "#C9A24A", fg: "#1F1A12" };
  if (t === "silver") return { bg: "#B8B0A0", fg: "#1F1A12" };
  if (t === "bronze") return { bg: "#B5572A", fg: "#F6EFE2" };
  return { bg: "#E6DCC7", fg: "#3D372C" };
}

function LeaderboardList({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => {
        const stamps = r.stamps ?? r.visit_count ?? null;
        const points = r.points ?? null;
        const tier = r.tier;
        const tc = tierColor(tier);
        return (
          <li
            key={`${r.rank}-${r.display_name}-${i}`}
            className="flex items-center gap-4 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 shadow-sm"
          >
            <RankBadge rank={r.rank ?? i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-trail-serif text-base font-semibold text-[#1F3D2B]">
                {r.display_name ?? "Guest"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {tier && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ backgroundColor: tc.bg, color: tc.fg }}
                  >
                    {tier}
                  </span>
                )}
                {r.is_completed && (
                  <span className="inline-flex items-center rounded-full bg-[#1F3D2B]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1F3D2B]">
                    Completed
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              {points !== null && (
                <div className="text-lg font-semibold text-[#B5572A]">
                  {points}
                  <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A7E66]">
                    pts
                  </span>
                </div>
              )}
              {stamps !== null && (
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8A7E66]">
                  {stamps} {stamps === 1 ? "stamp" : "stamps"}
                </div>
              )}
            </div>
          </li>
        );
      })}
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
