import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { resolveStaleSavedPassport } from "./checkin-passport-recovery";

const EVENT = "00000000-0000-4000-8000-000000000001";
const KEY = `gs.passport.${EVENT}`;

function stubStorage(store: Map<string, string>) {
  const ls = {
    setItem: (k: string, v: string) => void store.set(k, v),
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage: ls });
  vi.stubGlobal("localStorage", ls);
}

beforeEach(() => {
  rpc.mockReset();
  vi.unstubAllGlobals();
});

describe("resolveStaleSavedPassport", () => {
  it("clears the saved credential only on a conclusive zero-row readback", async () => {
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "dead-tok" })]]);
    stubStorage(store);
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await resolveStaleSavedPassport(EVENT)).toBe("invalid_cleared");
    expect(store.has(KEY)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("get_passport_by_token", { _raw_token: "dead-tok" });
  });

  it("keeps the credential when the token still validates for this event", async () => {
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "good-tok" })]]);
    stubStorage(store);
    rpc.mockResolvedValue({ data: [{ passport_id: "p1", event_id: EVENT }], error: null });
    expect(await resolveStaleSavedPassport(EVENT)).toBe("kept");
    expect(store.has(KEY)).toBe(true);
  });

  it("keeps the credential on a transport/server error readback", async () => {
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "tok" })]]);
    stubStorage(store);
    rpc.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    expect(await resolveStaleSavedPassport(EVENT)).toBe("kept");
    expect(store.has(KEY)).toBe(true);
  });

  it("preserves a newer token saved by a concurrent fresh login", async () => {
    // The rejected token was already replaced in storage by a fresh login;
    // the readback validates the NEW token and must not remove it.
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "fresh-tok" })]]);
    stubStorage(store);
    rpc.mockResolvedValue({ data: [{ passport_id: "p2", event_id: EVENT }], error: null });
    expect(await resolveStaleSavedPassport(EVENT)).toBe("kept");
    expect(JSON.parse(store.get(KEY)!).access_token).toBe("fresh-tok");
  });

  it("clears a conclusively invalid token only when storage still holds that exact token", async () => {
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "dead-tok" })]]);
    stubStorage(store);
    rpc.mockResolvedValue({ data: [], error: null });
    // Simulate a concurrent login replacing the token mid-flight.
    store.set(KEY, JSON.stringify({ access_token: "fresh-tok" }));
    rpc.mockResolvedValue({ data: [{ passport_id: "p2", event_id: EVENT }], error: null });
    expect(await resolveStaleSavedPassport(EVENT)).toBe("kept");
    expect(JSON.parse(store.get(KEY)!).access_token).toBe("fresh-tok");
  });

  it("keeps everything when the current event could not be resolved", async () => {
    const store = new Map<string, string>([[KEY, JSON.stringify({ access_token: "tok" })]]);
    stubStorage(store);
    expect(await resolveStaleSavedPassport(null)).toBe("kept");
    expect(store.has(KEY)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});
