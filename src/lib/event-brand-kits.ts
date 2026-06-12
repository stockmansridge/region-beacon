// Phase D — Curated Brand Kits.
//
// A Brand Kit is a complete set of semantic colour values. Picking a
// kit in the admin writes EVERY colour field below into the event's
// branding row. The organiser can then override any individual field;
// doing so flips `brand_kit_key` to "custom".
//
// Kits never overwrite logo/cover/font/typography choices — only
// colour roles. Existing events with `brand_kit_key === null` keep
// resolving via legacy palette/background fallbacks and look
// identical to today.

export type BrandKitKey =
  | "vineyard"
  | "coastal"
  | "festival"
  | "highlands"
  | "minimal_light"
  | "minimal_dark"
  | "custom";

export type BrandKitColors = {
  // Brand
  primary_color: string;
  accent_color: string;
  link_color: string;
  // Page surface
  page_background_color: string;
  text_color: string;           // page heading (also body fallback)
  muted_text_color: string;     // page muted
  border_color: string;         // page-level borders
  // Card surface
  card_background_color: string;
  card_text_color: string;      // card heading (also body fallback)
  card_muted_text_color: string;
  card_border_color: string;
  // Buttons
  button_primary_bg: string;
  button_primary_fg: string;
  button_secondary_bg: string;
  button_secondary_fg: string;
  // Navigation
  nav_background_color: string;
  nav_fg_color: string;
  nav_muted_color: string;
  nav_active_fg_color: string;
  // Hero
  hero_bg_color: string;
  hero_fg_color: string;
  hero_accent_color: string;
};

export type BrandKit = {
  key: BrandKitKey;
  label: string;
  description: string;
  /** Bumped when curated values change; persisted in brand_kit_version. */
  version: number;
  colors: BrandKitColors;
};

export const BRAND_KIT_VERSION = 1;

