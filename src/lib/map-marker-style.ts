import { publicStyleItem, type PublicStyleOverrideDocument } from "@/lib/public-style-overrides";

/**
 * One app-owned map pin resolver shared by the real MapKit annotations and the
 * preview/fallback marker. V1 returns the exact historic colours. V2 starts from
 * the canonical event theme and applies the allowlisted `map.marker` item/record
 * override (pin colour = iconBackgroundColor, glyph = iconColor). The active
 * state independently controls selected pin and glyph colours. Visited pins
 * retain their tick while honouring an explicit V2 pin colour.
 */
export type MapMarkerInput = {
  templateVersion: "v1" | "v2";
  primary: string | null | undefined;
  accent: string | null | undefined;
  overrides: PublicStyleOverrideDocument | null | undefined;
  venueId: string;
  visited: boolean;
  hasPassport: boolean;
};
export type MapMarkerStyle = {
  color: string;
  glyphColor: string;
  selectedColor: string;
  selectedGlyphColor: string;
  glyphText: string;
};

export function resolveMapMarkerStyle(input: MapMarkerInput): MapMarkerStyle {
  const primary = input.primary ?? "#1F3D2B";
  const accent = input.accent ?? "#B5572A";
  const muted = "#8A7E66";
  const glyphText = input.visited ? "\u2713" : "";
  const base = input.visited ? primary : input.hasPassport ? muted : accent;
  if (input.templateVersion !== "v2") return { color: base, glyphColor: "#FFFFFF", selectedColor: base, selectedGlyphColor: "#FFFFFF", glyphText };
  const item = publicStyleItem(input.overrides, "map.marker", input.venueId);
  const normal = item?.normal ?? {};
  const active = item?.states?.active ?? {};
  const glyph = typeof normal.iconColor === "string" ? normal.iconColor : "#FFFFFF";
  const color = typeof normal.iconBackgroundColor === "string" ? normal.iconBackgroundColor : base;
  return {
    color,
    glyphColor: glyph,
    selectedColor: typeof active.iconBackgroundColor === "string" ? active.iconBackgroundColor : color,
    selectedGlyphColor: typeof active.iconColor === "string" ? active.iconColor : glyph,
    glyphText,
  };
}

/** MapKit constructor options and selection updates share this exact mapping. */
export function mapMarkerAnnotationOptions(style: MapMarkerStyle, title: string) {
  return {
    title,
    color: style.color,
    glyphText: style.glyphText,
    glyphColor: style.glyphColor,
    selectedGlyphColor: style.selectedGlyphColor,
  };
}

export function applyMapMarkerSelection(
  annotation: { color: string; glyphColor?: string },
  style: MapMarkerStyle,
  selected: boolean,
) {
  annotation.color = selected ? style.selectedColor : style.color;
  annotation.glyphColor = selected ? style.selectedGlyphColor : style.glyphColor;
}
