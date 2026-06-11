import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMapkitToken, type MapkitDiag } from "@/lib/mapkit.functions";

// Apple MapKit JS venue picker. Loaded only inside the admin venue editor.
// MapKit JS itself is fetched from Apple's CDN on demand.

declare global {
  interface Window {
    mapkit?: any;
  }
}

const MAPKIT_SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";

let mapkitLoadPromise: Promise<void> | null = null;

function loadMapKitScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.mapkit) return Promise.resolve();
  if (mapkitLoadPromise) return mapkitLoadPromise;
  mapkitLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPKIT_SCRIPT_SRC}"]`);
    const onLoad = () => resolve();
    const onError = () => {
      mapkitLoadPromise = null;
      reject(new Error("Failed to load Apple MapKit JS"));
    };
    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return;
    }
    const s = document.createElement("script");
    s.src = MAPKIT_SCRIPT_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.addEventListener("load", onLoad);
    s.addEventListener("error", onError);
    document.head.appendChild(s);
  });
  return mapkitLoadPromise;
}

export type VenueMapKitValue = {
  name: string;
  address: string;
  lat: string;
  lng: string;
};

type SearchResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isAU: boolean;
  distanceKm: number | null;
  score: number;
};

const AU_CENTROID = { lat: -25.2744, lng: 133.7751 };

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function placeIsAU(p: any): boolean {
  const cc = (p?.countryCode ?? "").toString().toUpperCase();
  if (cc) return cc === "AU";
  const addr = `${p?.formattedAddress ?? ""} ${p?.country ?? ""}`.toLowerCase();
  return /australia/.test(addr);
}

function scorePlace(p: any, query: string, centre: { lat: number; lng: number } | null): SearchResult | null {
  const lat = p?.coordinate?.latitude;
  const lng = p?.coordinate?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || (lat === 0 && lng === 0)) return null;
  const name: string = p?.name ?? "";
  const address: string = p?.formattedAddress ?? "";
  const isAU = placeIsAU(p);
  let score = 0;
  // Country bias — AU strongly preferred, overseas heavily demoted.
  score += isAU ? 60 : -80;
  // Distance from the best-known centre.
  let distanceKm: number | null = null;
  if (centre) {
    distanceKm = haversineKm(centre.lat, centre.lng, lat, lng);
    if (distanceKm < 25) score += 35;
    else if (distanceKm < 100) score += 25;
    else if (distanceKm < 400) score += 12;
    else if (distanceKm < 1500) score += 4;
    else if (distanceKm > 5000) score -= 30;
  }
  // Name match against query tokens.
  const qTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const nameLc = name.toLowerCase();
  if (qTokens.length > 0) {
    const matched = qTokens.filter((t) => nameLc.includes(t)).length;
    score += Math.round((matched / qTokens.length) * 30);
    if (nameLc === query.toLowerCase()) score += 10;
  }
  // POI/business indicator: poiCategory means an actual place, not a region.
  if (p?.poiCategory) score += 20;
  // Looks like an administrative area (city/region) while the query has
  // multiple words (likely a business name) → demote.
  const looksAdmin = !p?.poiCategory && !/\d/.test(address) && (p?.administrativeArea || p?.locality) && nameLc === (p?.locality ?? p?.administrativeArea ?? "").toLowerCase();
  if (looksAdmin && qTokens.length > 1) score -= 25;
  return {
    id: `${lat.toFixed(5)},${lng.toFixed(5)}-${name || address}`,
    name,
    address,
    lat,
    lng,
    isAU,
    distanceKm,
    score,
  };
}

