import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/admin.server", () => ({ getSupabaseAdmin: () => ({ rpc }) }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));

import { loginWithPassportEmail } from "./passport-login.functions";

const invoke = loginWithPassportEmail as unknown as (input: {
  data: { eventId: string; email: string };
}) => Promise<{ ok: boolean; reason?: string }>;
const input = { data: { eventId: "00000000-0000-4000-8000-000000000001", email: "visitor@example.test" } };

beforeEach(() => rpc.mockReset());

describe("passport lookup failure classification", () => {
  it("does not report an absent RPC as an unregistered email", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await invoke(input)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("does not report a network failure as an unregistered email", async () => {
    rpc.mockImplementation(() => { throw new TypeError("Failed to fetch"); });
    expect(await invoke(input)).toEqual({ ok: false, reason: "unavailable" });
  });
  it("reports a successful empty lookup separately", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await invoke(input)).toEqual({ ok: false, reason: "notfound" });
  });
});