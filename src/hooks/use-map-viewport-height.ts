import { useLayoutEffect, type RefObject } from "react";

/** Fit the interactive canvas into the first visible page, not a percentage
 * of the viewport plus an oversized minimum. Measure the actual mobile menu,
 * including safe-area padding and event styling, inside this page only. */
export function useMapViewportHeight(
  mapRef: RefObject<HTMLDivElement | null>,
  navigationRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const map = mapRef.current;
    const navigation = navigationRef.current;
    if (!enabled || !map || !navigation) return;

    const update = () => {
      const viewport = window.visualViewport;
      const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const menu = navigation.querySelector<HTMLElement>(".public-mobile-nav nav");
      const menuRect = menu?.getBoundingClientRect();
      const bottom = menuRect && menuRect.height > 0
        ? Math.min(viewportBottom, menuRect.top)
        : viewportBottom;
      // Document coordinates prevent the map from growing as the page scrolls.
      const top = map.getBoundingClientRect().top + window.scrollY;
      map.style.height = `${Math.max(0, Math.floor(bottom - top - 12))}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    if (map.parentElement?.parentElement) observer.observe(map.parentElement.parentElement);
    navigation.querySelectorAll("header, .public-mobile-nav nav").forEach((element) => observer.observe(element));
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [mapRef, navigationRef, enabled]);
}