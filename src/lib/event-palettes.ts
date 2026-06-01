// Curated public event palettes.
//
// Each palette is identified by a stable `key` that's persisted in
// `public.event_branding.palette_key`. When a palette is selected, public
// pages use these colours instead of the legacy per-event
// `primary_color`/`accent_color` fields.
//
// All colour values are 6-digit hex (#RRGGBB) for compatibility with the
// existing public-page colour pipeline. Each palette also exposes a
// `cssVars` map for components that want to scope a richer theme via CSS
// custom properties (see <EventPaletteScope>).

export type EventPaletteKey =
  | "classic_vineyard"
  | "modern_navy"
  | "festival_bright"
  | "premium_wine"
  | "coastal_trail"
  | "orchard_country"
  | "custom";

export const CUSTOM_PALETTE_KEY: EventPaletteKey = "custom";

export type EventPalette = {
  key: EventPaletteKey;
  label: string;
  description: string;
  // Core colours surfaced to existing components via the
  // primary_color / accent_color pipeline.
  primary: string;
  primaryForeground: string;
  accent: string;
  // Extended tokens for richer theming when a component opts in.
  pageBg: string;
  cardBg: string;
  heading: string;
  bodyText: string;
  mutedText: string;
  border: string;
  visitedStamp: string;
  pinDefault: string;
};

export const EVENT_PALETTES: ReadonlyArray<EventPalette> = [
  {
    key: "classic_vineyard",
    label: "Classic Vineyard",
    description: "Cream, deep green, muted gold — the GetStampd house look.",
    primary: "#1F3D2B",
    primaryForeground: "#F6EFE2",
    accent: "#B5572A",
    pageBg: "#F6EFE2",
    cardBg: "#FBF5E8",
    heading: "#1F3D2B",
    bodyText: "#2A2620",
    mutedText: "#7A6F5C",
    border: "#E6DCC7",
    visitedStamp: "#1F3D2B",
    pinDefault: "#B5572A",
  },
  {
    key: "modern_navy",
    label: "Modern Navy",
    description: "Pale neutral background, navy primary, gold accent.",
    primary: "#0F2A4A",
    primaryForeground: "#FFFFFF",
    accent: "#C9A24A",
    pageBg: "#F4F5F8",
    cardBg: "#FFFFFF",
    heading: "#0F2A4A",
    bodyText: "#1B2233",
    mutedText: "#5B6478",
    border: "#DEE2EA",
    visitedStamp: "#0F2A4A",
    pinDefault: "#C9A24A",
  },
  {
    key: "festival_bright",
    label: "Festival Bright",
    description: "Light warm background, vivid blue primary, sunny accent.",
    primary: "#1F6FEB",
    primaryForeground: "#FFFFFF",
    accent: "#F4B400",
    pageBg: "#FFF8EE",
    cardBg: "#FFFFFF",
    heading: "#16243F",
    bodyText: "#22324D",
    mutedText: "#6B7A8F",
    border: "#F0E2C8",
    visitedStamp: "#E94F37",
    pinDefault: "#1F6FEB",
  },
  {
    key: "premium_wine",
    label: "Premium Wine",
    description: "Soft cream, burgundy primary, champagne accent.",
    primary: "#6E1A2E",
    primaryForeground: "#FBF5E8",
    accent: "#D9B97A",
    pageBg: "#F7F1E6",
    cardBg: "#FFFBF2",
    heading: "#3F1F25",
    bodyText: "#2E1F22",
    mutedText: "#8A7466",
    border: "#E8DBC2",
    visitedStamp: "#2E4F3A",
    pinDefault: "#6E1A2E",
  },
  {
    key: "coastal_trail",
    label: "Coastal Trail",
    description: "Pale blue/cream background, teal primary, sand accent.",
    primary: "#1F6E7A",
    primaryForeground: "#FFFFFF",
    accent: "#E2C58A",
    pageBg: "#EFF6F7",
    cardBg: "#FFFFFF",
    heading: "#0F3D44",
    bodyText: "#1F2E33",
    mutedText: "#5F7378",
    border: "#D6E4E7",
    visitedStamp: "#1F6E7A",
    pinDefault: "#C58A3F",
  },
  {
    key: "orchard_country",
    label: "Orchard Country",
    description: "Warm cream, olive primary, burnt-orange accent.",
    primary: "#5C6B2A",
    primaryForeground: "#FBF7EC",
    accent: "#C45A1F",
    pageBg: "#F5EFDF",
    cardBg: "#FAF4E2",
    heading: "#3A3F1F",
    bodyText: "#2C2A1F",
    mutedText: "#7A7257",
    border: "#E4DAB8",
    visitedStamp: "#5C6B2A",
    pinDefault: "#C45A1F",
  },
];

