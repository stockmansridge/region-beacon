import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeReturnTo, storeReturnTo } from "./return-to";

const EVENT_A = "00000000-0000-4000-8000-00000000000a";
const EVENT_B = "00000000-0000-4000-8000-00000000000b";

function stubSessionStorage() {
  const store = new Map<string, string>();
  const ss = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("sessionStorage", ss);
  return store;
}

beforeEach(() => vi.unstubAllGlobals());

describe("consumeReturnTo", () => {
  it("resumes the intended scan exactly once — consuming the scoped entry also clears the matching pending entry", () => {
    const store = stubSessionStorage();
    storeReturnTo("/checkin/qr-1", EVENT_A);
    expect(consumeReturnTo(EVENT_A)).toBe("/checkin/qr-1");
    expect(store.has("gs.returnTo.pending")).toBe(false);
    expect(store.has(`gs.returnTo.${EVENT_A}`)).toBe(false);
    // A later email recovery must not replay the earlier scan.
    expect(consumeReturnTo(EVENT_A)).toBeNull();
  });

  it("does not redirect another event's login to a stale pending scan", () => {
    const store = stubSessionStorage();
    // Visitor scanned a QR in event A, then logs in on event B's join page.
    storeReturnTo("/checkin/qr-a", EVENT_A);
    expect(consumeReturnTo(EVENT_B)).toBeNull();
    // Event A's intent is preserved for when they actually log in there.
    expect(consumeReturnTo(EVENT_A)).toBe("/checkin/qr-a");
    expect(store.has("gs.returnTo.pending")).toBe(false);
  });

  it("falls back to the pending entry when the original QR event was temporarily unresolved", () => {
    stubSessionStorage();
    // storeReturnTo with no eventId writes only the pending key.
    storeReturnTo("/checkin/qr-1", null);
    expect(consumeReturnTo(EVENT_A)).toBe("/checkin/qr-1");
    expect(consumeReturnTo(EVENT_A)).toBeNull();
  });

  it("consumes the pending entry when no event is known", () => {
    stubSessionStorage();
    storeReturnTo("/collect/bonus/tok", null);
    expect(consumeReturnTo(null)).toBe("/collect/bonus/tok");
    expect(consumeReturnTo(null)).toBeNull();
  });
});
