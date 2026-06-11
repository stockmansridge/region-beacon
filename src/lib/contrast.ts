// WCAG 2.x relative-luminance & contrast-ratio helpers.
// Inputs accept 6-digit hex (#RRGGBB). Invalid inputs return null.

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function hexToRgb(hex: string): [number, number, number] | null {
  if (!HEX_RE.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbChannelToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Returns true when contrast is too low for normal body text (WCAG AA: 4.5).
 * Returns false when contrast is acceptable. Returns null when inputs are
 * invalid (caller should treat as "unknown, no warning").
 */
export function isLowContrast(
  fg: string,
  bg: string,
  threshold = 4.5,
): boolean | null {
  const r = contrastRatio(fg, bg);
  if (r == null) return null;
  return r < threshold;
}
