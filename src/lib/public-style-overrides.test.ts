import { describe, expect, it } from "vitest";
import {
  PUBLIC_V2_THEME_KEYS,
  PUBLIC_V2_THEME_KEY_KINDS,
  parsePublicStyleOverrides,
  publicStyleCss,
  publicStyleItem,
  publicStylePropertyValue,
  publicStyleTarget,
  publicTrailTabLabel,
  resolvePublicTemplateVersion,
  validatePublicStyleOverrides,
} from "./public-style-overrides";
import { publicEventScopeProps } from "@/components/public-event-branding-scope";
import { resolveEventBrandingKeys, brandingScopeProps } from "@/lib/use-event-palette";

describe("V2 theme round-trip (finding 5)", () => {
  it("keeps all four button bg/fg keys alongside *_color keys", () => {
    const parsed = parsePublicStyleOverrides({
      version: 1, items: {},
      theme: { button_primary_bg: "#123456", button_primary_fg: "#ABCDEF", button_secondary_bg: "#234567", button_secondary_fg: "#BCDEFA", hero_bg_color: "#345678" },
    });
    expect(parsed.theme).toEqual({ button_primary_bg: "#123456", button_primary_fg: "#ABCDEF", button_secondary_bg: "#234567", button_secondary_fg: "#BCDEFA", hero_bg_color: "#345678" });
  });

  it("round-trips a valid value for every allowlisted theme key", () => {
    const sample: Record<string, unknown> = {};
    for (const key of PUBLIC_V2_THEME_KEYS) {
      const kind = PUBLIC_V2_THEME_KEY_KINDS[key];
      sample[key] = kind === "colour" ? "#ABCDEF" : kind === "percent" ? 25 : kind === "font" ? "Lora" : kind === "copy" ? "Hello" : kind === "logoShape" ? "circle" : "color";
    }
    const { document, errors } = validatePublicStyleOverrides({ version: 1, items: {}, theme: sample });
    expect(errors).toEqual([]);
    expect(Object.keys(document.theme ?? {}).sort()).toEqual([...PUBLIC_V2_THEME_KEYS].sort());
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it("reports invalid input instead of silently dropping it", () => {
    const { errors } = validatePublicStyleOverrides({ version: 1, items: { "home.shareButton": { normal: { color: "#12" } } }, theme: { button_primary_bg: "red" } });
    expect(errors).toContain("theme.button_primary_bg has an invalid value");
    expect(errors).toContain("home.shareButton.color has an invalid value");
  });

  it("keeps explicit null clears", () => {
    expect(parsePublicStyleOverrides({ version: 1, items: {}, theme: { welcome_copy: null } }).theme).toEqual({ welcome_copy: null });
  });
});

describe("V2 bottom navigation round-trip", () => {
  it("preserves valid labels, icon choices, order and unrelated overrides", () => {
    const source = {
      version: 1, items: { "passport.hero.heading": { normal: { color: "#123456" } } },
      navigation: { items: [
        { id: "venues", label: "Stops", icon: "pin" },
        { id: "passport", label: "My Pass", icon: "stamp" },
        { id: "prizes", label: "Rewards", icon: "trophy" },
        { id: "offers", label: "Deals", icon: "tag" },
        { id: "more", label: "More", icon: "more" },
      ] },
    };
    const parsed = parsePublicStyleOverrides(source);
    expect(parsed.navigation?.items.map((item) => item.id)).toEqual(["venues", "passport", "prizes", "offers", "more"]);
    expect(parsed.navigation?.items[0]).toEqual({ id: "venues", label: "Stops", icon: "pin" });
    expect(parsed.items["passport.hero.heading"]?.normal?.color).toBe("#123456");
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("reports malformed and duplicate items while restoring safe required defaults", () => {
    const checked = validatePublicStyleOverrides({ version: 1, items: {}, navigation: { items: [
      { id: "passport", label: "Pass", icon: "stamp" },
      { id: "passport", label: "Again", icon: "trophy" },
      { id: "bad", label: "Bad", icon: "javascript" },
    ] } });
    expect(checked.errors.length).toBeGreaterThan(0);
    expect(new Set(checked.document.navigation?.items.map((item) => item.id))).toEqual(new Set(["passport", "prizes", "venues", "offers", "more"]));
  });
});

describe("V2 Venues / Offers toggle", () => {
  it("round-trips safe labels and independent unselected/current item styles", () => {
    const source = { version: 1, items: {
      "shared.trailTabs.surface": { normal: { backgroundColor: "#112233", borderColor: "#223344" } },
      "shared.trailTabs.tab": { normal: { color: "#334455", backgroundColor: "#445566", borderColor: "#556677", fontSize: 13, fontWeight: 600 } },
      "shared.trailTabs.currentTab": { normal: { color: "#FFFFFF", backgroundColor: "#667788", borderColor: "#778899", fontSize: 14, fontWeight: 700 } },
    }, records: {
      "shared.trailTabs.tab": { offers: { normal: { color: "#8899AA" } } },
      "shared.trailTabs.currentTab": { venues: { normal: { backgroundColor: "#99AABB" } } },
    }, trailTabs: { labels: { venues: "Trail Stops", offers: "Local Deals" } } };
    const parsed = parsePublicStyleOverrides(source);
    expect(publicTrailTabLabel(parsed, "venues", "Venues")).toBe("Trail Stops");
    expect(publicTrailTabLabel(parsed, "offers", "Venues")).toBe("Local Deals");
    expect(parsed.records?.["shared.trailTabs.tab"]?.offers?.normal?.color).toBe("#8899AA");
    expect(parsed.records?.["shared.trailTabs.currentTab"]?.venues?.normal?.backgroundColor).toBe("#99AABB");
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("sanitizes labels and rejects unknown item slots", () => {
    const checked = validatePublicStyleOverrides({ version: 1, items: {}, records: { "shared.trailTabs.tab": { unknown: { normal: { color: "#112233" } } } }, trailTabs: { labels: { venues: "<Trail   Stops>", unknown: "Bad" } } });
    expect(checked.errors.some((error) => error.includes("trailTabs.labels.venues"))).toBe(true);
    expect(checked.errors.some((error) => error.includes("trailTabs.labels.unknown"))).toBe(true);
    expect(checked.document.records?.["shared.trailTabs.tab"]?.unknown).toBeUndefined();
  });
});

describe("independent text / icon / background (finding 6)", () => {
  const doc = { version: 1 as const, items: { "home.shareButton": { normal: { color: "#111111", iconColor: "#FF0000", backgroundColor: "#00FF00", borderColor: "#0000FF" }, states: { hover: { iconColor: "#00AAFF", color: "#222222" } } } } };

  it("text keeps its own colour when an icon colour is set", () => {
    const target = publicStyleTarget(doc, "home.shareButton");
    expect(target.style.color).toBe("#111111");
    expect(target.style.backgroundColor).toBe("#00FF00");
    expect(target.style.borderColor).toBe("#0000FF");
    expect((target.style as Record<string, string>)["--item-icon-color"]).toBe("#FF0000");
  });

  it("icon background paints only icon surfaces", () => {
    const button = publicStyleTarget({ version: 1, items: { "home.shareButton": { normal: {} } } }, "home.shareButton");
    expect(button.style.backgroundColor).toBeUndefined();
    const icon = publicStyleTarget({ version: 1, items: { "home.nextPrize.icon": { normal: { iconBackgroundColor: "#ABCDEF" } } } }, "home.nextPrize.icon");
    expect(icon.style.backgroundColor).toBe("#ABCDEF");
  });

  it("state icon colour rule out-ranks the normal svg rule", () => {
    const css = publicStyleCss(doc, "scopeA");
    expect(css).toContain('[data-public-style-root="scopeA"] [data-event-style="home.shareButton"] svg{color:#FF0000!important}');
    expect(css).toMatch(/:is\(:hover,\[data-preview-state="hover"\]\) svg\{color:#00AAFF!important\}/);
    // Normal block must not set `color` to the icon colour.
    const normalBlock = css.split("\n").find((rule) => rule.startsWith('[data-public-style-root="scopeA"] [data-event-style="home.shareButton"]{'));
    expect(normalBlock).toContain("color:#111111!important");
    expect(normalBlock).not.toMatch(/(^|[;{])color:#FF0000/);
  });
});

describe("scope isolation (finding 9)", () => {
  it("prefixes every rule with its own scope root", () => {
    const a = publicStyleCss({ version: 1, items: { "home.hero.welcomeLabel": { normal: { color: "#AA0000" } } } }, "eventA");
    const b = publicStyleCss({ version: 1, items: { "home.hero.welcomeLabel": { normal: { color: "#00BB00" } } } }, "eventB");
    for (const rule of a.split("\n")) expect(rule.startsWith('[data-public-style-root="eventA"] ')).toBe(true);
    for (const rule of b.split("\n")) expect(rule.startsWith('[data-public-style-root="eventB"] ')).toBe(true);
  });
  it("rejects unsafe scope ids", () => {
    expect(publicStyleCss({ version: 1, items: { "home.hero.heading": { normal: { color: "#AA0000" } } } }, '"]{}*{')).not.toContain("*{");
  });
});

describe("record merge and validation", () => {
  it("merges type default with record override per property", () => {
    const item = publicStyleItem({ version: 1, items: { "home.stamps.tile": { normal: { backgroundColor: "#111111", borderColor: "#222222" } } }, records: { "home.stamps.tile": { "venue-1": { normal: { backgroundColor: "#333333" } } } } }, "home.stamps.tile", "venue-1");
    expect(item?.normal).toEqual({ backgroundColor: "#333333", borderColor: "#222222" });
  });
  it("validates partial typing values the same way as saved documents", () => {
    expect(publicStylePropertyValue("fontSize", 1)).toBeNull();
    expect(publicStylePropertyValue("fontSize", 12)).toBe(12);
    expect(publicStylePropertyValue("color", "#12")).toBeNull();
    expect(publicStylePropertyValue("opacity", 0.25)).toBe(0.25);
    expect(publicStylePropertyValue("opacity", 25)).toBeNull();
  });
  it("opacity endpoints serialise as 0–1 on the tint layer", () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      const doc = parsePublicStyleOverrides({ version: 1, items: { "home.hero.cover": { normal: { opacity: pct / 100 } } } });
      expect(publicStyleTarget(doc, "home.hero.cover").style.opacity).toBe(pct / 100);
    }
  });
  it("unknown template versions fall back to V1", () => {
    expect(resolvePublicTemplateVersion("v3")).toBe("v1");
    expect(resolvePublicTemplateVersion(null)).toBe("v1");
    expect(resolvePublicTemplateVersion("v2")).toBe("v2");
  });
  it("round-trips only allowlisted non-identifying leaderboard template slots", () => {
    const source = { version: 1, items: { "leaderboard.rank": { normal: { color: "#112233" } } }, records: {
      "leaderboard.rank.surface": {
        first: { normal: { backgroundColor: "#AABBCC" } },
        "passport-person-123": { normal: { backgroundColor: "#DDEEFF" } },
      },
      "leaderboard.tier.text": { explorer: { normal: { color: "#223344" } }, unknown: { normal: { color: "#334455" } } },
    } };
    const parsed = parsePublicStyleOverrides(source);
    expect(parsed.items["leaderboard.rank"]?.normal?.color).toBe("#112233");
    expect(parsed.records?.["leaderboard.rank.surface"]?.first?.normal?.backgroundColor).toBe("#AABBCC");
    expect(parsed.records?.["leaderboard.rank.surface"]?.["passport-person-123"]).toBeUndefined();
    expect(parsed.records?.["leaderboard.tier.text"]?.explorer?.normal?.color).toBe("#223344");
    expect(parsed.records?.["leaderboard.tier.text"]?.unknown).toBeUndefined();
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });
});

describe("canonical public V1/V2 boundary", () => {
  it("maps V2 theme values into the shared hook-based page scope", () => {
    const config = parsePublicStyleOverrides({ version: 1, items: {}, theme: { nav_background_color: "#112233", page_body_color: "#445566" } });
    const keys = resolveEventBrandingKeys({ event_id: "event-v2", nav_background_color: "#FFFFFF", page_body_color: "#EEEEEE" } as never, { public_template_version: "v2", v2_style_config: config });
    const scope = brandingScopeProps(keys);
    expect(keys.navBackgroundColor).toBe("#112233");
    expect(keys.pageBodyColor).toBe("#445566");
    expect(scope.navBackgroundColor).toBe("#112233");
    expect(scope.pageBodyColor).toBe("#445566");
  });

  it("does not expose V2-only split text roles to V1", () => {
    const keys = resolveEventBrandingKeys({ event_id: "event-v1", nav_background_color: "#FFFFFF", page_body_color: "#445566" } as never, { public_template_version: "v1", v2_style_config: null });
    expect(keys.navBackgroundColor).toBe("#FFFFFF");
    expect(keys.pageBodyColor).toBeNull();
    expect(keys.styleOverrides).toBeNull();
  });
  it("carries event identity and V2 overrides through the shared scope mapper", () => {
    const config = parsePublicStyleOverrides({ version: 1, items: { "shared.navigation.surface": { normal: { backgroundColor: "#123456" } } } });
    const props = publicEventScopeProps({ event_id: "event-a", public_template_version: "v2", v2_style_config: config } as never);
    expect(props.eventId).toBe("event-a");
    expect(props.templateVersion).toBe("v2");
    expect(props.styleOverrides).toEqual(config);
  });

  it("keeps missing and unknown versions on V1 without item overrides", () => {
    const config = parsePublicStyleOverrides({ version: 1, items: { "shared.navigation.surface": { normal: { backgroundColor: "#123456" } } } });
    for (const version of [null, "future"]) {
      const props = publicEventScopeProps({ event_id: "event-v1", public_template_version: version, v2_style_config: config } as never);
      expect(props.templateVersion).toBe("v1");
      expect(props.styleOverrides).toBeNull();
    }
  });
});