/**
 * Build a runtime palette from custom primary/accent hex inputs. Surface
 * colours are derived from the classic_vineyard palette so cards/text
 * stay readable when an event picks the Custom option.
 */
export function buildCustomPalette(
  primaryHex: string | null | undefined,
  accentHex: string | null | undefined,
): EventPalette {
  const base = EVENT_PALETTES[0];
  return {
    ...base,
    key: "custom" as EventPaletteKey,
    label: "Custom",
    description: "Custom brand colours",
    primary: primaryHex && /^#[0-9A-Fa-f]{6}$/.test(primaryHex) ? primaryHex : base.primary,
    accent: accentHex && /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : base.accent,
    visitedStamp: primaryHex && /^#[0-9A-Fa-f]{6}$/.test(primaryHex) ? primaryHex : base.visitedStamp,
    pinDefault: accentHex && /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : base.pinDefault,
  };
}

/**
 * Resolve the active palette for an event row. Honours palette_key when
 * it matches a curated palette; falls back to a custom palette built
 * from primary_color/accent_color when palette_key is 'custom' or null.
 */
export function resolveEventPalette(input: {
  palette_key?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
}): EventPalette {
  if (input.palette_key && input.palette_key !== "custom") {
    const p = getPalette(input.palette_key);
    if (p) return p;
  }
  if (input.palette_key === "custom" || input.primary_color || input.accent_color) {
    return buildCustomPalette(input.primary_color ?? null, input.accent_color ?? null);
  }
  return getPaletteOrDefault(null);
}

export const DEFAULT_PALETTE_KEY: EventPaletteKey = "classic_vineyard";

const PALETTE_INDEX: Record<string, EventPalette> = Object.fromEntries(
  EVENT_PALETTES.map((p) => [p.key, p]),
);

export function getPalette(key: string | null | undefined): EventPalette | null {
  if (!key) return null;
  return PALETTE_INDEX[key] ?? null;
}

export function getPaletteOrDefault(key: string | null | undefined): EventPalette {
  return getPalette(key) ?? PALETTE_INDEX[DEFAULT_PALETTE_KEY];
}

/**
 * Overlay the curated palette on top of an event-shaped record. If
 * `palette_key` is set and recognised, the palette's primary/accent
 * colours replace the legacy free-form hex fields so all existing
 * components (TrailLanding, PublicEventNav, CTA buttons, map pins…)
 * automatically pick up the palette.
 *
 * The original record is returned unchanged when no palette is set or
 * the key is unknown.
 */
export function applyPaletteToEvent<
  T extends {
    palette_key?: string | null;
    primary_color: string | null;
    accent_color: string | null;
  },
>(event: T): T {
  // For 'custom' palette_key, keep event.primary_color/accent_color as-is.
  if (event.palette_key === "custom") return event;
  const palette = getPalette(event.palette_key ?? null);
  if (!palette) return event;
  return {
    ...event,
    primary_color: palette.primary,
    accent_color: palette.accent,
  };
}

/**
 * CSS variable map for the curated palette. Suitable for spreading onto
 * a wrapper element's `style` prop so children can read palette tokens
 * via `var(--event-*)`.
 */
export function paletteCssVars(palette: EventPalette): React.CSSProperties {
  return {
    ["--event-page-bg" as any]: palette.pageBg,
    ["--event-card-bg" as any]: palette.cardBg,
    ["--event-heading" as any]: palette.heading,
    ["--event-body" as any]: palette.bodyText,
    ["--event-muted" as any]: palette.mutedText,
    ["--event-primary" as any]: palette.primary,
    ["--event-primary-fg" as any]: palette.primaryForeground,
    ["--event-accent" as any]: palette.accent,
    ["--event-border" as any]: palette.border,
    ["--event-visited" as any]: palette.visitedStamp,
    ["--event-pin" as any]: palette.pinDefault,
  };
}
