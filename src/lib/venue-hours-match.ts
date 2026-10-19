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

/** Lowercase, strip diacritics and punctuation, collapse spaces. */
export function normalizeVenueName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
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

/**
 * Pick the Google listing for a venue. A candidate must (a) match the venue
 * name and (b) sit within MATCH_RADIUS_M of the venue's position. Among
 * name-matching candidates the nearest wins. Returns null when nothing is
 * defensible — never guesses another business's listing.
 */
export function choosePlace(
  venue: { name: string; lat: number; lng: number },
  candidates: PlaceCandidate[],
): { id: string; name: string | null; distanceM: number } | null {
  if (!Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return null;
  let best: { id: string; name: string | null; distanceM: number } | null = null;
  for (const c of candidates) {
    if (!c.id || c.lat == null || c.lng == null) continue;
    if (!namesMatch(venue.name, c.name)) continue;
    const d = distanceM(venue.lat, venue.lng, c.lat, c.lng);
    if (d > MATCH_RADIUS_M) continue;
    if (!best || d < best.distanceM) best = { id: c.id, name: c.name ?? null, distanceM: d };
  }
  return best;
}
