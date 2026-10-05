import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Only the TanStack router hooks are faked; PublicLink / PublicNavProvider /
// style scope are the REAL components so marker + style attributes survive.
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/offers" }),
    useNavigate: () => vi.fn(),
    useRouterState: () => ({ location: { pathname: "/offers" } }),
    Link: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
  };
});

import { PublicNavProvider } from "@/components/public-nav-context";
import { PublicOffersPage } from "./live.$subdomain.offers";
import { CombinedLegalPage } from "@/components/public-legal";
import { PublicStyleScope } from "@/components/public-style-scope";
import { eventScopedCustomFontFamily, v2FontFamilyValue } from "@/lib/event-font-alias";
import { publicStyleCss, publicStyleDefinition, publicStyleTarget } from "@/lib/public-style-overrides";
import { V2ResultPreview } from "@/components/v2-result-previews";

const baseEvent = {
  event_id: "event-a",
  name: "Test Wine Trail",
  primary_color: "#1F3D2B",
  accent_color: "#D4AF37",
  nav_background_color: "#FFFFFF",
  venue_label_singular: "Stop",
  venue_label_plural: "Stops",
};
const offers = [
  { venue_id: "venue-1", name: "Estate Winery", offer_summary: "2-for-1 Tasting\nTwo for one.", event_found: true },
  { venue_id: "venue-2", name: "Hill Cellar", offer_summary: "Free cheese\nWith any flight.", event_found: true },
];
const v2Config = {
  version: 1,
  items: { "offers.card.heading": { normal: { color: "#AB0001" } } },
  records: { "offers.card.heading": { "venue-2": { normal: { color: "#00CD02" } } } },
};

const navigate = vi.fn();
function render(event: Record<string, unknown>) {
  return renderToStaticMarkup(
    <PublicNavProvider mode="preview" subdomain="preview" onPreviewNavigate={navigate} activePath="/offers">
      <PublicOffersPage subdomain="preview" previewData={{ event: event as any, offers: offers as any }} />
    </PublicNavProvider>,
  );
}
const attrsFor = (html: string, id: string) => [...html.matchAll(new RegExp(`<[^>]*data-event-style="${id.replace(/\./g, "\\.")}"[^>]*>`, "g"))].map((m) => m[0]);

