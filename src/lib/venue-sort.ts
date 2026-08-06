/**
 * Display-only sorting for the public venue list.
 *
 * IMPORTANT: sorting here never touches `order_index` or any database order —
 * it only reorders the array that is rendered. `order_index` remains the
 * organiser's canonical order and is used as the stable tiebreaker.
 */

export type VenueSortKey = "az" | "za" | "nearest" | "unvisited" | "visited";

export const VENUE_SORT_DEFAULT: VenueSortKey = "az";

/** Sorting controls only appear once a list is long enough to need them. */
export const VENUE_SORT_MIN_COUNT = 10;

export const VENUE_SORT_OPTIONS: Array<{
  key: VenueSortKey;
  label: string;
  /** Requires an active passport (visit status). */
  needsPassport?: boolean;
}> = [
  { key: "az", label: "A–Z" },
  { key: "za", label: "Z–A" },
  { key: "nearest", label: "Nearest" },
  { key: "unvisited", label: "Not visited first", needsPassport: true },
  { key: "visited", label: "Visited first", needsPassport: true },
];

export function parseVenueSort(raw: unknown): VenueSortKey {
  return VENUE_SORT_OPTIONS.some((o) => o.key === raw)
    ? (raw as VenueSortKey)
    : VENUE_SORT_DEFAULT;
}

export function venueSortLabel(key: VenueSortKey): string {
  return VENUE_SORT_OPTIONS.find((o) => o.key === key)?.label ?? "A–Z";
}

export type SortableVenue = {
  venue_id: string | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
  order_index: number | null;
};

export type Coords = { lat: number; lng: number };

const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function nameOf(v: SortableVenue): string {
  return (v.name ?? "").trim();
}

function orderOf(v: SortableVenue): number {
  return typeof v.order_index === "number" ? v.order_index : Number.MAX_SAFE_INTEGER;
}

export function hasCoords(v: SortableVenue): boolean {
  return (
    typeof v.lat === "number" &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng)
  );
}

/** Great-circle distance in metres. */
export function distanceMetres(a: Coords, b: Coords): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m" below 1 km, "12.4 km" at or above 1 km. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/**
 * Distance (metres) from the visitor to each venue that has valid
 * coordinates. Venues without coordinates are absent from the map.
 */
export function buildDistanceMap<T extends SortableVenue>(
  venues: T[],
  origin: Coords | null,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!origin) return out;
  for (const v of venues) {
    if (!v.venue_id || !hasCoords(v)) continue;
    out.set(v.venue_id, distanceMetres(origin, { lat: v.lat!, lng: v.lng! }));
  }
  return out;
}

/**
 * Returns a new array — the input order (and therefore `order_index`) is
 * untouched. Secondary ordering is always deterministic:
 *   az / za      → name, then order_index
 *   nearest      → distance (missing coords last), then name
 *   visit states → visit state, then name
 */
export function sortVenues<T extends SortableVenue>(
  venues: T[],
  opts: {
    sort: VenueSortKey;
    distances?: Map<string, number>;
    visitedIds?: Set<string>;
  },
): T[] {
  const { sort, distances, visitedIds } = opts;
  const byName = (a: T, b: T) => collator.compare(nameOf(a), nameOf(b));
  const byOrder = (a: T, b: T) => orderOf(a) - orderOf(b);
  const rows = [...venues];

  if (sort === "az") {
    rows.sort((a, b) => byName(a, b) || byOrder(a, b));
    return rows;
  }
  if (sort === "za") {
    rows.sort((a, b) => byName(b, a) || byOrder(a, b));
    return rows;
  }
  if (sort === "nearest") {
    rows.sort((a, b) => {
      const da = a.venue_id ? distances?.get(a.venue_id) : undefined;
      const db = b.venue_id ? distances?.get(b.venue_id) : undefined;
      if (da == null && db == null) return byName(a, b) || byOrder(a, b);
      if (da == null) return 1; // no coordinates → after venues with coordinates
      if (db == null) return -1;
      return da - db || byName(a, b);
    });
    return rows;
  }
  // Visit-state sorts. Without passport data every venue scores the same, so
  // the list falls back to name order rather than pretending nothing is visited.
  const visitScore = (v: T) =>
    v.venue_id && visitedIds?.has(v.venue_id) ? 1 : 0;
  rows.sort((a, b) => {
    const sa = visitScore(a);
    const sb = visitScore(b);
    const delta = sort === "visited" ? sb - sa : sa - sb;
    return delta || byName(a, b);
  });
  return rows;
}
