import {
  Gift,
  Wine,
  Ticket,
  Tag,
  Utensils,
  Coffee,
  Trophy,
  Star,
  MapPin,
  Percent,
  ShoppingBag,
  Music,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const OFFER_DISPLAY_ICONS = [
  "gift",
  "wine",
  "ticket",
  "tag",
  "food",
  "coffee",
  "trophy",
  "star",
  "map_pin",
  "percent",
  "shopping_bag",
  "music",
  "generic_offer",
] as const;

export type OfferDisplayIcon = (typeof OFFER_DISPLAY_ICONS)[number];

const ICON_MAP: Record<OfferDisplayIcon, LucideIcon> = {
  gift: Gift,
  wine: Wine,
  ticket: Ticket,
  tag: Tag,
  food: Utensils,
  coffee: Coffee,
  trophy: Trophy,
  star: Star,
  map_pin: MapPin,
  percent: Percent,
  shopping_bag: ShoppingBag,
  music: Music,
  generic_offer: Sparkles,
};

export const OFFER_DISPLAY_ICON_LABEL: Record<OfferDisplayIcon, string> = {
  gift: "Gift",
  wine: "Wine",
  ticket: "Ticket",
  tag: "Tag",
  food: "Food",
  coffee: "Coffee",
  trophy: "Trophy",
  star: "Star",
  map_pin: "Map pin",
  percent: "Discount",
  shopping_bag: "Shopping bag",
  music: "Music",
  generic_offer: "Generic offer",
};

export function resolveOfferIcon(icon: string | null | undefined): LucideIcon {
  if (icon && (OFFER_DISPLAY_ICONS as readonly string[]).includes(icon)) {
    return ICON_MAP[icon as OfferDisplayIcon];
  }
  return Gift;
}

export function isValidHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function expandHex(hex: string): string {
  if (hex.length === 4) {
    return (
      "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    ).toLowerCase();
  }
  return hex.toLowerCase();
}

/** YIQ-based readable foreground (black or white) for a given hex bg. */
export function pickReadableForeground(bg: string): string {
  const full = expandHex(bg);
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1a1a1a" : "#ffffff";
}

/**
 * Resolve the final background + foreground for a public offer badge,
 * applying safe fallbacks to event theme tokens when fields are missing.
 */
export function resolveOfferBadgeStyle(
  bgColour: string | null | undefined,
  fgColour: string | null | undefined,
): { background: string; color: string } {
  const bg = isValidHex(bgColour)
    ? bgColour
    : "color-mix(in oklab, var(--event-accent, var(--event-primary, #1F3D2B)) 18%, transparent)";

  let color: string;
  if (isValidHex(fgColour)) {
    color = fgColour;
  } else if (isValidHex(bgColour)) {
    color = pickReadableForeground(bgColour);
  } else {
    color = "var(--event-primary,#1F3D2B)";
  }
  return { background: bg, color };
}
