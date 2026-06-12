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
  /** Storage path of the event logo, if uploaded. */
  logoPath: string | null;
  /** CSS font-family stack chosen for the event. */
  fontFamily: string | null;
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
  logoPath: null,
  fontFamily: null,
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
    fontFamily: b.fontFamily,
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
          logo_path?: string | null;
          font_family?: string | null;
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
          logoPath: row?.logo_path ?? null,
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
