import type { CSSProperties } from "react";
import { v2FontFamilyValue } from "@/lib/event-font-alias";

export const PUBLIC_STYLE_DOCUMENT_VERSION = 1 as const;

export const PUBLIC_TEMPLATE_V1 = "v1" as const;
export const PUBLIC_TEMPLATE_V2 = "v2" as const;
export type PublicTemplateVersion = typeof PUBLIC_TEMPLATE_V1 | typeof PUBLIC_TEMPLATE_V2;

export function resolvePublicTemplateVersion(value: unknown): PublicTemplateVersion {
  return value === PUBLIC_TEMPLATE_V2 ? PUBLIC_TEMPLATE_V2 : PUBLIC_TEMPLATE_V1;
}

export type PublicStylePage =
  | "home"
  | "passport"
  | "join"
  | "venues"
  | "venue"
  | "offers"
  | "prizes"
  | "map"
  | "leaderboard"
  | "faq"
  | "legal"
  | "bookmarks"
  | "scan"
  | "checkin"
  | "bonus"
  | "tasting"
  | "shared";

export type PublicStyleState = "normal" | "hover" | "focus" | "active" | "disabled";
export type PublicStyleProperty =
  | "color"
  | "backgroundColor"
  | "borderColor"
  | "iconColor"
  | "iconBackgroundColor"
  | "progressTrackColor"
  | "progressFillColor"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "textAlign"
  | "opacity"
  | "backgroundGradient";

export type PublicStyleProperties = Partial<Record<PublicStyleProperty, string | number>>;

export type PublicStyleItemOverride = {
  normal?: PublicStyleProperties;
  states?: Partial<Record<Exclude<PublicStyleState, "normal">, PublicStyleProperties>>;
};

export type PublicStyleOverrideDocument = {
  version: typeof PUBLIC_STYLE_DOCUMENT_VERSION;
  items: Record<string, PublicStyleItemOverride>;
  records?: Record<string, Record<string, PublicStyleItemOverride>>;
  theme?: PublicV2Theme;
};

export const PUBLIC_V2_THEME_KEYS = [
  "font_family", "heading_font_family", "default_emotive_font_family",
  "primary_color", "accent_color", "link_color", "page_background_color",
  "page_heading_color", "page_body_color", "page_muted_color", "border_color",
  "card_background_color", "card_heading_color", "card_body_color", "card_muted_color",
  "card_border_color", "button_primary_bg", "button_primary_fg", "button_secondary_bg",
  "button_secondary_fg", "nav_background_color", "nav_fg_color", "nav_muted_color",
  "nav_active_fg_color", "hero_bg_color", "hero_fg_color", "hero_accent_color",
  "hero_body_color", "hero_overlay_color", "hero_overlay_opacity",
  "welcome_copy", "logo_shape", "logo_backdrop", "logo_backdrop_color",
  "cover_focal_x", "cover_focal_y",
] as const;

export type PublicV2ThemeKey = (typeof PUBLIC_V2_THEME_KEYS)[number];
export type PublicV2Theme = Partial<Record<PublicV2ThemeKey, string | number | null>>;

export type PublicStyleElementDefinition = {
  id: string;
  page: PublicStylePage;
  section: string;
  label: string;
  kind: "text" | "button" | "surface" | "icon" | "progress";
  properties: readonly PublicStyleProperty[];
  states?: readonly Exclude<PublicStyleState, "normal">[];
  repeat?: "venue" | "award" | "template";
  similarGroup?: string;
};

