import { publicStyleItem, type PublicStyleOverrideDocument } from "@/lib/public-style-overrides";

/**
 * One app-owned map pin resolver shared by the real MapKit annotations and the
 * preview/fallback marker. V1 returns the exact historic colours. V2 starts from
 * the canonical event theme and applies the allowlisted `map.marker` item/record
 * override (pin colour = iconBackgroundColor, glyph = iconColor, selected glyph =
 * active-state iconColor). Visited pins keep the theme primary + check glyph so
 * the visited distinction survives a default-pin override.
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
export type MapMarkerStyle = { color: string; glyphColor: string; selectedGlyphColor: string; glyphText: string };

export function resolveMapMarkerStyle(input: MapMarkerInput): MapMarkerStyle {
  const primary = input.primary ?? "#1F3D2B";
  const accent = input.accent ?? "#B5572A";
  const muted = "#8A7E66";
  const glyphText = input.visited ? "\u2713" : "";
  const base = input.visited ? primary : input.hasPassport ? muted : accent;
  if (input.templateVersion !== "v2") return { color: base, glyphColor: "#FFFFFF", selectedGlyphColor: "#FFFFFF", glyphText };
  const item = publicStyleItem(input.overrides, "map.marker", input.venueId);
  const normal = item?.normal ?? {};
  const active = item?.states?.active ?? {};
  const glyph = typeof normal.iconColor === "string" ? normal.iconColor : "#FFFFFF";
  return {
    color: !input.visited && typeof normal.iconBackgroundColor === "string" ? normal.iconBackgroundColor : base,
    glyphColor: glyph,
    selectedGlyphColor: typeof active.iconColor === "string" ? active.iconColor : glyph,
    glyphText,
  };
}
