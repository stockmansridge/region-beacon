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
//
// Palettes are tagged by use-case category and ship with a recommended
// background-style key so the Branding editor can suggest a sensible
// page background after the admin picks a palette.

export type EventPaletteKey =
  // Legacy / existing — kept so saved values keep resolving.
  | "classic_vineyard"
  | "modern_navy"
  | "festival_bright"
  | "premium_wine"
  | "coastal_trail"
  | "orchard_country"
  // New modern additions.
  | "clean_minimal"
  | "coastal_fresh"
  | "urban_night"
  | "market_pop"
  | "alpine_blue"
  | "bushland"
  | "luxury_black_gold"
  | "custom";

export const CUSTOM_PALETTE_KEY: EventPaletteKey = "custom";

export type PaletteCategory =
  | "premium"
  | "bright"
  | "nature"
  | "coastal"
  | "minimal"
  | "food_wine";

export type EventPalette = {
  key: EventPaletteKey;
  label: string;
  description: string;
  /** Short use-case tags, surfaced in the palette card as chips. */
  tags: ReadonlyArray<string>;
  /** Filter categories the palette belongs to. */
  categories: ReadonlyArray<PaletteCategory>;
  /** Recommended background-style key (see event-backgrounds.ts). */
  recommendedBackground: string;
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
  // ---------- Modern, recommended-first ----------
  {
    key: "clean_minimal",
    label: "Clean Minimal",
    description: "Crisp neutral surfaces with a confident blue accent — works for almost any event.",
    tags: ["General", "Corporate", "Minimal"],
    categories: ["minimal", "premium"],
    recommendedBackground: "clean",
    primary: "#1F2937",
    primaryForeground: "#FFFFFF",
    accent: "#2F6FE4",
    pageBg: "#F5F7FB",
    cardBg: "#FFFFFF",
    heading: "#0F172A",
    bodyText: "#1F2937",
    mutedText: "#64748B",
    border: "#E2E8F0",
    visitedStamp: "#2F6FE4",
    pinDefault: "#2F6FE4",
  },
  {
    key: "modern_navy",
    label: "Modern Navy",
    description: "Premium navy with gold detailing — tourism, regions, corporate events.",
    tags: ["Premium", "Tourism", "Regional"],
    categories: ["premium", "minimal"],
    recommendedBackground: "clean",
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
    description: "Vivid blue and sunny accents for festivals, markets, and family events.",
    tags: ["Festival", "Family", "Bright"],
    categories: ["bright"],
    recommendedBackground: "gradient",
    primary: "#1F6FEB",
    primaryForeground: "#FFFFFF",
    accent: "#F4B400",
    pageBg: "#FFFFFF",
    cardBg: "#FFFFFF",
    heading: "#16243F",
    bodyText: "#22324D",
    mutedText: "#5B6478",
    border: "#E2E8F0",
    visitedStamp: "#E94F37",
    pinDefault: "#1F6FEB",
  },
  {
    key: "coastal_fresh",
    label: "Coastal Fresh",
    description: "Ocean-inspired teals on pale aqua — tourism, beach, holiday trails.",
    tags: ["Tourism", "Coastal", "Family"],
    categories: ["coastal", "bright"],
    recommendedBackground: "soft_tint",
    primary: "#0E6E7A",
    primaryForeground: "#FFFFFF",
    accent: "#E2A24A",
    pageBg: "#EEF6F8",
    cardBg: "#FFFFFF",
    heading: "#093F47",
    bodyText: "#15333A",
    mutedText: "#5F7378",
    border: "#D6E4E7",
    visitedStamp: "#0E6E7A",
    pinDefault: "#E2A24A",
  },
  {
    key: "alpine_blue",
    label: "Alpine Blue",
    description: "Deep blue on pale sky — towns, regional and tourism trails.",
    tags: ["Tourism", "Regional", "Towns"],
    categories: ["coastal", "minimal"],
    recommendedBackground: "soft_tint",
    primary: "#1E3A8A",
    primaryForeground: "#FFFFFF",
    accent: "#3D8B6A",
    pageBg: "#EAF1F8",
    cardBg: "#FFFFFF",
    heading: "#0F1F4D",
    bodyText: "#1B2540",
    mutedText: "#5C6B85",
    border: "#D7E0EE",
    visitedStamp: "#1E3A8A",
    pinDefault: "#3D8B6A",
  },
  {
    key: "bushland",
    label: "Bushland",
    description: "Eucalyptus green on pale sage — nature, outdoor, country trails.",
    tags: ["Nature", "Outdoor", "Country"],
    categories: ["nature"],
    recommendedBackground: "soft_tint",
    primary: "#3F5D3A",
    primaryForeground: "#FFFFFF",
    accent: "#C0683A",
    pageBg: "#EFF3EB",
    cardBg: "#FAFBF6",
    heading: "#1F2C1A",
    bodyText: "#2A332A",
    mutedText: "#6B7765",
    border: "#DCE3D3",
    visitedStamp: "#3F5D3A",
    pinDefault: "#C0683A",
  },
  {
    key: "market_pop",
    label: "Market Pop",
    description: "Raspberry with a mint accent — markets, retail, food activations.",
    tags: ["Market", "Retail", "Food"],
    categories: ["bright", "food_wine"],
    recommendedBackground: "soft_tint",
    primary: "#C8366A",
    primaryForeground: "#FFFFFF",
    accent: "#39B58A",
    pageBg: "#FFF4F7",
    cardBg: "#FFFFFF",
    heading: "#3A0F23",
    bodyText: "#2A1820",
    mutedText: "#7A5566",
    border: "#F1D7E0",
    visitedStamp: "#C8366A",
    pinDefault: "#39B58A",
  },
  {
    key: "urban_night",
    label: "Urban Night",
    description: "Near-black surfaces with electric violet — nightlife, city and art trails.",
    tags: ["Premium", "City", "Art"],
    categories: ["premium"],
    recommendedBackground: "dark_premium",
    primary: "#7C5CFF",
    primaryForeground: "#FFFFFF",
    accent: "#3DD9D6",
    pageBg: "#0E1020",
    cardBg: "#1A1D33",
    heading: "#F5F7FF",
    bodyText: "#E4E7F5",
    mutedText: "#9BA1BD",
    border: "#2A2F4A",
    visitedStamp: "#7C5CFF",
    pinDefault: "#3DD9D6",
  },
  {
    key: "luxury_black_gold",
    label: "Luxury Black & Gold",
    description: "Strong black header with gold accents — premium events and gala trails.",
    tags: ["Premium", "Gala", "Luxury"],
    categories: ["premium", "food_wine"],
    recommendedBackground: "clean",
    primary: "#111111",
    primaryForeground: "#F5E7B8",
    accent: "#C9A84C",
    pageBg: "#FAFAF7",
    cardBg: "#FFFFFF",
    heading: "#111111",
    bodyText: "#1F1F1F",
    mutedText: "#6B6358",
    border: "#E7E3DA",
    visitedStamp: "#111111",
    pinDefault: "#C9A84C",
  },
  // ---------- Beige-leaning (kept lower so they aren't the default) ----------
  {
    key: "premium_wine",
    label: "Premium Wine",
    description: "Burgundy on soft cream with a champagne accent — premium wine and food.",
    tags: ["Wine", "Food", "Premium"],
    categories: ["food_wine", "premium"],
    recommendedBackground: "soft_tint",
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
    key: "classic_vineyard",
    label: "Classic Vineyard",
    description: "Cream, deep green and muted gold — the traditional GetStampd wine-trail look.",
    tags: ["Wine", "Classic"],
    categories: ["food_wine", "nature"],
    recommendedBackground: "subtle_texture",
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
    key: "orchard_country",
    label: "Orchard Country",
    description: "Olive on warm cream with a burnt-orange accent — orchards and produce trails.",
    tags: ["Farm", "Produce", "Country"],
    categories: ["nature", "food_wine"],
    recommendedBackground: "subtle_texture",
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
  {
    key: "coastal_trail",
    label: "Coastal Trail (warm)",
    description: "Soft cream + teal — earlier coastal styling, kept for existing events.",
    tags: ["Coastal", "Warm"],
    categories: ["coastal", "food_wine"],
    recommendedBackground: "soft_tint",
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
];

/**
 * Build a runtime palette from custom primary/accent hex inputs. Surface
 * colours are derived from the Clean Minimal palette so cards/text
 * stay readable when an event picks the Custom option.
 */
export function buildCustomPalette(
  primaryHex: string | null | undefined,
  accentHex: string | null | undefined,
): EventPalette {
  const base =
    EVENT_PALETTES.find((p) => p.key === "clean_minimal") ?? EVENT_PALETTES[0];
  return {
    ...base,
    key: "custom" as EventPaletteKey,
    label: "Custom",
    description: "Custom brand colours",
    tags: ["Custom"],
    categories: ["minimal"],
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

// New events default to a modern, readable palette. Existing events keep
// whatever palette_key they were saved with — this only affects events
// that have no palette set yet.
export const DEFAULT_PALETTE_KEY: EventPaletteKey = "clean_minimal";

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
    brand_kit_key?: string | null;
    primary_color: string | null;
    accent_color: string | null;
  },
>(event: T): T {
  // Modern Brand Kit / Custom branding resolves via explicit semantic
  // columns. Do not let a stale legacy palette_key replace the saved
  // primary/accent colours on public pages.
  if (event.brand_kit_key) return event;
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
