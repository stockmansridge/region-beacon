// Curated public event page backgrounds.
//
// Each background is identified by a stable `key` persisted on
// `public.event_branding.page_background_key`. A background is a pure
// CSS treatment computed from the active palette so it always blends
// with the chosen palette colours.
//
// The Branding editor only exposes the 6 modern "styles" below
// (`MODERN_BACKGROUND_STYLES`). Legacy keys (warm_paper, vineyard_lines,
// festival_glow, country_texture, soft_green_tint, pale_blue, soft_gold)
// remain registered so existing events keep rendering exactly as before,
// they are simply no longer offered for new selections.

import type { CSSProperties } from "react";
import {
  EventPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";

export type EventBackgroundKey =
  // Modern, palette-driven styles (offered in the UI).
  | "clean"
  | "soft_tint"
  | "gradient"
  | "subtle_texture"
  | "dark_premium"
  | "custom_color"
  // Legacy keys — kept for back-compat. Mapped to a modern style for UI
  // display purposes via `getModernStyleKey`.
  | "clean_light"
  | "warm_paper"
  | "vineyard_lines"
  | "soft_gradient"
  | "festival_glow"
  | "country_texture"
  | "soft_green_tint"
  | "pale_blue"
  | "soft_gold";

export type EventBackground = {
  key: EventBackgroundKey;
  label: string;
  description: string;
  /** Full background style applied to the page wrapper. */
  build: (palette: EventPalette) => CSSProperties;
  /** Small preview style for the admin swatch button. */
  swatch: (palette: EventPalette) => CSSProperties;
  /** True for legacy keys that should not appear in the new UI. */
  legacy?: boolean;
};

// ---------- helpers ----------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mix(hex: string, withHex: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = m(a.r, b.r);
  const g = m(a.g, b.g);
  const bl = m(a.b, b.b);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

// ---------- modern, palette-driven styles ----------

const cleanBg: EventBackground = {
  key: "clean",
  label: "Clean",
  description: "Plain palette background — the safest, most readable default.",
  build: (p) => ({ backgroundColor: p.pageBg }),
  swatch: (p) => ({ backgroundColor: p.pageBg }),
};

const softTintBg: EventBackground = {
  key: "soft_tint",
  label: "Soft tint",
  description: "Very light tint of the palette primary — adds a hint of brand.",
  build: (p) => ({ backgroundColor: mix(p.pageBg, p.primary, 0.06) }),
  swatch: (p) => ({ backgroundColor: mix(p.pageBg, p.primary, 0.18) }),
};

const gradientBg: EventBackground = {
  key: "gradient",
  label: "Gradient",
  description: "Subtle gradient using the selected palette colours.",
  build: (p) => ({
    backgroundColor: p.pageBg,
    backgroundImage: `linear-gradient(160deg, ${p.pageBg} 0%, ${mix(p.pageBg, p.accent, 0.18)} 60%, ${mix(p.pageBg, p.primary, 0.15)} 100%)`,
  }),
  swatch: (p) => ({
    backgroundImage: `linear-gradient(160deg, ${p.pageBg}, ${mix(p.pageBg, p.accent, 0.35)}, ${mix(p.pageBg, p.primary, 0.3)})`,
  }),
};

const subtleTextureBg: EventBackground = {
  key: "subtle_texture",
  label: "Subtle texture",
  description: "Very light paper grain over the palette background.",
  build: (p) => ({
    backgroundColor: p.pageBg,
    backgroundImage: `radial-gradient(${rgba("#000000", 0.04)} 1px, transparent 1px)`,
    backgroundSize: "12px 12px",
  }),
  swatch: (p) => ({
    backgroundColor: p.pageBg,
    backgroundImage: `radial-gradient(${rgba("#000000", 0.08)} 1px, transparent 1px)`,
    backgroundSize: "6px 6px",
  }),
};

const darkPremiumBg: EventBackground = {
  key: "dark_premium",
  label: "Dark premium",
  description:
    "Dark background derived from the palette primary. Best with palettes that have light cards.",
  build: (p) => {
    const base = mix(p.primary, "#0B0B0F", 0.55);
    return {
      backgroundColor: base,
      backgroundImage: [
        `radial-gradient(circle at 20% 0%, ${rgba(p.accent, 0.1)}, transparent 55%)`,
        `radial-gradient(circle at 80% 100%, ${rgba(p.primary, 0.18)}, transparent 60%)`,
      ].join(", "),
    };
  },
  swatch: (p) => {
    const base = mix(p.primary, "#0B0B0F", 0.55);
    return {
      backgroundColor: base,
      backgroundImage: `radial-gradient(circle at 30% 30%, ${rgba(p.accent, 0.5)}, transparent 70%)`,
    };
  },
};

const customColorBg: EventBackground = {
  key: "custom_color",
  label: "Custom",
  description: "Pick your own page and card colours below.",
  build: () => ({ backgroundColor: "#FFFFFF" }),
  swatch: () => ({
    backgroundImage:
      "linear-gradient(135deg, #fde68a 0%, #f9a8d4 50%, #93c5fd 100%)",
  }),
};

/** The six styles surfaced in the Branding editor. */
export const MODERN_BACKGROUND_STYLES: ReadonlyArray<EventBackground> = [
  cleanBg,
  softTintBg,
  gradientBg,
  subtleTextureBg,
  darkPremiumBg,
  customColorBg,
];

// ---------- legacy backgrounds (kept resolvable, hidden from UI) ----------

const legacyBackgrounds: ReadonlyArray<EventBackground> = [
  {
    key: "clean_light",
    label: "Clean light",
    description: "Legacy: behaves like Clean.",
    build: (p) => ({ backgroundColor: p.pageBg }),
    swatch: (p) => ({ backgroundColor: p.pageBg }),
    legacy: true,
  },
  {
    key: "warm_paper",
    label: "Warm paper",
    description: "Legacy: warm parchment with paper grain.",
    build: (p) => {
      const base = mix(p.pageBg, "#F5EBD2", 0.5);
      return {
        backgroundColor: base,
        backgroundImage: `radial-gradient(${rgba("#000000", 0.04)} 1px, transparent 1px)`,
        backgroundSize: "12px 12px",
      };
    },
    swatch: (p) => {
      const base = mix(p.pageBg, "#F5EBD2", 0.5);
      return {
        backgroundColor: base,
        backgroundImage: `radial-gradient(${rgba("#000000", 0.08)} 1px, transparent 1px)`,
        backgroundSize: "6px 6px",
      };
    },
    legacy: true,
  },
  {
    key: "vineyard_lines",
    label: "Vineyard lines",
    description: "Legacy: subtle diagonal line pattern.",
    build: (p) => ({
      backgroundColor: p.pageBg,
      backgroundImage: `repeating-linear-gradient(135deg, ${rgba(p.primary, 0.05)} 0 1px, transparent 1px 14px)`,
    }),
    swatch: (p) => ({
      backgroundColor: p.pageBg,
      backgroundImage: `repeating-linear-gradient(135deg, ${rgba(p.primary, 0.25)} 0 1px, transparent 1px 6px)`,
    }),
    legacy: true,
  },
  {
    key: "soft_gradient",
    label: "Soft gradient",
    description: "Legacy: alias for Gradient.",
    build: gradientBg.build,
    swatch: gradientBg.swatch,
    legacy: true,
  },
  {
    key: "festival_glow",
    label: "Festival glow",
    description: "Legacy: bright radial highlights.",
    build: (p) => ({
      backgroundColor: mix(p.pageBg, "#FFFFFF", 0.25),
      backgroundImage: [
        `radial-gradient(circle at 15% 0%, ${rgba(p.accent, 0.22)}, transparent 45%)`,
        `radial-gradient(circle at 85% 10%, ${rgba(p.primary, 0.16)}, transparent 50%)`,
        `radial-gradient(circle at 50% 100%, ${rgba(p.accent, 0.12)}, transparent 55%)`,
      ].join(", "),
    }),
    swatch: (p) => ({
      backgroundColor: mix(p.pageBg, "#FFFFFF", 0.25),
      backgroundImage: [
        `radial-gradient(circle at 30% 20%, ${rgba(p.accent, 0.6)}, transparent 60%)`,
        `radial-gradient(circle at 80% 80%, ${rgba(p.primary, 0.4)}, transparent 60%)`,
      ].join(", "),
    }),
    legacy: true,
  },
  {
    key: "country_texture",
    label: "Country texture",
    description: "Legacy: warm earthy diagonal weave.",
    build: (p) => {
      const base = mix(p.pageBg, "#C9A86A", 0.18);
      return {
        backgroundColor: base,
        backgroundImage: [
          `repeating-linear-gradient(45deg, ${rgba("#5C3A14", 0.05)} 0 1px, transparent 1px 8px)`,
          `repeating-linear-gradient(-45deg, ${rgba("#5C3A14", 0.04)} 0 1px, transparent 1px 8px)`,
        ].join(", "),
      };
    },
    swatch: (p) => {
      const base = mix(p.pageBg, "#C9A86A", 0.25);
      return {
        backgroundColor: base,
        backgroundImage: [
          `repeating-linear-gradient(45deg, ${rgba("#5C3A14", 0.18)} 0 1px, transparent 1px 4px)`,
          `repeating-linear-gradient(-45deg, ${rgba("#5C3A14", 0.14)} 0 1px, transparent 1px 4px)`,
        ].join(", "),
      };
    },
    legacy: true,
  },
  {
    key: "soft_green_tint",
    label: "Soft green tint",
    description: "Legacy: pale green wash.",
    build: () => ({ backgroundColor: "#EEF4EC" }),
    swatch: () => ({ backgroundColor: "#EEF4EC" }),
    legacy: true,
  },
  {
    key: "pale_blue",
    label: "Pale blue",
    description: "Legacy: cool light blue surface.",
    build: () => ({ backgroundColor: "#EAF1F7" }),
    swatch: () => ({ backgroundColor: "#EAF1F7" }),
    legacy: true,
  },
  {
    key: "soft_gold",
    label: "Soft gold",
    description: "Legacy: warm pale gold surface.",
    build: () => ({ backgroundColor: "#F6EFD9" }),
    swatch: () => ({ backgroundColor: "#F6EFD9" }),
    legacy: true,
  },
];

/** Full registry (modern + legacy). Lookup-only — UI iterates MODERN_BACKGROUND_STYLES. */
export const EVENT_BACKGROUNDS: ReadonlyArray<EventBackground> = [
  ...MODERN_BACKGROUND_STYLES,
  ...legacyBackgrounds,
];

export const DEFAULT_BACKGROUND_KEY: EventBackgroundKey = "clean";

const BACKGROUND_INDEX: Record<string, EventBackground> = Object.fromEntries(
  EVENT_BACKGROUNDS.map((b) => [b.key, b]),
);

export function getBackground(
  key: string | null | undefined,
): EventBackground | null {
  if (!key) return null;
  return BACKGROUND_INDEX[key] ?? null;
}

export function getBackgroundOrDefault(
  key: string | null | undefined,
): EventBackground {
  return getBackground(key) ?? BACKGROUND_INDEX[DEFAULT_BACKGROUND_KEY];
}

/**
 * Map a (possibly legacy) saved background key to the modern style it
 * most closely matches. Used by the Branding editor so a saved legacy
 * key still highlights the correct chip in the new UI.
 */
const LEGACY_TO_MODERN: Record<string, EventBackgroundKey> = {
  clean_light: "clean",
  warm_paper: "subtle_texture",
  vineyard_lines: "subtle_texture",
  soft_gradient: "gradient",
  festival_glow: "gradient",
  country_texture: "subtle_texture",
  soft_green_tint: "soft_tint",
  pale_blue: "soft_tint",
  soft_gold: "soft_tint",
};

export function getModernStyleKey(
  key: string | null | undefined,
): EventBackgroundKey | null {
  if (!key) return null;
  const direct = MODERN_BACKGROUND_STYLES.find((b) => b.key === key);
  if (direct) return direct.key;
  return LEGACY_TO_MODERN[key] ?? null;
}

/**
 * Returns the CSS style to apply to the page wrapper for the given
 * background + palette combination.
 */
export function getBackgroundStyle(
  backgroundKey: string | null | undefined,
  paletteKey: string | null | undefined,
): CSSProperties {
  const palette = getPaletteOrDefault(paletteKey);
  const background = getBackgroundOrDefault(backgroundKey);
  return background.build(palette);
}
