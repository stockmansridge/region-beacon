// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MapLocationControl } from "./map-location-control";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("requests location only on click and passes the actual coordinates to the map", () => {
  let success: PositionCallback | undefined;
  const getCurrentPosition = vi.fn((callback: PositionCallback) => { success = callback; });
  vi.spyOn(navigator, "geolocation", "get").mockReturnValue({ getCurrentPosition } as unknown as Geolocation);
  const onLocate = vi.fn();
  const view = render(<MapLocationControl onLocate={onLocate} />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole("button", { name: "Find my location" }));
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(view.getByRole("button").getAttribute("disabled")).not.toBeNull();
  act(() => { success?.({ coords: { latitude: -33.419, longitude: 149.577 } } as GeolocationPosition); });
  expect(onLocate).toHaveBeenCalledWith(-33.419, 149.577);
  expect(view.getByRole("button").getAttribute("disabled")).toBeNull();
});

it("shows denied access, permits retry, and ignores a result after leaving the map", () => {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | null | undefined;
  const getCurrentPosition = vi.fn((ok: PositionCallback, error?: PositionErrorCallback | null) => { success = ok; failure = error; });
  vi.spyOn(navigator, "geolocation", "get").mockReturnValue({ getCurrentPosition } as unknown as Geolocation);
  const onLocate = vi.fn();
  const view = render(<MapLocationControl onLocate={onLocate} />);
  fireEvent.click(view.getByRole("button"));
  act(() => { failure?.({ code: 1 } as GeolocationPositionError); });
  expect(view.getByRole("alert").textContent).toContain("Allow location access");
  expect(onLocate).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole("button"));
  expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  view.unmount();
  act(() => { success?.({ coords: { latitude: -33, longitude: 149 } } as GeolocationPosition); });
  expect(onLocate).not.toHaveBeenCalled();
});