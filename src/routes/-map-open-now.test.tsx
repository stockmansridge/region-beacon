// @vitest-environment happy-dom
import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() , createServerFn: () => ({ middleware: () => ({ handler: () => vi.fn() }) }) }));
vi.mock("@/lib/mapkit.functions", () => ({ getMapkitToken: vi.fn() }));
vi.mock("@tanstack/react-router", async () => ({ ...await vi.importActual<object>("@tanstack/react-router"), useLocation: () => ({ pathname: "/map" }), useNavigate: () => vi.fn(), useRouterState: () => ({ location: { pathname: "/map" } }), Link: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock("@/components/public-event-nav", () => ({ PublicEventNav: () => null }));
vi.mock("@/lib/use-event-palette", async () => ({ ...await vi.importActual<object>("@/lib/use-event-palette"), useEventBrandingKeys: () => ({}) }));
import { PublicTrailMapPage, type MapVenueRow } from "./live.$subdomain.map";
import { PublicNavProvider } from "@/components/public-nav-context";
import { resolveEventBrandingKeys } from "@/lib/use-event-palette";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["v1", "v2"] as const)("filters the real %s map fallback for visitors without a passport, without fetching in preview", (version) => {
  const event = { event_id: "test-event", name: "Trail", primary_color: null, accent_color: null, timezone: "Australia/Sydney", public_template_version: version };
  const venues = ["open", "closed", "unknown", "manual"].map((name, i) => ({ venue_id: name, name, lat: -33 + i * .01, lng: 149, event_found: true })) as MapVenueRow[];
  const common = { synced_at: "2026-10-18T00:00:00Z", utc_offset_minutes: 600, hours_source: "google" };
  const view = render(<PublicNavProvider mode="preview" subdomain="test" activePath="/map"><PublicTrailMapPage subdomain="test" previewData={{ event, venues, branding: resolveEventBrandingKeys(event), now: new Date("2026-10-19T01:00:00Z"), hours: {
    open: { ...common, periods: [{ open: { day: 1, hour: 10 }, close: { day: 1, hour: 17 } }] },
    closed: { ...common, periods: [{ open: { day: 1, hour: 14 }, close: { day: 1, hour: 17 } }] },
    manual: { ...common, hours_source: "manual", periods: null },
  } }} /></PublicNavProvider>);
  expect(view.getByRole("link", { name: "closed" })).toBeDefined();
  fireEvent.click(view.getByRole("button", { name: "Open now" }));
  expect(view.getByRole("link", { name: "open" })).toBeDefined();
  for (const name of ["closed", "unknown", "manual"]) expect(view.queryByRole("link", { name })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Open now" }));
  expect(view.getByRole("link", { name: "closed" })).toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});