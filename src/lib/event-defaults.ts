/**
 * Canonical defaults applied when a NEW event is created.
 *
 * Why this exists: `resolveEventTheme()` only emits the current semantic
 * token set ("modern branding") when `event_branding.brand_kit_key` is set.
 * New events used to be inserted with only `primary_color`, `accent_color`
 * and `font_family`, so they resolved down the LEGACY palette path and
 * rendered with the older, flatter look — while events whose branding had
 * been saved through the Branding editor (which writes a brand kit) got the
 * current design. That was the regression: a data default, not a second
 * renderer.
 *
 * Every new event is therefore created on the latest brand kit + template
 * version, so the shared landing/passport renderers light up automatically.
 * Only colours/fonts/images/content differ per event.
 */
import {
  BRAND_KIT_VERSION,
  brandKitWritePayload,
  type BrandKitKey,
} from "@/lib/event-brand-kits";
import { DEFAULT_EMOTIVE_FONT_VALUE } from "@/lib/event-fonts";
import { DEFAULT_BACKGROUND_KEY } from "@/lib/event-backgrounds";

/**
 * Neutral kit for brand-new events: current structure and token coverage,
 * deliberately understated colours the organiser can then change.
 */
export const DEFAULT_NEW_EVENT_BRAND_KIT: BrandKitKey = "minimal_light";

/** Columns that exist on every deployment, including older production DBs. */
function legacyBrandingDefaults(agencyId: string, eventId: string) {
  return {
    agency_id: agencyId,
    event_id: eventId,
    font_family: "",
    welcome_copy: null as string | null,
    terms_url: null as string | null,
  };
}

/**
 * Full default branding insert payload for a new event: legacy columns plus
 * the current brand kit written into the semantic colour columns.
 */
export function newEventBrandingInsert(agencyId: string, eventId: string) {
  const kit = brandKitWritePayload(DEFAULT_NEW_EVENT_BRAND_KIT);
  return {
    ...legacyBrandingDefaults(agencyId, eventId),
    ...kit,
    brand_kit_version: BRAND_KIT_VERSION,
    palette_key: "custom" as string,
    page_background_key: DEFAULT_BACKGROUND_KEY as string,
    default_emotive_font_family: DEFAULT_EMOTIVE_FONT_VALUE,
  };
}

/**
 * Minimal fallback used only when the deployment predates the semantic
 * branding columns. Keeps event creation working; the Branding editor will
 * write the kit once the columns exist.
 */
export function newEventBrandingInsertFallback(agencyId: string, eventId: string) {
  const kit = brandKitWritePayload(DEFAULT_NEW_EVENT_BRAND_KIT);
  return {
    ...legacyBrandingDefaults(agencyId, eventId),
    primary_color: kit.primary_color ?? "#111827",
    accent_color: kit.accent_color ?? "#2563EB",
  };
}