const TEXT = ["color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "textAlign"] as const;
const BUTTON = ["backgroundColor", "color", "borderColor", "iconColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "textAlign"] as const;
const SURFACE = ["backgroundColor", "borderColor", "opacity", "backgroundGradient"] as const;
const ICON = ["iconColor", "iconBackgroundColor", "borderColor"] as const;
const PROGRESS = ["progressTrackColor", "progressFillColor"] as const;
const INPUT = ["backgroundColor", "color", "borderColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "textAlign"] as const;
const INTERACTIVE = ["hover", "focus", "active", "disabled"] as const;

export const PUBLIC_STYLE_ELEMENTS = [
  { id: "shared.navigation.surface", page: "shared", section: "Navigation", label: "Navigation surface", kind: "surface", properties: SURFACE },
  { id: "shared.navigation.item", page: "shared", section: "Navigation", label: "Navigation item", kind: "button", properties: BUTTON, states: INTERACTIVE, similarGroup: "navigation-items" },
  { id: "shared.navigation.activeItem", page: "shared", section: "Navigation", label: "Active navigation item", kind: "button", properties: BUTTON, states: INTERACTIVE, similarGroup: "navigation-items" },
  { id: "shared.navigation.drawer", page: "shared", section: "Navigation", label: "Menu drawer", kind: "surface", properties: SURFACE },
  { id: "shared.announcement.surface", page: "shared", section: "Announcements", label: "Announcement bar", kind: "surface", properties: SURFACE },
  { id: "shared.announcement.text", page: "shared", section: "Announcements", label: "Announcement text", kind: "text", properties: TEXT },
  { id: "shared.activity.surface", page: "shared", section: "Activity", label: "Activity notification", kind: "surface", properties: SURFACE },
  { id: "shared.footer.text", page: "shared", section: "Footer", label: "Powered by text", kind: "text", properties: TEXT },

  { id: "home.hero.surface", page: "home", section: "Hero", label: "Hero background", kind: "surface", properties: ["backgroundColor", "borderColor", "backgroundGradient"] },
  { id: "home.hero.image", page: "home", section: "Hero", label: "Hero image", kind: "surface", properties: ["opacity"] },
  { id: "home.hero.cover", page: "home", section: "Hero", label: "Cover image overlay", kind: "surface", properties: ["opacity", "backgroundGradient"] },
  { id: "home.hero.logo", page: "home", section: "Hero", label: "Event logo backdrop", kind: "surface", properties: SURFACE },
  { id: "home.hero.welcomeLabel", page: "home", section: "Hero", label: "Welcome label", kind: "text", properties: TEXT },
  { id: "home.hero.heading", page: "home", section: "Hero", label: "Event heading", kind: "text", properties: TEXT },
  { id: "home.hero.welcomeCopy", page: "home", section: "Hero", label: "Welcome message", kind: "text", properties: TEXT },
  { id: "home.page.surface", page: "home", section: "Page", label: "Page background", kind: "surface", properties: SURFACE },
  { id: "home.summary.surface", page: "home", section: "Progress summary", label: "Progress card", kind: "surface", properties: SURFACE },
  { id: "home.summary.ring", page: "home", section: "Progress summary", label: "Passport progress ring", kind: "progress", properties: PROGRESS },
  { id: "home.summary.progress", page: "home", section: "Progress summary", label: "Trail progress bar", kind: "progress", properties: PROGRESS },
  { id: "home.primaryCta", page: "home", section: "Actions", label: "Start / View passport button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "home.shareButton", page: "home", section: "Actions", label: "Share button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "home.prizesButton", page: "home", section: "Actions", label: "View prizes button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "home.venuesButton", page: "home", section: "Actions", label: "View venues button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "home.bonusPromo.surface", page: "home", section: "Bonus points", label: "Bonus points card", kind: "surface", properties: SURFACE },
  { id: "home.bonusPromo.icon", page: "home", section: "Bonus points", label: "Bonus points icon", kind: "icon", properties: ICON },
  { id: "home.bonusPromo.heading", page: "home", section: "Bonus points", label: "Bonus points heading", kind: "text", properties: TEXT },
  { id: "home.bonusPromo.body", page: "home", section: "Bonus points", label: "Bonus points message", kind: "text", properties: TEXT },
  { id: "home.nextPrize.surface", page: "home", section: "Next prize", label: "Next prize card", kind: "surface", properties: SURFACE },
  { id: "home.nextPrize.icon", page: "home", section: "Next prize", label: "Next prize icon background", kind: "icon", properties: ICON },
  { id: "home.nextPrize.heading", page: "home", section: "Next prize", label: "Next prize heading", kind: "text", properties: TEXT },
  { id: "home.nextPrize.progress", page: "home", section: "Next prize", label: "Next prize progress", kind: "progress", properties: PROGRESS },
  { id: "home.collect.surface", page: "home", section: "Collect points", label: "Collect points card", kind: "surface", properties: SURFACE },
  { id: "home.collect.heading", page: "home", section: "Collect points", label: "Collect points heading", kind: "text", properties: TEXT },
  { id: "home.collect.cta", page: "home", section: "Collect points", label: "Create passport button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "home.stamps.tile", page: "home", section: "Stamp collection", label: "Venue stamp", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "home.stamps.label", page: "home", section: "Stamp collection", label: "Venue stamp label", kind: "text", properties: TEXT, repeat: "venue" },

  { id: "passport.page.surface", page: "passport", section: "Page", label: "Passport page", kind: "surface", properties: SURFACE },
  { id: "passport.progress.ring", page: "passport", section: "Progress", label: "Progress ring", kind: "progress", properties: PROGRESS },
  { id: "passport.progress.number", page: "passport", section: "Progress", label: "Progress number", kind: "text", properties: TEXT },
  { id: "passport.stamp.tile", page: "passport", section: "Stamps", label: "Venue stamp", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "passport.stamp.status", page: "passport", section: "Stamps", label: "Stamp status (Visited / Empty)", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "leaderboard.row.points", page: "leaderboard", section: "Leaderboard", label: "Points", kind: "text", properties: TEXT, repeat: "template" },
  { id: "leaderboard.row.stamps", page: "leaderboard", section: "Leaderboard", label: "Stamps count", kind: "text", properties: TEXT, repeat: "template" },
  { id: "leaderboard.row.meta", page: "leaderboard", section: "Leaderboard", label: "Venue / bonus breakdown", kind: "text", properties: TEXT, repeat: "template" },
  { id: "passport.stamp.label", page: "passport", section: "Stamps", label: "Venue stamp label", kind: "text", properties: TEXT, repeat: "venue" },

  { id: "join.page.surface", page: "join", section: "Page", label: "Join page", kind: "surface", properties: SURFACE },
  { id: "join.form.surface", page: "join", section: "Form", label: "Registration form", kind: "surface", properties: SURFACE },
  { id: "join.form.heading", page: "join", section: "Form", label: "Form heading", kind: "text", properties: TEXT },
  { id: "join.form.label", page: "join", section: "Form", label: "Field label", kind: "text", properties: TEXT, repeat: "template" },
  { id: "join.form.field", page: "join", section: "Form", label: "Form input", kind: "text", properties: INPUT, states: INTERACTIVE, repeat: "template" },
  { id: "join.form.error", page: "join", section: "Form", label: "Validation message", kind: "text", properties: TEXT, repeat: "template" },
  { id: "join.form.submit", page: "join", section: "Form", label: "Create passport button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "join.state.message", page: "join", section: "States", label: "Join status message", kind: "text", properties: TEXT, repeat: "template" },

  { id: "venues.page.heading", page: "venues", section: "Page", label: "Venues heading", kind: "text", properties: TEXT },
  { id: "venues.controls.sort", page: "venues", section: "Controls", label: "Sort control", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "venues.card.surface", page: "venues", section: "Venue cards", label: "Venue card", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "venues.card.heading", page: "venues", section: "Venue cards", label: "Venue name", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venues.card.meta", page: "venues", section: "Venue cards", label: "Venue details", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venue.actions.directions", page: "venue", section: "Actions", label: "Directions button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "venue.actions.website", page: "venue", section: "Actions", label: "Website button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "venue.bookmark", page: "venue", section: "Actions", label: "Bookmark button", kind: "icon", properties: ICON, states: INTERACTIVE, repeat: "venue" },

  { id: "offers.card.surface", page: "offers", section: "Offers", label: "Offer card", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "offers.card.badge", page: "offers", section: "Offers", label: "Offer badge", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "prizes.tabs.item", page: "prizes", section: "Tabs", label: "Prize tab", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "prizes.card.surface", page: "prizes", section: "Prize cards", label: "Prize card", kind: "surface", properties: SURFACE, repeat: "award" },
  { id: "prizes.card.heading", page: "prizes", section: "Prize cards", label: "Prize name", kind: "text", properties: TEXT, repeat: "award" },
  { id: "prizes.card.badge", page: "prizes", section: "Prize cards", label: "Prize status badge", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "award" },
  { id: "prizes.card.progress", page: "prizes", section: "Prize cards", label: "Prize progress", kind: "progress", properties: PROGRESS, repeat: "award" },

  { id: "map.controls.item", page: "map", section: "Controls", label: "Map control", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "map.marker", page: "map", section: "Map", label: "Map marker", kind: "icon", properties: ICON, repeat: "venue" },
  { id: "map.list.card", page: "map", section: "Venue list", label: "Map venue card", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "leaderboard.heading", page: "leaderboard", section: "Leaderboard", label: "Leaderboard heading", kind: "text", properties: TEXT },
  { id: "leaderboard.row", page: "leaderboard", section: "Leaderboard", label: "Leaderboard row", kind: "surface", properties: SURFACE, repeat: "template" },
  { id: "leaderboard.rank", page: "leaderboard", section: "Leaderboard", label: "Rank number", kind: "text", properties: TEXT, repeat: "template" },
  { id: "faq.item.surface", page: "faq", section: "Questions", label: "FAQ item", kind: "surface", properties: SURFACE, repeat: "template" },
  { id: "faq.item.question", page: "faq", section: "Questions", label: "FAQ question", kind: "text", properties: TEXT, repeat: "template" },
  { id: "faq.item.answer", page: "faq", section: "Questions", label: "FAQ answer", kind: "text", properties: TEXT, repeat: "template" },
  { id: "legal.heading", page: "legal", section: "Content", label: "Legal page heading", kind: "text", properties: TEXT },
  { id: "legal.body", page: "legal", section: "Content", label: "Legal page text", kind: "text", properties: TEXT },

  { id: "venues.page.intro", page: "venues", section: "Page", label: "Venues intro text", kind: "text", properties: TEXT },
  { id: "venues.card.distance", page: "venues", section: "Venue cards", label: "Distance / status line", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venues.card.directions", page: "venues", section: "Venue cards", label: "Directions link", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "venue.page.heading", page: "venue", section: "Header", label: "Venue name", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venue.page.emotive", page: "venue", section: "Header", label: "Emotive text", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venue.page.body", page: "venue", section: "Header", label: "Venue description", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venue.page.join", page: "venue", section: "Header", label: "Start passport link", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "venue.offer.body", page: "venue", section: "Offer", label: "Offer text", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "venue.bonus.heading", page: "venue", section: "Bonus challenges", label: "Bonus challenge name", kind: "text", properties: TEXT, repeat: "template" },
  { id: "venue.bonus.meta", page: "venue", section: "Bonus challenges", label: "Bonus challenge points", kind: "text", properties: TEXT, repeat: "template" },
  { id: "venue.bonus.body", page: "venue", section: "Bonus challenges", label: "Bonus challenge description", kind: "text", properties: TEXT, repeat: "template" },
  { id: "venue.actions.phone", page: "venue", section: "Actions", label: "Phone button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "offers.page.heading", page: "offers", section: "Page", label: "Offers heading", kind: "text", properties: TEXT },
  { id: "offers.page.intro", page: "offers", section: "Page", label: "Offers intro text", kind: "text", properties: TEXT },
  { id: "offers.card.venue", page: "offers", section: "Offers", label: "Offer venue name", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "offers.card.heading", page: "offers", section: "Offers", label: "Offer title", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "offers.card.body", page: "offers", section: "Offers", label: "Offer details", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "prizes.hero.heading", page: "prizes", section: "Hero", label: "Prizes heading", kind: "text", properties: TEXT },
  { id: "prizes.hero.body", page: "prizes", section: "Hero", label: "Prizes intro text", kind: "text", properties: TEXT },
  { id: "prizes.sort.item", page: "prizes", section: "Tabs", label: "Sort option", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "prizes.card.body", page: "prizes", section: "Prize cards", label: "Prize description", kind: "text", properties: TEXT, repeat: "award" },
  { id: "prizes.card.meta", page: "prizes", section: "Prize cards", label: "Prize draw / points line", kind: "text", properties: TEXT, repeat: "award" },
  { id: "prizes.bonus.surface", page: "prizes", section: "Bonus cards", label: "Bonus card", kind: "surface", properties: SURFACE, repeat: "template" },
  { id: "prizes.bonus.heading", page: "prizes", section: "Bonus cards", label: "Bonus name", kind: "text", properties: TEXT, repeat: "template" },
  { id: "prizes.bonus.body", page: "prizes", section: "Bonus cards", label: "Bonus description", kind: "text", properties: TEXT, repeat: "template" },
  { id: "prizes.bonus.meta", page: "prizes", section: "Bonus cards", label: "Bonus distance / venues", kind: "text", properties: TEXT, repeat: "template" },
  { id: "map.page.heading", page: "map", section: "Page", label: "Map heading", kind: "text", properties: TEXT },
  { id: "map.page.count", page: "map", section: "Page", label: "Visited count", kind: "text", properties: TEXT },
  { id: "map.page.join", page: "map", section: "Page", label: "Start passport button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "map.unmapped.label", page: "map", section: "Venue list", label: "Unmapped venues label", kind: "text", properties: TEXT },
  { id: "map.unmapped.link", page: "map", section: "Venue list", label: "Unmapped venue link", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "map.card.close", page: "map", section: "Selected venue", label: "Close button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "map.card.heading", page: "map", section: "Selected venue", label: "Venue name", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "map.card.body", page: "map", section: "Selected venue", label: "Venue description", kind: "text", properties: TEXT, repeat: "venue" },
  { id: "map.card.directions", page: "map", section: "Selected venue", label: "Directions link", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "venue" },
  { id: "faq.page.eyebrow", page: "faq", section: "Page", label: "FAQ eyebrow", kind: "text", properties: TEXT },
  { id: "faq.page.heading", page: "faq", section: "Page", label: "FAQ heading", kind: "text", properties: TEXT },
  { id: "faq.state.message", page: "faq", section: "Page", label: "FAQ status message", kind: "text", properties: TEXT },
  { id: "faq.item.toggle", page: "faq", section: "Questions", label: "FAQ question button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "leaderboard.page.eyebrow", page: "leaderboard", section: "Page", label: "Leaderboard eyebrow", kind: "text", properties: TEXT },
  { id: "leaderboard.page.intro", page: "leaderboard", section: "Page", label: "Leaderboard intro", kind: "text", properties: TEXT },
  { id: "leaderboard.empty.heading", page: "leaderboard", section: "Empty state", label: "Empty heading", kind: "text", properties: TEXT },
  { id: "leaderboard.empty.body", page: "leaderboard", section: "Empty state", label: "Empty message", kind: "text", properties: TEXT },
  { id: "leaderboard.row.name", page: "leaderboard", section: "Leaderboard", label: "Visitor name", kind: "text", properties: TEXT, repeat: "template" },
  { id: "leaderboard.footnote", page: "leaderboard", section: "Leaderboard", label: "Footnote", kind: "text", properties: TEXT },
  { id: "bookmarks.page.heading", page: "bookmarks", section: "Page", label: "Bookmarks heading", kind: "text", properties: TEXT },
  { id: "bookmarks.page.intro", page: "bookmarks", section: "Page", label: "Bookmarks intro", kind: "text", properties: TEXT },
  { id: "bookmarks.card", page: "bookmarks", section: "Bookmarks", label: "Bookmark card", kind: "surface", properties: SURFACE, repeat: "venue" },
  { id: "bookmarks.empty.surface", page: "bookmarks", section: "Empty state", label: "Empty card", kind: "surface", properties: SURFACE },
  { id: "bookmarks.empty.heading", page: "bookmarks", section: "Empty state", label: "Empty heading", kind: "text", properties: TEXT },
  { id: "bookmarks.empty.body", page: "bookmarks", section: "Empty state", label: "Empty message", kind: "text", properties: TEXT },
  { id: "bookmarks.empty.cta", page: "bookmarks", section: "Empty state", label: "Browse button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "legal.eyebrow", page: "legal", section: "Content", label: "Legal eyebrow", kind: "text", properties: TEXT },
  { id: "legal.meta", page: "legal", section: "Content", label: "Legal version / link text", kind: "text", properties: TEXT, repeat: "template" },
  { id: "legal.section.surface", page: "legal", section: "Sections", label: "Legal section card", kind: "surface", properties: SURFACE, repeat: "template" },
  { id: "legal.section.toggle", page: "legal", section: "Sections", label: "Legal section heading button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "join.page.heading", page: "join", section: "Page", label: "Join heading", kind: "text", properties: TEXT },
  { id: "join.page.intro", page: "join", section: "Page", label: "Join intro", kind: "text", properties: TEXT },
  { id: "join.page.notice", page: "join", section: "Page", label: "Already-registered notice", kind: "text", properties: TEXT },
  { id: "join.returning.heading", page: "join", section: "Returning visitor", label: "Returning heading", kind: "text", properties: TEXT },
  { id: "join.returning.body", page: "join", section: "Returning visitor", label: "Returning message", kind: "text", properties: TEXT },
  { id: "join.returning.registerAgain", page: "join", section: "Returning visitor", label: "Register again button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "join.form.consent", page: "join", section: "Form", label: "Consent text", kind: "text", properties: TEXT, repeat: "template" },
  { id: "join.form.link", page: "join", section: "Form", label: "Terms / privacy link", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "join.form.footnote", page: "join", section: "Form", label: "Form footnote", kind: "text", properties: TEXT },
  { id: "join.success.heading", page: "join", section: "Success", label: "Success heading", kind: "text", properties: TEXT },
  { id: "join.success.body", page: "join", section: "Success", label: "Success message", kind: "text", properties: TEXT },
  { id: "join.success.button", page: "join", section: "Success", label: "Success button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "join.state.heading", page: "join", section: "States", label: "Status heading", kind: "text", properties: TEXT, repeat: "template" },
  { id: "passport.hero.eyebrow", page: "passport", section: "Hero", label: "My Passport label", kind: "text", properties: TEXT },
  { id: "passport.hero.heading", page: "passport", section: "Hero", label: "Visitor name", kind: "text", properties: TEXT },
  { id: "passport.hero.body", page: "passport", section: "Hero", label: "Hero message", kind: "text", properties: TEXT },
  { id: "passport.actions.copyLink", page: "passport", section: "Actions", label: "Copy passport link", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "passport.actions.support", page: "passport", section: "Actions", label: "Copy support details", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "passport.progress.heading", page: "passport", section: "Progress", label: "Trail progress heading", kind: "text", properties: TEXT },
  { id: "passport.progress.body", page: "passport", section: "Progress", label: "Trail progress message", kind: "text", properties: TEXT },
  { id: "passport.stamps.heading", page: "passport", section: "Stamps", label: "Stamps heading", kind: "text", properties: TEXT },
  { id: "passport.stamps.intro", page: "passport", section: "Stamps", label: "Stamps intro", kind: "text", properties: TEXT },
  { id: "passport.stamps.empty", page: "passport", section: "Stamps", label: "No venues message", kind: "text", properties: TEXT },
  { id: "passport.rewards.heading", page: "passport", section: "Prizes", label: "Prizes heading", kind: "text", properties: TEXT },
  { id: "passport.rewards.intro", page: "passport", section: "Prizes", label: "Prizes intro", kind: "text", properties: TEXT },
  { id: "passport.award.body", page: "passport", section: "Prizes", label: "Prize description", kind: "text", properties: TEXT, repeat: "award" },
  { id: "checkin.result.body", page: "checkin", section: "Result", label: "Check-in result message", kind: "text", properties: TEXT },
  { id: "checkin.result.button", page: "checkin", section: "Result", label: "Check-in result button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "checkin.failure.heading", page: "checkin", section: "Problem", label: "Check-in problem heading", kind: "text", properties: TEXT },
  { id: "checkin.failure.body", page: "checkin", section: "Problem", label: "Check-in problem message", kind: "text", properties: TEXT },
  { id: "checkin.failure.button", page: "checkin", section: "Problem", label: "Check-in problem button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "bonus.result.body", page: "bonus", section: "Result", label: "Bonus result message", kind: "text", properties: TEXT },
  { id: "bonus.result.button", page: "bonus", section: "Result", label: "Bonus result button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "bonus.failure.heading", page: "bonus", section: "Problem", label: "Bonus problem heading", kind: "text", properties: TEXT },
  { id: "bonus.failure.body", page: "bonus", section: "Problem", label: "Bonus problem message", kind: "text", properties: TEXT },
  { id: "bonus.failure.button", page: "bonus", section: "Problem", label: "Bonus problem button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "tasting.result.body", page: "tasting", section: "Result", label: "Tasting result message", kind: "text", properties: TEXT },
  { id: "tasting.result.button", page: "tasting", section: "Result", label: "Tasting result button", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "tasting.failure.heading", page: "tasting", section: "Problem", label: "Tasting problem heading", kind: "text", properties: TEXT },
  { id: "tasting.failure.body", page: "tasting", section: "Problem", label: "Tasting problem message", kind: "text", properties: TEXT },
  { id: "tasting.failure.button", page: "tasting", section: "Problem", label: "Tasting problem button", kind: "button", properties: BUTTON, states: INTERACTIVE, repeat: "template" },
  { id: "scan.heading", page: "scan", section: "Scanner", label: "Scanner heading", kind: "text", properties: TEXT },
  { id: "scan.body", page: "scan", section: "Scanner", label: "Scanner help text", kind: "text", properties: TEXT },
  { id: "scan.camera", page: "scan", section: "Scanner", label: "Camera area", kind: "surface", properties: SURFACE },
  { id: "scan.error", page: "scan", section: "Scanner", label: "Scanner error message", kind: "text", properties: TEXT },
  { id: "scan.control", page: "scan", section: "Scanner", label: "Scanner control", kind: "button", properties: BUTTON, states: INTERACTIVE },
  { id: "checkin.result.surface", page: "checkin", section: "Result", label: "Check-in result", kind: "surface", properties: SURFACE },
  { id: "checkin.result.heading", page: "checkin", section: "Result", label: "Check-in result heading", kind: "text", properties: TEXT },
  { id: "bonus.result.surface", page: "bonus", section: "Result", label: "Bonus result", kind: "surface", properties: SURFACE },
  { id: "bonus.result.heading", page: "bonus", section: "Result", label: "Bonus result heading", kind: "text", properties: TEXT },
  { id: "tasting.result.surface", page: "tasting", section: "Result", label: "Tasting result", kind: "surface", properties: SURFACE },
  { id: "tasting.result.heading", page: "tasting", section: "Result", label: "Tasting result heading", kind: "text", properties: TEXT },
] as const satisfies readonly PublicStyleElementDefinition[];

export type PublicStyleElementId = (typeof PUBLIC_STYLE_ELEMENTS)[number]["id"];

const DEFINITIONS = new Map<string, PublicStyleElementDefinition>(
  PUBLIC_STYLE_ELEMENTS.map((definition) => [definition.id, definition]),
);
const HEX = /^#[0-9a-f]{6}$/i;
const GRADIENT = /^(linear|radial)-gradient\([^{};]{1,500}\)$/i;
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 '\-]{0,79}$/;
const WEIGHTS = new Set([400, 500, 600, 700]);
const ALIGNS = new Set(["left", "center", "right", "start", "end"]);

export function emptyPublicStyleOverrides(): PublicStyleOverrideDocument {
  return { version: PUBLIC_STYLE_DOCUMENT_VERSION, items: {} };
}

type ThemeKeyKind = "colour" | "percent" | "font" | "copy" | "logoShape" | "logoBackdrop";
/** Explicit per-key kind map — every PUBLIC_V2_THEME_KEYS entry must be listed. */
export const PUBLIC_V2_THEME_KEY_KINDS: Record<PublicV2ThemeKey, ThemeKeyKind> = {
  font_family: "font", heading_font_family: "font", default_emotive_font_family: "font",
  primary_color: "colour", accent_color: "colour", link_color: "colour", page_background_color: "colour",
  page_heading_color: "colour", page_body_color: "colour", page_muted_color: "colour", border_color: "colour",
  card_background_color: "colour", card_heading_color: "colour", card_body_color: "colour", card_muted_color: "colour",
  card_border_color: "colour", button_primary_bg: "colour", button_primary_fg: "colour", button_secondary_bg: "colour",
  button_secondary_fg: "colour", nav_background_color: "colour", nav_fg_color: "colour", nav_muted_color: "colour",
  nav_active_fg_color: "colour", hero_bg_color: "colour", hero_fg_color: "colour", hero_accent_color: "colour",
  hero_body_color: "colour", hero_overlay_color: "colour", hero_overlay_opacity: "percent",
  welcome_copy: "copy", logo_shape: "logoShape", logo_backdrop: "logoBackdrop", logo_backdrop_color: "colour",
  cover_focal_x: "percent", cover_focal_y: "percent",
};

function cleanThemeValue(key: PublicV2ThemeKey, value: unknown): { ok: true; value: string | number | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  switch (PUBLIC_V2_THEME_KEY_KINDS[key]) {
    case "colour": return typeof value === "string" && HEX.test(value) ? { ok: true, value: value.toUpperCase() } : { ok: false };
    case "percent": return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? { ok: true, value } : { ok: false };
    case "font": return typeof value === "string" && FONT.test(value.trim()) ? { ok: true, value: value.trim() } : { ok: false };
    case "copy": return typeof value === "string" && value.length <= 1000 ? { ok: true, value } : { ok: false };
    case "logoShape": return value === "square" || value === "circle" ? { ok: true, value } : { ok: false };
    case "logoBackdrop": return value === "transparent" || value === "color" ? { ok: true, value } : { ok: false };
  }
}

function cleanTheme(raw: unknown, errors?: string[]): PublicV2Theme | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const theme: PublicV2Theme = {};
  for (const key of PUBLIC_V2_THEME_KEYS) {
    if (!(key in source) || source[key] === undefined) continue;
    const result = cleanThemeValue(key, source[key]);
    if (result.ok) theme[key] = result.value;
    else errors?.push(`theme.${key} has an invalid value`);
  }
  return Object.keys(theme).length > 0 ? theme : undefined;
}

function cleanProperty(property: PublicStyleProperty, raw: unknown): string | number | null {
  if (property.endsWith("Color") || property === "color") {
    return typeof raw === "string" && HEX.test(raw) ? raw.toUpperCase() : null;
  }
  if (property === "backgroundGradient") {
    return typeof raw === "string" && GRADIENT.test(raw.trim()) ? raw.trim() : null;
  }
  if (property === "fontFamily") {
    return typeof raw === "string" && FONT.test(raw.trim()) ? raw.trim() : null;
  }
  if (property === "fontSize") {
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 8 && raw <= 96 ? raw : null;
  }
  if (property === "fontWeight") {
    return typeof raw === "number" && WEIGHTS.has(raw) ? raw : null;
  }
  if (property === "lineHeight") {
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0.8 && raw <= 2.5 ? raw : null;
  }
  if (property === "opacity") {
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
  }
  if (property === "textAlign") return typeof raw === "string" && ALIGNS.has(raw) ? raw : null;
  return null;
}

/** Validate one property value with the same rules the saved document uses (null = invalid). */
export function publicStylePropertyValue(property: PublicStyleProperty, raw: unknown): string | number | null {
  return cleanProperty(property, raw);
}

function cleanProperties(definition: PublicStyleElementDefinition, raw: unknown, errors?: string[], path = definition.id): PublicStyleProperties {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const result: PublicStyleProperties = {};
  for (const property of definition.properties) {
    if (source[property] === undefined || source[property] === null) continue;
    const value = cleanProperty(property, source[property]);
    if (value !== null) result[property] = value;
    else errors?.push(`${path}.${property} has an invalid value`);
  }
  return result;
}

function cleanItem(definition: PublicStyleElementDefinition, raw: unknown, errors?: string[]): PublicStyleItemOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const normal = cleanProperties(definition, source.normal, errors);
  const states: PublicStyleItemOverride["states"] = {};
  const sourceStates = source.states && typeof source.states === "object" && !Array.isArray(source.states)
    ? source.states as Record<string, unknown>
    : {};
  for (const state of definition.states ?? []) {
    const cleaned = cleanProperties(definition, sourceStates[state], errors, `${definition.id}:${state}`);
    if (Object.keys(cleaned).length > 0) states[state] = cleaned;
  }
  if (Object.keys(normal).length === 0 && Object.keys(states).length === 0) return null;
  return {
    ...(Object.keys(normal).length > 0 ? { normal } : {}),
    ...(Object.keys(states).length > 0 ? { states } : {}),
  };
}

/** Parse and report every rejected value so a save can refuse instead of silently dropping input. */
export function validatePublicStyleOverrides(raw: unknown): { document: PublicStyleOverrideDocument; errors: string[] } {
  const errors: string[] = [];
  const document = parsePublicStyleOverrides(raw, errors);
  return { document, errors };
}

export function parsePublicStyleOverrides(raw: unknown, errors?: string[]): PublicStyleOverrideDocument {
  const empty = emptyPublicStyleOverrides();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const source = raw as Record<string, unknown>;
  if (source.version !== PUBLIC_STYLE_DOCUMENT_VERSION) return empty;
  const items: PublicStyleOverrideDocument["items"] = {};
  const rawItems = source.items && typeof source.items === "object" && !Array.isArray(source.items)
    ? source.items as Record<string, unknown>
    : {};
  for (const [id, value] of Object.entries(rawItems)) {
    const definition = DEFINITIONS.get(id);
    if (!definition) continue;
    const item = cleanItem(definition, value, errors);
    if (item) items[id] = item;
  }
  const records: NonNullable<PublicStyleOverrideDocument["records"]> = {};
  const rawRecords = source.records && typeof source.records === "object" && !Array.isArray(source.records)
    ? source.records as Record<string, unknown>
    : {};
  for (const [id, values] of Object.entries(rawRecords)) {
    const definition = DEFINITIONS.get(id);
    if (!definition?.repeat || !values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const [recordId, value] of Object.entries(values as Record<string, unknown>)) {
      if (!RECORD_ID.test(recordId)) continue;
      const item = cleanItem(definition, value, errors);
      if (item) (records[id] ??= {})[recordId] = item;
    }
  }
  const theme = cleanTheme(source.theme, errors);
  return {
    version: PUBLIC_STYLE_DOCUMENT_VERSION,
    items,
    ...(Object.keys(records).length > 0 ? { records } : {}),
    ...(theme ? { theme } : {}),
  };
}

export function publicStyleDefinition(id: string): PublicStyleElementDefinition | null {
  return DEFINITIONS.get(id) ?? null;
}

/** Merged resolution: item default, then this record's override on top (per property and per state). */
export function publicStyleItem(
  document: PublicStyleOverrideDocument | null | undefined,
  id: string,
  recordId?: string | null,
): PublicStyleItemOverride | null {
  const parsed = parsePublicStyleOverrides(document);
  const base = parsed.items[id];
  const record = recordId ? parsed.records?.[id]?.[recordId] : undefined;
  if (!record) return base ?? null;
  if (!base) return record;
  const states: PublicStyleItemOverride["states"] = { ...(base.states ?? {}) };
  for (const [state, values] of Object.entries(record.states ?? {})) {
    states[state as keyof typeof states] = { ...(states[state as keyof typeof states] ?? {}), ...values };
  }
  return { normal: { ...(base.normal ?? {}), ...(record.normal ?? {}) }, states };
}

/** Element-level CSS. Icon colour never paints the element text; icon background only paints icon surfaces. */
function standardStyle(properties: PublicStyleProperties | undefined, kind?: PublicStyleElementDefinition["kind"], eventId?: string | null): CSSProperties {
  if (!properties) return {};
  return {
    ...(properties.color ? { color: String(properties.color) } : {}),
    ...(properties.backgroundColor ? { backgroundColor: String(properties.backgroundColor) } : {}),
    ...(properties.backgroundGradient ? { backgroundImage: String(properties.backgroundGradient) } : {}),
    ...(properties.borderColor ? { borderColor: String(properties.borderColor) } : {}),
    ...(properties.fontFamily ? { fontFamily: v2FontFamilyValue(String(properties.fontFamily), eventId) } : {}),
    ...(typeof properties.fontSize === "number" ? { fontSize: properties.fontSize } : {}),
    ...(typeof properties.fontWeight === "number" ? { fontWeight: properties.fontWeight } : {}),
    ...(typeof properties.lineHeight === "number" ? { lineHeight: properties.lineHeight } : {}),
    ...(properties.textAlign ? { textAlign: properties.textAlign as CSSProperties["textAlign"] } : {}),
    ...(typeof properties.opacity === "number" ? { opacity: properties.opacity } : {}),
    ...(kind === "icon" && properties.iconBackgroundColor ? { backgroundColor: String(properties.iconBackgroundColor) } : {}),
  };
}

function variableStyle(properties: PublicStyleProperties | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (properties?.progressTrackColor) vars["--item-progress-track"] = String(properties.progressTrackColor);
  if (properties?.progressFillColor) vars["--item-progress-fill"] = String(properties.progressFillColor);
  if (properties?.iconColor) vars["--item-icon-color"] = String(properties.iconColor);
  if (properties?.iconBackgroundColor) vars["--item-icon-bg"] = String(properties.iconBackgroundColor);
  return vars;
}

export function publicStyleTarget(
  document: PublicStyleOverrideDocument | null | undefined,
  id: PublicStyleElementId,
  options?: { recordId?: string | null; selectable?: boolean; eventId?: string | null },
): {
  "data-event-style"?: string;
  "data-event-record"?: string;
  "data-brand-role"?: string;
  "data-brand-instance"?: string;
  style: CSSProperties;
} {
  const item = publicStyleItem(document, id, options?.recordId);
  const normal = item?.normal;
  return {
    "data-event-style": id,
    ...(options?.recordId ? { "data-event-record": options.recordId } : {}),
    ...(options?.selectable ? { "data-brand-role": id, "data-brand-instance": options.recordId ? `${id}@${options.recordId}` : id } : {}),
    style: { ...standardStyle(normal, DEFINITIONS.get(id)?.kind, options?.eventId), ...variableStyle(normal) } as CSSProperties,
  };
}

const CSS_SCOPE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Item CSS, confined to ONE scope root (`[data-public-style-root="<scope>"]`)
 * so two event scopes in one document never affect each other.
 */
export function publicStyleCss(document: PublicStyleOverrideDocument | null | undefined, scope?: string, eventId?: string | null): string {
  const parsed = parsePublicStyleOverrides(document);
  const root = scope && CSS_SCOPE.test(scope) ? `[data-public-style-root="${scope}"] ` : "";
  const rules: string[] = [];
  const declaration = (properties: PublicStyleProperties, kind?: PublicStyleElementDefinition["kind"]) => {
    const style = standardStyle(properties, kind, eventId) as Record<string, string | number | undefined>;
    const pairs = Object.entries(style).map(([key, value]) => {
      const cssKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${cssKey}:${typeof value === "number" && key === "fontSize" ? `${value}px` : value}!important`;
    });
    for (const [key, value] of Object.entries(variableStyle(properties))) pairs.push(`${key}:${value}!important`);
    return pairs.join(";");
  };
  const add = (selector: string, item: PublicStyleItemOverride, kind?: PublicStyleElementDefinition["kind"]) => {
    const scoped = `${root}${selector}`;
    if (item.normal) {
      const body = declaration(item.normal, kind);
      if (body) rules.push(`${scoped}{${body}}`);
      if (item.normal.iconColor) rules.push(`${scoped} svg{color:${item.normal.iconColor}!important}`);
    }
    for (const [state, properties] of Object.entries(item.states ?? {})) {
      if (!properties) continue;
      const native = state === "focus" ? ":focus-visible" : state === "disabled" ? ':disabled,[aria-disabled="true"]' : `:${state}`;
      // [data-preview-state] lets the editor force an appearance for visual checking; never set on live pages.
      const pseudo = `:is(${native},[data-preview-state="${state}"])`;
      const body = declaration(properties, kind);
      if (body) rules.push(`${scoped}${pseudo}{${body}}`);
      // State icon rules carry the pseudo-class, so they out-rank the normal svg rule.
      if (properties.iconColor) rules.push(`${scoped}${pseudo} svg{color:${properties.iconColor}!important}`);
    }
  };
  for (const [id, item] of Object.entries(parsed.items)) add(`[data-event-style="${id}"]`, item, DEFINITIONS.get(id)?.kind);
  for (const [id, records] of Object.entries(parsed.records ?? {})) {
    for (const [recordId, item] of Object.entries(records)) {
      add(`[data-event-style="${id}"][data-event-record="${recordId}"]`, item, DEFINITIONS.get(id)?.kind);
    }
  }
  return rules.join("\n");
}
