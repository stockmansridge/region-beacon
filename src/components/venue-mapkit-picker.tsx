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
  source: "autocomplete" | "search";
  reason?: string;
};

type DebugAttempt = {
  api: "autocomplete" | "search";
  query: string;
  regionCentre: { lat: number; lng: number } | null;
  regionSpan: number | null;
  rawCount: number;
  topRaw: Array<{ name: string; address: string; country: string; isAU: boolean }>;
};

const AU_CENTROID = { lat: -25.2744, lng: 133.7751 };
const BUSINESS_WORDS = /\b(wines?|winery|wineries|cellar|brewery|distillery|cafe|caf\u00e9|restaurant|bar|pub|hotel|motel|market|farm|orchard|venue|gallery|museum|brewing|estate|vineyard|bakery|kitchen)\b/i;

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
  if (cc === "AU" || cc === "AUS") return true;
  if (cc && cc.length <= 3) return false;
  const addr = `${p?.formattedAddress ?? ""} ${p?.country ?? ""}`.toLowerCase();
  return /australia/.test(addr);
}

function scorePlace(
  p: any,
  query: string,
  centre: { lat: number; lng: number } | null,
  hasBusinessWord: boolean,
): SearchResult | null {
  const lat = p?.coordinate?.latitude;
  const lng = p?.coordinate?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || (lat === 0 && lng === 0)) return null;
  const name: string = p?.name ?? "";
  const address: string = p?.formattedAddress ?? "";
  const isAU = placeIsAU(p);
  const reasons: string[] = [];
  let score = 0;
  score += isAU ? 60 : -120;
  reasons.push(isAU ? "+60 AU" : "-120 non-AU");
  let distanceKm: number | null = null;
  if (centre) {
    distanceKm = haversineKm(centre.lat, centre.lng, lat, lng);
    if (distanceKm < 25) { score += 40; reasons.push("+40 <25km"); }
    else if (distanceKm < 100) { score += 28; reasons.push("+28 <100km"); }
    else if (distanceKm < 400) { score += 14; reasons.push("+14 <400km"); }
    else if (distanceKm < 1500) { score += 4; }
    else if (distanceKm > 5000) { score -= 40; reasons.push("-40 >5000km"); }
  }
  const qTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1 && !BUSINESS_WORDS.test(t));
  const nameLc = name.toLowerCase();
  if (qTokens.length > 0 && nameLc) {
    const matched = qTokens.filter((t) => nameLc.includes(t)).length;
    const ratio = matched / qTokens.length;
    const add = Math.round(ratio * 35);
    score += add;
    if (add) reasons.push(`+${add} name`);
    if (nameLc === query.toLowerCase()) { score += 15; reasons.push("+15 exact"); }
  }
  if (p?.poiCategory) { score += 30; reasons.push("+30 POI"); }
  const looksAdmin = !p?.poiCategory && !/\d/.test(address);
  if (looksAdmin && hasBusinessWord) { score -= 80; reasons.push("-80 admin/business-query"); }
  else if (looksAdmin && qTokens.length > 1) { score -= 20; reasons.push("-20 admin"); }
  return {
    id: `${lat.toFixed(5)},${lng.toFixed(5)}-${name || address}`,
    name,
    address,
    lat,
    lng,
    isAU,
    distanceKm,
    score,
    source: "search",
    reason: reasons.join(", "),
  };
}

