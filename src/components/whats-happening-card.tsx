import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

type CheckinRow = {
  first_name: string;
  last_initial: string | null;
  venue_name: string;
  happened_at: string;
};

type BonusRow = {
  first_name: string;
  bonus_name: string;
  points_awarded: number;
  happened_at: string;
};

type HappeningPayload = {
  recent_checkins: CheckinRow[];
  explorers_today: number;
  recent_bonus: BonusRow[];
};

type WhatsHappeningCardProps = {
  subdomain?: string | null;
  hostname?: string | null;
  fallbackCheckins?: CheckinRow[];
};

const POLL_MS = 30_000;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return "1 hr ago";
  if (hrs < 24) return `${hrs} hrs ago`;
  return "yesterday";
}

function displayName(first: string, initial: string | null): string {
  if (!first) return "Someone";
  return initial ? `${first} ${initial}.` : first;
}

function fallbackPayload(checkins: CheckinRow[] = []): HappeningPayload {
  return {
    recent_checkins: checkins.slice(0, 5),
    explorers_today: 0,
    recent_bonus: [],
  };
}

function mergeFallback(
  payload: HappeningPayload | null,
  checkins: CheckinRow[],
): HappeningPayload {
  if (!payload) return fallbackPayload(checkins);
  return {
    ...payload,
    recent_checkins:
      payload.recent_checkins?.length > 0
        ? payload.recent_checkins
        : checkins.slice(0, 5),
  };
}

export function WhatsHappeningCard({
  subdomain,
  hostname,
  fallbackCheckins,
}: WhatsHappeningCardProps) {
  const [data, setData] = useState<HappeningPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallbackRows = fallbackCheckins ?? [];
    const host = subdomain
      ? tenantHost(subdomain)
      : (hostname ?? "").toLowerCase().split(":")[0].trim();

    async function loadRecentCheckins(): Promise<CheckinRow[]> {
      if (!host) return [];
      const { data: recent, error } = await supabase.rpc(
        "get_public_event_recent_activity",
        { _hostname: host, _limit: 5 },
      );
      if (error) throw error;
      return ((recent ?? []) as Array<{
        first_name: string;
        venue_name: string;
        happened_at: string;
      }>).map((row) => ({
        first_name: row.first_name,
        last_initial: null,
        venue_name: row.venue_name,
        happened_at: row.happened_at,
      }));
    }

    async function load() {
      if (!host) {
        if (!cancelled) setData(fallbackPayload(fallbackRows));
        return;
      }
      try {
        const { data: res, error } = await supabase.rpc(
          "get_public_event_happening_now",
          { _hostname: host },
        );
        if (error) {
          throw error;
        }
        if (!cancelled && res) {
          setData(mergeFallback(res as HappeningPayload, fallbackRows));
        }
      } catch {
        try {
          const recentCheckins = await loadRecentCheckins();
          if (!cancelled) {
            setData(fallbackPayload(recentCheckins.length ? recentCheckins : fallbackRows));
          }
        } catch {
          if (!cancelled) setData(fallbackPayload(fallbackRows));
        }
      }
    }

    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [subdomain, hostname, fallbackCheckins]);

  const isLoading = !data;

  const checkin = data?.recent_checkins?.[0] ?? null;
  const explorers = data?.explorers_today ?? 0;
  const bonus = data?.recent_bonus?.[0] ?? null;

  const showExplorers = explorers >= 1;
  const showBonus = Boolean(bonus);
  const isEmpty = !isLoading && !checkin && !showExplorers && !showBonus;

  return (
    <section>
      <div
        className="rounded-3xl border p-5 shadow-sm"
        style={{
          borderColor: "var(--event-card-border)",
          backgroundColor: "var(--event-card-bg)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-[16px] font-bold"
            style={{
              color: "var(--event-card-heading)",
              fontFamily: "var(--event-font)",
            }}
          >
            What's Happening Now
          </h3>
          <Link
            to="/leaderboard"
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--event-link, var(--event-card-muted))" }}
          >
            View all
          </Link>
        </div>

        {isLoading && (
          <p
            className="mt-4 text-[13px] leading-snug"
            style={{ color: "var(--event-card-muted)" }}
          >
            Loading live activity…
          </p>
        )}

        {isEmpty && (
          <p
            className="mt-4 text-[13px] leading-snug"
            style={{ color: "var(--event-card-muted)" }}
          >
            No activity in the last little while — be the first to check in!
          </p>
        )}


        <ul className="mt-4 flex flex-col gap-4">
          {checkin && (
            <li className="flex gap-3">
              <span aria-hidden className="text-xl leading-none">🔥</span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] leading-snug"
                  style={{ color: "var(--event-card-text)" }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {displayName(checkin.first_name, checkin.last_initial)}
                  </span>{" "}
                  just visited{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {checkin.venue_name}
                  </span>
                </p>
                <p
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  {relativeTime(checkin.happened_at)}
                </p>
              </div>
            </li>
          )}

          {showExplorers && (
            <li className="flex gap-3">
              <span aria-hidden className="text-xl leading-none">🍷</span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] leading-snug"
                  style={{ color: "var(--event-card-text)" }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {explorers} people are exploring
                  </span>{" "}
                  the trail today
                </p>
                <p
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  Join them!
                </p>
              </div>
            </li>
          )}

          {showBonus && bonus && (
            <li className="flex gap-3">
              <span aria-hidden className="text-xl leading-none">⭐</span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] leading-snug"
                  style={{ color: "var(--event-card-text)" }}
                >
                  Someone found a{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    hidden bonus
                  </span>{" "}
                  —{" "}
                  <span
                    className="font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {bonus.bonus_name}
                  </span>
                  !
                </p>
                <p
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  {bonus.points_awarded} bonus points awarded
                </p>
              </div>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
