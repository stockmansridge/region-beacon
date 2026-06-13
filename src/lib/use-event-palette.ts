// Lightweight branding resolver for public pages that don't already
// fetch the full event row.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

export type EventBrandingKeys = {
  paletteKey: string | null;
  backgroundKey: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  pageBackgroundColor: string | null;
  cardBackgroundColor: string | null;
  // Semantic text/border columns (may be missing on older DBs).
  textColor: string | null;
  mutedTextColor: string | null;
  // Card-surface overrides (separate from page text). Optional; if
  // absent the card surface inherits the page text colours.
  cardTextColor: string | null;
  cardMutedTextColor: string | null;
  borderColor: string | null;
  primaryTextColor: string | null;
  /** Hex background colour for header/bottom nav/drawer. Nullable. */
  navBackgroundColor: string | null;
  // ---- Phase D additions (all optional; resolver falls back) ----
  brandKitKey: string | null;
  linkColor: string | null;
  cardBorderColor: string | null;
  buttonPrimaryBg: string | null;
  buttonPrimaryFg: string | null;
  buttonSecondaryBg: string | null;
  buttonSecondaryFg: string | null;
  navFgColor: string | null;
  navMutedColor: string | null;
  navActiveFgColor: string | null;
  heroBgColor: string | null;
  heroFgColor: string | null;
  heroAccentColor: string | null;
  // ---- Phase D Pass 2 — heading/body/muted split ----
  pageHeadingColor: string | null;
  pageBodyColor: string | null;
  pageMutedColor: string | null;
  cardHeadingColor: string | null;
  cardBodyColor: string | null;
  cardMutedColor: string | null;
  /** Storage path of the event logo, if uploaded. */
  logoPath: string | null;
  /** Storage path of the event cover image, if uploaded. */
  coverPath: string | null;
  /** CSS font-family stack chosen for the event. */
  fontFamily: string | null;
  /** Separate heading font for hero event titles. Falls back to fontFamily. */
  headingFontFamily: string | null;
  ready: boolean;
};

const EMPTY: EventBrandingKeys = {
  paletteKey: null,
  backgroundKey: null,
  primaryColor: null,
  accentColor: null,
  pageBackgroundColor: null,
  cardBackgroundColor: null,
  textColor: null,
  mutedTextColor: null,
  cardTextColor: null,
  cardMutedTextColor: null,
  borderColor: null,
  primaryTextColor: null,
  navBackgroundColor: null,
  brandKitKey: null,
  linkColor: null,
  cardBorderColor: null,
  buttonPrimaryBg: null,
  buttonPrimaryFg: null,
  buttonSecondaryBg: null,
  buttonSecondaryFg: null,
  navFgColor: null,
  navMutedColor: null,
  navActiveFgColor: null,
  heroBgColor: null,
  heroFgColor: null,
  heroAccentColor: null,
  pageHeadingColor: null,
  pageBodyColor: null,
  pageMutedColor: null,
  cardHeadingColor: null,
  cardBodyColor: null,
  cardMutedColor: null,
  logoPath: null,
  coverPath: null,
  fontFamily: null,
  headingFontFamily: null,
  ready: false,
};

/**
 * Convert a branding-keys object into the prop bag accepted by
 * <EventPaletteScope>. Public pages should spread this rather than
 * cherry-picking props so newly-added semantic colour roles propagate
 * automatically.
 */
export function brandingScopeProps(b: EventBrandingKeys) {
  return {
    paletteKey: b.paletteKey,
    backgroundKey: b.backgroundKey,
    primaryColor: b.primaryColor,
    accentColor: b.accentColor,
    pageBackgroundColor: b.pageBackgroundColor,
    cardBackgroundColor: b.cardBackgroundColor,
    textColor: b.textColor,
    mutedTextColor: b.mutedTextColor,
    cardTextColor: b.cardTextColor,
    cardMutedTextColor: b.cardMutedTextColor,
    borderColor: b.borderColor,
    primaryTextColor: b.primaryTextColor,
    navBackgroundColor: b.navBackgroundColor,
    brandKitKey: b.brandKitKey,
    linkColor: b.linkColor,
    cardBorderColor: b.cardBorderColor,
    buttonPrimaryBg: b.buttonPrimaryBg,
    buttonPrimaryFg: b.buttonPrimaryFg,
    buttonSecondaryBg: b.buttonSecondaryBg,
    buttonSecondaryFg: b.buttonSecondaryFg,
    navFgColor: b.navFgColor,
    navMutedColor: b.navMutedColor,
    navActiveFgColor: b.navActiveFgColor,
    heroBgColor: b.heroBgColor,
    heroFgColor: b.heroFgColor,
    heroAccentColor: b.heroAccentColor,
    fontFamily: b.fontFamily,
    headingFontFamily: b.headingFontFamily,
  };
}

