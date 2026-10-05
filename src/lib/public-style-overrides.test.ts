import { describe, expect, it } from "vitest";
import {
  parsePublicStyleOverrides,
  publicStyleCss,
  publicStyleItem,
} from "./public-style-overrides";

describe("public passport style overrides", () => {
  it("keeps independent welcome, prize icon, and prize progress values", () => {
    const document = parsePublicStyleOverrides({
      version: 1,
      items: {
        "home.hero.welcomeLabel": { normal: { color: "#112233" } },
        "home.nextPrize.icon": { normal: { iconBackgroundColor: "#445566" } },
        "home.nextPrize.progress": { normal: { progressFillColor: "#778899" } },
      },
    });
    expect(publicStyleItem(document, "home.hero.welcomeLabel")?.normal?.color).toBe("#112233");
    expect(publicStyleItem(document, "home.nextPrize.icon")?.normal?.iconBackgroundColor).toBe("#445566");
    expect(publicStyleItem(document, "home.nextPrize.progress")?.normal?.progressFillColor).toBe("#778899");
  });

  it("drops unknown IDs, properties and invalid values", () => {
    const document = parsePublicStyleOverrides({
      version: 1,
      items: {
        "unknown.selector": { normal: { color: "#112233" } },
        "home.shareButton": {
          normal: { color: "red;display:none", backgroundColor: "#ABCDEF", position: "fixed" },
        },
      },
    });
    expect(document.items["unknown.selector"]).toBeUndefined();
    expect(document.items["home.shareButton"]?.normal).toEqual({ backgroundColor: "#ABCDEF" });
  });

  it("resolves stable record overrides ahead of the type default", () => {
    const document = parsePublicStyleOverrides({
      version: 1,
      items: { "venues.card.heading": { normal: { color: "#111111" } } },
      records: { "venues.card.heading": { "venue-42": { normal: { color: "#222222" } } } },
    });
    expect(publicStyleItem(document, "venues.card.heading", "venue-42")?.normal?.color).toBe("#222222");
    expect(publicStyleItem(document, "venues.card.heading", "venue-99")?.normal?.color).toBe("#111111");
  });

  it("emits state selectors and no arbitrary selector content", () => {
    const css = publicStyleCss(parsePublicStyleOverrides({
      version: 1,
      items: {
        "home.shareButton": {
          normal: { backgroundColor: "#123456", color: "#FFFFFF" },
          states: { hover: { backgroundColor: "#654321" } },
        },
      },
    }));
    expect(css).toContain('[data-event-style="home.shareButton"]');
    expect(css).toContain('[data-event-style="home.shareButton"]:hover');
    expect(css).not.toContain("position");
  });
});