export function VenueMapKitPicker({
  value,
  nameIsBlank,
  regionHint,
  regionHintLabel,
  venueName,
  onChange,
  onClose,
}: {
  value: VenueMapKitValue;
  nameIsBlank: boolean;
  /** Best-known event/region centre (e.g. averaged from existing venue coordinates). */
  regionHint?: { lat: number; lng: number } | null;
  /** Optional human-readable region label, e.g. "Orange NSW" — appended as a search variant. */
  regionHintLabel?: string | null;
  /** Current venue-name draft, used as a fallback search term. */
  venueName?: string | null;
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
  const [townHint, setTownHint] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [weakResults, setWeakResults] = useState(false);
  const [showSearchDiag, setShowSearchDiag] = useState(false);
  const [debugAttempts, setDebugAttempts] = useState<DebugAttempt[]>([]);
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

  // Promisified MapKit POI/business search. Passes BOTH coordinate (point
  // bias) and region (bounding box) so Apple's ranker treats it as a true
  // local search instead of global geocoding.
  const searchPlaces = useCallback(
    (q: string, centre: { lat: number; lng: number } | null, span: number): Promise<any[]> => {
      const mapkit = window.mapkit;
      if (!mapkit) return Promise.resolve([]);
      return new Promise((resolve) => {
        try {
          const c = centre ?? AU_CENTROID;
          const coordinate = new mapkit.Coordinate(c.lat, c.lng);
          const region = new mapkit.CoordinateRegion(coordinate, new mapkit.CoordinateSpan(span, span));
          const search = new mapkit.Search({
            language: "en-AU",
            region,
            coordinate,
            includePointsOfInterest: true,
            includeAddresses: true,
            includeQueries: false,
          });
          search.search(q, (err: any, data: any) => {
            if (err) { resolve([]); return; }
            resolve(data?.places ?? []);
          }, { coordinate, region });
        } catch {
          resolve([]);
        }
      });
    },
    [],
  );

  // MapKit Search autocomplete — this is what Apple Maps uses to fuzzy-match
  // typos like "dindema wines" → "Dindima Wines". Returns completion items;
  // each can be resolved to full places via search.search(completion).
  const autocompletePlaces = useCallback(
    (q: string, centre: { lat: number; lng: number } | null, span: number): Promise<any[]> => {
      const mapkit = window.mapkit;
      if (!mapkit) return Promise.resolve([]);
      return new Promise((resolve) => {
        try {
          const c = centre ?? AU_CENTROID;
          const coordinate = new mapkit.Coordinate(c.lat, c.lng);
          const region = new mapkit.CoordinateRegion(coordinate, new mapkit.CoordinateSpan(span, span));
          const search = new mapkit.Search({
            language: "en-AU",
            region,
            coordinate,
            includePointsOfInterest: true,
            includeAddresses: true,
          });
          search.autocomplete(q, (err: any, data: any) => {
            if (err) { resolve([]); return; }
            resolve(data?.results ?? []);
          }, { coordinate, region });
        } catch {
          resolve([]);
        }
      });
    },
    [],
  );

  // Resolve an autocomplete completion (which may lack coordinate) into one
  // or more full Place results by re-running search on its display string.
  const resolveCompletion = useCallback(
    async (completion: any, centre: { lat: number; lng: number } | null, span: number): Promise<any[]> => {
      // Some completions already have coordinate + structured address.
      if (completion?.coordinate?.latitude != null) {
        return [{
          coordinate: completion.coordinate,
          name: completion?.displayLines?.[0] ?? completion?.title ?? "",
          formattedAddress: completion?.displayLines?.slice(1).join(", ") ?? "",
          countryCode: completion?.countryCode,
          country: completion?.country,
          poiCategory: completion?.poiCategory,
        }];
      }
      const q = Array.isArray(completion?.displayLines) && completion.displayLines.length
        ? completion.displayLines.join(", ")
        : (completion?.title ?? "");
      if (!q) return [];
      return searchPlaces(q, centre, span);
    },
    [searchPlaces],
  );

  // Build the ordered query variants to try. Each variant is paired with a
  // region centre + span so Apple ranks results locally first, AU second,
  // and global last.
  const buildVariants = useCallback(
    (rawQuery: string, centre: { lat: number; lng: number } | null) => {
      const variants: Array<{ query: string; centre: { lat: number; lng: number } | null; span: number; label: string }> = [];
      const q = rawQuery.trim();
      const town = townHint.trim();
      const hasBusinessWord = BUSINESS_WORDS.test(q);

      // 1. Local-region variants (event/venue/user centre).
      if (centre) {
        variants.push({ query: q, centre, span: 1.5, label: "local-tight" });
        variants.push({ query: q, centre, span: 8, label: "local-wide" });
        if (town) variants.push({ query: `${q} ${town}`, centre, span: 8, label: "local+town" });
      }
      // 2. Town hint anywhere in AU.
      if (town) {
        variants.push({ query: `${q} ${town}`, centre: AU_CENTROID, span: 40, label: "AU+town" });
      }
      // 3. Region-label hint (e.g. "Orange NSW") if provided.
      if (regionHintLabel && !q.toLowerCase().includes(regionHintLabel.toLowerCase())) {
        variants.push({ query: `${q} ${regionHintLabel}`, centre: centre ?? AU_CENTROID, span: 8, label: "region-label" });
      }
      // 4. NSW / Australia AU-biased fallbacks.
      if (!/\bnsw\b/i.test(q)) {
        variants.push({ query: `${q} NSW`, centre: AU_CENTROID, span: 40, label: "AU+NSW" });
      }
      // 5. Plain AU-wide.
      variants.push({ query: q, centre: AU_CENTROID, span: 40, label: "AU" });
      // 6. " Australia" suffix.
      if (!/australia/i.test(q)) {
        variants.push({ query: `${q} Australia`, centre: AU_CENTROID, span: 40, label: "AU+Australia" });
      }
      // 7. Business-keyword expansion (e.g. "Dindima winery", "Dindima cellar door").
      if (hasBusinessWord) {
        const stripped = q.replace(BUSINESS_WORDS, "").replace(/\s+/g, " ").trim();
        if (stripped && stripped !== q) {
          variants.push({ query: `${stripped} winery`, centre: centre ?? AU_CENTROID, span: 8, label: "stripped+winery" });
          variants.push({ query: `${stripped} cellar door`, centre: centre ?? AU_CENTROID, span: 8, label: "stripped+cellar" });
        }
      }
      // 8. Venue-name fallback (if user typed nothing useful but a venue
      // name is already drafted in the form).
      if (venueName && venueName.trim() && venueName.trim().toLowerCase() !== q.toLowerCase()) {
        variants.push({ query: venueName.trim(), centre: centre ?? AU_CENTROID, span: 8, label: "venue-name" });
      }
      return variants;
    },
    [townHint, regionHintLabel, venueName],
  );

  // Search pipeline: for each variant, run autocomplete first (Apple's
  // fuzzy POI matcher), resolve top completions to full places, then fall
  // back to search.search on the variant string. Score, dedupe, stop on
  // strong AU match.
  const stagedSearch = useCallback(async (q: string) => {
    const mapkit = window.mapkit;
    if (!mapkit || !q) return;
    const seq = ++searchSeqRef.current;
    maybeRequestGeolocation();
    setSearchAttempted(true);
    setSearchError(null);
    setWeakResults(false);
    setSearching(true);
    setDebugAttempts([]);

    const centre = getBestCentre();
    const variants = buildVariants(q, centre);
    const hasBusinessWord = BUSINESS_WORDS.test(q);
    const seen = new Set<string>();
    let collected: SearchResult[] = [];
    const attempts: DebugAttempt[] = [];
    const goodEnough = (rs: SearchResult[]) =>
      rs.some((r) => r.isAU && r.score >= 80 && (r.source === "autocomplete" || !!r.reason?.includes("POI")));

    const consumePlaces = (places: any[], source: "autocomplete" | "search") => {
      for (const p of places) {
        const scored = scorePlace(p, q, centre, hasBusinessWord);
        if (!scored) continue;
        scored.source = source;
        if (source === "autocomplete") scored.score += 8;
        if (seen.has(scored.id)) continue;
        seen.add(scored.id);
        collected.push(scored);
      }
    };

    try {
      for (const v of variants) {
        // (a) autocomplete
        const completions = await autocompletePlaces(v.query, v.centre, v.span);
        if (seq !== searchSeqRef.current) return;
        attempts.push({
          api: "autocomplete",
          query: v.query,
          regionCentre: v.centre,
          regionSpan: v.span,
          rawCount: completions.length,
          topRaw: completions.slice(0, 5).map((c: any) => ({
            name: c?.displayLines?.[0] ?? c?.title ?? "",
            address: c?.displayLines?.slice(1).join(", ") ?? "",
            country: c?.country ?? c?.countryCode ?? "",
            isAU: placeIsAU(c),
          })),
        });
        // Resolve up to top 5 completions to full places.
        for (const c of completions.slice(0, 5)) {
          const places = await resolveCompletion(c, v.centre, v.span);
          if (seq !== searchSeqRef.current) return;
          consumePlaces(places, "autocomplete");
        }
        if (goodEnough(collected)) break;

        // (b) direct search fallback
        const places = await searchPlaces(v.query, v.centre, v.span);
        if (seq !== searchSeqRef.current) return;
        attempts.push({
          api: "search",
          query: v.query,
          regionCentre: v.centre,
          regionSpan: v.span,
          rawCount: places.length,
          topRaw: places.slice(0, 5).map((p: any) => ({
            name: p?.name ?? "",
            address: p?.formattedAddress ?? "",
            country: p?.country ?? p?.countryCode ?? "",
            isAU: placeIsAU(p),
          })),
        });
        consumePlaces(places, "search");
        if (goodEnough(collected)) break;
      }

      collected.sort((a, b) => b.score - a.score);
      const hasAU = collected.some((r) => r.isAU);
      const display = (hasAU ? collected.filter((r) => r.isAU) : collected).slice(0, 8);
      if (seq !== searchSeqRef.current) return;
      setDebugAttempts(attempts);
      setResults(display);
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
      setDebugAttempts(attempts);
      setSearchError("Search failed. Try again, or set the address manually below.");
    }
  }, [autocompletePlaces, buildVariants, getBestCentre, maybeRequestGeolocation, resolveCompletion, searchPlaces]);


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
    setWeakResults(false);
  };

  const fmtDistance = (km: number | null) => {
    if (km == null) return null;
    if (km < 1) return "<1 km away";
    if (km < 100) return `${Math.round(km)} km away`;
    return `${Math.round(km).toLocaleString()} km away`;
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
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{r.name || r.address}</span>
                      {fmtDistance(r.distanceKm) && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDistance(r.distanceKm)}</span>
                      )}
                    </div>
                    {r.name && r.address && <div className="text-xs text-muted-foreground">{r.address}</div>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && weakResults && results.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              No strong local match found. These results may be outside your event region — try adding a town, suburb, or nearby landmark.
            </div>
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
