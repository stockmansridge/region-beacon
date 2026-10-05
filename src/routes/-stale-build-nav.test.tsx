import { describe, it, expect, vi } from "vitest";
import { isStaleBuildError, isPublicEventContext, reloadOnceForStaleBuild } from "@/lib/stale-build-recovery";
import { buildEventHref } from "@/components/public-nav-context";

const win = (hostname: string, pathname: string, storage: Partial<Storage>) => {
  const reload = vi.fn();
  return { reload, w: { location: { hostname, pathname, search: "", reload } as never, sessionStorage: storage as Storage } };
};
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const HOST = "bathurstandbackroads.getstampd.com.au";

describe("public nav + stale-build recovery", () => {
  it("renamed labels never change canonical destinations", () => {
    for (const base of ["", "/live/bathurstandbackroads"]) {
      expect(buildEventHref({ to: "/venues", base })).toBe(`${base}/venues`);
      expect(buildEventHref({ to: "/offers", base })).toBe(`${base}/offers`);
    }
  });
  it("detects chunk failures only", () => {
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: x.js"))).toBe(true);
    expect(isStaleBuildError(new Error("venues RPC failed"))).toBe(false);
  });
  it("public contexts only; admin/editor excluded", () => {
    expect(isPublicEventContext(HOST, "/passport/abc")).toBe(true);
    expect(isPublicEventContext("getstampd.com.au", "/live/bathurst/offers")).toBe(true);
    expect(isPublicEventContext("getstampd.com.au", "/admin/events/1/branding")).toBe(false);
    expect(isPublicEventContext(HOST, "/admin")).toBe(false);
    expect(isPublicEventContext("getstampd.com.au", "/")).toBe(false);
    const { w, reload } = win("getstampd.com.au", "/admin/events/1/branding", memory());
    expect(reloadOnceForStaleBuild(w)).toBe(false); expect(reload).not.toHaveBeenCalled();
  });
  it("reloads once, never twice; blocked storage fails closed", () => {
    const s = memory(); const a = win(HOST, "/offers", s);
    expect(reloadOnceForStaleBuild(a.w)).toBe(true);
    expect(reloadOnceForStaleBuild(a.w)).toBe(false);
    expect(a.reload).toHaveBeenCalledTimes(1);
    const blocked = win(HOST, "/offers", { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("x"); } });
    expect(reloadOnceForStaleBuild(blocked.w)).toBe(false);
    const silent = win(HOST, "/offers", { getItem: () => null, setItem: () => {} });
    expect(reloadOnceForStaleBuild(silent.w)).toBe(false);
    expect(blocked.reload).not.toHaveBeenCalled(); expect(silent.reload).not.toHaveBeenCalled();
  });
});
