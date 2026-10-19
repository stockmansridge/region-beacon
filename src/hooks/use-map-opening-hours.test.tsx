// @vitest-environment happy-dom
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { useMapOpeningHours } from "./use-map-opening-hours";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it("reads cached public hours only when enabled and does not re-fetch on minute ticks", async () => {
  rpc.mockResolvedValue({ data: [{ hours_source: "google", periods: [], synced_at: null, utc_offset_minutes: 660 }], error: null });
  const view = renderHook(({ enabled }) => useMapOpeningHours("test", ["venue-a"], enabled), { initialProps: { enabled: false } });
  expect(rpc).not.toHaveBeenCalled();
  view.rerender({ enabled: true });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(rpc).toHaveBeenCalledWith("get_public_venue_hours", expect.objectContaining({ _venue_id: "venue-a" }));
  const initial = view.result.current.now?.getTime() ?? 0;
  vi.useFakeTimers();
  vi.setSystemTime(initial + 60_000);
  act(() => vi.advanceTimersByTime(60_000));
  expect(view.result.current.now?.getTime()).toBeGreaterThan(initial);
  expect(rpc).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not expose another tenant's rows while a new tenant read is pending", async () => {
  rpc.mockResolvedValueOnce({ data: [{ hours_source: "google", periods: [], synced_at: null }], error: null });
  const view = renderHook(({ tenant }) => useMapOpeningHours(tenant, ["venue-a"], true), { initialProps: { tenant: "first" } });
  await waitFor(() => expect(view.result.current.rows["venue-a"]).toBeDefined());
  rpc.mockImplementationOnce(() => new Promise(() => {}));
  view.rerender({ tenant: "second" });
  expect(view.result.current.rows).toEqual({});
  expect(view.result.current.loading).toBe(true);
});