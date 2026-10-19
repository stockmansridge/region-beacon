import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { loginWithPassportEmail } from "./passport-login";

const EVENT = "00000000-0000-4000-8000-000000000001";

beforeEach(() => { rpc.mockReset(); });

function stubStorage(store: Map<string, string>) {
  const ls = {
    setItem: (k: string, v: string) => void store.set(k, v),
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
  return ls;
}

describe("passport email lookup", () => {
  it("reuses the valid saved passport only when its email matches the login email", async () => {
    const store = new Map<string, string>([
      [`gs.passport.${EVENT}`, JSON.stringify({ access_token: "saved-tok" })],
    ]);
    stubStorage(store);
    rpc.mockImplementation((name: string) =>
      name === "get_passport_by_token"
        ? Promise.resolve({ data: [{ passport_id: "p1", event_id: EVENT, email: "A@b.co" }], error: null })
        : Promise.resolve({ data: [], error: null }),
    );
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: true, token: "saved-tok" });
    expect(rpc).toHaveBeenCalledWith("get_passport_by_token", { _raw_token: "saved-tok" });
    expect(rpc).not.toHaveBeenCalledWith("lookup_passport_by_email", expect.anything());
    vi.unstubAllGlobals();
  });
  it("never opens person A's saved passport when person B's email is entered", async () => {
    const store = new Map<string, string>([
      [`gs.passport.${EVENT}`, JSON.stringify({ access_token: "saved-tok-a" })],
    ]);
    stubStorage(store);
    rpc.mockImplementation((name: string, args: { _email?: string }) =>
      name === "get_passport_by_token"
        ? Promise.resolve({ data: [{ passport_id: "pA", event_id: EVENT, email: "a@example.test" }], error: null })
        : Promise.resolve({ data: [{ access_token: "device-tok-b" }], error: null }),
    );
    expect(await loginWithPassportEmail(EVENT, "b@example.test")).toEqual({ ok: true, token: "device-tok-b" });
    expect(rpc).toHaveBeenCalledWith("lookup_passport_by_email", { _event_id: EVENT, _email: "b@example.test" });
    // Person B's alias is saved on this device; person A's token was never invalidated.
    expect(JSON.parse(store.get(`gs.passport.${EVENT}`) ?? "null")?.access_token).toBe("device-tok-b");
    vi.unstubAllGlobals();
  });
  it("does not reuse the saved passport when the validated row carries no email", async () => {
    const store = new Map<string, string>([
      [`gs.passport.${EVENT}`, JSON.stringify({ access_token: "saved-tok" })],
    ]);
    stubStorage(store);
    rpc.mockImplementation((name: string) =>
      name === "get_passport_by_token"
        ? Promise.resolve({ data: [{ passport_id: "p1", event_id: EVENT }], error: null })
        : Promise.resolve({ data: [{ access_token: "device-tok" }], error: null }),
    );
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: true, token: "device-tok" });
    expect(rpc).toHaveBeenCalledWith("lookup_passport_by_email", { _event_id: EVENT, _email: "a@b.co" });
    vi.unstubAllGlobals();
  });
  it("opens the existing passport for a registered email", async () => {
    rpc.mockResolvedValue({ data: [{ access_token: "tok" }], error: null });
    expect(await loginWithPassportEmail(EVENT, " Visitor@Example.test ")).toEqual({ ok: true, token: "tok" });
    expect(rpc).toHaveBeenCalledWith("lookup_passport_by_email", { _event_id: EVENT, _email: "visitor@example.test" });
  });
  it("does not report a permission or missing-function error as an unregistered email", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: false, reason: "unavailable" });
  });
  it("does not report a network failure as an unregistered email", async () => {
    rpc.mockImplementation(() => { throw new TypeError("Failed to fetch"); });
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: false, reason: "unavailable" });
  });
  it("reports a successful empty lookup as not found", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: false, reason: "notfound" });
  });
  it("re-saves the reopened passport on this device", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        setItem: (k: string, v: string) => void store.set(k, v),
        getItem: (k: string) => store.get(k) ?? null,
        removeItem: (k: string) => void store.delete(k),
      },
    });
    rpc.mockResolvedValue({ data: [{ access_token: "tok" }], error: null });
    await loginWithPassportEmail(EVENT, "a@b.co");
    const saved = JSON.parse(store.get(`gs.passport.${EVENT}`) ?? "null");
    expect(saved?.access_token).toBe("tok");
    vi.unstubAllGlobals();
  });
  it("still opens the passport when storage is blocked", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => { throw new Error("blocked"); },
        getItem: () => null,
        removeItem: () => undefined,
      },
    });
    rpc.mockResolvedValue({ data: [{ access_token: "tok" }], error: null });
    expect(await loginWithPassportEmail(EVENT, "a@b.co")).toEqual({ ok: true, token: "tok" });
    vi.unstubAllGlobals();
  });
});
