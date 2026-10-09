// @vitest-environment happy-dom
import React, { useRef } from "react";
import { render, cleanup, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMapViewportHeight } from "./use-map-viewport-height";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("fits above the measured menu, follows resize, and does not grow after page scrolling", () => {
  let menuTop = 580;
  let scroll = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(650);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: this.tagName === "NAV" ? menuTop : 180 - scroll, height: this.tagName === "NAV" ? 70 : 0 } as DOMRect;
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  function Canvas() {
    const map = useRef<HTMLDivElement | null>(null);
    const nav = useRef<HTMLDivElement | null>(null);
    useMapViewportHeight(map, nav, true);
    return <><div ref={nav}><div className="public-mobile-nav"><nav /></div></div><div ref={map} data-testid="map" /></>;
  }
  const view = render(<Canvas />);
  expect(view.getByTestId("map").style.height).toBe("388px");
  scroll = 100;
  act(() => { window.dispatchEvent(new Event("resize")); });
  expect(view.getByTestId("map").style.height).toBe("388px");
  menuTop = 480;
  act(() => { window.dispatchEvent(new Event("resize")); });
  expect(view.getByTestId("map").style.height).toBe("288px");
});

it("uses the viewport bottom when the mobile menu is hidden", () => {
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: this.tagName === "NAV" ? 0 : 120, height: 0 } as DOMRect;
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  function Canvas() {
    const map = useRef<HTMLDivElement | null>(null);
    const nav = useRef<HTMLDivElement | null>(null);
    useMapViewportHeight(map, nav, true);
    return <><div ref={nav}><div className="public-mobile-nav"><nav /></div></div><div ref={map} data-testid="map" /></>;
  }
  const view = render(<Canvas />);
  expect(view.getByTestId("map").style.height).toBe("768px");
});