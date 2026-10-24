import { expect, it, vi } from "vitest";
import { readAnalyticsPages } from "./analytics-pagination";

it("loads new records beyond the first 1000 on every refresh", async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
  const fetchPage = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
  expect((await readAnalyticsPages(fetchPage)).data?.at(-1)).toEqual({ id: 1000 });
  rows.push({ id: 1001 });
  expect((await readAnalyticsPages(fetchPage)).data).toHaveLength(1002);
  expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999], [0, 999], [1000, 1999]]);
});

it("rejects partial totals if a later page fails", async () => {
  const result = await readAnalyticsPages(async from => from === 0
    ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
    : { data: null, error: { message: "Network unavailable" } });
  expect(result.data).toBeNull();
  expect(result.error?.message).toBe("Network unavailable");
});