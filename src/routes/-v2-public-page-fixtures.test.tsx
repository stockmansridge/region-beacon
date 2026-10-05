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
import { publicStyleCss, publicStyleTarget } from "@/lib/public-style-overrides";

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
    const doc = { version: 1, items: { "offers.card.heading": { normal: { fontFamily: "My Upload" }, hover: { fontFamily: "My Upload" } } } } as any;
    const alias = eventScopedCustomFontFamily("My Upload", "e1");
    const inline = String(publicStyleTarget(doc, "offers.card.heading", { eventId: "e1" }).style.fontFamily);
    expect(inline).toContain(alias);
    expect(inline).toBe(v2FontFamilyValue("My Upload", "e1"));
    const css = publicStyleCss(doc, "s1", "e1");
    expect(css).toContain(alias);
    expect(css).not.toContain(eventScopedCustomFontFamily("My Upload", "e2"));
  });
});
