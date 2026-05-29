/**
 * Build an Apple Maps "directions to" URL for a venue.
 *
 * Prefers coordinates when both lat/lng are present; otherwise falls back to
 * the postal address. Returns null when neither is available so callers can
 * hide the button entirely.
 *
 * Format reference: https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
 * Apple Maps URLs work on iOS/macOS directly and gracefully fall back to a
 * web view on other platforms.
 */
export function buildAppleMapsDirectionsUrl(input: {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  const params = new URLSearchParams();
  const hasCoords =
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  if (hasCoords) {
    params.set("daddr", `${input.lat},${input.lng}`);
    if (input.name) params.set("q", input.name);
  } else if (input.address && input.address.trim().length > 0) {
    params.set("daddr", input.address.trim());
  } else {
    return null;
  }
  return `https://maps.apple.com/?${params.toString()}`;
}
