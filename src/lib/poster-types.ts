// Shared types used by the A4 Posters page (event trail + per-venue posters).
//
// Keep this file dependency-free so it is safe to import from both server
// and client modules without dragging in browser-only QR/PDF code.

export type PosterBranding = {
  primaryColor: string;
  accentColor: string;
  pageBackground: string;
  cardBackground: string;
  textColor: string;
  mutedTextColor: string;
  headingFontFamily: string | null;
  bodyFontFamily: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
};

export type EventPosterData = {
  eventId: string;
  eventName: string;
  eventDescription: string | null;
  eventLocation: string | null;
  startDate: string | null; // ISO
  endDate: string | null; // ISO
  timezone: string | null;
  venueCount: number;
  rewardSummary: string | null;
  publicUrl: string | null; // null if no active subdomain
  eventQrUrl: string | null; // QR target (same as publicUrl when available)
  branding: PosterBranding;
};

export type VenuePosterData = {
  eventId: string;
  eventName: string;
  venueId: string;
  venueName: string;
  venueAddress: string | null;
  venueDescription: string | null;
  venueOffer: string | null;
  stampValue: number;
  pointsValue: number | null;
  venueQrUrl: string | null; // null when no active QR
  venueImageUrl: string | null;
  publicUrl: string | null;
  branding: PosterBranding;
};

export function slugForFilename(value: string, fallback: string): string {
  const s = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

export function eventPosterFilename(eventSlug: string): string {
  return `getstampd-${slugForFilename(eventSlug, "event")}-trail-poster.pdf`;
}

export function venuePosterFilename(
  eventSlug: string,
  venueName: string,
): string {
  return `getstampd-${slugForFilename(eventSlug, "event")}-${slugForFilename(venueName, "venue")}-poster.pdf`;
}

export function venuePostersBundleFilename(eventSlug: string): string {
  return `getstampd-${slugForFilename(eventSlug, "event")}-venue-posters.pdf`;
}
