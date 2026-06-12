import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { tenantHost } from "@/lib/domains";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys } from "@/lib/use-event-palette";
import { getEventAssetPublicUrl } from "@/lib/event-assets";

export const Route = createFileRoute("/live/$subdomain/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard" }] }),
  component: function LeaderboardRoute() {
    const { subdomain } = Route.useParams();
    return <PublicLeaderboardPage subdomain={subdomain} />;
  },
});


type LeaderboardRow = {
  rank: number | null;
  display_name: string | null;
  stamps: number | null;
  points: number | null;
  venue_points: number | null;
  bonus_points: number | null;
  visit_count: number | null;
  tier: string | null;
  is_completed: boolean | null;
  is_enabled: boolean | null;
  event_found: boolean | null;
};

type SupportDetails = {
  hostname: string;
  subdomain: string;
  rpc_error_code: string | null;
  rpc_error_message: string | null;
  rpc_error_details: string | null;
  rpc_error_hint: string | null;
  row_count: number;
  first_row_event_found: boolean | null;
  first_row_is_enabled: boolean | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found"; support: SupportDetails }
  | { kind: "disabled" }
  | { kind: "ready"; rows: LeaderboardRow[] };

export function PublicLeaderboardPage({ subdomain }: { subdomain: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [eventId, setEventId] = useState<string | null>(null);
  const branding = useEventBrandingKeys(subdomain);
  // paletteKey/backgroundKey now flow via brandingScopeProps below.


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data } = await supabase.rpc("resolve_event_by_host", {
        _hostname: host,
      });
      const row = (data?.[0] ?? null) as { event_id?: string | null } | null;
      if (!cancelled) setEventId(row?.event_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);
      const { data, error } = await supabase.rpc(
        "get_public_leaderboard_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;

      const rows = (data ?? []) as LeaderboardRow[];
      const firstFound = rows[0]?.event_found ?? null;
      const firstEnabled = rows[0]?.is_enabled ?? null;

      const buildSupport = (): SupportDetails => ({
        hostname:
          typeof window !== "undefined" ? window.location.hostname : host,
        subdomain,
        rpc_error_code: (error as { code?: string } | null)?.code ?? null,
        rpc_error_message: error?.message ?? null,
        rpc_error_details:
          (error as { details?: string } | null)?.details ?? null,
        rpc_error_hint: (error as { hint?: string } | null)?.hint ?? null,
        row_count: rows.length,
        first_row_event_found: firstFound,
        first_row_is_enabled: firstEnabled,
      });

      // Hard RPC failure → not_found with support details.
      if (error) {
        setState({ kind: "not_found", support: buildSupport() });
        return;
      }

      // Explicit not-found sentinel from the RPC:
      //   rows.length === 1 AND event_found === false.
      // An empty result set (rows.length === 0) means the event IS live
      // and the leaderboard IS enabled — just no qualifying entries yet —
      // so it must fall through to the "ready" empty state, NOT not_found.
      if (rows.length === 1 && firstFound === false) {
        setState({ kind: "not_found", support: buildSupport() });
        return;
      }

      // Explicit disabled sentinel: event_found = true, is_enabled = false,
      // display_name = null.
      if (
        rows.length === 1 &&
        firstEnabled === false &&
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
    <EventPaletteScope {...brandingScopeProps(branding)} className="min-h-screen px-4 py-8 sm:py-12">
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventId={eventId}
        activeOverride="leaderboard"
        logoUrl={getEventAssetPublicUrl(branding.logoPath)}
        primaryColor={branding.primaryColor}
        accentColor={branding.accentColor}
        transparentHeader
      />
      <div className="mx-auto max-w-xl">
        <Header subdomain={subdomain} />

        {state.kind === "loading" && (
          <Card>
            <p className="text-center text-sm text-[var(--event-card-muted)]">Loading…</p>
          </Card>
        )}

        {state.kind === "not_found" && (
          <>
            <EmptyState
              title="Event not live yet"
              body="This leaderboard isn't available right now. Please check back closer to the event, or contact the organiser for details."
            />
            <SupportDetailsBlock details={state.support} />
          </>
        )}

        {state.kind === "disabled" && (
          <EmptyState
            title="Leaderboard is not enabled"
            body="The organiser hasn't turned on the public leaderboard for this event."
          />
        )}

        {state.kind === "ready" && state.rows.length === 0 && (
          <EmptyState
            title="No points collected yet"
            body="Participants will appear here once they scan venue or bonus QR codes."
          />
        )}

        {state.kind === "ready" && state.rows.length > 0 && (
          <LeaderboardList rows={state.rows} />
        )}

        <PrivacyNote />

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--event-link)] underline-offset-4 hover:underline"
          >
            ← Back to event
          </Link>
        </div>
      </div>
    </EventPaletteScope>
  );
}

