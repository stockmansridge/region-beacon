import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trophy, Users, Calendar, PartyPopper, Zap, ArrowUpDown, MapPin, AtSign, Hash } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys } from "@/lib/use-event-palette";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { listPublicAwards, type PublicEventAward } from "@/lib/event-awards";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";

const searchSchema = z.object({
  tab: fallback(z.string(), "prizes").default("prizes"),
});

export const Route = createFileRoute("/live/$subdomain/prizes")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Prizes" }] }),
  component: function AwardsRoute() {
    const { subdomain } = Route.useParams();
    const { tab } = Route.useSearch();
    return <AwardsPage subdomain={subdomain} initialTab={tab === "bonus" ? "bonus" : "prizes"} />;
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

type BonusRow = {
  bonus_code_id: string;
  name: string;
  description: string | null;
  points_value: number;
  is_claimed?: boolean;
  kind?: "points" | "social" | null;
  social_location?: string | null;
  social_hashtags?: string | null;
};

type Venue = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  logo_path: string | null;
};

type BonusEntry = BonusRow & {
  scope: "event" | "per_venue";
  venues: Venue[];
};

function usePublicBonuses(subdomain: string, eventId: string | null) {
  const [rows, setRows] = useState<BonusEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId) {
      setRows(null);
      return;
    }
    let cancelled = false;
    const host = tenantHost(subdomain);
    (async () => {
      try {
        const rpc = (fn: string, args: Record<string, unknown>) =>
          (supabase.rpc as unknown as (this: typeof supabase, fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)
            .call(supabase, fn, args);

        const seen = new Map<string, BonusEntry>();

        // 1) Event-wide bonuses.
        const eventWideRes = await rpc("get_public_event_bonus_challenges", {
          _hostname: host,
          _passport_token: null,
        });
        if (eventWideRes.error) {
          console.error("[prizes] event-wide bonuses failed", eventWideRes.error);
        }
        const eventWide = Array.isArray(eventWideRes.data)
          ? (eventWideRes.data as BonusRow[])
          : [];
        for (const b of eventWide) {
          seen.set(b.bonus_code_id, { ...b, scope: "event", venues: [] });
        }

        // 2) Per-venue bonuses — iterate venues to collect participating names.
        const venuesRes = await rpc("get_public_venues_by_domain", {
          _hostname: host,
        });
        if (venuesRes.error) {
          console.error("[prizes] venues fetch failed", venuesRes.error);
        }
        const venues = (Array.isArray(venuesRes.data)
          ? (venuesRes.data as Array<{ id?: string; venue_id?: string; name: string; lat: unknown; lng: unknown; logo_path?: string | null }>)
          : []
        ).map<Venue>((v) => ({
          id: String(v.venue_id ?? v.id ?? ""),
          name: v.name,
          lat: v.lat == null ? null : Number(v.lat as string | number),
          lng: v.lng == null ? null : Number(v.lng as string | number),
          logo_path: v.logo_path ?? null,
        })).filter((v) => v.id.length > 0);

        const perVenueErrors: string[] = [];
        await Promise.all(
          venues.map(async (v) => {
            const r = await rpc("get_public_event_bonus_challenges", {
              _hostname: host,
              _passport_token: null,
              _venue_id: v.id,
            });
            if (r.error) {
              perVenueErrors.push(r.error.message ?? "rpc error");
              return;
            }
            const list = Array.isArray(r.data) ? (r.data as BonusRow[]) : [];
            for (const b of list) {
              const existing = seen.get(b.bonus_code_id);
              if (existing) {
                if (existing.scope === "event") continue;
                if (!existing.venues.some((x) => x.id === v.id)) existing.venues.push(v);
              } else {
                seen.set(b.bonus_code_id, { ...b, scope: "per_venue", venues: [v] });
              }
            }
          }),
        );
        if (perVenueErrors.length > 0) {
          console.error("[prizes] per-venue bonus errors", perVenueErrors);
        }

        if (cancelled) return;
        const merged = Array.from(seen.values());
        setRows(merged);
        if (merged.length === 0 && (eventWideRes.error || perVenueErrors.length > 0)) {
          setError(
            (eventWideRes.error?.message as string | undefined) ??
              perVenueErrors[0] ??
              "Failed to load bonus points.",
          );
        } else {
          setError(null);
        }
      } catch (e) {
        console.error("[prizes] bonuses load threw", e);
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Failed to load bonus points.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain, eventId]);
  return { rows, error };
}

type SortMode = "az" | "points" | "proximity";

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function AwardsPage({
  subdomain,
  initialTab = "prizes",
}: {
  subdomain: string;
  initialTab?: "prizes" | "bonus";
}) {
  const branding = useEventBrandingKeys(subdomain);
  const eventInfo = useEventInfo(subdomain);
  const passport = useCurrentEventPassport(eventInfo.event_id);
  const [awards, setAwards] = useState<PublicEventAward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"prizes" | "bonus">(initialTab);
  const recentCheckins = useRecentActivity(subdomain);
  const { rows: bonuses, error: bonusesError } = usePublicBonuses(subdomain, eventInfo.event_id);
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

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
          const err = e as { message?: string; details?: string; hint?: string; code?: string } | null;
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

  const sortedBonuses = useMemo(() => {
    const list = [...(bonuses ?? [])];
    if (sortMode === "az") {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    } else if (sortMode === "points") {
      list.sort((a, b) => b.points_value - a.points_value);
    } else if (sortMode === "proximity" && userLoc) {
      const dist = (e: BonusEntry) => {
        const pts = e.venues
          .filter((v) => v.lat != null && v.lng != null && !(v.lat === 0 && v.lng === 0))
          .map((v) => distanceKm(userLoc, { lat: v.lat as number, lng: v.lng as number }));
        if (pts.length === 0) return Number.POSITIVE_INFINITY;
        return Math.min(...pts);
      };
      list.sort((a, b) => dist(a) - dist(b));
    }
    return list;
  }, [bonuses, sortMode, userLoc]);

  function requestProximity() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location not available on this device.");
      return;
    }
    setSortMode("proximity");
    if (userLoc) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      () => {
        setGeoError("Couldn't get your location — showing A–Z.");
        setSortMode("az");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

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
    return recentCheckins.filter((r) => new Date(r.happened_at).getTime() > cutoff).length;
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
          <TabButton active={tab === "prizes"} onClick={() => setTab("prizes")}>
            Prizes
          </TabButton>
          <TabButton active={tab === "bonus"} onClick={() => setTab("bonus")}>
            Bonus Points {bonuses && bonuses.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--event-primary,#1F3D2B)] px-1.5 py-0.5 text-[10px] text-[var(--event-primary-fg,#FFF)]">
                {bonuses.length}
              </span>
            )}
          </TabButton>
        </div>

        {tab === "prizes" && (
          <>
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
              {!error && awards != null && (awards?.length ?? 0) === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
                  No prizes have been added for this event yet.
                </div>
              )}
              {(awards ?? []).map((a) => (
                <AwardCard
                  key={a.id}
                  award={a}
                  hasPassport={hasPassport}
                  isTopPrize={a.id === topPrizeId && (awards?.length ?? 0) > 1}
                  isPopular={a.id === popularPrizeId && a.id !== topPrizeId}
                />
              ))}
            </div>
          </>
        )}

        {tab === "bonus" && (
          <div className="mt-4 space-y-4">
            {/* Sort filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
                <ArrowUpDown className="h-3.5 w-3.5" /> Sort
              </span>
              <SortPill active={sortMode === "az"} onClick={() => setSortMode("az")}>A–Z</SortPill>
              <SortPill active={sortMode === "points"} onClick={() => setSortMode("points")}>Points</SortPill>
              <SortPill active={sortMode === "proximity"} onClick={requestProximity}>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Proximity</span>
              </SortPill>
              {geoError && (
                <span className="text-[11px] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">{geoError}</span>
              )}
            </div>

            {bonuses == null && (
              <p className="text-sm text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">Loading…</p>
            )}
            {bonuses != null && bonuses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
                {bonusesError
                  ? `Couldn't load bonus points: ${bonusesError}`
                  : "No bonus points have been added for this event yet."}
              </div>
            )}
            {sortedBonuses.map((b) => (
              <BonusCard key={b.bonus_code_id} bonus={b} userLoc={userLoc} eventLogoUrl={getEventAssetPublicUrl(branding.logoPath)} />
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}

function SortPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors " +
        (active
          ? "border-[var(--event-primary,#1F3D2B)] bg-[var(--event-primary,#1F3D2B)] text-[var(--event-primary-fg,#FFF)]"
          : "border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] text-[var(--event-card-muted,var(--event-muted,#8A7E66))] hover:text-[var(--event-primary,#1F3D2B)]")
      }
    >
      {children}
    </button>
  );
}

function BonusCard({ bonus, userLoc, eventLogoUrl }: { bonus: BonusEntry; userLoc: { lat: number; lng: number } | null; eventLogoUrl: string | null }) {
  const isSocial = bonus.kind === "social";
  const nearestKm = useMemo(() => {
    if (!userLoc || bonus.venues.length === 0) return null;
    const dists = bonus.venues
      .filter((v) => v.lat != null && v.lng != null && !(v.lat === 0 && v.lng === 0))
      .map((v) => distanceKm(userLoc, { lat: v.lat as number, lng: v.lng as number }));
    if (dists.length === 0) return null;
    return Math.min(...dists);
  }, [bonus.venues, userLoc]);

  const singleVenueLogo =
    bonus.scope === "per_venue" && bonus.venues.length === 1
      ? getVenueAssetPublicUrl(bonus.venues[0]!.logo_path)
      : null;
  const logoUrl = singleVenueLogo ?? eventLogoUrl;
  const logoAlt =
    bonus.scope === "per_venue" && bonus.venues.length === 1
      ? bonus.venues[0]!.name
      : "Event";

  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = !!logoUrl && !logoBroken;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl"
          style={{
            backgroundColor: "var(--event-hero-accent, var(--event-accent, var(--event-primary, #1F3D2B)))",
            color: "var(--event-button-primary-fg, var(--event-primary-fg, #FFFFFF))",
          }}
        >
          {showLogo ? (
            <img
              src={logoUrl!}
              alt={logoAlt}
              className="h-full w-full object-cover"
              onError={() => setLogoBroken(true)}
            />
          ) : isSocial ? (
            <Hash className="h-5 w-5" aria-hidden />
          ) : (
            <Sparkles className="h-5 w-5" aria-hidden />
          )}
        </div>


        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
              {bonus.name}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--event-primary,#1F3D2B)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--event-primary-fg,#FFF)]">
              +{bonus.points_value} pts
            </span>
          </div>
          {bonus.description && (
            <p className="mt-1 text-sm text-[var(--event-card-text,var(--event-body,#3D372C))]">
              {bonus.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
            <span className="inline-flex items-center gap-1">
              {isSocial ? "Social" : "Points"}
            </span>
            <span>·</span>
            <span>
              {bonus.scope === "event"
                ? "Event-wide"
                : bonus.venues.length === 1
                  ? bonus.venues[0]!.name
                  : `${bonus.venues.length} venues`}
            </span>
            {nearestKm != null && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {nearestKm < 1 ? `${Math.round(nearestKm * 1000)} m` : `${nearestKm.toFixed(1)} km`}
                </span>
              </>
            )}
          </div>
          {bonus.scope === "per_venue" && bonus.venues.length > 1 && (
            <p className="mt-2 text-[12px] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
              At: {bonus.venues.map((v) => v.name).join(" · ")}
            </p>
          )}
          {isSocial && (bonus.social_location || bonus.social_hashtags) && (
            <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-[var(--event-card-text,var(--event-body,#3D372C))]">
              {bonus.social_location && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5">
                  <AtSign className="h-3 w-3" /> {bonus.social_location.replace(/^@+/, "")}
                </span>
              )}
              {bonus.social_hashtags &&
                bonus.social_hashtags
                  .split(/[\s,]+/)
                  .map((t) => t.replace(/^#+/, "").trim())
                  .filter(Boolean)
                  .map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5">
                      <Hash className="h-3 w-3" /> {tag}
                    </span>
                  ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
      <FireworksShow />

      <div className="relative">
        {inDraw ? (
          <>
            <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24">
              <div className="relative flex h-full w-full items-center justify-center text-6xl drop-shadow-sm sm:text-7xl">
                🎁
              </div>
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
            <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24">
              <div className="relative flex h-full w-full items-center justify-center text-6xl drop-shadow-sm sm:text-7xl">
                🎁
              </div>
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

// A short choreographed fireworks show layered over the hero card.
// Mixes three styles: a symmetrical circular burst, a "peony" burst
// whose sparks drift and fall with gravity, and a rocket that launches
// from the bottom and explodes into falling sparks.
function FireworksShow() {
  const shows: Array<{
    variant: "ring" | "peony" | "rocket";
    top: string;
    left: string;
    delay: number;
    hue: string;
  }> = [
    { variant: "ring",   top: "22%", left: "18%", delay: 0.0, hue: "#FF3B6B" },
    { variant: "peony",  top: "16%", left: "78%", delay: 1.1, hue: "#FFD23F" },
    { variant: "rocket", top: "30%", left: "50%", delay: 2.2, hue: "#3AB0FF" },
    { variant: "peony",  top: "28%", left: "34%", delay: 3.3, hue: "#B15CFF" },
    { variant: "ring",   top: "20%", left: "66%", delay: 4.2, hue: "#3DDC97" },
  ];
  const CYCLE = 5.2;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {shows.map((s, i) => (
        <FireworkBurst key={i} {...s} cycle={CYCLE} />
      ))}
      <style>{`
        @keyframes fw-rocket {
          0%   { transform: translate(-50%, 120%); opacity: 0; }
          6%   { opacity: 1; }
          38%  { transform: translate(-50%, 0%); opacity: 1; }
          42%  { transform: translate(-50%, 0%); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes fw-particle-ring {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          8%   { opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx, 0px)), calc(-50% + var(--dy, 0px))) scale(0.9); opacity: 0; }
        }
        @keyframes fw-particle-peony {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          10%  { opacity: 1; }
          60%  { opacity: 1; }
          100% {
            /* travel outward then fall — dy grows past its target via gravity term */
            transform: translate(
              calc(-50% + var(--dx, 0px)),
              calc(-50% + var(--dy, 0px) + 46px)
            ) scale(0.7);
            opacity: 0;
          }
        }
        @keyframes fw-flash {
          0%, 100% { opacity: 0; }
          6%, 12%  { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function FireworkBurst({
  variant,
  top,
  left,
  delay,
  hue,
  cycle,
}: {
  variant: "ring" | "peony" | "rocket";
  top: string;
  left: string;
  delay: number;
  hue: string;
  cycle: number;
}) {
  const palette = ["#FF3B6B", "#FFB800", "#FFE24B", "#3DDC97", "#3AB0FF", "#B15CFF", "#FF6BE1", "#FFFFFF"];
  const count = variant === "ring" ? 14 : 22;
  const items = Array.from({ length: count }).map((_, i) => {
    // Ring = evenly spaced, uniform radius. Peony = jittered angle + radius.
    const evenAngle = (i / count) * 360;
    const angle =
      variant === "ring"
        ? evenAngle
        : evenAngle + (Math.sin(i * 12.9) * 10);
    const radius =
      variant === "ring"
        ? 38
        : 30 + ((i * 7) % 22);
    const rad = (angle * Math.PI) / 180;
    return {
      dx: Math.cos(rad) * radius,
      dy: Math.sin(rad) * radius,
      color: i % 6 === 0 ? "#FFFFFF" : palette[i % palette.length],
      size: variant === "ring" ? 5 : 4 + (i % 3),
    };
  });

  // The rocket launches, then bursts. Burst starts partway through the cycle.
  const burstDelay = variant === "rocket" ? delay + 1.4 : delay;
  const burstAnim = variant === "peony" ? "fw-particle-peony" : "fw-particle-ring";

  return (
    <>
      {variant === "rocket" && (
        <div
          className="absolute"
          style={{
            top,
            left,
            width: 3,
            height: 22,
            marginLeft: -1.5,
            borderRadius: 999,
            background: `linear-gradient(180deg, ${hue}, transparent)`,
            boxShadow: `0 0 8px ${hue}`,
            animation: `fw-rocket 1.6s ease-out ${delay}s infinite`,
            animationDuration: `${cycle}s`,
            animationDelay: `${delay}s`,
          }}
        />
      )}
      {/* Central flash */}
      <div
        className="absolute rounded-full"
        style={{
          top,
          left,
          width: 22,
          height: 22,
          marginLeft: -11,
          marginTop: -11,
          background: `radial-gradient(circle, ${hue}CC 0%, ${hue}00 70%)`,
          filter: "blur(2px)",
          animation: `fw-flash ${cycle}s ease-out ${burstDelay}s infinite`,
        }}
      />
      <div
        className="absolute h-0 w-0"
        style={{ top, left }}
      >
        {items.map((p, i) => (
          <span
            key={i}
            className="absolute block rounded-full"
            style={{
              left: 0,
              top: 0,
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: `0 0 8px ${p.color}, 0 0 14px ${p.color}99`,
              transform: "translate(-50%, -50%)",
              animation: `${burstAnim} ${cycle}s cubic-bezier(0.12,0.7,0.3,1) ${burstDelay}s infinite`,
              opacity: 0,
              ["--dx" as any]: `${p.dx}px`,
              ["--dy" as any]: `${p.dy}px`,
            }}
          />
        ))}
      </div>
    </>
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
