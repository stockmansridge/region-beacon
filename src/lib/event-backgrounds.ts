// Curated public event page backgrounds.
//
// Independent from the colour palette: an event picks a palette AND a
// page background separately. Backgrounds are stored on
// `public.event_branding.page_background_key`.
//
// Each background is a pure CSS treatment (no external images) computed
// from the active palette so it always blends with the chosen palette.
// Use `getBackgroundStyle(backgroundKey, palette)` to get a ready-to-use
// React style object for the page wrapper.

import type { CSSProperties } from "react";
import {
  EventPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";

export type EventBackgroundKey =
  | "clean_light"
  | "warm_paper"
  | "vineyard_lines"
  | "soft_gradient"
  | "festival_glow"
  | "country_texture"
  | "dark_premium";

export type EventBackground = {
  key: EventBackgroundKey;
  label: string;
  description: string;
  /** Full background style applied to the page wrapper. */
  build: (palette: EventPalette) => CSSProperties;
  /** Small preview style for the admin swatch button. */
  swatch: (palette: EventPalette) => CSSProperties;
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

// ---------- backgrounds ----------

export const EVENT_BACKGROUNDS: ReadonlyArray<EventBackground> = [
  {
    key: "clean_light",
    label: "Clean light",
    description: "Simple pale background — the safest default.",
    build: (p) => ({ backgroundColor: p.pageBg }),
    swatch: (p) => ({ backgroundColor: p.pageBg }),
  },
  {
    key: "warm_paper",
    label: "Warm paper",
    description: "Soft cream / parchment feel with a faint paper grain.",
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
  },
  {
    key: "vineyard_lines",
    label: "Vineyard lines",
    description: "Subtle topographic line pattern — great for wine trails.",
    build: (p) => ({
      backgroundColor: p.pageBg,
      backgroundImage: `repeating-linear-gradient(135deg, ${rgba(p.primary, 0.05)} 0 1px, transparent 1px 14px)`,
    }),
    swatch: (p) => ({
      backgroundColor: p.pageBg,
      backgroundImage: `repeating-linear-gradient(135deg, ${rgba(p.primary, 0.25)} 0 1px, transparent 1px 6px)`,
    }),
  },
  {
    key: "soft_gradient",
    label: "Soft gradient",
    description: "Gentle gradient using the selected palette colours.",
    build: (p) => ({
      backgroundColor: p.pageBg,
      backgroundImage: `linear-gradient(160deg, ${p.pageBg} 0%, ${mix(p.pageBg, p.accent, 0.18)} 60%, ${mix(p.pageBg, p.primary, 0.15)} 100%)`,
    }),
    swatch: (p) => ({
      backgroundImage: `linear-gradient(160deg, ${p.pageBg}, ${mix(p.pageBg, p.accent, 0.35)}, ${mix(p.pageBg, p.primary, 0.3)})`,
    }),
  },
  {
    key: "festival_glow",
    label: "Festival glow",
    description: "Bright base with soft radial highlights from the accent.",
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
  },
  {
    key: "country_texture",
    label: "Country texture",
    description: "Warm earthy background with a subtle diagonal weave.",
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
  },
  {
    key: "dark_premium",
    label: "Dark premium",
    description:
      "Dark muted background. Cards stay light for readability — use with palettes that have light card surfaces.",
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
  },
];

export const DEFAULT_BACKGROUND_KEY: EventBackgroundKey = "clean_light";

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
 * Returns the CSS style to apply to the page wrapper for the given
 * background + palette combination. Both are independent: an unknown
 * or NULL background key falls back to `clean_light`; an unknown or
 * NULL palette key falls back to the default palette.
 */
export function getBackgroundStyle(
  backgroundKey: string | null | undefined,
  paletteKey: string | null | undefined,
): CSSProperties {
  const palette = getPaletteOrDefault(paletteKey);
  const background = getBackgroundOrDefault(backgroundKey);
  return background.build(palette);
}
