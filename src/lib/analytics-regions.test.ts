import { expect, it } from "vitest";
import { postcodeRegion, regionalBreakdown } from "./analytics-regions";

it("separates Greater Sydney, Blue Mountains and Central West NSW", () => {
  expect(postcodeRegion("2000")?.area).toBe("Greater Sydney");
  expect(postcodeRegion("2780")?.area).toBe("Blue Mountains");
  expect(postcodeRegion("2800")).toMatchObject({ area: "Central West", state: "NSW" });
  expect(postcodeRegion("2795")?.area).toBe("Central West");
});
it("retains northern territory leading zeros and unmapped postcodes", () => {
  expect(postcodeRegion("0800")?.state).toBe("NT");
  expect(postcodeRegion("9999")).toBeNull();
});
it("percentages count each visitor once and include unknown in denominator", () => {
  const rows = regionalBreakdown([{ postcode: "2000", count: 2 }, { postcode: "2780", count: 1 }, { postcode: "9999", count: 1 }], "area");
  expect(rows.find(r => r.label === "Greater Sydney · NSW")?.pct).toBe(50);
  expect(rows.find(r => r.label === "Unknown / unmapped")?.pct).toBe(25);
  expect(rows.reduce((n, r) => n + r.pct, 0)).toBe(100);
});