const KITS: ReadonlyArray<BrandKit> = [
  {
    key: "vineyard",
    label: "Vineyard",
    description: "Deep green on warm cream with an amber accent — wine, food, country trails.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#1F3D2B",
      accent_color: "#B5572A",
      link_color: "#1F3D2B",
      page_background_color: "#F6EFE2",
      text_color: "#1F3D2B",
      muted_text_color: "#7A6F5C",
      border_color: "#E6DCC7",
      card_background_color: "#FBF5E8",
      card_text_color: "#1F3D2B",
      card_muted_text_color: "#7A6F5C",
      card_border_color: "#E6DCC7",
      button_primary_bg: "#1F3D2B",
      button_primary_fg: "#F6EFE2",
      button_secondary_bg: "#FBF5E8",
      button_secondary_fg: "#1F3D2B",
      nav_background_color: "#1F3D2B",
      nav_fg_color: "#F6EFE2",
      nav_muted_color: "#C8C0A8",
      nav_active_fg_color: "#B5572A",
      hero_bg_color: "#1F3D2B",
      hero_fg_color: "#F6EFE2",
      hero_accent_color: "#B5572A",
    },
  },
  {
    key: "coastal",
    label: "Coastal",
    description: "Navy on ivory with a coral accent — tourism, beach, holiday trails.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#0F2A4A",
      accent_color: "#E94F37",
      link_color: "#0F2A4A",
      page_background_color: "#F4F7FA",
      text_color: "#0F2A4A",
      muted_text_color: "#5B6478",
      border_color: "#DEE5EE",
      card_background_color: "#FFFFFF",
      card_text_color: "#0F2A4A",
      card_muted_text_color: "#5B6478",
      card_border_color: "#DEE5EE",
      button_primary_bg: "#0F2A4A",
      button_primary_fg: "#FFFFFF",
      button_secondary_bg: "#FFFFFF",
      button_secondary_fg: "#0F2A4A",
      nav_background_color: "#0F2A4A",
      nav_fg_color: "#FFFFFF",
      nav_muted_color: "#B6C2D4",
      nav_active_fg_color: "#E94F37",
      hero_bg_color: "#0F2A4A",
      hero_fg_color: "#FFFFFF",
      hero_accent_color: "#E94F37",
    },
  },
  {
    key: "festival",
    label: "Festival",
    description: "Charcoal on off-white with electric pink — festivals, markets, family events.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#1F2230",
      accent_color: "#E91E63",
      link_color: "#1F2230",
      page_background_color: "#FAFAFA",
      text_color: "#1F2230",
      muted_text_color: "#5E6470",
      border_color: "#E5E6EA",
      card_background_color: "#FFFFFF",
      card_text_color: "#1F2230",
      card_muted_text_color: "#5E6470",
      card_border_color: "#E5E6EA",
      button_primary_bg: "#1F2230",
      button_primary_fg: "#FFFFFF",
      button_secondary_bg: "#FFFFFF",
      button_secondary_fg: "#1F2230",
      nav_background_color: "#1F2230",
      nav_fg_color: "#FFFFFF",
      nav_muted_color: "#B5B8C2",
      nav_active_fg_color: "#E91E63",
      hero_bg_color: "#1F2230",
      hero_fg_color: "#FFFFFF",
      hero_accent_color: "#E91E63",
    },
  },
  {
    key: "highlands",
    label: "Highlands",
    description: "Slate on parchment with mustard accent — country, regional, heritage trails.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#3B4252",
      accent_color: "#C99A2E",
      link_color: "#3B4252",
      page_background_color: "#F2EFE6",
      text_color: "#2E3340",
      muted_text_color: "#6F7585",
      border_color: "#E1DCCC",
      card_background_color: "#FBF8EF",
      card_text_color: "#2E3340",
      card_muted_text_color: "#6F7585",
      card_border_color: "#E1DCCC",
      button_primary_bg: "#3B4252",
      button_primary_fg: "#FBF8EF",
      button_secondary_bg: "#FBF8EF",
      button_secondary_fg: "#3B4252",
      nav_background_color: "#3B4252",
      nav_fg_color: "#FBF8EF",
      nav_muted_color: "#B8BCC6",
      nav_active_fg_color: "#C99A2E",
      hero_bg_color: "#3B4252",
      hero_fg_color: "#FBF8EF",
      hero_accent_color: "#C99A2E",
    },
  },
  {
    key: "minimal_light",
    label: "Minimal Light",
    description: "White surfaces, ink text, single confident accent.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#111111",
      accent_color: "#2F6FE4",
      link_color: "#2F6FE4",
      page_background_color: "#FFFFFF",
      text_color: "#111111",
      muted_text_color: "#64748B",
      border_color: "#E5E7EB",
      card_background_color: "#F8FAFC",
      card_text_color: "#111111",
      card_muted_text_color: "#64748B",
      card_border_color: "#E5E7EB",
      button_primary_bg: "#111111",
      button_primary_fg: "#FFFFFF",
      button_secondary_bg: "#F8FAFC",
      button_secondary_fg: "#111111",
      nav_background_color: "#FFFFFF",
      nav_fg_color: "#111111",
      nav_muted_color: "#64748B",
      nav_active_fg_color: "#2F6FE4",
      hero_bg_color: "#F8FAFC",
      hero_fg_color: "#111111",
      hero_accent_color: "#2F6FE4",
    },
  },
  {
    key: "minimal_dark",
    label: "Minimal Dark",
    description: "Near-black surfaces, off-white text, single confident accent.",
    version: BRAND_KIT_VERSION,
    colors: {
      primary_color: "#F5F5F5",
      accent_color: "#3DD9D6",
      link_color: "#3DD9D6",
      page_background_color: "#0E1020",
      text_color: "#F5F7FF",
      muted_text_color: "#9BA1BD",
      border_color: "#2A2F4A",
      card_background_color: "#1A1D33",
      card_text_color: "#F5F7FF",
      card_muted_text_color: "#9BA1BD",
      card_border_color: "#2A2F4A",
      button_primary_bg: "#F5F7FF",
      button_primary_fg: "#0E1020",
      button_secondary_bg: "#1A1D33",
      button_secondary_fg: "#F5F7FF",
      nav_background_color: "#0E1020",
      nav_fg_color: "#F5F7FF",
      nav_muted_color: "#9BA1BD",
      nav_active_fg_color: "#3DD9D6",
      hero_bg_color: "#0E1020",
      hero_fg_color: "#F5F7FF",
      hero_accent_color: "#3DD9D6",
    },
  },
];

export const BRAND_KITS: ReadonlyArray<BrandKit> = KITS;

const KIT_INDEX: Record<string, BrandKit> = Object.fromEntries(
  KITS.map((k) => [k.key, k]),
);

export function getBrandKit(key: string | null | undefined): BrandKit | null {
  if (!key || key === "custom") return null;
  return KIT_INDEX[key] ?? null;
}

/**
 * Return a payload of column values to write when the organiser picks
 * a kit. Caller merges into the event_branding update payload along
 * with `brand_kit_key` and `brand_kit_version`.
 */
export function brandKitWritePayload(key: BrandKitKey): Partial<BrandKitColors> & {
  brand_kit_key: BrandKitKey;
  brand_kit_version: number;
} {
  const kit = getBrandKit(key);
  if (!kit) {
    return { brand_kit_key: "custom", brand_kit_version: BRAND_KIT_VERSION };
  }
  return {
    ...kit.colors,
    brand_kit_key: kit.key,
    brand_kit_version: kit.version,
  };
}
