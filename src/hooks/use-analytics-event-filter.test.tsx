// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAnalyticsEventFilter } from "./use-analytics-event-filter";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("remembers the event after leaving and reopening Analytics", () => {
  const first = renderHook(() => useAnalyticsEventFilter("agency-a"));
  act(() => first.result.current[1]("event-a"));
  first.unmount();
  const reopened = renderHook(() => useAnalyticsEventFilter("agency-a"));
  expect(reopened.result.current[0]).toBe("event-a");
  act(() => reopened.result.current[1]("event-b"));
  reopened.unmount();
  expect(renderHook(() => useAnalyticsEventFilter("agency-a")).result.current[0]).toBe("event-b");
});

it("remembers All events when explicitly selected", () => {
  localStorage.setItem("gs.analytics.event.agency-a", "event-a");
  const first = renderHook(() => useAnalyticsEventFilter("agency-a"));
  act(() => first.result.current[1]("all"));
  first.unmount();
  expect(renderHook(() => useAnalyticsEventFilter("agency-a")).result.current[0]).toBe("all");
});

it("keeps organisations separate and restores each on switching back", () => {
  const hook = renderHook(({ agencyId }) => useAnalyticsEventFilter(agencyId), { initialProps: { agencyId: "agency-a" } });
  act(() => hook.result.current[1]("event-a"));
  hook.rerender({ agencyId: "agency-b" });
  expect(hook.result.current[0]).toBe("all");
  act(() => hook.result.current[1]("event-b"));
  hook.rerender({ agencyId: "agency-a" });
  expect(hook.result.current[0]).toBe("event-a");
  hook.rerender({ agencyId: "agency-b" });
  expect(hook.result.current[0]).toBe("event-b");
});

it("still allows event changes when browser storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  const hook = renderHook(() => useAnalyticsEventFilter("agency-a"));
  act(() => hook.result.current[1]("event-a"));
  expect(hook.result.current[0]).toBe("event-a");
});