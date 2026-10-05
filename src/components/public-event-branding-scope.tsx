import type { ReactNode } from "react";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { PublicStyleScope } from "@/components/public-style-scope";
import type { PublicEventData } from "@/components/event-public-landing";
import {
  parsePublicStyleOverrides,
  resolvePublicTemplateVersion,
  type PublicStyleOverrideDocument,
} from "@/lib/public-style-overrides";

export type PublicBrandingEvent = PublicEventData & {
  public_template_version?: string | null;
  v2_style_config?: PublicStyleOverrideDocument | null;
};

export function applyV2Theme(event: PublicBrandingEvent): PublicBrandingEvent {
  const config = parsePublicStyleOverrides(event.v2_style_config);
  return { ...event, ...config.theme, style_overrides: config } as PublicBrandingEvent;
}

/**
 * The single V1/V2 boundary for public event pages.
 * V1 receives the historic theme shape unchanged. V2 receives the event-owned
 * sparse theme and item overrides, including the six split text roles.
 */
export function resolvePublicBrandingEvent(
  event: PublicBrandingEvent,
  forceV2 = false,
): { event: PublicBrandingEvent; isV2: boolean } {
  const isV2 = forceV2 || resolvePublicTemplateVersion(event.public_template_version) === "v2";
  return {
    event: isV2 ? applyV2Theme(event) : { ...event, style_overrides: null },
    isV2,
  };
}

/** Complete mapping for public pages that already own their palette wrapper. */
export function publicEventScopeProps(source: PublicBrandingEvent, forceV2 = false) {
  const { event, isV2 } = resolvePublicBrandingEvent(source, forceV2);
  return {
    paletteKey: event.palette_key ?? null, backgroundKey: event.page_background_key ?? null,
    primaryColor: event.primary_color ?? null, accentColor: event.accent_color ?? null,
    pageBackgroundColor: event.page_background_color ?? null, cardBackgroundColor: event.card_background_color ?? null,
    textColor: event.text_color ?? null, mutedTextColor: event.muted_text_color ?? null,
    cardTextColor: event.card_text_color ?? null, cardMutedTextColor: event.card_muted_text_color ?? null,
    borderColor: event.border_color ?? null, primaryTextColor: event.primary_text_color ?? null,
    navBackgroundColor: event.nav_background_color ?? null, brandKitKey: event.brand_kit_key ?? null,
    linkColor: event.link_color ?? null, cardBorderColor: event.card_border_color ?? null,
    buttonPrimaryBg: event.button_primary_bg ?? null, buttonPrimaryFg: event.button_primary_fg ?? null,
    buttonSecondaryBg: event.button_secondary_bg ?? null, buttonSecondaryFg: event.button_secondary_fg ?? null,
    navFgColor: event.nav_fg_color ?? null, navMutedColor: event.nav_muted_color ?? null,
    navActiveFgColor: event.nav_active_fg_color ?? null, heroBgColor: event.hero_bg_color ?? null,
    heroFgColor: event.hero_fg_color ?? null, heroAccentColor: event.hero_accent_color ?? null,
    heroBodyColor: event.hero_body_color ?? null, heroOverlayColor: event.hero_overlay_color ?? null,
    heroOverlayOpacity: event.hero_overlay_opacity ?? null,
    pageHeadingColor: isV2 ? event.page_heading_color ?? null : null,
    pageBodyColor: isV2 ? event.page_body_color ?? null : null,
    pageMutedColor: isV2 ? event.page_muted_color ?? null : null,
    cardHeadingColor: isV2 ? event.card_heading_color ?? null : null,
    cardBodyColor: isV2 ? event.card_body_color ?? null : null,
    cardMutedColor: isV2 ? event.card_muted_color ?? null : null,
    fontFamily: event.font_family ?? null, headingFontFamily: event.heading_font_family ?? null,
    eventId: event.event_id, templateVersion: isV2 ? "v2" as const : "v1" as const,
    styleOverrides: isV2 ? event.style_overrides : null,
  };
}

export function PublicEventBrandingScope({
  event: source,
  children,
  className,
  forceV2 = false,
}: {
  event: PublicBrandingEvent;
  children: ReactNode;
  className?: string;
  forceV2?: boolean;
}) {
  const { event, isV2 } = resolvePublicBrandingEvent(source, forceV2);
  return (
    <PublicStyleScope overrides={isV2 ? event.style_overrides : null} enabled={isV2} eventId={event.event_id}>
      <EventPaletteScope
        paletteKey={event.palette_key ?? null}
        backgroundKey={event.page_background_key ?? null}
        primaryColor={event.primary_color ?? null}
        accentColor={event.accent_color ?? null}
        pageBackgroundColor={event.page_background_color ?? null}
        cardBackgroundColor={event.card_background_color ?? null}
        textColor={event.text_color ?? null}
        mutedTextColor={event.muted_text_color ?? null}
        cardTextColor={event.card_text_color ?? null}
        cardMutedTextColor={event.card_muted_text_color ?? null}
        borderColor={event.border_color ?? null}
        primaryTextColor={event.primary_text_color ?? null}
        navBackgroundColor={event.nav_background_color ?? null}
        brandKitKey={event.brand_kit_key ?? null}
        linkColor={event.link_color ?? null}
        cardBorderColor={event.card_border_color ?? null}
        buttonPrimaryBg={event.button_primary_bg ?? null}
        buttonPrimaryFg={event.button_primary_fg ?? null}
        buttonSecondaryBg={event.button_secondary_bg ?? null}
        buttonSecondaryFg={event.button_secondary_fg ?? null}
        navFgColor={event.nav_fg_color ?? null}
        navMutedColor={event.nav_muted_color ?? null}
        navActiveFgColor={event.nav_active_fg_color ?? null}
        heroBgColor={event.hero_bg_color ?? null}
        heroFgColor={event.hero_fg_color ?? null}
        heroAccentColor={event.hero_accent_color ?? null}
        heroBodyColor={event.hero_body_color ?? null}
        heroOverlayColor={event.hero_overlay_color ?? null}
        heroOverlayOpacity={event.hero_overlay_opacity ?? null}
        pageHeadingColor={isV2 ? event.page_heading_color ?? null : null}
        pageBodyColor={isV2 ? event.page_body_color ?? null : null}
        pageMutedColor={isV2 ? event.page_muted_color ?? null : null}
        cardHeadingColor={isV2 ? event.card_heading_color ?? null : null}
        cardBodyColor={isV2 ? event.card_body_color ?? null : null}
        cardMutedColor={isV2 ? event.card_muted_color ?? null : null}
        fontFamily={event.font_family ?? null}
        headingFontFamily={event.heading_font_family ?? null}
        eventId={event.event_id}
        className={className}
      >
        {children}
      </EventPaletteScope>
    </PublicStyleScope>
  );
}