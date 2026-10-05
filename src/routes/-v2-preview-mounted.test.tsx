// @vitest-environment happy-dom
/**
 * MOUNTED interaction tests (happy-dom + React DOM, not SSR). Real public
 * components; only the router and the backend client are faked so we can
 * prove the editor preview makes zero visitor reads/writes, RPCs or device
 * permission calls while every visible link/button is exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

const { rpc, from, routerNavigate } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: null, error: null })),
  from: vi.fn(() => { throw new Error("no table access in preview"); }),
  routerNavigate: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from, storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: path ? `https://assets.example/${path}` : "" } }) }) }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } }));
vi.mock("@tanstack/react-start", async () => ({ ...(await vi.importActual<object>("@tanstack/react-start")), useServerFn: () => vi.fn(async () => { throw new Error("server fn in preview"); }) }));
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/" }),
    useNavigate: () => routerNavigate,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: ({ children, to, params: _p, ...rest }: any) => <a data-router-link={String(to)} {...rest}>{children}</a>,
  };
});

import { PublicNavProvider } from "@/components/public-nav-context";
import { PublicEventNav } from "@/components/public-event-nav";
import { V2ResultPreview, RESULT_PAGE_STATES, type ResultPreviewPage } from "@/components/v2-result-previews";
import { ScannerView } from "./scan";
import { BonusView } from "./collect.bonus.$token";
import { VenueSortControl } from "@/components/venue-sort-control";
import { PublicStyleScope } from "@/components/public-style-scope";
import { applyMapMarkerSelection, mapMarkerAnnotationOptions, resolveMapMarkerStyle } from "@/lib/map-marker-style";
import { MapMarkerGlyph } from "./live.$subdomain.map";
import { EventPublicLanding } from "@/components/event-public-landing";
import { formToPreviewEvent } from "./admin.events.$eventId_.branding";
import { PassportPreview, type PassportRow } from "./passport.$token";
import { EMPTY_PASSPORT_STAMP_STATE } from "@/lib/passport-stamps";
import { PublicOffersPage, type EventRow as OffersEventRow, type OfferVenue } from "./live.$subdomain.offers";
import { PublicLeaderboardPage, type LeaderboardRow } from "./live.$subdomain.leaderboard";

const V1_EVENT = {
  event_id: "event-v1", name: "Legacy Trail", palette_key: null, page_background_key: null,
  primary_color: "#101010", accent_color: "#202020", text_color: "#303030", nav_background_color: "#404040",
  public_template_version: null,
  v2_style_config: { version: 1, theme: { primary_color: "#AA0000" }, items: { "bonus.result.heading": { normal: { color: "#AA0001" } } } },
};
const V2_EVENT = {
  ...V1_EVENT, event_id: "event-v2", public_template_version: "v2",
  v2_style_config: {
    version: 1,
    theme: { primary_color: "#0A0B0C", accent_color: "#0D0E0F" },
    items: { "scan.heading": { normal: { color: "#ABCDEF" } }, "bonus.result.heading": { normal: { color: "#AA0001" } } },
  },
};

let spies: Array<ReturnType<typeof vi.fn>> = [];
const storageCalls: string[] = [];
function spyDeviceApis() {
  storageCalls.length = 0;
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const m of ["getItem", "setItem", "removeItem", "clear"] as const) {
      const orig = store[m].bind(store);
      vi.spyOn(store, m).mockImplementation(((...a: unknown[]) => { storageCalls.push(`${m}:${String(a[0])}`); return (orig as any)(...a); }) as never);
    }
  }
  const getUserMedia = vi.fn(); const geo = vi.fn(); const share = vi.fn(); const clip = vi.fn(); const notif = vi.fn(); const fetchSpy = vi.fn(async () => new Response("{}"));
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: geo, watchPosition: geo }, configurable: true });
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: { writeText: clip }, configurable: true });
  (globalThis as any).Notification = Object.assign(function () {}, { requestPermission: notif, permission: "default" });
  vi.stubGlobal("fetch", fetchSpy);
  spies = [getUserMedia, geo, share, clip, notif, fetchSpy];
}
function expectNoSideEffects() {
  expect(storageCalls.filter((c) => /gs\.|passport|visitor|token/i.test(c))).toEqual([]);
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  for (const s of spies) expect(s).not.toHaveBeenCalled();
  expect(routerNavigate).not.toHaveBeenCalled();
}
async function clickEverything(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll("a,button"))) {
    await act(async () => { fireEvent.click(el); });
  }
}
const previewNav = vi.fn();
function inPreview(node: React.ReactNode, activePath = "/") {
  return (
    <PublicNavProvider mode="preview" subdomain="preview" onPreviewNavigate={previewNav} activePath={activePath} previewFeatures={{ hasFaq: true, hasMap: true, hasAwards: true }}>
      {node}
    </PublicNavProvider>
  );
}
const varOf = (root: HTMLElement, name: string) => {
  const el = Array.from(root.querySelectorAll<HTMLElement>("[style]")).find((n) => n.style.getPropertyValue(name));
  return el?.style.getPropertyValue(name).trim().toLowerCase() ?? null;
};

beforeEach(() => { rpc.mockClear(); from.mockClear(); routerNavigate.mockClear(); previewNav.mockClear(); spyDeviceApis(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Preview navigation (mounted)", () => {
  it("PublicEventNav in preview reads no visitor storage, calls no RPC, and keeps every link inside the preview", async () => {
    const { container } = render(inPreview(<PublicEventNav subdomain="preview" eventId="event-v2" eventName="Trail" />));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await clickEverything(container);
    expectNoSideEffects();
    expect(container.querySelector("[data-router-link]")).toBeNull();
  });
});

describe("Result previews (mounted, every state, every action)", () => {
  for (const page of Object.keys(RESULT_PAGE_STATES) as ResultPreviewPage[]) {
    for (const [state] of RESULT_PAGE_STATES[page]) {
      for (const ev of [V1_EVENT, V2_EVENT]) {
        it(`${page}/${state} (${ev.public_template_version ?? "v1"}) has zero side effects`, async () => {
          const { container } = render(inPreview(<V2ResultPreview page={page} state={state} event={ev} venueName="Sample" />));
          await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
          await clickEverything(container);
          expectNoSideEffects();
          expect(container.querySelector("[data-router-link]")).toBeNull();
          expect(container.querySelector('a[href="/"]:not([data-preview])')?.getAttribute("href") ?? "/").toBeTruthy();
        });
      }
    }
  }
});

describe("Version-specific result profiles", () => {
  it("V1 Bonus preview: exact legacy gradient, palette-only scope (raw event primary NOT applied), no V2 markers", () => {
    const { container } = render(inPreview(<V2ResultPreview page="bonus" state="claimed" event={V1_EVENT} venueName={null} />));
    const surface = Array.from(container.querySelectorAll<HTMLElement>("div")).find((d) => d.className.includes("h-[420px]"))!;
    expect(surface.getAttribute("style")).toContain("linear-gradient(160deg, #1F3D2B 0%, #14271C 100%)");
    expect(container.querySelector("[data-event-style]")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("#101010");
    expect(container.innerHTML.toLowerCase()).not.toContain("#aa0001");
  });
  it("V1 Check-in preview keeps its historic full prop bag (raw primary applied, V2 theme ignored)", () => {
    const { container } = render(inPreview(<V2ResultPreview page="checkin" state="stamped" event={V1_EVENT} venueName={null} />));
    expect(varOf(container, "--event-primary")).toBe("#101010");
    expect(container.innerHTML.toLowerCase()).not.toContain("#aa0000");
  });
  it("V2 Bonus preview applies saved theme + item override on the heading only", () => {
    const { container } = render(inPreview(<V2ResultPreview page="bonus" state="claimed" event={V2_EVENT} venueName={null} />));
    expect(varOf(container, "--event-primary")).toBe("#0a0b0c");
    const heading = container.querySelector<HTMLElement>('[data-event-style="bonus.result.heading"]')!;
    expect(heading.style.color.toLowerCase()).toMatch(/#aa0001|rgb\(170, 0, 1\)/);
    expect(container.querySelector<HTMLElement>('[data-event-style="bonus.result.body"]')!.style.color).toBe("");
  });
  it("Public V1 Bonus view (no preview) uses the exact legacy gradient too", () => {
    const { container } = render(<BonusView outcome={{ kind: "claimed", row: { points_awarded: 5, total_points: 9, bonus_code_name: null } as never, passportToken: "t" }} />);
    expect(container.innerHTML).toContain("linear-gradient(160deg, #1F3D2B 0%, #14271C 100%)");
  });
});

describe("Public ScannerView canonical V2 vs exact V1", () => {
  const props = { subdomain: null, eventId: "e", hasPassport: true, err: { kind: "none" } as never, manual: "", onManualChange() {}, onManualGo() {}, copied: false, onCopySupport() {}, camera: <div /> };
  it("V1: raw row colours, no V2 theme, no item override", () => {
    const { container } = render(inPreview(<ScannerView {...props} event={V1_EVENT} />));
    expect(varOf(container, "--event-primary")).toBe("#101010");
    expect(container.querySelector("[data-event-style]")).toBeNull();
  });
  it("V2: saved theme replaces row colours; item override lands on its target only", () => {
    const { container } = render(inPreview(<ScannerView {...props} event={V2_EVENT} />));
    expect(varOf(container, "--event-primary")).toBe("#0a0b0c");
    expect(container.innerHTML.toLowerCase()).not.toContain("--event-primary: #101010");
    expect(container.querySelector<HTMLElement>('[data-event-style="scan.heading"]')?.style.color.toLowerCase()).toBe("#abcdef");
    expect(container.querySelector<HTMLElement>('[data-event-style="scan.body"]')?.style.color).toBe("");
  });
});

describe("Map pin resolver (shared by MapKit annotations and preview marker)", () => {
  const doc = { version: 1, items: { "map.marker": { normal: { iconBackgroundColor: "#111111", iconColor: "#222222" }, states: { active: { iconColor: "#333333", iconBackgroundColor: "#555555" } } } }, records: { "map.marker": { "venue-b": { normal: { iconBackgroundColor: "#444444" } } } } } as never;
  const base = { primary: "#P00000".replace("P", "1"), accent: "#200000", overrides: doc, hasPassport: false, visited: false };
  it("V1 ignores overrides and returns historic colours", () => {
    expect(resolveMapMarkerStyle({ ...base, templateVersion: "v1", venueId: "venue-a" })).toEqual({ color: "#200000", glyphColor: "#FFFFFF", selectedColor: "#200000", selectedGlyphColor: "#FFFFFF", glyphText: "" });
    expect(resolveMapMarkerStyle({ ...base, templateVersion: "v1", venueId: "venue-a", hasPassport: true }).color).toBe("#8A7E66");
  });
  it("V2 default / record / selected / visited states", () => {
    const normal = resolveMapMarkerStyle({ ...base, templateVersion: "v2", venueId: "venue-a" });
    expect(normal).toMatchObject({ color: "#111111", glyphColor: "#222222", selectedColor: "#555555", selectedGlyphColor: "#333333" });
    expect(resolveMapMarkerStyle({ ...base, templateVersion: "v2", venueId: "venue-b" }).color).toBe("#444444");
    const visited = resolveMapMarkerStyle({ ...base, templateVersion: "v2", venueId: "venue-a", visited: true, hasPassport: true });
    expect(visited.color).toBe("#111111");
    expect(visited.glyphText).toBe("\u2713");
    const options = mapMarkerAnnotationOptions(normal, "Venue");
    expect(options).toMatchObject({ color: "#111111", glyphColor: "#222222", selectedGlyphColor: "#333333" });
    const annotation = { color: options.color, glyphColor: options.glyphColor };
    applyMapMarkerSelection(annotation, normal, true);
    expect(annotation).toEqual({ color: "#555555", glyphColor: "#333333" });
    applyMapMarkerSelection(annotation, normal, false);
    expect(annotation).toEqual({ color: "#111111", glyphColor: "#222222" });
    const { container } = render(
      <PublicStyleScope overrides={doc} eventId="e">
        <MapMarkerGlyph style={normal} recordId="venue-a" />
        <MapMarkerGlyph style={normal} recordId="venue-selected" selected />
        <MapMarkerGlyph style={visited} recordId="venue-visited" />
      </PublicStyleScope>,
    );
    const target = container.querySelector<HTMLElement>('[data-brand-role="map.marker"]')!;
    const paint = target.querySelector<HTMLElement>("[data-marker-paint]")!;
    expect(target.dataset.brandInstance).toBe("map.marker@venue-a");
    expect(target.dataset.eventRecord).toBe("venue-a");
    expect(target.style.backgroundColor).toBe("");
    expect(target.style.getPropertyValue("--item-icon-bg")).toBe("#111111");
    expect(paint.style.backgroundColor).toContain("--item-icon-bg");
    expect(paint.style.color).toContain("--item-icon-color");
    target.dataset.previewState = "active";
    expect(Array.from(container.querySelectorAll("style")).map((node) => node.textContent).join("\n")).toContain('[data-preview-state="active"]');
    expect(getComputedStyle(target).backgroundColor).toBe("");
    expect(getComputedStyle(target).getPropertyValue("--item-icon-bg").trim()).toBe("#555555");
    expect(getComputedStyle(target).getPropertyValue("--item-icon-color").trim()).toBe("#333333");
    delete target.dataset.previewState;
    expect(getComputedStyle(target).getPropertyValue("--item-icon-bg").trim()).toBe("#111111");
    const selectedTarget = container.querySelector<HTMLElement>('[data-event-record="venue-selected"]')!;
    const selectedPaint = selectedTarget.querySelector<HTMLElement>("[data-marker-paint]")!;
    expect(selectedTarget.dataset.markerState).toBe("selected");
    expect(getComputedStyle(selectedTarget).getPropertyValue("--item-icon-bg").trim()).toBe("#555555");
    expect(getComputedStyle(selectedTarget).getPropertyValue("--item-icon-color").trim()).toBe("#333333");
    expect(selectedPaint.style.backgroundColor).toBe("var(--item-icon-bg, #555555)");
    expect(selectedPaint.style.color).toBe("var(--item-icon-color, #333333)");
    const visitedTarget = container.querySelector<HTMLElement>('[data-event-record="venue-visited"]')!;
    const visitedPaint = visitedTarget.querySelector<HTMLElement>("[data-marker-paint]")!;
    expect(visitedTarget.dataset.markerState).toBe("visited");
    expect(getComputedStyle(visitedTarget).getPropertyValue("--item-icon-bg").trim()).toBe("#111111");
    expect(getComputedStyle(visitedTarget).getPropertyValue("--item-icon-color").trim()).toBe("#222222");
    expect(visitedPaint.style.backgroundColor).toBe("var(--item-icon-bg, #111111)");
    expect(visitedPaint.style.color).toBe("var(--item-icon-color, #222222)");
    const v1 = render(<PublicStyleScope enabled={false} overrides={doc} eventId="e"><MapMarkerGlyph style={normal} recordId="venue-a" /></PublicStyleScope>);
    expect(v1.container.querySelector("[data-event-style], [data-brand-role]")).toBeNull();
  });
});

describe("Venue sort control typography lands on the visible select", () => {
  it("label override is inherited by the native select (no fixed size/weight class on it)", () => {
    const doc = { version: 1, items: { "venues.controls.sort": { normal: { fontSize: 18, fontWeight: 700 } } } } as never;
    const { container } = render(inPreview(
      <PublicStyleScope overrides={doc} eventId="e"><VenueSortControl sort={"default" as never} onChange={() => {}} count={2} countLabel="Stops" hasPassport={false} locationError={null} locating={false} /></PublicStyleScope>,
    ));
    const target = container.querySelector<HTMLElement>('[data-event-style="venues.controls.sort"]')!;
    expect(target.style.fontSize).toBe("18px");
    const select = container.querySelector("select")!;
    expect(select.className).not.toMatch(/text-\[12px\]|font-semibold/);
    expect(select.style.fontSize).toBe("inherit");
    expect(select.style.fontWeight).toBe("inherit");
    expect(getComputedStyle(select).fontSize).toBe("18px");
  });
});

describe("Home + nav preview (mounted)", () => {
  it("EventPublicLanding in preview mode: no visitor storage, RPC, share/clipboard or router navigation after clicking everything", async () => {
    const { container } = render(inPreview(
      <EventPublicLanding subdomain={null} mode="preview" templateVersion="v2" event={{ ...V2_EVENT, public_slug: "trail", description: null } as never} venues={[{ venue_id: "venue-1", name: "Estate", event_found: true } as never]} />,
    ));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await clickEverything(container);
    expectNoSideEffects();
    expect(previewNav).toHaveBeenCalled();
  });
});

describe("Passport V2 preview composition", () => {
  it("uses the real scoped Passport nodes, bottom menu, and a true zero-stamp state without side effects", async () => {
    const doc = { version: 1, items: { "passport.page.surface": { normal: { backgroundColor: "#123456" } } } } as never;
    const passport = { passport_id: "preview", event_id: "event-v2", first_name: "Sample", full_name: "Sample Visitor", checkin_count: 1 } as PassportRow;
    const branding = { paletteKey: null, backgroundKey: null, primaryColor: null, accentColor: null, pageBackgroundColor: null, cardBackgroundColor: null, textColor: null, mutedTextColor: null, cardTextColor: null, cardMutedTextColor: null, borderColor: null, primaryTextColor: null, navBackgroundColor: null, brandKitKey: null, linkColor: null, cardBorderColor: null, buttonPrimaryBg: null, buttonPrimaryFg: null, buttonSecondaryBg: null, buttonSecondaryFg: null, navFgColor: null, navMutedColor: null, navActiveFgColor: null, heroBgColor: null, heroFgColor: null, heroAccentColor: null, heroBodyColor: null, heroOverlayColor: null, heroOverlayOpacity: null, pageHeadingColor: null, pageBodyColor: null, pageMutedColor: null, cardHeadingColor: null, cardBodyColor: null, cardMutedColor: null, logoPath: null, coverPath: null, coverFocalX: null, coverFocalY: null, fontFamily: null, headingFontFamily: null, eventId: "event-v2", templateVersion: "v2" as const, styleOverrides: doc, ready: true };
    const { container } = render(inPreview(<PublicStyleScope overrides={doc} eventId="event-v2"><PassportPreview passport={passport} eventName="Trail" stamps={{ ...EMPTY_PASSPORT_STAMP_STATE, status: "ok" }} token="preview" subdomain="preview" branding={branding} awards={[]} preview /></PublicStyleScope>, "/passport/preview"));
    expect(container.querySelector<HTMLElement>('[data-event-style="passport.page.surface"]')?.style.backgroundColor).toBe("#123456");
    expect(container.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
    expect(container.textContent).toContain("0");
    await clickEverything(container);
    expectNoSideEffects();
  });
});

describe("Special Offers V2 targets", () => {
  const offers = [
    { venue_id: "venue-no-image", name: "No Image", offer_summary: "A gift", cover_path: null, logo_path: null, offer_display_icon: "gift", offer_display_colour: "#112233", offer_display_foreground_colour: "#F1F2F3", event_found: true },
    { venue_id: "venue-image", name: "Has Image", offer_summary: "A second gift", cover_path: "cover.jpg", logo_path: null, offer_display_icon: "gift", offer_display_colour: null, offer_display_foreground_colour: null, event_found: true },
  ] as OfferVenue[];
  const event = { ...V2_EVENT, name: "Trail" } as unknown as OffersEventRow;

  it("selects and paints each no-image icon node independently while preserving badge defaults", () => {
    const overrides = { version: 1, items: {}, records: {
      "offers.card.badge": { "venue-no-image": { normal: { iconColor: "#010203", iconBackgroundColor: "#AABBCC", borderColor: "#102030" } } },
      "offers.card.placeholder": { "venue-no-image": { normal: { backgroundColor: "#DDEEFF", borderColor: "#203040" } } },
      "offers.card.placeholderIcon": { "venue-no-image": { normal: { iconColor: "#334455", iconBackgroundColor: "#CCDDEE" } } },
      "offers.card.chevron": { "venue-no-image": { normal: { iconColor: "#556677", iconBackgroundColor: "#EECCAA" } } },
    } } as never;
    const { container } = render(inPreview(<PublicOffersPage subdomain="preview" previewData={{ event: { ...event, v2_style_config: overrides }, offers }} />, "/offers"));
    const target = (id: string) => container.querySelector<HTMLElement>(`[data-brand-instance="${id}@venue-no-image"]`);
    expect(target("offers.card.badge")?.style.backgroundColor).toBe("#AABBCC");
    expect(target("offers.card.badge")?.style.getPropertyValue("--item-icon-color")).toBe("#010203");
    expect(target("offers.card.placeholder")?.style.backgroundColor).toBe("#DDEEFF");
    expect(target("offers.card.placeholderIcon")?.style.backgroundColor).toBe("#CCDDEE");
    expect(target("offers.card.placeholderIcon")?.style.getPropertyValue("--item-icon-color")).toBe("#334455");
    expect(target("offers.card.chevron")?.style.backgroundColor).toBe("#EECCAA");
    expect(target("offers.card.chevron")?.style.getPropertyValue("--item-icon-color")).toBe("#556677");
    expect(container.querySelector('[data-brand-instance="offers.card.image@venue-image"]')).not.toBeNull();
    expect(container.querySelector('[data-brand-instance="offers.card.placeholder@venue-image"]')).toBeNull();
  });

  it("does not emit selectable offer targets for V1", () => {
    const { container } = render(inPreview(<PublicOffersPage subdomain="preview" previewData={{ event: { ...event, public_template_version: null }, offers }} />, "/offers"));
    expect(container.querySelector("[data-brand-role^='offers.card.']")).toBeNull();
  });
});

describe("Leaderboard V2 person-card targets", () => {
  const rows = [
    { rank: 1, display_name: "Unchanged Person", stamps: 3, points: 30, venue_points: 25, bonus_points: 5, visit_count: 3, tier: "Explorer", is_completed: true, is_enabled: true, event_found: true },
    { rank: 2, display_name: "Other Person", stamps: 2, points: 20, venue_points: 20, bonus_points: 0, visit_count: 2, tier: "Silver", is_completed: false, is_enabled: true, event_found: true },
  ] as LeaderboardRow[];
  const branding = (eventId: string, overrides: unknown, version: "v1" | "v2" = "v2") => ({
    paletteKey: null, backgroundKey: null, primaryColor: null, accentColor: null, pageBackgroundColor: null, cardBackgroundColor: null, textColor: null, mutedTextColor: null, cardTextColor: null, cardMutedTextColor: null, borderColor: null, primaryTextColor: null, navBackgroundColor: null, brandKitKey: null, linkColor: null, cardBorderColor: null, buttonPrimaryBg: null, buttonPrimaryFg: null, buttonSecondaryBg: null, buttonSecondaryFg: null, navFgColor: null, navMutedColor: null, navActiveFgColor: null, heroBgColor: null, heroFgColor: null, heroAccentColor: null, heroBodyColor: null, heroOverlayColor: null, heroOverlayOpacity: null, pageHeadingColor: null, pageBodyColor: null, pageMutedColor: null, cardHeadingColor: null, cardBodyColor: null, cardMutedColor: null, logoPath: null, coverPath: null, coverFocalX: null, coverFocalY: null, fontFamily: null, headingFontFamily: null, eventId, templateVersion: version, styleOverrides: overrides as never, ready: true,
  });

  it("selects and styles rank, tier, completed and points leaves by safe template slot", () => {
    const doc = { version: 1, items: { "leaderboard.rank": { normal: { color: "#101112" } } }, records: {
      "leaderboard.rank.surface": { first: { normal: { backgroundColor: "#202122", borderColor: "#303132" } } },
      "leaderboard.rank": { first: { normal: { fontSize: 19, fontWeight: 700 } } },
      "leaderboard.tier.surface": { explorer: { normal: { backgroundColor: "#404142", borderColor: "#505152" } } },
      "leaderboard.tier.text": { explorer: { normal: { color: "#606162", fontSize: 12 } } },
      "leaderboard.completed.surface": { completed: { normal: { backgroundColor: "#707172" } } },
      "leaderboard.completed.text": { completed: { normal: { color: "#808182" } } },
      "leaderboard.row.pointsUnit": { first: { normal: { color: "#909192", fontSize: 14 } } },
    } } as never;
    const { container } = render(inPreview(<PublicLeaderboardPage subdomain="preview" previewData={{ branding: branding("event-a", doc), eventId: "event-a", rows }} />, "/leaderboard"));
    const get = (instance: string) => container.querySelector<HTMLElement>(`[data-brand-instance="${instance}"]`)!;
    expect(get("leaderboard.rank.surface@first").style.backgroundColor).toBe("#202122");
    expect(get("leaderboard.rank@first").style.fontSize).toBe("19px");
    expect(get("leaderboard.rank@first").style.color).toBe("#101112");
    expect(get("leaderboard.tier.surface@explorer").style.backgroundColor).toBe("#404142");
    expect(get("leaderboard.tier.text@explorer").style.color).toBe("#606162");
    expect(get("leaderboard.completed.surface@completed").style.backgroundColor).toBe("#707172");
    expect(get("leaderboard.completed.text@completed").style.color).toBe("#808182");
    expect(get("leaderboard.row.pointsUnit@first").style.color).toBe("#909192");
    expect(container.textContent).toContain("Unchanged Person");
    expect(get("leaderboard.rank.surface@second").style.backgroundColor).not.toBe("#202122");
  });

  it("keeps V1 unmarked and ignores another event's V2 document", () => {
    const foreign = { version: 1, records: { "leaderboard.tier.surface": { explorer: { normal: { backgroundColor: "#123456" } } } }, items: {} };
    const { container } = render(inPreview(<PublicLeaderboardPage subdomain="preview" previewData={{ branding: branding("event-b", foreign, "v1"), eventId: "event-b", rows }} />, "/leaderboard"));
    expect(container.querySelector("[data-brand-role^='leaderboard.']")).toBeNull();
    expect(container.innerHTML).not.toContain("#123456");
    expect(container.textContent).toContain("Unchanged Person");
  });
});

describe("formToPreviewEvent emotive font", () => {
  it("draft uses the unsaved form value, not the saved row", () => {
    const saved = { default_emotive_font_family: "Saved Script" } as never;
    const form = new Proxy({ default_emotive_font_family: "Draft Script", style_overrides: null } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : "") }) as never;
    const out = formToPreviewEvent({ id: "e", name: "E" }, saved, form, { default_emotive_font_family: "Saved Script" });
    expect(out.default_emotive_font_family).toBe("Draft Script");
  });
});

describe("PublicEventNav override precedence", () => {
  const doc = { version: 1, items: {
    "shared.navigation.surface": { normal: { backgroundColor: "#112233", borderColor: "#445566" } },
    "shared.navigation.item": { normal: { color: "#AA0001", backgroundColor: "#CCAA00", fontSize: 13, iconColor: "#00AA02", iconBackgroundColor: "#00CCDD" } },
    "shared.navigation.activeItem": { normal: { color: "#BB0003", backgroundColor: "#0000CC", iconColor: "#EE00AA", iconBackgroundColor: "#DDEEFF" } },
    "shared.navigation.drawer": { normal: { backgroundColor: "#778899" } },
  } } as never;

  it("without V2 overrides keeps the exact default nav styles", () => {
    const { container } = render(inPreview(<PublicEventNav subdomain="preview" eventId="e" eventName="Trail" />));
    const header = container.querySelector<HTMLElement>("header")!;
    expect(header.style.background).not.toBe("");
    expect(header.style.backgroundColor === "" || header.style.backgroundColor === header.style.background).toBeTruthy();
    const label = Array.from(container.querySelectorAll<HTMLElement>("nav[aria-label='Primary'] li > *")).at(-1)!;
    expect(label.className).toMatch(/text-\[10px\]/);
  });

  it("V2 item overrides win on header, bottom bar, drawer, labels and icons", async () => {
    const { container } = render(inPreview(<PublicStyleScope overrides={doc} eventId="e"><PublicEventNav subdomain="preview" eventId="e" eventName="Trail" /></PublicStyleScope>, "/prizes"));
    const header = container.querySelector<HTMLElement>("header")!;
    const bottom = container.querySelector<HTMLElement>("nav[aria-label='Primary']")!;
    for (const bar of [header, bottom]) {
      expect(bar.style.backgroundColor).toBe("#112233");
      expect(bar.style.background === "" || bar.style.background.includes("#112233")).toBeTruthy();
      expect(bar.style.borderColor).toBe("#445566");
    }
    const eventName = Array.from(container.querySelectorAll<HTMLElement>("header span")).find((s) => s.textContent === "Trail")!;
    expect(eventName.style.color).toBe("#AA0001");
    const tabs = Array.from(bottom.querySelectorAll<HTMLElement>("li > *"));
    const active = tabs.filter((t) => t.style.color === "#BB0003");
    const inactive = tabs.filter((t) => t.style.color === "#AA0001");
    expect(inactive.length).toBeGreaterThan(0);
    expect(active.length).toBeGreaterThan(0);
    for (const t of inactive) {
      expect(t.style.fontSize).toBe("13px");
      const leaf = t.querySelector<HTMLElement>("span.whitespace-nowrap")!;
      expect(leaf.className).not.toMatch(/text-\[10px\]|leading-4/);
      expect(getComputedStyle(leaf).fontSize).toBe("13px");
      expect(t.style.getPropertyValue("--item-icon-color")).toBe("#00AA02");
      expect(t.style.backgroundColor).toBe("#CCAA00");
      const icon = t.querySelector<HTMLElement>("[data-navigation-icon]")!;
      expect(icon.style.color).toContain("--item-icon-color");
      expect(icon.style.backgroundColor).toContain("--item-icon-bg");
    }
    for (const t of active) {
      expect(t.style.backgroundColor).toBe("#0000CC");
      const icon = t.querySelector<HTMLElement>("[data-navigation-icon]")!;
      expect(icon.style.color).toContain("--item-icon-color");
      expect(icon.style.backgroundColor).toContain("--item-icon-bg");
    }
    const headerButton = container.querySelector<HTMLElement>("button[aria-label='Open menu']")!;
    expect(headerButton.style.backgroundColor).toBe("#CCAA00");
    expect(headerButton.querySelector<HTMLElement>("[data-navigation-icon]")!.style.backgroundColor).toContain("--item-icon-bg");
    const generatedCss = Array.from(container.querySelectorAll("style")).map((style) => style.textContent).join("\n");
    expect(generatedCss).toContain("--item-icon-color:#00AA02!important");
    expect(generatedCss).toContain("--item-icon-bg:#00CCDD!important");
    expect(generatedCss).toContain("--item-icon-color:#EE00AA!important");
    expect(generatedCss).toContain("--item-icon-bg:#DDEEFF!important");
    const menuButton = container.querySelector<HTMLElement>("button[aria-label='Open menu']")!;
    await act(async () => { fireEvent.click(menuButton); });
    const aside = document.querySelector<HTMLElement>("aside")!;
    expect(aside.style.backgroundColor).toBe("#778899");
    expect(aside.style.background === "" || aside.style.background.includes("#778899")).toBeTruthy();
  });

  it("renders event-scoped V2 item labels, order, icons, and active item styles", () => {
    const configured = { version: 1, items: {
      "shared.navigation.surface": { normal: { backgroundColor: "#112233", borderColor: "#445566" } },
      "shared.navigation.item": { normal: { color: "#AA0001" } },
      "shared.navigation.activeItem": { normal: { color: "#BB0003", iconColor: "#EE00AA" } },
    }, navigation: { items: [
      { id: "venues", label: "Stops", icon: "map" }, { id: "passport", label: "My Pass", icon: "stamp" },
      { id: "prizes", label: "Rewards", icon: "trophy" }, { id: "offers", label: "Deals", icon: "tag" },
      { id: "more", label: "Explore", icon: "more" },
    ] }, records: {
      "shared.navigation.tabItem": { venues: { normal: { color: "#0F0F0F", iconColor: "#123456", iconBackgroundColor: "#654321" } }, prizes: { normal: { color: "#0E0E0E" } } },
      "shared.navigation.currentTab": { venues: { normal: { color: "#C0FFEE", iconColor: "#ABCDEF", iconBackgroundColor: "#FEDCBA" } } },
    } } as never;
    const { container } = render(inPreview(<PublicStyleScope overrides={configured} eventId="e"><PublicEventNav subdomain="preview" eventId="e" eventName="Trail" brandingSelection /></PublicStyleScope>, "/venues/venue-a"));
    const tabs = Array.from(container.querySelectorAll<HTMLElement>("nav[aria-label='Primary'] li > *"));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Stops", "My Pass", "Rewards", "Deals", "Explore"]);
    const venue = tabs[0];
    // Current page: inactive per-tab override (#0F0F0F) is NOT applied; current-page override paints.
    expect(venue.dataset.brandInstance).toBe("shared.navigation.currentTab@venues");
    expect(venue.getAttribute("aria-current")).toBe("page");
    expect(venue.dataset.navTab).toBe("current");
    expect(venue.style.color).toBe("#C0FFEE");
    expect(venue.style.getPropertyValue("--item-icon-color")).toBe("#ABCDEF");
    expect(venue.style.getPropertyValue("--item-icon-bg")).toBe("#FEDCBA");
    const css = Array.from(container.querySelectorAll("style")).map((style) => style.textContent).join("\n");
    expect(css).toContain('[data-event-style="shared.navigation.currentTab"][data-event-record="venues"]{color:#C0FFEE!important');
    // Inactive tab keeps its own override; legacy shared item/active CSS still reaches tabs via aliases.
    const prizes = tabs[2];
    expect(prizes.dataset.navTab).toBe("inactive");
    expect(prizes.style.color).toBe("#0E0E0E");
    expect(css).toContain(':where([data-nav-tab="current"]){color:#BB0003!important');
    expect(css).toContain(':where([data-nav-tab="inactive"]){color:#AA0001!important');
  });
});

describe("f034e969 follow-up repairs", () => {
  const branding = { ready: true, eventId: "event-v2", templateVersion: "v2" as const } as any;

  it("Passport: stamp card target is the real card; progress bar + prize progress consume track/fill", () => {
    const doc = { version: 1, items: {
      "passport.stamps.surface": { normal: { backgroundColor: "#101010" } },
      "passport.progress.bar": { normal: { progressTrackColor: "#202020", progressFillColor: "#303030" } },
      "passport.holder.name": { normal: { color: "#404040" } },
      "passport.summary.pointsLabel": { normal: { fontSize: 14 } },
    } } as never;
    const passport = { passport_id: "preview", event_id: "event-v2", first_name: "Sample", full_name: "Sample Visitor", checkin_count: 1 } as PassportRow;
    const stamps = { ...EMPTY_PASSPORT_STAMP_STATE, status: "ok", totalVenueCount: 2, visitedCount: 1, allVenues: [{ venue_id: "v1", name: "A", stamped: true }, { venue_id: "v2", name: "B", stamped: false }] } as never;
    const { container } = render(inPreview(<PublicStyleScope overrides={doc} eventId="event-v2"><PassportPreview passport={passport} eventName="Trail" stamps={stamps} token="preview" subdomain="preview" branding={branding} awards={[]} preview /></PublicStyleScope>, "/passport/preview"));
    const card = container.querySelector<HTMLElement>('[data-event-style="passport.stamps.surface"]')!;
    expect(card.className).toMatch(/rounded-3xl/);
    expect(card.querySelector(".grid")).not.toBeNull();
    expect(card.style.backgroundColor).toBe("#101010");
    const bar = container.querySelector<HTMLElement>('[data-event-style="passport.progress.bar"]')!;
    expect(bar.style.getPropertyValue("--item-progress-track")).toBe("#202020");
    expect(bar.style.backgroundColor).toContain("--item-progress-track");
    expect((bar.firstElementChild as HTMLElement).style.backgroundColor).toContain("--item-progress-fill");
    expect(container.querySelector<HTMLElement>('[data-event-style="passport.holder.name"]')!.style.color).toBe("#404040");
    expect(container.querySelector<HTMLElement>('[data-event-style="passport.summary.pointsLabel"]')!.style.fontSize).toBe("14px");
    expect(container.querySelector('[data-event-style="passport.summary.nextValue"][data-event-record="none"]')).not.toBeNull();
  });

  it("Bookmarks: venue and offer leaves, thumbnail and arrow are separately selectable; V1 has no markers", async () => {
    const { PublicBookmarksPage } = await import("./live.$subdomain.bookmarks");
    const rows = [
      { kind: "venue", venue_id: "venue-a", venue_name: "Estate", logo_path: null, cover_path: null, offer_summary: null, created_at: "" },
      { kind: "offer", venue_id: "venue-b", venue_name: "Cellar", logo_path: null, cover_path: null, offer_summary: "Free tasting\nMore", created_at: "" },
    ] as never;
    const doc = { version: 1, items: { "bookmarks.card.name": { normal: { color: "#111111" } } }, records: { "bookmarks.card.offer": { "venue-b": { normal: { color: "#222222", fontSize: 15 } } }, "bookmarks.card.thumb": { "venue-a": { normal: { iconBackgroundColor: "#333333" } } } } } as never;
    const { container } = render(inPreview(<PublicStyleScope overrides={doc} eventId="event-v2"><PublicBookmarksPage subdomain="preview" previewData={{ branding, eventId: "event-v2", enabled: true, rows }} /></PublicStyleScope>, "/bookmarks"));
    const inst = (id: string) => container.querySelector<HTMLElement>(`[data-brand-instance="${id}"]`);
    expect(inst("bookmarks.card.type@venue-a")?.textContent).toBe("Venue");
    expect(inst("bookmarks.card.type@venue-b")?.textContent).toBe("Offer");
    expect(inst("bookmarks.card.name@venue-a")?.style.color).toBe("#111111");
    expect(inst("bookmarks.card.offer@venue-b")?.style.color).toBe("#222222");
    expect(inst("bookmarks.card.offer@venue-a")).toBeNull();
    expect(inst("bookmarks.card.thumb@venue-a")?.style.backgroundColor).toBe("#333333");
    expect(inst("bookmarks.card.chevron@venue-b")?.querySelector("svg")).not.toBeNull();
    cleanup();
    const v1 = render(inPreview(<PublicBookmarksPage subdomain="preview" previewData={{ branding: { ...branding, templateVersion: "v1" }, eventId: "event-v1", enabled: true, rows }} />, "/bookmarks"));
    expect(v1.container.querySelector("[data-event-style]")).toBeNull();
    expect(v1.container.textContent).toContain("Free tasting");
  });

  it("Venue detail V1 keeps the original single CTA (mt-6, no collect panel copy)", async () => {
    const { PublicVenueDetailPage } = await import("./live.$subdomain.venues.$venueId");
    const venue = { venue_id: "venue-a", name: "Estate", description: null, offer_summary: null, offer_display_icon: null, offer_display_colour: null, offer_display_foreground_colour: null, address: null, website_url: null, phone: null, logo_path: null, cover_path: null, lat: null, lng: null, order_index: 0 };
    const v1 = render(inPreview(<PublicVenueDetailPage subdomain="preview" venueId="venue-a" previewData={{ event: { event_id: "e1", name: "Trail", public_template_version: null } as never, venue }} />, "/venues/venue-a"));
    const cta = Array.from(v1.container.querySelectorAll<HTMLElement>("a,span")).find((n) => n.textContent?.includes("Scan venue QR"))!;
    expect(cta.className.startsWith("mt-6 flex")).toBe(true);
    expect(v1.container.textContent).not.toContain("Collect your points");
    expect(v1.container.querySelector("[data-event-style]")).toBeNull();
    cleanup();
    const v2 = render(inPreview(<PublicStyleScope overrides={{ version: 1, items: {} }} eventId="e2"><PublicVenueDetailPage subdomain="preview" venueId="venue-a" previewData={{ event: { event_id: "e2", name: "Trail", public_template_version: "v2" } as never, venue }} /></PublicStyleScope>, "/venues/venue-a"));
    expect(v2.container.textContent).toContain("Collect your points");
  });

  it("menu display name buffers multiword typing, commits trimmed on blur, empty resets, and round-trips", async () => {
    const { NavLabelField } = await import("./admin.events.$eventId_.branding");
    const { parsePublicStyleOverrides } = await import("@/lib/public-style-overrides");
    const commit = vi.fn();
    const { container } = render(<NavLabelField value="" placeholder="Stops" disabled={false} commit={commit} />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "My " } });
    expect(input.value).toBe("My ");
    fireEvent.change(input, { target: { value: "My  Stops " } });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(commit).toHaveBeenLastCalledWith("My Stops");
    const doc = parsePublicStyleOverrides({ version: 1, items: {}, navigation: { items: [{ id: "venues", label: "My Stops", icon: "pin" }, { id: "prizes", icon: "trophy" }] } });
    expect(doc.navigation!.items.find((i) => i.id === "venues")!.label).toBe("My Stops");
    expect(doc.navigation!.items.find((i) => i.id === "prizes")!.label).toBeUndefined();
    expect(parsePublicStyleOverrides(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it("venues tab inherits the event's plural label when no name is saved", () => {
    const { container } = render(inPreview(<PublicStyleScope overrides={{ version: 1, items: {} }} eventId="e"><PublicEventNav subdomain="preview" eventId="e" eventName="Trail" venueLabels={{ singular: "Cellar", plural: "Cellars" } as never} /></PublicStyleScope>, "/"));
    const tabs = Array.from(container.querySelectorAll<HTMLElement>("nav[aria-label='Primary'] li > *")).map((t) => t.textContent?.trim());
    expect(tabs).toContain("Cellars");
    expect(tabs).not.toContain("Venues");
  });
});
