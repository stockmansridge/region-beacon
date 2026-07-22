// Helpers for the cover-image focal point (crop window) chosen in the
// branding editor. Focal X/Y are stored as smallints 0–100 and applied
// as CSS `object-position` percentages on the hero <img>.

export function clampFocalPct(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function focalObjectPosition(
  x: number | null | undefined,
  y: number | null | undefined,
): string {
  return `${clampFocalPct(x)}% ${clampFocalPct(y)}%`;
}