export function VenueMapKitPicker({
  value,
  nameIsBlank,
  regionHint,
  onChange,
  onClose,
}: {
  value: VenueMapKitValue;
  nameIsBlank: boolean;
  /** Best-known event/region centre (e.g. averaged from existing venue coordinates). */
  regionHint?: { lat: number; lng: number } | null;
  onChange: (next: Partial<VenueMapKitValue>) => void;
  onClose: () => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const fetchToken = useServerFn(getMapkitToken);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<MapkitDiag | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [weakResults, setWeakResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const userLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const geoRequestedRef = useRef(false);

  // Ask for browser geolocation lazily — only once the user actually starts
  // searching, never on mount. Denial/failure is silently ignored.
  const maybeRequestGeolocation = useCallback(() => {
    if (geoRequestedRef.current) return;
    geoRequestedRef.current = true;
    try {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          userLocRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        () => { /* denied or unavailable — keep fallbacks */ },
        { maximumAge: 600_000, timeout: 8_000, enableHighAccuracy: false },
      );
    } catch { /* ignore */ }
  }, []);

  // Best-known search centre, in priority order:
  // 1. current pin / saved venue coords
  // 2. event region hint (centre of existing venues)
  // 3. user's geolocation (if granted)
  // 4. current map centre, if the user has panned away from the AU centroid
  const getBestCentre = useCallback((): { lat: number; lng: number } | null => {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
    if (regionHint && Number.isFinite(regionHint.lat) && Number.isFinite(regionHint.lng)) {
      return regionHint;
    }
    if (userLocRef.current) return userLocRef.current;
    try {
      const c = mapRef.current?.center;
      if (c && typeof c.latitude === "number") {
        const movedFromCentroid = haversineKm(c.latitude, c.longitude, AU_CENTROID.lat, AU_CENTROID.lng) > 100;
        if (movedFromCentroid) return { lat: c.latitude, lng: c.longitude };
      }
    } catch { /* ignore */ }
    return null;
  }, [value.lat, value.lng, regionHint]);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const mapkit = window.mapkit;
    if (!mapkit || !mapRef.current) return;
    const coord = new mapkit.Coordinate(lat, lng);
    if (markerRef.current) {
      markerRef.current.coordinate = coord;
    } else {
      const annotation = new mapkit.MarkerAnnotation(coord, { draggable: true });
      annotation.addEventListener("drag-end", () => {
        const c = annotation.coordinate;
        onChange({ lat: String(c.latitude.toFixed(6)), lng: String(c.longitude.toFixed(6)) });
      });
      mapRef.current.addAnnotation(annotation);
      markerRef.current = annotation;
    }
    mapRef.current.setCenterAnimated(coord, true);
  }, [onChange]);

  // Init
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await fetchToken();
        if (cancelled) return;
        setDiag(tokenRes.diag ?? null);
        if (!tokenRes.token) {
          setStatus("error");
          setErrorMsg(tokenRes.error ?? "MapKit token unavailable.");
          return;
        }
        await loadMapKitScript();
        if (cancelled) return;
        const mapkit = window.mapkit;
        if (!mapkit) throw new Error("MapKit JS unavailable");

        // Listen for Apple rejecting the token (typically domain not allowed).
        try {
          mapkit.addEventListener?.("error", (e: any) => {
            const status = e?.status ?? e?.code ?? "unknown";
            setStatus("error");
            setErrorMsg(
              `Apple MapKit token was created, but Apple rejected this domain (${status}). Check the MapKit JS allowed domains.`,
            );
          });
        } catch { /* ignore */ }

        mapkit.init({
          authorizationCallback: (done: (t: string) => void) => {
            done(tokenRes.token!);
            if (tokenRes.expiresAt) {
              const ms = Math.max(60_000, tokenRes.expiresAt - Date.now() - 60_000);
              setTimeout(async () => {
                try {
                  const refreshed = await fetchToken();
                  if (refreshed.token) done(refreshed.token);
                } catch {
                  /* ignore */
                }
              }, ms);
            }
          },
        });

        if (!mapContainerRef.current) return;
        const lat = Number(value.lat);
        const lng = Number(value.lng);
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
        const center = hasCoords
          ? new mapkit.Coordinate(lat, lng)
          : new mapkit.Coordinate(-25.2744, 133.7751); // Australia centroid fallback

        const map = new mapkit.Map(mapContainerRef.current, {
          center,
          cameraDistance: hasCoords ? 800 : 4_000_000,
          mapType: mapkit.Map.MapTypes?.Hybrid ?? "hybrid",
          showsCompass: mapkit.FeatureVisibility?.Adaptive,
          isRotationEnabled: false,
        });
        mapRef.current = map;

        map.addEventListener("single-tap", (e: any) => {
          const point = e.pointOnPage;
          const coord = map.convertPointOnPageToCoordinate(point);
          placeMarker(coord.latitude, coord.longitude);
          onChange({ lat: String(coord.latitude.toFixed(6)), lng: String(coord.longitude.toFixed(6)) });
          // Reverse geocode to fill address.
          try {
            const geo = new mapkit.Geocoder({ language: "en-AU" });
            geo.reverseLookup(coord, (err: any, data: any) => {
              if (err || !data?.results?.length) return;
              const r = data.results[0];
              if (r.formattedAddress) onChange({ address: r.formattedAddress });
            });
          } catch { /* ignore */ }
        });

        if (hasCoords) placeMarker(lat, lng);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "MapKit failed to load.");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch { /* ignore */ }
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Promisified MapKit search over a given region.
  const searchOnce = useCallback((q: string, region: any): Promise<any[]> => {
    const mapkit = window.mapkit;
    if (!mapkit) return Promise.resolve([]);
    return new Promise((resolve) => {
      try {
        const search = new mapkit.Search({ language: "en-AU", region });
        search.search(q, (err: any, data: any) => {
          if (err) { resolve([]); return; }
          resolve(data?.places ?? []);
        });
      } catch {
        resolve([]);
      }
    });
  }, []);

  // Staged, region-biased search:
  //   1. tight region around best-known centre (event pin / venues / user)
  //   2. wider regional fallback around the same centre
  //   3. Australia-wide
  //   4. query + " Australia" variant (still AU region) as a last resort
  // Stops as soon as a stage yields good local (AU) candidates. Results are
  // ranked (country, distance, name match, POI-ness) before display.
  const stagedSearch = useCallback(async (q: string) => {
    const mapkit = window.mapkit;
    if (!mapkit || !q) return;
    const seq = ++searchSeqRef.current;
    maybeRequestGeolocation();
    setSearchAttempted(true);
    setSearchError(null);
    setWeakResults(false);
    setSearching(true);

    const centre = getBestCentre();
    const mkRegion = (c: { lat: number; lng: number }, span: number) =>
      new mapkit.CoordinateRegion(new mapkit.Coordinate(c.lat, c.lng), new mapkit.CoordinateSpan(span, span));
    const auRegion = new mapkit.CoordinateRegion(
      new mapkit.Coordinate(AU_CENTROID.lat, AU_CENTROID.lng),
      new mapkit.CoordinateSpan(40, 45),
    );

    const stages: Array<{ query: string; region: any }> = [];
    if (centre) {
      stages.push({ query: q, region: mkRegion(centre, 1.5) }); // ~local
      stages.push({ query: q, region: mkRegion(centre, 8) });   // ~regional
    }
    stages.push({ query: q, region: auRegion });                 // Australia-wide
    if (!/australia/i.test(q)) {
      stages.push({ query: `${q} Australia`, region: auRegion }); // last resort
    }

    const seen = new Set<string>();
    let collected: SearchResult[] = [];
    const goodEnough = (rs: SearchResult[]) => rs.some((r) => r.isAU && r.score >= 60);

    try {
      for (const stage of stages) {
        const places = await searchOnce(stage.query, stage.region);
        if (seq !== searchSeqRef.current) return; // superseded by newer search
        for (const p of places) {
          const scored = scorePlace(p, q, centre);
          if (!scored || seen.has(scored.id)) continue;
          seen.add(scored.id);
          collected.push(scored);
        }
        if (goodEnough(collected)) break;
      }

      collected.sort((a, b) => b.score - a.score);
      const hasAU = collected.some((r) => r.isAU);
      // If we have plausible AU candidates, hide weak overseas noise entirely.
      const display = (hasAU ? collected.filter((r) => r.isAU || r.score > 0) : collected).slice(0, 8);
      if (seq !== searchSeqRef.current) return;
      setResults(display);
      // Weak-match warning: nothing Australian, or best match is far from the
      // known event/user centre.
      const top = display[0];
      setWeakResults(
        display.length > 0 &&
          (!hasAU || (centre != null && top?.distanceKm != null && top.distanceKm > 500)),
      );
      setSearching(false);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setSearching(false);
      setResults([]);
      setSearchError("Search failed. Try again, or set the address manually below.");
    }
  }, [getBestCentre, maybeRequestGeolocation, searchOnce]);

  const runSearch = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    void stagedSearch(q);
  }, [searchQuery, stagedSearch]);

  // Debounced live search as the user types — same staged, ranked pipeline.
  useEffect(() => {
    if (status !== "ready") return;
    const q = searchQuery.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 3) {
      if (q.length === 0) {
        setResults([]);
        setSearchError(null);
        setSearchAttempted(false);
        setWeakResults(false);
      }
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      void stagedSearch(q);
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, status, stagedSearch]);

  const pickResult = (r: { name: string; address: string; lat: number; lng: number }) => {
    const next: Partial<VenueMapKitValue> = {
      address: r.address,
      lat: String(r.lat.toFixed(6)),
      lng: String(r.lng.toFixed(6)),
    };
    if (nameIsBlank && r.name) next.name = r.name;
    onChange(next);
    placeMarker(r.lat, r.lng);
    setResults([]);
    setSearchAttempted(false);
  };

  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Select location with Apple Maps</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      {status === "error" && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <div>
            Apple Maps picker is unavailable ({errorMsg ?? "unknown error"}). You can still set address and lat/lng manually below.
          </div>
          {diag && (
            <div>
              <button
                type="button"
                onClick={() => setShowDiag((v) => !v)}
                className="text-[11px] underline underline-offset-2"
              >
                {showDiag ? "Hide" : "Show"} diagnostics (no key material)
              </button>
              {showDiag && (
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-amber-100/60 p-2 text-[10px] leading-snug dark:bg-amber-950/60">
{JSON.stringify(diag, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {status !== "error" && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="Search a winery, business, town, or partial address…"
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
              disabled={status !== "ready"}
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={status !== "ready" || searching}
              className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>

          {results.length > 0 && (
            <ul className="max-h-56 overflow-auto rounded-md border divide-y text-sm">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pickResult(r)}
                    className="block w-full px-3 py-2 text-left hover:bg-muted"
                  >
                    <div className="font-medium">{r.name || r.address}</div>
                    {r.name && r.address && <div className="text-xs text-muted-foreground">{r.address}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchError && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {searchError}
            </div>
          )}

          {!searching && !searchError && searchAttempted && results.length === 0 && searchQuery.trim().length >= 2 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              No good matches found. Try a business name, town/suburb, or a partial street address. You can also tap the map to drop a pin manually.
            </div>
          )}

          <div
            ref={mapContainerRef}
            className="h-72 w-full overflow-hidden rounded-md border bg-muted"
          >
            {status === "loading" && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Loading Apple Maps…
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Tap or drag the pin to set the venue location. Address and coordinates update automatically.
          </p>
        </>
      )}
    </div>
  );
}
