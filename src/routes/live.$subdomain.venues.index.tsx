import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicTrailTabs } from "@/components/public-trail-tabs";
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

  return (
    <EventPaletteScope
      paletteKey={event?.palette_key ?? null}
      backgroundKey={event?.page_background_key ?? null}
      className="min-h-screen px-4 py-6"
    >
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        eventId={event?.event_id ?? null}
      />
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-muted,#8A7E66)]">
              Trail
            </p>
            <h1 className="mt-1 truncate font-trail-serif text-[26px] font-semibold leading-tight text-[var(--event-primary,#1F3D2B)]">
              {labels.plural}
            </h1>
          </div>
          <Link
            to="/"
            className="shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)] underline-offset-4 hover:underline"
          >
            ← Home
          </Link>
        </div>

        <PublicTrailTabs active="venues" venueLabelPlural={labels.plural} />

        {venues.length === 0 ? (
          <div className="rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-body,#3D372C)]">
            No {labels.plural.toLowerCase()} listed yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-3">
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
              return (
                <li key={vid || Math.random()}>
                  <div className="overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/50 hover:shadow-md">
                    <a
                      href={vid ? `/venues/${vid}` : "#"}
                      aria-label={`View ${v.name ?? "venue"} details`}
                      className="flex items-stretch gap-3 p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)]"
                    >
                      <Thumb path={v.cover_path ?? v.logo_path} />
                      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-trail-serif text-[17px] font-semibold leading-tight text-[var(--event-primary,#1F3D2B)]">
                              {v.name ?? "Unnamed"}
                            </p>
                            <VisitedBadge visited={visited} />
                          </div>
                          {v.description && (
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--event-body,#3D372C)]">
                              {v.description}
                            </p>
                          )}
                        </div>
                        {hasOffer && (
                          <div className="mt-1.5">
                            <span
                              className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                              style={{
                                backgroundColor:
                                  "color-mix(in oklab, var(--event-accent, var(--event-primary, #1F3D2B)) 16%, transparent)",
                                color: "var(--event-primary,#1F3D2B)",
                              }}
                            >
                              <span aria-hidden>🎁</span>
                              <span className="truncate">
                                {v.offer_summary!.split("\n")[0].slice(0, 40)}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </a>
                    {directionsUrl && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between border-t border-[var(--event-border,#E6DCC7)] px-3 py-2 text-[12px] font-medium text-[var(--event-primary,#1F3D2B)] hover:bg-[var(--event-primary,#1F3D2B)]/5"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden>📍</span> Get directions
                        </span>
                        <span aria-hidden className="text-[var(--event-muted,#8A7E66)]">
                          ↗
                        </span>
                      </a>
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

function VisitedBadge({ visited }: { visited: boolean }) {
  if (visited) {
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--event-primary,#1F3D2B)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--event-card-bg,#FBF5E8)]"
        title="Visited"
      >
        ✓ Visited
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--event-muted,#8A7E66)] text-[10px] text-[var(--event-muted,#8A7E66)]"
      title="Not visited"
      aria-label="Not visited"
    >
      ○
    </span>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = getVenueAssetPublicUrl(path);
  if (!url) {
    return (
      <div className="h-[88px] w-[88px] flex-shrink-0 rounded-xl bg-[var(--event-primary,#1F3D2B)]/10" />
    );
  }
  return (
    <div className="h-[88px] w-[88px] flex-shrink-0 overflow-hidden rounded-xl bg-[var(--event-primary,#1F3D2B)]/10">
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
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