describe("Offers page (real components)", () => {
  it("V1 event renders no V2 markers or item styles", () => {
    const html = render({ ...baseEvent, public_template_version: null, v2_style_config: v2Config });
    expect(html).toContain("Estate Winery");
    expect(html).not.toContain("data-event-style=\"offers.card.heading\"");
    expect(html).not.toContain("#AB0001");
  });

  it("V2 event applies type default and per-record override to the right card only", () => {
    const html = render({ ...baseEvent, public_template_version: "v2", v2_style_config: v2Config });
    const heads = attrsFor(html, "offers.card.heading");
    expect(heads).toHaveLength(2);
    const one = heads.find((h) => h.includes('data-event-record="venue-1"'))!;
    const two = heads.find((h) => h.includes('data-event-record="venue-2"'))!;
    expect(one.toLowerCase()).toContain("#ab0001");
    expect(two.toLowerCase()).toContain("#00cd02");
    // Sibling text on the same card keeps its inherited colour.
    for (const body of attrsFor(html, "offers.card.body")) expect(body.toLowerCase()).not.toMatch(/#ab0001|#00cd02/);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("Legal page (real component)", () => {
  const row = { event_id: "event-a", event_name: "T", legal_source: "local_text", terms_title: "Terms", terms_body: "Body", terms_url: null, privacy_title: "Privacy", privacy_body: "P", privacy_url: null, terms_version: null, privacy_version: null, effective_at: null };
  it("legal heading is independently addressable in V2 scope", () => {
    const html = renderToStaticMarkup(
      <PublicNavProvider mode="preview" subdomain="preview">
        <PublicStyleScope eventId="event-a" overrides={{ version: 1, items: { "legal.heading": { normal: { color: "#123456" } } } } as any}>
          <CombinedLegalPage subdomain="preview" initialOpen="both" previewData={{ branding: { ready: true } as any, row: row as any }} />
        </PublicStyleScope>
      </PublicNavProvider>,
    );
    const heads = attrsFor(html, "legal.heading");
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.every((h) => h.includes("#123456"))).toBe(true);
    for (const body of attrsFor(html, "legal.body")) expect(body).not.toContain("#123456");
  });
});

describe("Event-scoped custom font aliases", () => {
  it("never collide across events or punctuation-only differences", () => {
    expect(eventScopedCustomFontFamily("A B", "e1")).not.toBe(eventScopedCustomFontFamily("AB", "e1"));
    expect(eventScopedCustomFontFamily("Brand", "e1")).not.toBe(eventScopedCustomFontFamily("Brand", "e2"));
    expect(eventScopedCustomFontFamily("Brand", "e1")).toBe(eventScopedCustomFontFamily("brand", "e1"));
  });
  it("item inline style and state CSS use the same registered alias", () => {
    const doc = { version: 1, items: { "venues.card.directions": { normal: { fontFamily: "My Upload" }, states: { hover: { fontFamily: "Hover Upload" } } } } } as any;
    const alias = eventScopedCustomFontFamily("My Upload", "e1");
    const hoverAlias = eventScopedCustomFontFamily("Hover Upload", "e1");
    const inline = String(publicStyleTarget(doc, "venues.card.directions", { eventId: "e1" }).style.fontFamily);
    expect(inline).toBe(v2FontFamilyValue("My Upload", "e1"));
    const css = publicStyleCss(doc, "s1", "e1");
    const hoverRule = css.split("}").find((rule) => rule.includes(":hover"));
    expect(hoverRule).toBeDefined();
    expect(hoverRule).toContain(hoverAlias);
    expect(inline).toContain(alias);
    expect(css).not.toContain(eventScopedCustomFontFamily("Hover Upload", "e2"));
  });
});

describe("Result previews use the real V2 presentation scope", () => {
  const resultEvent = {
    ...baseEvent,
    public_template_version: "v2",
    v2_style_config: {
      version: 1,
      items: {
        "bonus.result.surface": { normal: { backgroundColor: "#102030" } },
        "bonus.result.heading": { normal: { color: "#F1E2D3" } },
        "bonus.result.icon": { normal: { iconColor: "#11AA22", iconBackgroundColor: "#334455" } },
        "bonus.failure.heading": { normal: { color: "#CC2244" } },
      },
    },
  };

  it("applies success styles and lets a solid surface replace the built-in gradient", () => {
    const html = renderToStaticMarkup(<PublicNavProvider mode="preview" subdomain={null}><V2ResultPreview page="bonus" state="claimed" event={resultEvent} venueName={null} /></PublicNavProvider>);
    expect(attrsFor(html, "bonus.result.surface")[0]?.toLowerCase()).toContain("background-color:#102030");
    expect(attrsFor(html, "bonus.result.surface")[0]?.toLowerCase()).toContain("background-image:none");
    expect(attrsFor(html, "bonus.result.heading")[0]?.toLowerCase()).toContain("#f1e2d3");
    expect(attrsFor(html, "bonus.result.icon")[0]?.toLowerCase()).toContain("#334455");
    expect(html).toContain('data-public-style-version="1"');
  });

  it("applies failure styles through the same scope without mounting a claim controller", () => {
    const html = renderToStaticMarkup(<PublicNavProvider mode="preview" subdomain={null}><V2ResultPreview page="bonus" state="inactive" event={resultEvent} venueName={null} /></PublicNavProvider>);
    expect(attrsFor(html, "bonus.failure.heading")[0]?.toLowerCase()).toContain("#cc2244");
    expect(html).toContain("Bonus code inactive");
  });

  it("keeps V1 result output outside a V2 item scope", () => {
    const html = renderToStaticMarkup(<PublicNavProvider mode="preview" subdomain={null}><V2ResultPreview page="bonus" state="claimed" event={{ ...resultEvent, public_template_version: null }} venueName={null} /></PublicNavProvider>);
    expect(html).not.toContain("data-public-style-version");
    expect(html).not.toContain("#102030");
  });
});

describe("Typed leaf controls", () => {
  it("keeps join input text and surface properties independent", () => {
    const definition = publicStyleDefinition("join.form.field");
    expect(definition?.kind).toBe("text");
    expect(definition?.properties).toEqual(expect.arrayContaining(["backgroundColor", "borderColor", "color", "fontFamily", "fontSize"]));
    const target = publicStyleTarget({ version: 1, items: { "join.form.field": { normal: { backgroundColor: "#112233", color: "#DDEEFF" } } } }, "join.form.field");
    expect(target.style.backgroundColor).toBe("#112233");
    expect(target.style.color).toBe("#DDEEFF");
  });

  it("keeps award badge record overrides on the selected award", () => {
    const doc = { version: 1, items: { "prizes.card.badge": { normal: { color: "#111111" } } }, records: { "prizes.card.badge": { "award-a": { normal: { color: "#AA0000" } } } } } as const;
    expect(publicStyleTarget(doc, "prizes.card.badge", { recordId: "award-a" }).style.color).toBe("#AA0000");
    expect(publicStyleTarget(doc, "prizes.card.badge", { recordId: "award-b" }).style.color).toBe("#111111");
  });
});
