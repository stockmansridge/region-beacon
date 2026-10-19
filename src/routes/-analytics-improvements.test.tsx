// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }), useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/hooks/use-agency-context", () => ({ useAgencyContext: () => ({ selected: { id: "agency" } }) }));
vi.mock("recharts", () => Object.fromEntries(["CartesianGrid", "Line", "LineChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map(name => [name, () => null])));
vi.mock("@/integrations/supabase/client", () => {
  const now = new Date().toISOString();
  const tables: Record<string, unknown[]> = {
    events: [{ id: "e", name: "Event", agency_id: "agency", status: "published" }],
    venues: [{ id: "a", name: "Active Venue", event_id: "e" }, { id: "b", name: "Zero Venue", event_id: "e" }],
    visitors: Array.from({ length: 40 }, (_, i) => ({ id: `v${i}`, event_id: "e", full_name: `Guest ${i}`, email: `guest${i}@example.test`, postcode: i === 0 ? "2780" : "2000", created_at: now, marketing_opt_in: true })),
    passports: [{ id: "p", visitor_id: "v0", event_id: "e", created_at: "2020-01-01T00:00:00Z" }],
    checkins: [{ id: "c", event_id: "e", visitor_id: "v0", passport_id: "p", venue_id: "a", created_at: now }],
    participant_point_awards: [
      { id: "pt", event_id: "e", participant_id: "p", points_awarded: 10, created_at: now, metadata: null, source_id: "code" },
      { id: "pt2", event_id: "e", participant_id: "p", points_awarded: 5, created_at: now, metadata: null, source_id: "code" },
      { id: "pt3", event_id: "e", participant_id: "p", points_awarded: 7, created_at: now, metadata: null, source_id: "venue-code" },
    ],
    event_bonus_codes: [{ id: "code", event_id: "e", name: "Welcome bonus" }],
    event_bonus_code_venues: [{ id: "venue-code", bonus_code_id: "code", venue_id: "a" }],
    event_awards: [{ id: "award", event_id: "e", title: "Ten point prize", points_required: 10, requires_all_locations: false }],
    event_page_views: Array.from({ length: 30 }, (_, i) => ({ id: `pv${i}`, event_id: "e", path: `/page-${i}`, device_id: "device", created_at: now })),
  };
  return { supabase: { from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order", "limit", "range"]) q[method] = () => q;
    q.then = (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data: tables[table] ?? [], error: null }));
    return q;
  }, rpc: async () => ({ data: [], error: null }) } };
});
import { Route } from "./admin.analytics";
afterEach(cleanup);

it("venue check-in links open the correct graph including zero-activity venues", async () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  await screen.findByText("Ten point prize");
  fireEvent.click(screen.getByRole("button", { name: "View check-ins over time for Active Venue" }));
  let modal = screen.getByRole("dialog", { name: "Active Venue — check-ins over time" });
  expect(within(modal).getByText("1 check-ins in this selection")).toBeTruthy();
  expect(within(modal).getByRole("img", { name: /Daily check-ins chart/ })).toBeTruthy();
  fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "View check-ins over time for Zero Venue" }));
  modal = screen.getByRole("dialog", { name: "Zero Venue — check-ins over time" });
  expect(within(modal).getByText("0 check-ins in this selection")).toBeTruthy();
});

it("Bonus points opens item totals while Bonus scans retains the visitor matrix", async () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  await screen.findByText("Ten point prize");
  fireEvent.click(screen.getByRole("button", { name: /Bonus points earned/ }));
  const modal = screen.getByRole("dialog", { name: "Bonus points by item" });
  const rows = within(modal).getAllByRole("row");
  expect(within(rows[1]).getAllByRole("cell").map(c => c.textContent)).toEqual(["Welcome bonus", "Event", "2", "15"]);
  expect(within(rows[2]).getAllByRole("cell").map(c => c.textContent)).toEqual(["Welcome bonus — Active Venue", "Event", "1", "7"]);
  expect(within(rows[3]).getAllByRole("cell").map(c => c.textContent)).toEqual(["Total", "3", "22"]);
  fireEvent.change(within(modal).getByRole("searchbox"), { target: { value: "Active Venue" } });
  expect(within(modal).getAllByRole("row")).toHaveLength(3);
  fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: /Bonus scans/ }));
  const matrix = screen.getByRole("button", { name: "Sort by Welcome bonus" }).closest("table");
  if (!matrix) throw new Error("Bonus scan matrix missing");
  expect(within(matrix).getByText("guest0@example.test")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sort by Welcome bonus" })).toBeTruthy();
});

it("venue-name headers retain check-in column sorting", async () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  await screen.findByText("Ten point prize");
  fireEvent.click(screen.getByRole("button", { name: /Total check-ins/ }));
  const sortButton = screen.getByRole("button", { name: "Sort by Active Venue" });
  fireEvent.click(sortButton);
  expect(sortButton.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
  fireEvent.click(sortButton);
  expect(sortButton.closest("th")?.getAttribute("aria-sort")).toBe("descending");
});

it("venue engagement opens with zero venues, and zero check-ins toggle includes them", async () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  await screen.findByText("Ten point prize");
  fireEvent.click(screen.getByRole("button", { name: /^Venues/ }));
  const modal = screen.getByRole("dialog", { name: "Venue engagement" });
  expect(within(modal).getByText("Zero Venue")).toBeTruthy();
  expect(within(modal).getByText("Active Venue")).toBeTruthy();
  fireEvent.click(within(modal).getByRole("button", { name: "Close" }));
  expect(screen.queryByText("Zero Venue")).toBeNull();
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.getByText("Zero Venue")).toBeTruthy();
});
it("region tab counts visitors, keeps full lists and qualifies older passports with recent bonus points", async () => {
  const Page = Route.options.component as ComponentType;
  render(<Page />);
  await screen.findByText("Ten point prize");
  expect(within(screen.getByRole("region", { name: "Marketing opt-in list" })).getAllByRole("row")).toHaveLength(41);
  expect(within(screen.getByRole("region", { name: "Page view list" })).getAllByRole("row")).toHaveLength(31);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "State / Area" }), { button: 0, ctrlKey: false });
  expect(screen.getByText("Blue Mountains · NSW")).toBeTruthy();
  expect(screen.getByText("Greater Sydney · NSW")).toBeTruthy();
  expect(screen.getByText("2.5%")).toBeTruthy();
  expect(screen.getByText("10 points")).toBeTruthy();
});