// Pure matching helpers for venue opening hours: decide whether a Google
// Places candidate is really the venue before trusting its opening hours.

export type PlaceCandidate = {
  id: string;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const MATCH_RADIUS_M = 200;
/** Two name matches closer together than this are treated as ambiguous. */
export const AMBIGUITY_GAP_M = 50;

export type MatchResult =
  | { kind: "match"; id: string; name: string | null; distanceM: number }
  | { kind: "ambiguous"; candidates: Array<{ id: string; name: string | null; distanceM: number }> }
  | { kind: "none" };

/** Lowercase, strip diacritics and punctuation, collapse spaces. */
export function normalizeVenueName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''ʼ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

/**
 * Defensible name match: exact after normalisation, one name containing the
 * other, or one name's words being a subset of the other's (handles
 * "Stockman's Ridge Wines" vs "Stockmans Ridge"). Rejects different names.
 */
export function namesMatch(venueName: string, placeName: string | null | undefined): boolean {
  const a = normalizeVenueName(venueName);
  const b = normalizeVenueName(placeName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  const subset = (small: string[], big: string[]) =>
    small.length > 0 && small.every((t) => big.includes(t));
  return subset(ta, tb) || subset(tb, ta);
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLng = (bLng - aLng) * r;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Locality words (suburb, postcode, state) shared between two addresses. */
function sharedLocalityTokens(venueAddress: string, placeAddress: string): string[] {
  const a = new Set(tokens(normalizeVenueName(venueAddress)));
  const b = new Set(tokens(normalizeVenueName(placeAddress)));
  // Drop words that are just the street number or too generic to mean anything.
  const noise = new Set(["nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act", "australia", "au", "road", "rd", "street", "st", "lane", "ln", "drive", "dr", "highway", "hwy"]);
  return [...a].filter((t) => b.has(t) && !noise.has(t) && t.length >= 3);
}

/**
 * Pick the Google listing for a venue. A candidate must (a) match the venue
 * name and (b) sit within MATCH_RADIUS_M of the venue's position. When two
 * name-matching listings sit close together (within AMBIGUITY_GAP_M of each
 * other), the result is "ambiguous" and held for review — unless exactly one
 * of them shares address/locality evidence with the venue's own address.
 * Never guesses another business's listing.
 */
export function choosePlace(
  venue: { name: string; lat: number; lng: number; address?: string | null },
  candidates: PlaceCandidate[],
): MatchResult {
  if (!Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return { kind: "none" };
  const hits: Array<{ id: string; name: string | null; address: string | null; distanceM: number }> = [];
  for (const c of candidates) {
    if (!c.id || c.lat == null || c.lng == null) continue;
    if (!namesMatch(venue.name, c.name)) continue;
    const d = distanceM(venue.lat, venue.lng, c.lat, c.lng);
    if (d > MATCH_RADIUS_M) continue;
    hits.push({ id: c.id, name: c.name ?? null, address: c.address ?? null, distanceM: d });
  }
  if (hits.length === 0) return { kind: "none" };
  hits.sort((x, y) => x.distanceM - y.distanceM);
  const best = hits[0];
  const rivals = hits.filter((h) => h.distanceM - best.distanceM <= AMBIGUITY_GAP_M);
  if (rivals.length === 1) return { kind: "match", id: best.id, name: best.name, distanceM: best.distanceM };

  // Genuinely close duplicates: try address/locality evidence.
  if (venue.address) {
    const withEvidence = rivals.filter(
      (h): h is typeof h & { address: string } =>
        typeof h.address === "string" && sharedLocalityTokens(venue.address!, h.address).length > 0,
    );
    if (withEvidence.length === 1) {
      const only = withEvidence[0];
      return { kind: "match", id: only.id, name: only.name, distanceM: only.distanceM };
    }
  }
  return {
    kind: "ambiguous",
    candidates: rivals.map(({ id, name, distanceM }) => ({ id, name, distanceM })),
  };
}
