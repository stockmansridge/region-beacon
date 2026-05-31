import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMapkitToken, type MapkitDiag } from "@/lib/mapkit.functions";
import { loadMapKitScript } from "@/lib/mapkit-loader";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { matchRootDomain, tenantHost } from "@/lib/domains";

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

type MapDiagnostics = {
  tokenStatus: "pending" | "ok" | "error";
  tokenError: string | null;
  tokenDiag: MapkitDiag | null;
  scriptStatus: "pending" | "ok" | "error";
  scriptError: string | null;
  initStatus: "pending" | "ok" | "error";
  initError: string | null;
  appleErrorStatus: string | null;
  appleErrorMessage: string | null;
};

const INITIAL_DIAG: MapDiagnostics = {
  tokenStatus: "pending",
  tokenError: null,
  tokenDiag: null,
  scriptStatus: "pending",
  scriptError: null,
  initStatus: "pending",
  initError: null,
  appleErrorStatus: null,
  appleErrorMessage: null,
};

export function PublicTrailMapPage({ subdomain }: { subdomain: string }) {
  const fetchToken = useServerFn(getMapkitToken);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapDiag, setMapDiag] = useState<MapDiagnostics>(INITIAL_DIAG);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [hasPassport, setHasPassport] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<VenueRow | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const annotationsRef = useRef<Map<string, any>>(new Map());

  // Load event + venues
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const host = tenantHost(subdomain);
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
                is_stamped: boolean | null;
              }>) {
                if (s.venue_id && s.is_stamped) visited.add(String(s.venue_id));
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

  // PostgREST serialises numeric(9,6) as strings, so coerce defensively and
  // store the normalised numbers on each row for downstream use.
  const geoVenues = useMemo(
    () =>
      venues
        .map((v) => {
          const lat = v.lat == null ? NaN : Number(v.lat as unknown as string);
          const lng = v.lng == null ? NaN : Number(v.lng as unknown as string);
          return { ...v, lat, lng };
        })
        .filter(
          (v) =>
            Number.isFinite(v.lat) &&
            Number.isFinite(v.lng) &&
            !(v.lat === 0 && v.lng === 0),
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
      // 1. Token
      let tokenRes: Awaited<ReturnType<typeof fetchToken>>;
      try {
        tokenRes = await fetchToken();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Token endpoint failed";
        setMapDiag((d) => ({ ...d, tokenStatus: "error", tokenError: msg }));
        setMapError(`Could not reach MapKit token endpoint: ${msg}`);
        return;
      }
      if (cancelled) return;
      setMapDiag((d) => ({
        ...d,
        tokenStatus: tokenRes.token ? "ok" : "error",
        tokenError: tokenRes.error ?? null,
        tokenDiag: tokenRes.diag ?? null,
      }));
      if (!tokenRes.token) {
        setMapError(tokenRes.error ?? "MapKit token unavailable.");
        return;
      }

      // 2. Script
      try {
        await loadMapKitScript();
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Script load failed";
        setMapDiag((d) => ({ ...d, scriptStatus: "error", scriptError: msg }));
        setMapError(`Apple MapKit JS failed to load: ${msg}`);
        return;
      }
      if (cancelled) return;
      const mapkit = window.mapkit;
      if (!mapkit) {
        setMapDiag((d) => ({
          ...d,
          scriptStatus: "error",
          scriptError: "window.mapkit missing after load",
        }));
        setMapError("Apple MapKit JS loaded but window.mapkit is missing.");
        return;
      }
      setMapDiag((d) => ({ ...d, scriptStatus: "ok" }));

      // 3. Listen for Apple rejecting the token (typically domain not allowed).
      try {
        mapkit.addEventListener?.("error", (e: any) => {
          const status = e?.status ?? e?.code ?? "unknown";
          const message = e?.message ?? String(status);
          setMapDiag((d) => ({
            ...d,
            appleErrorStatus: String(status),
            appleErrorMessage: message,
          }));
          if (status === "Unauthorized" || status === "Initialization Failed") {
            setMapError(
              `Apple rejected this domain (${status}). Add *.getstampd.com.au to the MapKit JS allowed domains in your Apple Developer account.`,
            );
          } else {
            setMapError(`Apple MapKit error: ${status}`);
          }
        });
      } catch {
        /* ignore */
      }

      // 4. Init + create map
      try {
        mapkit.init({
          authorizationCallback: (done: (t: string) => void) => {
            done(tokenRes.token!);
          },
        });
        if (!mapContainerRef.current) {
          setMapDiag((d) => ({
            ...d,
            initStatus: "error",
            initError: "map container not mounted",
          }));
          setMapError("Map container is not ready.");
          return;
        }
        const map = new mapkit.Map(mapContainerRef.current, {
          showsCompass: mapkit.FeatureVisibility?.Adaptive,
          isRotationEnabled: false,
          showsUserLocationControl: false,
          tracksUserLocation: false,
          showsUserLocation: false,
        });
        // Set initial region centred on event venues (never the visitor's
        // device location) so the map opens framed on the trail.
        try {
          const lats = geoVenues.map((v) => v.lat as number);
          const lngs = geoVenues.map((v) => v.lng as number);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const centerLat = (minLat + maxLat) / 2;
          const centerLng = (minLng + maxLng) / 2;
          // Add padding; clamp to a sensible minimum span for single-venue
          // events so we don't zoom in absurdly far.
          const latSpan = Math.max((maxLat - minLat) * 1.6, 0.02);
          const lngSpan = Math.max((maxLng - minLng) * 1.6, 0.02);
          map.region = new mapkit.CoordinateRegion(
            new mapkit.Coordinate(centerLat, centerLng),
            new mapkit.CoordinateSpan(latSpan, lngSpan),
          );
        } catch {
          /* ignore — annotations effect will still call showItems */
        }
        mapRef.current = map;
        setMapDiag((d) => ({ ...d, initStatus: "ok" }));
        setMapReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Map init failed";
        setMapDiag((d) => ({ ...d, initStatus: "error", initError: msg }));
        setMapError(`Apple MapKit failed to initialise: ${msg}`);
      }
    })();
    return () => {
      cancelled = true;
      setMapReady(false);
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
  }, [mapReady, filteredVenues, hasPassport, visitedIds, event?.accent_color, event?.primary_color]);

  // Highlight the selected pin without recreating annotations.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    try {
      if (selected?.venue_id) {
        const a = annotationsRef.current.get(selected.venue_id);
        if (a) map.selectedAnnotation = a;
      } else {
        map.selectedAnnotation = null;
      }
    } catch {
      /* ignore */
    }
  }, [selected, mapReady]);

  const labels = resolveVenueLabels(event ?? {});
  const primary = event?.primary_color ?? "#1F3D2B";
  const accent = event?.accent_color ?? "#B5572A";

  const noCoords = geoVenues.length === 0;
  const geoVenueIds = useMemo(
    () => new Set(geoVenues.map((v) => v.venue_id)),
    [geoVenues],
  );
  const unmappedVenues = useMemo(
    () => venues.filter((v) => !geoVenueIds.has(v.venue_id)),
    [venues, geoVenueIds],
  );

  const visitedCount = useMemo(
    () => geoVenues.filter((v) => v.venue_id && visitedIds.has(v.venue_id)).length,
    [geoVenues, visitedIds],
  );
  const totalCount = geoVenues.length;

  const buildSupportReport = useCallback(() => {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const href = typeof window !== "undefined" ? window.location.href : "";
    const isAllowedLooking = Boolean(matchRootDomain(hostname));
    const report = {
      timestamp: new Date().toISOString(),
      pageUrl: href,
      hostname,
      subdomain,
      route: "/live/$subdomain/map",
      hostnameLooksAllowed: isAllowedLooking,
      venueCount: venues.length,
      venueCountWithLatLng: geoVenues.length,
      fallbackListRendered: Boolean(mapError),
      mapError,
      mapkit: mapDiag,
    };
    return JSON.stringify(report, null, 2);
  }, [subdomain, venues.length, geoVenues.length, mapError, mapDiag]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }


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
        <div className="mb-3">
          <h1 className="font-trail-serif text-2xl font-semibold" style={{ color: primary }}>
            Trail Map
          </h1>
          {hasPassport && totalCount > 0 && (
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#8A7E66]">
              {visitedCount} of {totalCount} {labels.plural.toLowerCase()} visited
            </p>
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
            <p>
              {venues.length === 0
                ? "No venue locations have been set yet."
                : `${labels.plural} have been added, but map locations have not been set yet.`}
            </p>
            {venues.length > 0 && (
              <ul className="mt-4 space-y-2 text-left">
                {venues.map((v) => (
                  <li
                    key={v.venue_id ?? Math.random()}
                    className="rounded-lg bg-white px-3 py-2"
                  >
                    <Link
                      to="/venues/$venueId"
                      params={{ venueId: v.venue_id ?? "" }}
                      className="font-semibold underline-offset-2 hover:underline"
                      style={{ color: primary }}
                    >
                      {v.name ?? "Venue"}
                    </Link>
                    {v.address && (
                      <span className="block text-xs text-[#8A7E66]">{v.address}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <a
              href="/venues"
              className="mt-3 inline-block rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: primary, color: "#FBF5E8" }}
            >
              See {labels.plural.toLowerCase()} list
            </a>
          </div>

        ) : mapError ? (
          <MapFallbackList
            venues={geoVenues}
            primary={primary}
            errorMessage={mapError}
            buildReport={buildSupportReport}
          />
        ) : (
          <div className="relative">
            <div
              ref={mapContainerRef}
              className="h-[70vh] min-h-[460px] w-full overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#1F3D2B]/10"
            />
            {hasPassport && totalCount > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
                <div className="pointer-events-auto flex gap-1 rounded-full border border-[#E6DCC7] bg-[#FBF5E8]/95 p-1 text-xs shadow-sm backdrop-blur">
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
              </div>
            )}
            {selected && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <div className="pointer-events-auto w-full max-w-md">
                  <SelectedVenueCard
                    venue={selected}
                    visited={hasPassport && !!selected.venue_id && visitedIds.has(selected.venue_id)}
                    primary={primary}
                    accent={accent}
                    onClose={() => setSelected(null)}
                  />
                </div>
              </div>
            )}
          </div>
        )}


        {!noCoords && unmappedVenues.length > 0 && (
          <div className="mt-4 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4 text-xs text-[#3D372C]">
            <p className="mb-2 font-semibold uppercase tracking-[0.18em] text-[#8A7E66]">
              {labels.plural} without map locations
            </p>
            <ul className="space-y-1">
              {unmappedVenues.map((v) => (
                <li key={v.venue_id ?? Math.random()}>
                  <Link
                    to="/venues/$venueId"
                    params={{ venueId: v.venue_id ?? "" }}
                    className="underline-offset-2 hover:underline"
                    style={{ color: primary }}
                  >
                    {v.name ?? "Venue"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
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
    <div className="relative overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] shadow-lg">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close venue card"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-base text-[#3D372C] shadow-sm hover:bg-white"
      >
        ×
      </button>
      <Link
        to="/venues/$venueId"
        params={{ venueId: venue.venue_id ?? "" }}
        className="flex items-stretch gap-3 p-3 pr-10 transition hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{ minHeight: 88 }}
      >
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
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-center gap-2">
            <p className="truncate font-trail-serif text-lg font-semibold" style={{ color: primary }}>
              {venue.name ?? "Venue"}
            </p>
            {visited && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: primary, color: "#FBF5E8" }}
              >
                Visited
              </span>
            )}
          </div>
          {venue.address ? (
            <p className="mt-0.5 truncate text-[11px] text-[#8A7E66]">{venue.address}</p>
          ) : venue.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#3D372C]">
              {venue.description}
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: primary }}
            >
              View details
            </span>
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                Directions ↗
              </a>
            )}
          </div>
        </div>
        <span
          aria-hidden
          className="flex flex-shrink-0 items-center text-2xl"
          style={{ color: primary }}
        >
          ›
        </span>
      </Link>
    </div>
  );
}

function MapFallbackList({
  venues,
  primary,
  errorMessage,
  buildReport,
}: {
  venues: VenueRow[];
  primary: string;
  errorMessage: string;
  buildReport: () => string;
}) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const handleCopy = async () => {
    const report = buildReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open the report so the visitor can copy manually.
      setShowDetails(true);
    }
  };
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="mb-1 font-medium">Map preview unavailable. Here's the venue list:</p>
      <p className="mb-3 text-xs text-amber-800">{errorMessage}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-full border border-amber-600/40 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900 hover:bg-amber-100"
        >
          {copied ? "Copied ✓" : "Copy support details"}
        </button>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="rounded-full border border-amber-600/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900 hover:bg-amber-100"
        >
          {showDetails ? "Hide" : "Show"} details
        </button>
      </div>
      {showDetails && (
        <pre className="mb-3 max-h-64 overflow-auto rounded-lg bg-white p-3 text-[10px] leading-snug text-amber-900">
          {buildReport()}
        </pre>
      )}
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
