import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trophy, Users, Calendar, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys } from "@/lib/use-event-palette";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { listPublicAwards, type PublicEventAward } from "@/lib/event-awards";
import { getEventAssetPublicUrl } from "@/lib/event-assets";

export const Route = createFileRoute("/live/$subdomain/awards")({
  head: () => ({ meta: [{ title: "Prizes" }] }),
  component: function AwardsRoute() {
    const { subdomain } = Route.useParams();
    return <AwardsPage subdomain={subdomain} />;
  },
});

type EventInfo = { event_id: string | null; event_name: string | null };

function useEventInfo(subdomain: string): EventInfo {
  const [info, setInfo] = useState<EventInfo>({ event_id: null, event_name: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data } = await supabase.rpc("get_public_event_by_domain", {
        _hostname: host,
      });
      if (cancelled) return;
      const row = (data?.[0] ?? null) as { event_id?: string; name?: string } | null;
      setInfo({ event_id: row?.event_id ?? null, event_name: row?.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return info;
}

type RecentCheckin = {
  first_name: string;
  last_initial: string | null;
  venue_name: string;
  happened_at: string;
};

function useRecentActivity(subdomain: string) {
  const [rows, setRows] = useState<RecentCheckin[]>([]);
  useEffect(() => {
    let cancelled = false;
    const host = tenantHost(subdomain);
    async function load() {
      try {
        const { data } = await supabase.rpc(
          "get_public_event_happening_now",
          { _hostname: host },
        );
        if (cancelled) return;
        const payload = (data as { recent_checkins?: RecentCheckin[] } | null) ?? null;
        setRows(payload?.recent_checkins ?? []);
      } catch {
        // silent — banner is decorative
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [subdomain]);
  return rows;
}

function formatDrawDate(iso: string | null | undefined): string {
  if (!iso) return "Draw date: TBA";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "Draw date: TBA";
  return `Draw: ${d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function AwardsPage({ subdomain }: { subdomain: string }) {
  const branding = useEventBrandingKeys(subdomain);
  const eventInfo = useEventInfo(subdomain);
  const passport = useCurrentEventPassport(eventInfo.event_id);
  const [awards, setAwards] = useState<PublicEventAward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rewards" | "entries">("rewards");
  const recentCheckins = useRecentActivity(subdomain);

  useEffect(() => {
    if (!eventInfo.event_id) return;
    let cancelled = false;
    (async () => {
      try {
        let passportId: string | null = null;
        if (passport.passportHref) {
          const token = passport.passportHref.split("/").pop() ?? null;
          if (token) {
            const { data } = await supabase.rpc("get_passport_by_token", {
              _raw_token: token,
            });
            const row = (data?.[0] ?? null) as { passport_id?: string } | null;
            passportId = row?.passport_id ?? null;
          }
        }
        const rows = await listPublicAwards(eventInfo.event_id!, passportId);
        if (!cancelled) setAwards(rows);
      } catch (e) {
        if (!cancelled) {
          const err = e as {
            message?: string;
            details?: string;
            hint?: string;
            code?: string;
          } | null;
          const parts = [
            err?.message,
            err?.details,
            err?.hint ? `hint: ${err.hint}` : null,
            err?.code ? `code ${err.code}` : null,
          ].filter(Boolean);
          const msg =
            e instanceof Error
              ? e.message
              : parts.length > 0
                ? parts.join(" · ")
                : "Could not load prizes.";
          setError(msg);
          setAwards([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventInfo.event_id, passport.passportHref]);

  const hasPassport = !!passport.passportHref;
  const myEntries = useMemo(
    () => (awards ?? []).filter((a) => a.is_eligible),
    [awards],
  );
  const visibleAwards = tab === "entries" ? myEntries : (awards ?? []);

  // Highlight rules
  const topPrizeId = useMemo(() => {
    if (!awards || awards.length === 0) return null;
    return [...awards].sort((a, b) => b.points_required - a.points_required)[0]?.id ?? null;
  }, [awards]);
  const popularPrizeId = useMemo(() => {
    if (!awards || awards.length === 0) return null;
    const sorted = [...awards].sort((a, b) => b.eligible_count - a.eligible_count);
    return sorted[0] && sorted[0].eligible_count > 0 ? sorted[0].id : null;
  }, [awards]);

  const newInLastHour = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return recentCheckins.filter(
      (r) => new Date(r.happened_at).getTime() > cutoff,
    ).length;
  }, [recentCheckins]);

  const avatars = recentCheckins.slice(0, 5);

  return (
    <EventPaletteScope
      {...brandingScopeProps(branding)}
      className="min-h-screen px-4 pb-4"
    >
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventInfo.event_name ?? "Event"}
          eventId={eventInfo.event_id}
          logoUrl={getEventAssetPublicUrl(branding.logoPath)}
          primaryColor={branding.primaryColor}
          accentColor={branding.accentColor}
        />
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-[0.22em] text-[var(--event-link,var(--event-primary,#1F3D2B))] underline-offset-4 hover:underline"
        >
          ← Back to event
        </Link>

        {/* Tabs */}
        <div className="mt-4 flex rounded-full border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-1 text-sm font-semibold uppercase tracking-[0.16em]">
          <TabButton active={tab === "rewards"} onClick={() => setTab("rewards")}>
            Rewards
          </TabButton>
          <TabButton active={tab === "entries"} onClick={() => setTab("entries")}>
            My Entries {hasPassport && myEntries.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--event-primary,#1F3D2B)] px-1.5 py-0.5 text-[10px] text-[var(--event-primary-fg,#FFF)]">
                {myEntries.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* Live activity banner */}
        {newInLastHour > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--event-primary,#1F3D2B)]/20 bg-[var(--event-primary,#1F3D2B)] px-4 py-3 text-[var(--event-primary-fg,#FFF)] shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <div className="flex-1 text-xs font-semibold uppercase tracking-[0.18em]">
              Live draw activity
              <div className="mt-0.5 text-sm font-medium normal-case tracking-normal opacity-95">
                {newInLastHour} new {newInLastHour === 1 ? "entry" : "entries"} in the last hour
              </div>
            </div>
            {avatars.length > 0 && (
              <div className="flex -space-x-2">
                {avatars.map((a, i) => (
                  <div
                    key={i}
                    title={`${a.first_name} ${a.last_initial ?? ""}`.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--event-primary,#1F3D2B)] bg-[var(--event-accent,#C7A96B)] text-xs font-bold text-[var(--event-primary,#1F3D2B)]"
                  >
                    {(a.first_name?.[0] ?? "?").toUpperCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hero */}
        <CelebrationHero
          inDraw={hasPassport && myEntries.length > 0}
          entryCount={myEntries.length}
        />

        <div className="mt-6 space-y-4">
          {awards == null && (
            <p className="text-sm text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              Loading…
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive">
              Could not load prizes: {error}
            </p>
          )}
          {!error && awards != null && visibleAwards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              {tab === "entries"
                ? "You haven't unlocked any prize entries yet. Check in at venues to start collecting points."
                : "No prizes have been added for this event yet."}
            </div>
          )}
          {visibleAwards.map((a) => (
            <AwardCard
              key={a.id}
              award={a}
              hasPassport={hasPassport}
              isTopPrize={a.id === topPrizeId && (awards?.length ?? 0) > 1}
              isPopular={a.id === popularPrizeId && a.id !== topPrizeId}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-full px-4 py-2 text-xs transition-colors " +
        (active
          ? "bg-[var(--event-primary,#1F3D2B)] text-[var(--event-primary-fg,#FFF)] shadow-sm"
          : "text-[var(--event-card-muted,var(--event-muted,#8A7E66))] hover:text-[var(--event-primary,#1F3D2B)]")
      }
    >
      {children}
    </button>
  );
}




// Loads Dancing Script from Google Fonts once for the celebratory heading.
function useFunFont() {
  useEffect(() => {
    const id = "gs-fun-font-dancing-script";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

function CelebrationHero({
  inDraw,
  entryCount,
}: {
  inDraw: boolean;
  entryCount: number;
}) {
  useFunFont();
  const funFont = "'Dancing Script', 'Segoe Script', cursive";
  return (
    <div
      className="relative mt-4 overflow-hidden rounded-3xl border p-6 text-center shadow-md sm:p-10"
      style={{
        borderColor: "var(--event-card-border, var(--event-border, #E6DCC7))",
        background: inDraw
          ? "linear-gradient(140deg, var(--event-card-bg, #FBF5E8) 0%, color-mix(in oklab, var(--event-accent, #C7A96B) 18%, var(--event-card-bg, #FBF5E8)) 100%)"
          : "linear-gradient(140deg, var(--event-card-bg, #FBF5E8) 0%, color-mix(in oklab, var(--event-primary, #1F3D2B) 8%, var(--event-card-bg, #FBF5E8)) 100%)",
      }}
    >
      <StreamerConfetti />
      <div className="relative">
        {inDraw ? (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center text-6xl drop-shadow-sm sm:h-24 sm:w-24 sm:text-7xl">
              🎁
            </div>
            <h1
              className="mt-2 text-[2.6rem] leading-none sm:text-[3.4rem]"
              style={{
                fontFamily: funFont,
                fontWeight: 700,
                color: "var(--event-page-heading, var(--event-primary, #1F3D2B))",
                textShadow: "0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              You&rsquo;re In the Draw!
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm sm:text-base text-[var(--event-page-text,var(--event-text,#3D372C))]">
              Complete challenges to earn more points and increase your chances
              to win.
            </p>
            <div
              className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] shadow-sm"
              style={{
                background: "var(--event-primary, #1F3D2B)",
                color: "var(--event-primary-fg, #FFF)",
              }}
            >
              <PartyPopper className="h-3.5 w-3.5" />
              {entryCount} {entryCount === 1 ? "entry" : "entries"} unlocked
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center text-6xl drop-shadow-sm sm:h-24 sm:w-24 sm:text-7xl">
              🎁
            </div>
            <h1
              className="mt-2 text-[2.4rem] leading-none sm:text-[3rem]"
              style={{
                fontFamily: funFont,
                fontWeight: 700,
                color: "var(--event-page-heading, var(--event-primary, #1F3D2B))",
                textShadow: "0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              Prizes to be won
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm sm:text-base text-[var(--event-page-text,var(--event-text,#3D372C))]">
              Earn points by checking in at venues to unlock prizes and enter
              prize draws.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Colourful streamer + confetti bits inspired by the mockup.
function StreamerConfetti() {
  const bits = [
    { top: "6%", left: "8%", c: "#E76F51", r: "-18deg", kind: "streamer" },
    { top: "10%", left: "78%", c: "#2A9D8F", r: "24deg", kind: "streamer" },
    { top: "22%", left: "92%", c: "#E9C46A", r: "-8deg", kind: "dot" },
    { top: "70%", left: "6%", c: "#F4A261", r: "12deg", kind: "streamer" },
    { top: "82%", left: "84%", c: "#8ECAE6", r: "-22deg", kind: "streamer" },
    { top: "44%", left: "3%", c: "#E76F51", r: "0deg", kind: "dot" },
    { top: "52%", left: "96%", c: "#2A9D8F", r: "0deg", kind: "dot" },
    { top: "88%", left: "44%", c: "#E9C46A", r: "10deg", kind: "dot" },
    { top: "4%", left: "48%", c: "#8ECAE6", r: "-4deg", kind: "dot" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {bits.map((b, i) =>
        b.kind === "streamer" ? (
          <span
            key={i}
            className="absolute block"
            style={{
              top: b.top,
              left: b.left,
              width: 22,
              height: 6,
              borderRadius: 999,
              background: b.c,
              transform: `rotate(${b.r})`,
              opacity: 0.9,
              animation: `award-float 3.6s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ) : (
          <span
            key={i}
            className="absolute block h-2.5 w-2.5 rounded-full"
            style={{
              top: b.top,
              left: b.left,
              background: b.c,
              opacity: 0.85,
              animation: `award-float 3.2s ease-in-out ${i * 0.14}s infinite`,
            }}
          />
        ),
      )}
      <style>{`
        @keyframes award-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.85; }
          50% { transform: translateY(-6px) scale(1.15); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function AwardCard({
  award,
  hasPassport,
  isTopPrize,
  isPopular,
}: {
  award: PublicEventAward;
  hasPassport: boolean;
  isTopPrize: boolean;
  isPopular: boolean;
}) {
  const status = deriveStatus(award, hasPassport);
  const progress = Math.max(
    0,
    Math.min(
      100,
      award.points_required === 0
        ? 100
        : Math.round((award.passport_points / award.points_required) * 100),
    ),
  );
  const entrantCopy =
    award.eligible_count === 0
      ? "No entries yet — be first!"
      : `${award.eligible_count} ${award.eligible_count === 1 ? "person" : "people"} in this draw`;

  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border bg-[var(--event-card-bg,#FBF5E8)] shadow-sm transition-shadow hover:shadow-md " +
        (status === "eligible"
          ? "border-[var(--event-primary,#1F3D2B)]/40 ring-1 ring-[var(--event-primary,#1F3D2B)]/20"
          : "border-[var(--event-card-border,var(--event-border,#E6DCC7))]")
      }
    >
      {/* Highlight badges */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
        {isTopPrize && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow">
            <Trophy className="h-3 w-3" /> Top Prize
          </span>
        )}
        {isPopular && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--event-primary,#1F3D2B)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--event-primary-fg,#FFF)] shadow">
            <Sparkles className="h-3 w-3" /> Popular
          </span>
        )}
      </div>

      {award.image_url && (
        <img
          src={award.image_url}
          alt=""
          className="h-44 w-full object-cover"
          loading="lazy"
        />
      )}

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
            {award.title}
          </h2>
          {status === "eligible" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
              <PartyPopper className="h-3 w-3" /> You're in!
            </span>
          ) : (
            <StatusBadge status={status} />
          )}
        </div>

        {award.description && (
          <p className="mt-1.5 text-sm text-[var(--event-card-text,var(--event-body,#3D372C))]">
            {award.description}
          </p>
        )}

        {/* Progress bar */}
        {hasPassport && award.points_required > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              <span>
                {Math.min(award.passport_points, award.points_required)} /{" "}
                {award.points_required} points
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--event-card-border,var(--event-border,#E6DCC7))]/60">
              <div
                className={
                  "h-full rounded-full transition-all " +
                  (status === "eligible"
                    ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                    : "bg-gradient-to-r from-[var(--event-accent,#C7A96B)] to-[var(--event-primary,#1F3D2B)]")
                }
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {award.requires_all_locations && (
          <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
            + Visit all locations required
          </p>
        )}

        <p className="mt-3 text-sm text-[var(--event-card-text,var(--event-body,#3D372C))]">
          <StatusMessage award={award} status={status} hasPassport={hasPassport} />
        </p>

        {/* Footer meta */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--event-card-border,var(--event-border,#E6DCC7))]/70 pt-3 text-xs text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Users className="h-3.5 w-3.5" /> {entrantCopy}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Calendar className="h-3.5 w-3.5" /> {formatDrawDate(award.draw_date ?? null)}
          </span>
        </div>
      </div>
    </div>
  );
}

type CardStatus = "eligible" | "need_points" | "need_all" | "need_points_and_all" | "anonymous";

function deriveStatus(award: PublicEventAward, hasPassport: boolean): CardStatus {
  if (!hasPassport) return "anonymous";
  if (award.is_eligible) return "eligible";
  const needsPoints = award.points_remaining > 0;
  const needsAll = award.needs_all_locations;
  if (needsPoints && needsAll) return "need_points_and_all";
  if (needsAll) return "need_all";
  return "need_points";
}

function StatusBadge({ status }: { status: CardStatus }) {
  const map: Record<CardStatus, { label: string; cls: string }> = {
    eligible: {
      label: "You're in!",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
    },
    need_points: {
      label: "Keep collecting",
      cls: "bg-amber-100 text-amber-900 border-amber-300",
    },
    need_all: {
      label: "Visit all locations",
      cls: "bg-sky-100 text-sky-900 border-sky-300",
    },
    need_points_and_all: {
      label: "Keep collecting",
      cls: "bg-amber-100 text-amber-900 border-amber-300",
    },
    anonymous: {
      label: "Start a passport",
      cls: "bg-slate-100 text-slate-700 border-slate-300",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
        cls
      }
    >
      {label}
    </span>
  );
}

function StatusMessage({
  award,
  status,
  hasPassport,
}: {
  award: PublicEventAward;
  status: CardStatus;
  hasPassport: boolean;
}) {
  if (!hasPassport) {
    return <>Start a passport and visit locations to enter this draw.</>;
  }
  if (status === "eligible") return <>You're in this draw. Good luck!</>;
  if (status === "need_points") {
    return (
      <>
        You need {award.points_remaining} more{" "}
        {award.points_remaining === 1 ? "point" : "points"} to enter this draw.
      </>
    );
  }
  if (status === "need_all") {
    return (
      <>
        You have enough points, but still need to visit every location to enter this draw.
      </>
    );
  }
  return (
    <>
      You need {award.points_remaining} more{" "}
      {award.points_remaining === 1 ? "point" : "points"} and must visit all locations to enter this draw.
    </>
  );
}
