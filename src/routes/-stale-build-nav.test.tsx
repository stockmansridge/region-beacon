import { describe, it, expect } from "vitest";
import { isStaleBuildError } from "./__root";
import { buildEventHref } from "@/components/public-nav-context";
import { publicNavItemLabel } from "@/lib/public-style-overrides";

describe("public nav from passport", () => {
  it("renamed labels never change canonical destinations", () => {
    const venues = { id: "venues" as const, label: "Stops", icon: "pin" as const };
    const offers = { id: "offers" as const, label: "Deals", icon: "tag" as const };
    expect(publicNavItemLabel(venues, "Stops")).toBe("Stops");
    for (const base of ["", "/live/bathurst"]) {
      expect(buildEventHref({ to: `/${venues.id}`, base })).toBe(`${base}/venues`);
      expect(buildEventHref({ to: `/${offers.id}`, base })).toBe(`${base}/offers`);
    }
  });
  it("detects stale-build chunk failures only", () => {
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/venues-abc.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError(new Error("venues RPC failed"))).toBe(false);
  });
});
