import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { loginWithPassportEmail } from "./passport-login";

const EVENT = "00000000-0000-4000-8000-000000000001";

beforeEach(() => { rpc.mockReset(); });

describe("passport email lookup", () => {
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
