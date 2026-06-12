import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Stamp, MapPin, Navigation } from "lucide-react";
import { resolveOfferIcon, resolveOfferBadgeStyle } from "@/lib/offer-display";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicTrailTabs } from "@/components/public-trail-tabs";
import { PassportProgressCard } from "@/components/passport-progress-card";
import { tenantHost } from "@/lib/domains";
import { buildGoogleMapsDirectionsUrl } from "@/lib/venue-directions";
import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";
import { loadPassportStampState } from "@/lib/passport-stamps";

export const Route = createFileRoute("/live/$subdomain/venues/")({
  head: () => ({ meta: [{ title: "Venues" }] }),
  component: function VenuesListRoute() {
    const { subdomain } = Route.useParams();
    return <PublicVenuesListPage subdomain={subdomain} />;
  },
});


type VenueRow = {
  venue_id: string | null;
  name: string | null;
  description: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  lat: number | null;
  lng: number | null;
  offer_summary: string | null;
  offer_display_icon: string | null;
  offer_display_colour: string | null;
  offer_display_foreground_colour: string | null;
  points_value?: number | null;
  order_index: number | null;
  event_found: boolean | null;
};

type EventRow = {
  event_id: string;
  name: string;
  primary_color: string | null;
  accent_color: string | null;
  palette_key?: string | null;
  page_background_key?: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
  logo_path?: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ready"; event: EventRow | null; venues: VenueRow[] };

export function PublicVenuesListPage({ subdomain }: { subdomain: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);

      const [{ data: venueData, error: venueErr }, { data: evtData }] =
        await Promise.all([
          supabase.rpc("get_public_venues_by_domain", { _hostname: host }),
          supabase.rpc("get_public_event_by_domain", { _hostname: host }),
        ]);
      if (cancelled) return;

      if (venueErr) {
        setState({ kind: "not_found" });
        return;
      }
      const rows = (venueData ?? []) as VenueRow[];

      if (rows.length === 0 || rows[0].event_found === false) {
        setState({ kind: "not_found" });
        return;
      }

      const venues = rows.filter((r) => r.event_found !== false && r.venue_id);
      const evtRaw = ((evtData?.[0] ?? null) as EventRow | null);
      const evt = evtRaw ? applyPaletteToEvent(evtRaw) : null;
      setState({ kind: "ready", event: evt, venues });

      if (evt?.event_id) {
        try {
          const passport = await resolveCurrentEventPassport(evt.event_id);
          if (!passport.token) return;
          const stamps = await loadPassportStampState(passport.token);
          if (cancelled) return;
          setVisitedIds(stamps.visitedVenueIds);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <NotLiveYet />;
  }

  const { event, venues } = state;
  const labels = resolveVenueLabels(event ?? {});
  const logoUrl = getEventAssetPublicUrl(event?.logo_path ?? null);
  const pointsEnabled = venues.some(
    (v) => typeof v.points_value === "number" && (v.points_value ?? 0) > 0,
  );

  return (
    <EventPaletteScope
      paletteKey={event?.palette_key ?? null}
      backgroundKey={event?.page_background_key ?? null}
      className="min-h-screen px-4 pb-10"
    >
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        logoUrl={logoUrl}
        eventId={event?.event_id ?? null}
      />
      <div className="mx-auto max-w-md">
        <PassportProgressCard
          eventId={event?.event_id ?? null}
          venueLabelPlural={labels.plural}
        />
        <div className="mt-4">
          <PublicTrailTabs active="venues" venueLabelPlural={labels.plural} />
        </div>

        {venues.length === 0 ? (
          <div className="rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-body,#3D372C)]">
            No {labels.plural.toLowerCase()} listed yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-4">
            {venues.map((v) => {
              const vid = v.venue_id ?? "";
              const visited = vid ? visitedIds.has(vid) : false;
              const directionsUrl = buildGoogleMapsDirectionsUrl({
                address: v.address,
                lat: v.lat,
                lng: v.lng,
              });
              const hasOffer =
                typeof v.offer_summary === "string" &&
                v.offer_summary.trim().length > 0;
              const points = v.points_value ?? 0;
              const showPoints = pointsEnabled && points > 0;
              return (
                <li key={vid || Math.random()}>
                  <div className="overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/60 hover:shadow-md">
                    <Link
                      to="/venues/$venueId"
                      params={{ venueId: vid }}
                      aria-label={`View ${v.name ?? "venue"} details`}
                      className="grid grid-cols-[112px_minmax(0,1fr)] items-stretch focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)] sm:grid-cols-[140px_minmax(0,1fr)]"
                    >
                      <HeroThumb
                        path={v.cover_path ?? v.logo_path}
                        visited={visited}
                      />
                      <div className="flex min-w-0 flex-col gap-1.5 p-3">
                        <p className="font-trail-serif text-[16px] font-semibold leading-snug text-[var(--event-primary,#1F3D2B)] break-words">
                          {v.name ?? "Unnamed"}
                        </p>
                        {v.description && (
                          <p className="line-clamp-5 text-[12.5px] leading-snug text-[var(--event-text,#3D372C)] sm:line-clamp-4">
                            {v.description}
                          </p>
                        )}
                        {hasOffer && (() => {
                          const OfferIcon = resolveOfferIcon(v.offer_display_icon);
                          const badgeStyle = resolveOfferBadgeStyle(
                            v.offer_display_colour,
                            v.offer_display_foreground_colour,
                          );
                          return (
                            <div className="mt-auto pt-1">
                              <span
                                className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                                style={{
                                  backgroundColor: badgeStyle.background,
                                  color: badgeStyle.color,
                                }}
                              >
                                <OfferIcon className="h-3 w-3" aria-hidden />
                                <span className="truncate">
                                  {v.offer_summary!.split("\n")[0].slice(0, 40)}
                                </span>
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </Link>
                    {(directionsUrl || showPoints) && (
                      <div className="flex items-center justify-between gap-2 border-t border-[var(--event-border,#E6DCC7)] px-3 py-2.5">
                        {directionsUrl ? (
                          <a
                            href={directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--event-primary,#1F3D2B)] transition hover:underline"
                          >
                            <Navigation className="h-3.5 w-3.5" aria-hidden />
                            Get directions
                          </a>
                        ) : (
                          <span />
                        )}
                        {showPoints && (
                          <span
                            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                            style={{ color: "var(--event-muted,#8A7E66)" }}
                          >
                            {visited ? (
                              <span style={{ color: "var(--event-primary,#1F3D2B)" }}>
                                {points} pts earned
                              </span>
                            ) : (
                              <>Visit to earn {points} pts</>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8 flex justify-center"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </EventPaletteScope>
  );
}

function HeroThumb({ path, visited }: { path: string | null; visited: boolean }) {
  const url = getVenueAssetPublicUrl(path);
  return (
    <div
      className="relative aspect-[3/4] min-h-full w-full overflow-hidden sm:aspect-[4/5]"
      style={{
        background:
          "color-mix(in oklab, var(--event-primary,#1F3D2B) 10%, var(--event-card-bg,#FBF5E8))",
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[var(--event-primary,#1F3D2B)]/35">
          <MapPin className="h-9 w-9" aria-hidden />
        </div>
      )}
      {/* Icon-only visited / not-yet indicator */}
      <span
        aria-label={visited ? "Visited" : "Not visited yet"}
        title={visited ? "Visited" : "Not visited yet"}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full shadow"
        style={
          visited
            ? {
                background: "var(--event-primary,#1F3D2B)",
                color: "var(--event-primary-fg,#F6EFE2)",
              }
            : {
                background:
                  "color-mix(in oklab, var(--event-card-bg,#FBF5E8) 80%, transparent)",
                color: "var(--event-muted,#8A7E66)",
                border:
                  "1px dashed color-mix(in oklab, var(--event-muted,#8A7E66) 60%, transparent)",
              }
        }
      >
        {visited ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Stamp className="h-4 w-4" aria-hidden />
        )}
      </span>
    </div>
  );
}

function NotLiveYet() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6">
      <div className="mx-auto max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--event-primary,#1F3D2B)]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
          Event not live yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">
          This passport experience isn't available right now. Please check back
          closer to the event, or contact the organiser for details.
        </p>
        <div className="mt-6 flex justify-start"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </div>
  );
}