export function useEventBrandingKeys(
  subdomain: string | null | undefined,
): EventBrandingKeys {
  const [keys, setKeys] = useState<EventBrandingKeys>(EMPTY);
  useEffect(() => {
    if (!subdomain) {
      setKeys({ ...EMPTY, ready: true });
      return;
    }
    let cancelled = false;
    setKeys(EMPTY);
    (async () => {
      try {
        const host = tenantHost(subdomain);
        const { data } = await supabase.rpc("get_public_event_by_domain", {
          _hostname: host,
        });
        if (cancelled) return;
        const row = (data?.[0] ?? null) as {
          palette_key?: string | null;
          page_background_key?: string | null;
          primary_color?: string | null;
          accent_color?: string | null;
          page_background_color?: string | null;
          card_background_color?: string | null;
          text_color?: string | null;
          muted_text_color?: string | null;
          card_text_color?: string | null;
          card_muted_text_color?: string | null;
          border_color?: string | null;
          primary_text_color?: string | null;
          nav_background_color?: string | null;
          brand_kit_key?: string | null;
          link_color?: string | null;
          card_border_color?: string | null;
          button_primary_bg?: string | null;
          button_primary_fg?: string | null;
          button_secondary_bg?: string | null;
          button_secondary_fg?: string | null;
          nav_fg_color?: string | null;
          nav_muted_color?: string | null;
          nav_active_fg_color?: string | null;
          hero_bg_color?: string | null;
          hero_fg_color?: string | null;
          hero_accent_color?: string | null;
          page_heading_color?: string | null;
          page_body_color?: string | null;
          page_muted_color?: string | null;
          card_heading_color?: string | null;
          card_body_color?: string | null;
          card_muted_color?: string | null;
          logo_path?: string | null;
          cover_path?: string | null;
          font_family?: string | null;
          heading_font_family?: string | null;
        } | null;
        setKeys({
          paletteKey: row?.palette_key ?? null,
          backgroundKey: row?.page_background_key ?? null,
          primaryColor: row?.primary_color ?? null,
          accentColor: row?.accent_color ?? null,
          pageBackgroundColor: row?.page_background_color ?? null,
          cardBackgroundColor: row?.card_background_color ?? null,
          textColor: row?.text_color ?? null,
          mutedTextColor: row?.muted_text_color ?? null,
          cardTextColor: row?.card_text_color ?? null,
          cardMutedTextColor: row?.card_muted_text_color ?? null,
          borderColor: row?.border_color ?? null,
          primaryTextColor: row?.primary_text_color ?? null,
          navBackgroundColor: row?.nav_background_color ?? null,
          brandKitKey: row?.brand_kit_key ?? null,
          linkColor: row?.link_color ?? null,
          cardBorderColor: row?.card_border_color ?? null,
          buttonPrimaryBg: row?.button_primary_bg ?? null,
          buttonPrimaryFg: row?.button_primary_fg ?? null,
          buttonSecondaryBg: row?.button_secondary_bg ?? null,
          buttonSecondaryFg: row?.button_secondary_fg ?? null,
          navFgColor: row?.nav_fg_color ?? null,
          navMutedColor: row?.nav_muted_color ?? null,
          navActiveFgColor: row?.nav_active_fg_color ?? null,
          heroBgColor: row?.hero_bg_color ?? null,
          heroFgColor: row?.hero_fg_color ?? null,
          heroAccentColor: row?.hero_accent_color ?? null,
          pageHeadingColor: row?.page_heading_color ?? null,
          pageBodyColor: row?.page_body_color ?? null,
          pageMutedColor: row?.page_muted_color ?? null,
          cardHeadingColor: row?.card_heading_color ?? null,
          cardBodyColor: row?.card_body_color ?? null,
          cardMutedColor: row?.card_muted_color ?? null,
          logoPath: row?.logo_path ?? null,
          coverPath: row?.cover_path ?? null,
          fontFamily: row?.font_family ?? null,
          ready: true,
        });
      } catch {
        if (!cancelled) setKeys({ ...EMPTY, ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return keys;
}

export function useEventPaletteKey(
  subdomain: string | null | undefined,
): string | null {
  return useEventBrandingKeys(subdomain).paletteKey;
}
