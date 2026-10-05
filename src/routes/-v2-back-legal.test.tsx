// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: () => { throw new Error("no table"); }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }));
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return { ...actual, useLocation: () => ({ pathname: "/" }), useNavigate: () => vi.fn(), useRouterState: () => ({ location: { pathname: "/" } }),
    Link: ({ children, to, params: _p, ...rest }: any) => <a data-router-link={String(to)} {...rest}>{children}</a> };
});

import { PublicNavProvider } from "@/components/public-nav-context";
import { PublicStyleScope } from "@/components/public-style-scope";
import { PublicBackLink } from "@/components/public-back-link";
import { LegalBody } from "@/components/legal-body";
import { CombinedLegalPage, type LegalRow } from "@/components/public-legal";
import { parsePublicStyleOverrides, validatePublicStyleOverrides, publicBackLinkLabel, PUBLIC_STYLE_DOCUMENT_VERSION } from "@/lib/public-style-overrides";

afterEach(cleanup);

const doc = (extra: object) => parsePublicStyleOverrides({ version: PUBLIC_STYLE_DOCUMENT_VERSION, items: {}, ...extra });
const legacy = "inline-flex items-center text-xs legacy-class";

describe("Shared back link", () => {
  it("V1 renders the exact legacy element, copy and destination", () => {
    const { container } = render(<PublicBackLink context="faq" to="/" label="Back to event" legacy="link" legacyClassName={legacy} />);
    const a = container.querySelector("a")!;
    expect(a.textContent).toBe("← Back to event");
    expect(a.getAttribute("data-router-link")).toBe("/");
    expect(a.className).toBe(legacy);
    expect(a.hasAttribute("data-event-style")).toBe(false);
  });

  it("V2 applies shared default, then context override, with label config; destination unchanged", () => {
    const overrides = doc({
      items: { "shared.backLink": { normal: { color: "#112233", iconColor: "#445566" } } },
      records: { "shared.backLink": { venue: { normal: { color: "#AA0000" } } } },
      backLinks: { labels: { default: "Return", venue: "All stops" } },
    });
    const { container } = render(
      <PublicNavProvider mode="live" subdomain="demo">
        <PublicStyleScope overrides={overrides} eventId="evt-a">
          <PublicBackLink context="faq" to="/" label="Back to event" legacy="link" legacyClassName={legacy} />
          <PublicBackLink context="venue" to="/venues" label="Back" legacy="public" legacyClassName={legacy} />
        </PublicStyleScope>
      </PublicNavProvider>,
    );
    const [faq, venue] = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[data-back-link]"));
    expect(faq.textContent).toBe("Return");
    expect(venue.textContent).toBe("All stops");
    expect(faq.style.color).toMatch(/#112233|rgb\(17, 34, 51\)/i);
    expect(venue.style.color).toMatch(/#AA0000|rgb\(170, 0, 0\)/i);
    expect(faq.getAttribute("data-router-link") ?? faq.getAttribute("href")).toMatch(/\/$/);
    expect(venue.getAttribute("data-router-link") ?? venue.getAttribute("href")).toMatch(/venues$/);
    expect(faq.querySelector("svg")).not.toBeNull();
  });

  it("label config round-trips and rejects markup, unknown contexts and overlong text", () => {
    const { document, errors } = validatePublicStyleOverrides({ version: 1, items: {}, backLinks: { labels: { faq: "  Back home ", default: "<b>x</b>", nope: "x", join: "x".repeat(41) } } });
    expect(document.backLinks?.labels).toEqual({ faq: "Back home", default: "bx/b" });
    expect(errors.some((e) => e.includes("nope"))).toBe(true);
    expect(errors.some((e) => e.includes("join"))).toBe(true);
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(publicBackLinkLabel(document, "prizes", "Back to event")).toBe("bx/b");
    expect(publicBackLinkLabel(null, "prizes", "Back to event")).toBe("Back to event");
    // An empty document stays empty (opening V2 writes nothing).
    expect(parsePublicStyleOverrides({ version: 1, items: {} })).toEqual({ version: 1, items: {} });
  });

  it("Select/Edit preview mode keeps the back link inert", () => {
    const overrides = doc({});
    const { container } = render(
      <PublicNavProvider mode="preview" subdomain={null} preservePreviewAppearance>
        <PublicStyleScope overrides={overrides} eventId="evt-a">
          <PublicBackLink context="legal" to="/" label="Back to event" legacy="link" legacyClassName={legacy} />
        </PublicStyleScope>
      </PublicNavProvider>,
    );
    const node = container.querySelector("[data-back-link]")!;
    expect(node.tagName).toBe("SPAN");
    expect(node.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Legal document styling", () => {
  const body = "Intro paragraph\n\n## Heading\n\nSecond paragraph";
  it("V1 LegalBody markup is unchanged", () => {
    const { container } = render(<LegalBody body={body} section="terms" />);
    expect(container.firstElementChild!.className).toBe("space-y-4 text-[15px] leading-relaxed text-[#3D372C]");
    expect(container.querySelector("[data-event-style]")).toBeNull();
  });

  it("V2 terms/privacy body + heading overrides land on the real nodes independently", () => {
    const overrides = doc({ records: {
      "legal.document.body": { terms: { normal: { color: "#123456", fontSize: 18, lineHeight: 1.8 } } },
      "legal.document.heading": { privacy: { normal: { color: "#654321" } } },
    } });
    const { container } = render(
      <PublicStyleScope overrides={overrides} eventId="evt-a">
        <LegalBody body={body} section="terms" />
        <LegalBody body={body} section="privacy" />
      </PublicStyleScope>,
    );
    const [terms, privacy] = Array.from(container.querySelectorAll<HTMLElement>("[data-legal-section]"));
    expect(terms.style.fontSize).toBe("18px");
    expect(terms.style.color).toMatch(/#123456|rgb\(18, 52, 86\)/i);
    expect(privacy.style.fontSize).toBe("");
    for (const p of Array.from(terms.querySelectorAll("p"))) expect(p.className).not.toMatch(/text-\[/);
    const [, privacyHeading] = Array.from(container.querySelectorAll<HTMLElement>("h2"));
    expect(privacyHeading.style.color).toMatch(/#654321|rgb\(101, 67, 33\)/i);
  });

  const row: LegalRow = { event_id: "evt-a", event_name: "Event A", legal_source: "local_text", terms_title: "T", terms_body: "Terms text", terms_url: null, privacy_title: "P", privacy_body: "Privacy text", privacy_url: null, terms_version: null, privacy_version: null, effective_at: null };
  const branding = { ready: true } as any;

  it("V2 toggle colour reaches heading text and chevron; open state follows page switch", () => {
    const overrides = doc({ records: { "legal.section.toggle": { terms: { normal: { color: "#0A0B0C" } } } } });
    const ui = (open: "terms" | "privacy") => (
      <PublicNavProvider mode="preview" subdomain={null} preservePreviewAppearance>
        <PublicStyleScope overrides={overrides} eventId="evt-a"><CombinedLegalPage subdomain="preview" initialOpen={open} previewData={{ branding, row }} /></PublicStyleScope>
      </PublicNavProvider>
    );
    const { container, rerender } = render(ui("terms"));
    const toggle = container.querySelector<HTMLButtonElement>('[data-legal-card="terms"] button')!;
    expect(toggle.style.color).toMatch(/#0A0B0C|rgb\(10, 11, 12\)/i);
    expect(toggle.querySelector("span")!.className ?? "").not.toMatch(/text-\[/);
    expect(toggle.querySelector("svg")!.getAttribute("class")).not.toMatch(/text-\[var/);
    expect(container.querySelector('[data-legal-card="terms"]')!.hasAttribute("data-event-style")).toBe(true);
    expect(container.textContent).toContain("Terms text");
    expect(container.textContent).not.toContain("Privacy text");
    rerender(ui("privacy"));
    expect(container.textContent).toContain("Privacy text");
    expect(container.textContent).not.toContain("Terms text");
    fireEvent.click(toggle);
  });

  it("external documents stay inert in preview and missing content invents no text", () => {
    const ext = { ...row, legal_source: "external_url" as const, terms_url: "https://example.com/t", privacy_url: null, privacy_body: null };
    const { container } = render(
      <PublicNavProvider mode="preview" subdomain={null} preservePreviewAppearance>
        <PublicStyleScope overrides={doc({})} eventId="evt-a"><CombinedLegalPage subdomain="preview" initialOpen="both" previewData={{ branding, row: ext }} /></PublicStyleScope>
      </PublicNavProvider>,
    );
    const link = container.querySelector<HTMLAnchorElement>('a[href="https://example.com/t"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(container.textContent).toContain("Not available for this event.");
  });
});
