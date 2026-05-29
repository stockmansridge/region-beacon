// Customer-facing venue/location wording.
// The DB column lives at event_branding.venue_label_{singular,plural}.
// Frontend defaults match the DB defaults so the UI stays sensible even if
// the columns aren't selected yet (e.g. older RPC responses).

export const DEFAULT_VENUE_LABEL_SINGULAR = "Venue";
export const DEFAULT_VENUE_LABEL_PLURAL = "Venues";
export const VENUE_LABEL_MAX = 40;

export type VenueLabels = {
  singular: string;
  plural: string;
};

export function resolveVenueLabels(
  input?: {
    venue_label_singular?: string | null;
    venue_label_plural?: string | null;
  } | null,
): VenueLabels {
  return {
    singular: normalizeLabel(input?.venue_label_singular, DEFAULT_VENUE_LABEL_SINGULAR),
    plural: normalizeLabel(input?.venue_label_plural, DEFAULT_VENUE_LABEL_PLURAL),
  };
}

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, VENUE_LABEL_MAX);
}

/**
 * Mirrors the DB CHECK constraints. Returns an error message or null.
 */
export function validateVenueLabel(value: string, fieldName: string): string | null {
  if (typeof value !== "string") return `${fieldName} is required.`;
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${fieldName} is required.`;
  if (trimmed.length > VENUE_LABEL_MAX) {
    return `${fieldName} must be ${VENUE_LABEL_MAX} characters or fewer.`;
  }
  if (value !== trimmed) {
    return `${fieldName} cannot start or end with whitespace.`;
  }
  return null;
}
