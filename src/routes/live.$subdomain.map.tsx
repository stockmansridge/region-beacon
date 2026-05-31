import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMapkitToken } from "@/lib/mapkit.functions";
import { loadMapKitScript } from "@/lib/mapkit-loader";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { rpcEventHost } from "@/lib/domains";

export const Route = createFileRoute("/live/$subdomain/map")({
  head: () => ({ meta: [{ title: "Trail Map" }] }),
  component: function TrailMapRoute() {
    const { subdomain } = Route.useParams();
    return <PublicTrailMapPage subdomain={subdomain} />;
  },
});

type VenueRow = {
  venue_id: string | null;
  name: string | null;
  description: string | null;
  address: string | null;
  logo_path: string | null;
  cover_path: string | null;
  lat: number | null;
  lng: number | null;
  event_found: boolean | null;
};

type EventRow = {
  event_id: string;
  name: string;
  primary_color: string | null;
  accent_color: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
};

type Filter = "all" | "visited" | "not_visited";

export function PublicTrailMapPage({ subdomain }: { subdomain: string }) {
  const fetchToken = useServerFn(getMapkitToken);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [hasPassport, setHasPassport] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<VenueRow | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const annotationsRef = useRef<Map<string, any>>(new Map());

  // Load event + venues
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const host = rpcEventHost(subdomain);
      const [{ data: venueData }, { data: evtData }] = await Promise.all([
        supabase.rpc("get_public_venues_by_domain", { _hostname: host }),
        supabase.rpc("get_public_event_by_domain", { _hostname: host }),
      ]);
      if (cancelled) return;
      const rows = ((venueData ?? []) as VenueRow[]).filter(
        (r) => r.event_found !== false && r.venue_id,
      );
      setVenues(rows);
      const evt = (evtData?.[0] ?? null) as EventRow | null;
      setEvent(evt);
      setLoading(false);

      // Load passport stamps if a saved passport exists for this event.
      if (evt?.event_id && typeof localStorage !== "undefined") {
        try {
          const raw = localStorage.getItem(`gs.passport.${evt.event_id}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { access_token?: string };
            if (parsed?.access_token) {
              setHasPassport(true);
              const { data: stampsData } = await supabase.rpc(
                "get_passport_stamps_by_token" as never,
                { _raw_token: parsed.access_token } as never,
              );
              if (cancelled) return;
              const visited = new Set<string>();
              for (const s of (stampsData ?? []) as Array<{
                venue_id: string | null;
                stamped: boolean | null;
              }>) {
                if (s.venue_id && s.stamped) visited.add(s.venue_id);
              }
              setVisitedIds(visited);
            }
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const geoVenues = useMemo(
    () =>
      venues.filter(
        (v) =>
          typeof v.lat === "number" &&
          typeof v.lng === "number" &&
          Number.isFinite(v.lat) &&
          Number.isFinite(v.lng),
      ),
    [venues],
  );

  const filteredVenues = useMemo(() => {
    if (!hasPassport || filter === "all") return geoVenues;
    if (filter === "visited")
      return geoVenues.filter((v) => v.venue_id && visitedIds.has(v.venue_id));
    return geoVenues.filter((v) => v.venue_id && !visitedIds.has(v.venue_id));
  }, [geoVenues, filter, visitedIds, hasPassport]);

  // Init MapKit
  useEffect(() => {
    if (loading) return;
    if (geoVenues.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await fetchToken();
        if (cancelled) return;
        if (!tokenRes.token) {
          setMapError("Map unavailable right now.");
          return;
        }
        await loadMapKitScript();
        if (cancelled) return;
        const mapkit = window.mapkit;
        if (!mapkit) {
          setMapError("Map unavailable right now.");
          return;
        }
        mapkit.init({
          authorizationCallback: (done: (t: string) => void) => {
            done(tokenRes.token!);
          },
        });
        if (!mapContainerRef.current) return;
        const map = new mapkit.Map(mapContainerRef.current, {
          showsCompass: mapkit.FeatureVisibility?.Adaptive,
          isRotationEnabled: false,
          showsUserLocationControl: true,
        });
        mapRef.current = map;
      } catch (e) {
        setMapError(e instanceof Error ? e.message : "Map unavailable.");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
        annotationsRef.current = new Map();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, geoVenues.length === 0]);

  // Update annotations on filter / data change
  useEffect(() => {
    const mapkit = typeof window !== "undefined" ? window.mapkit : null;
    const map = mapRef.current;
    if (!mapkit || !map) return;
    // Remove old
    const previous = Array.from(annotationsRef.current.values());
    if (previous.length) {
      try {
        map.removeAnnotations(previous);
      } catch {
        /* ignore */
      }
    }
    annotationsRef.current = new Map();

    const accent = event?.accent_color ?? "#B5572A";
    const primary = event?.primary_color ?? "#1F3D2B";
    const muted = "#8A7E66";

    const fresh: any[] = [];
    for (const v of filteredVenues) {
      if (!v.venue_id) continue;
      const visited = hasPassport && visitedIds.has(v.venue_id);
      const coord = new mapkit.Coordinate(v.lat as number, v.lng as number);
      const annotation = new mapkit.MarkerAnnotation(coord, {
        title: v.name ?? "Venue",
        color: visited ? primary : hasPassport ? muted : accent,
        glyphText: visited ? "✓" : "",
      });
      annotation.addEventListener("select", () => setSelected(v));
      fresh.push(annotation);
      annotationsRef.current.set(v.venue_id, annotation);
    }
    if (fresh.length) {
      try {
        map.addAnnotations(fresh);
        map.showItems(fresh, {
          animate: true,
          padding: new mapkit.Padding({ top: 60, right: 40, bottom: 60, left: 40 }),
        });
      } catch {
        /* ignore */
      }
    }
  }, [filteredVenues, hasPassport, visitedIds, event?.accent_color, event?.primary_color]);

  const labels = resolveVenueLabels(event ?? {});
  const primary = event?.primary_color ?? "#1F3D2B";
  const accent = event?.accent_color ?? "#B5572A";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }

  const noCoords = geoVenues.length === 0;
  const visitedCount = visitedIds.size;
  const totalCount = geoVenues.length;

  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-6">
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        activeOverride="map"
      />

      <div className="mx-auto mt-4 max-w-5xl">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-trail-serif text-2xl font-semibold" style={{ color: primary }}>
              Trail Map
            </h1>
            {hasPassport && totalCount > 0 && (
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#8A7E66]">
                {visitedCount} of {totalCount} {labels.plural.toLowerCase()} visited
              </p>
            )}
          </div>
          {hasPassport && totalCount > 0 && (
            <div className="flex gap-1 rounded-full border border-[#E6DCC7] bg-[#FBF5E8] p-1 text-xs">
              {(
                [
                  { k: "all", label: "All" },
                  { k: "visited", label: "Visited" },
                  { k: "not_visited", label: "Not visited" },
                ] as Array<{ k: Filter; label: string }>
              ).map((f) => {
                const active = filter === f.k;
                return (
                  <button
                    key={f.k}
                    type="button"
                    onClick={() => setFilter(f.k)}
                    className="rounded-full px-3 py-1 font-medium transition"
                    style={{
                      backgroundColor: active ? primary : "transparent",
                      color: active ? "#FBF5E8" : primary,
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!hasPassport && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-xs text-[#3D372C]">
            <span>Create a passport to track visited {labels.plural.toLowerCase()}.</span>
            <Link
              to="/join"
              className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: accent, color: "#FBF5E8" }}
            >
              Start passport
            </Link>
          </div>
        )}

        {noCoords ? (
          <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center text-sm text-[#3D372C]">
            <p>No mapped {labels.plural.toLowerCase()} yet.</p>
            <Link
              to="/venues"
              className="mt-3 inline-block rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: primary, color: "#FBF5E8" }}
            >
              See {labels.plural.toLowerCase()} list
            </Link>
          </div>
        ) : mapError ? (
          <MapFallbackList venues={geoVenues} primary={primary} />
        ) : (
          <>
            <div
              ref={mapContainerRef}
              className="h-[60vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#1F3D2B]/10"
            />
            {selected && (
              <SelectedVenueCard
                venue={selected}
                visited={hasPassport && !!selected.venue_id && visitedIds.has(selected.venue_id)}
                primary={primary}
                accent={accent}
                onClose={() => setSelected(null)}
              />
            )}
          </>
        )}

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </div>
  );
}

function SelectedVenueCard({
  venue,
  visited,
  primary,
  accent,
  onClose,
}: {
  venue: VenueRow;
  visited: boolean;
  primary: string;
  accent: string;
  onClose: () => void;
}) {
  const img = getVenueAssetPublicUrl(venue.cover_path ?? venue.logo_path);
  const directions = buildAppleMapsDirectionsUrl({
    name: venue.name,
    address: venue.address,
    lat: venue.lat ?? null,
    lng: venue.lng ?? null,
  });
  return (
    <div className="mt-3 flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3 shadow-sm">
      {img ? (
        <img
          src={img}
          alt=""
          className="h-20 w-20 flex-shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-20 w-20 flex-shrink-0 rounded-xl bg-[#1F3D2B]/10" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-trail-serif text-lg font-semibold" style={{ color: primary }}>
            {venue.name ?? "Venue"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-sm text-[#8A7E66] hover:text-[#3D372C]"
          >
            ×
          </button>
        </div>
        {visited && (
          <span
            className="mt-0.5 inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: primary, color: "#FBF5E8" }}
          >
            Visited
          </span>
        )}
        {venue.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#3D372C]">
            {venue.description}
          </p>
        )}
        {venue.address && (
          <p className="mt-1 truncate text-[11px] text-[#8A7E66]">{venue.address}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to="/venues/$venueId"
            params={{ venueId: venue.venue_id ?? "" }}
            className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: primary, color: "#FBF5E8" }}
          >
            View details
          </Link>
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ borderColor: accent, color: accent }}
            >
              Directions ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MapFallbackList({ venues, primary }: { venues: VenueRow[]; primary: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="mb-3 font-medium">Map preview unavailable. Here's the venue list:</p>
      <ul className="space-y-2">
        {venues.map((v) => (
          <li key={v.venue_id ?? Math.random()}>
            <Link
              to="/venues/$venueId"
              params={{ venueId: v.venue_id ?? "" }}
              className="block rounded-lg bg-white px-3 py-2 hover:bg-amber-100"
              style={{ color: primary }}
            >
              <span className="font-semibold">{v.name}</span>
              {v.address && <span className="block text-xs text-[#8A7E66]">{v.address}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
