// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  classifyPassportLookup,
  clearStoredPassportIfToken,
  readStoredPassportForEvent,
  resolveCurrentEventPassport,
} from "./use-current-event-passport";

const EVENT_A = "event-a";
const EVENT_B = "event-b";
const save = (eventId: string, token: string) =>
  localStorage.setItem(`gs.passport.${eventId}`, JSON.stringify({ passport_id: "p", access_token: token, event_id: eventId }));

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
});

describe("saved passport persistence", () => {
  it("registration save is reopened as a valid passport", async () => {
    save(EVENT_A, "tok-a");
    rpc.mockResolvedValue({ data: [{ passport_id: "p", event_id: EVENT_A }], error: null });
    const r = await resolveCurrentEventPassport(EVENT_A);
    expect(r.validationStatus).toBe("valid");
    expect(r.passportHref).toBe("/passport/tok-a");
  });

  it("keeps the token on an RPC/server error", async () => {
    save(EVENT_A, "tok-a");
    rpc.mockResolvedValue({ data: null, error: { message: "503" } });
    const r = await resolveCurrentEventPassport(EVENT_A);
    expect(r.validationStatus).toBe("error");
    expect(readStoredPassportForEvent(EVENT_A)?.access_token).toBe("tok-a");
  });

  it("keeps the token when offline (fetch throws)", async () => {
    save(EVENT_A, "tok-a");
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    await resolveCurrentEventPassport(EVENT_A);
    expect(readStoredPassportForEvent(EVENT_A)?.access_token).toBe("tok-a");
  });

  it("clears only this event's token when backend returns zero rows", async () => {
    save(EVENT_A, "tok-a");
    save(EVENT_B, "tok-b");
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await resolveCurrentEventPassport(EVENT_A);
    expect(r.validationStatus).toBe("invalid");
    expect(readStoredPassportForEvent(EVENT_A)).toBeNull();
    expect(readStoredPassportForEvent(EVENT_B)?.access_token).toBe("tok-b");
  });

  it("does not wipe a newer re-registration token with a stale rejection", () => {
    save(EVENT_A, "tok-new");
    expect(clearStoredPassportIfToken(EVENT_A, "tok-old")).toBe(false);
    expect(readStoredPassportForEvent(EVENT_A)?.access_token).toBe("tok-new");
  });

  it("storage key is template-independent: same key and token under V1 and V2", async () => {
    save(EVENT_A, "tok-a");
    rpc.mockResolvedValue({ data: [{ passport_id: "p", event_id: EVENT_A }], error: null });
    const v1 = await resolveCurrentEventPassport(EVENT_A);
    const v2 = await resolveCurrentEventPassport(EVENT_A);
    expect(v1.savedPassportKey).toBe(`gs.passport.${EVENT_A}`);
    expect(v2.token).toBe(v1.token);
  });

  it("classifies only empty successful responses as invalid", () => {
    expect(classifyPassportLookup({ data: [], error: null })).toBe("invalid");
    expect(classifyPassportLookup({ data: null, error: null })).toBe("unknown");
    expect(classifyPassportLookup({ data: null, error: { code: "42501" } })).toBe("unknown");
    expect(classifyPassportLookup({ data: [{ passport_id: "x" }], error: null })).toBe("valid");
  });
});