function Header({ subdomain }: { subdomain: string }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[var(--event-hero-accent)]">
        {subdomain}.getstampd.com.au
      </p>
      <h1
        className="mt-2 text-3xl font-semibold sm:text-4xl"
        style={{
          color: "var(--event-page-heading)",
          fontFamily: "var(--event-font, inherit)",
        }}
      >
        Leaderboard
      </h1>
      <p
        className="mt-2 text-sm"
        style={{ color: "var(--event-page-muted)" }}
      >
        Ranked by total points. Passport stamps are still shown so you can track venue progress.
      </p>
    </div>
  );
}


function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-[var(--event-card-border)] bg-[var(--event-card-bg)] p-6 shadow-sm">
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-[var(--event-page-heading)]/10" />
      <h2 className="font-trail-serif text-center text-xl font-semibold text-[var(--event-page-heading)]">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-[var(--event-card-text)]/80">
        {body}
      </p>
    </Card>
  );
}

function tierColor(tier: string | null): { bg: string; fg: string } {
  const t = (tier ?? "").toLowerCase();
  if (t === "complete") return { bg: "var(--event-page-heading)", fg: "var(--event-page-bg)" };
  if (t === "gold") return { bg: "#C9A24A", fg: "#1F1A12" };
  if (t === "silver") return { bg: "#B8B0A0", fg: "#1F1A12" };
  if (t === "bronze") return { bg: "var(--event-accent)", fg: "var(--event-page-bg)" };
  return { bg: "var(--event-card-border)", fg: "var(--event-card-text)" };
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
            className="flex items-center gap-4 rounded-2xl border border-[var(--event-card-border)] bg-[var(--event-card-bg)] px-4 py-3 shadow-sm"
          >
            <RankBadge rank={r.rank ?? i + 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-trail-serif text-base font-semibold text-[var(--event-card-heading)]">
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
                  <span className="inline-flex items-center rounded-full bg-[var(--event-card-heading)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--event-card-heading)]">
                    Completed
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              {points !== null && (
                <div className="text-lg font-semibold text-[var(--event-link)]">
                  {points}
                  <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--event-card-muted)]">
                    pts
                  </span>
                </div>
              )}
              {stamps !== null && (
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--event-card-muted)]">
                  {stamps} {stamps === 1 ? "stamp" : "stamps"}
                </div>
              )}
              {(r.venue_points !== null || r.bonus_points !== null) &&
                (r.venue_points ?? 0) + (r.bonus_points ?? 0) > 0 && (
                  <div className="mt-0.5 text-[10px] text-[var(--event-card-muted)]">
                    {r.venue_points ?? 0} venue · {r.bonus_points ?? 0} bonus
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
        ? "var(--event-accent)"
        : "var(--event-card-heading)";
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-[var(--event-page-bg)]"
      style={{ backgroundColor: bg }}
    >
      {rank}
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="mx-auto mt-6 max-w-md text-center text-[11px] leading-relaxed text-[var(--event-page-muted)]">
      Names are shown according to the organiser's privacy settings. We never
      publish email, phone, postcode, or full names.
    </p>
  );
}

function SupportDetailsBlock({ details }: { details: SupportDetails }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(details, null, 2);
  return (
    <div className="mx-auto mt-4 max-w-md rounded-2xl border border-[var(--event-card-border)] bg-[var(--event-card-bg)] p-4 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--event-card-muted)]">
          Support details
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // ignore clipboard failure
            }
          }}
          className="rounded-full border border-[var(--event-button-secondary-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--event-button-secondary-fg)] hover:bg-[var(--event-button-secondary-fg)]/5"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-snug text-[var(--event-card-text)]">
        {text}
      </pre>
      <p className="mt-2 text-[10px] text-[var(--event-card-muted)]">
        If this keeps happening, paste these details to the organiser. No
        personal data is included.
      </p>
    </div>
  );
}
