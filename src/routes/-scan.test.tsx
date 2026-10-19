// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { navigate, rpc } = vi.hoisted(() => ({ navigate: vi.fn(), rpc: vi.fn() }));
vi.mock("@tanstack/react-router", async () => ({
  ...await vi.importActual<object>("@tanstack/react-router"),
  useNavigate: () => navigate,
}));
vi.mock("@/lib/tenant-host", () => ({ useTenantSubdomain: () => "orangewinequest" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/use-event-palette", () => ({ loadPublicV2Branding: async () => ({ public_template_version: "v1" }) }));
vi.mock("@/components/public-event-nav", () => ({ PublicEventNav: () => null }));
vi.mock("@/components/qr-scanner", () => ({
  QrScanner: ({ onDecode }: { onDecode: (text: string) => void }) => <>
    <button onClick={() => onDecode("/collect/bonus/bonus_123")}>Simulate bonus QR</button>
    <button onClick={() => onDecode("/checkin/venue_123")}>Simulate venue QR</button>
    <button onClick={() => onDecode("https://example.org/offer")}>Simulate other QR</button>
  </>,
}));

import { Route } from "./scan";

describe("live scanner page with safe camera input", () => {
  beforeEach(() => {
    navigate.mockClear();
    rpc.mockReset().mockResolvedValue({ data: [{ event_id: "test-event", name: "Test Event" }], error: null });
  });
  afterEach(cleanup);
  const mount = () => {
    const Component = Route.options.component;
    if (!Component) throw new Error("Scanner route component missing");
    return render(<Component />);
  };
  it("camera bonus input reaches the real bonus route without a venue-only rejection", async () => {
    const screen = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Simulate bonus QR"));
    expect(navigate).toHaveBeenCalledWith({ href: "/collect/bonus/bonus_123" });
    expect(rpc.mock.calls.every(([name]) => name === "get_public_event_by_domain")).toBe(true);
  });
  it("manual bonus entry and camera venue entry share the existing claim destinations", async () => {
    const screen = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/collect/bonus/manual_123" } });
    fireEvent.click(screen.getByText("Go"));
    expect(navigate).toHaveBeenCalledWith({ href: "/collect/bonus/manual_123" });
    fireEvent.click(screen.getByText("Simulate venue QR"));
    expect(navigate).toHaveBeenCalledWith({ href: "/checkin/venue_123" });
  });
  it("other QR links require confirmation and Scan again restores the camera", async () => {
    const screen = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Simulate other QR"));
    expect(screen.getByRole("link", { name: "Open link" }).getAttribute("href")).toBe("https://example.org/offer");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText("Simulate bonus QR")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scan again" }));
    fireEvent.click(screen.getByText("Simulate bonus QR"));
    expect(navigate).toHaveBeenCalledWith({ href: "/collect/bonus/bonus_123" });
  });
});