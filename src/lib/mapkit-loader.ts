// Shared Apple MapKit JS loader. Loads the script from Apple's CDN on demand
// and exposes `window.mapkit`. Safe to call multiple times — concurrent calls
// share a single promise.

declare global {
  interface Window {
    mapkit?: any;
  }
}

const MAPKIT_SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";

let mapkitLoadPromise: Promise<void> | null = null;

export function loadMapKitScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.mapkit) return Promise.resolve();
  if (mapkitLoadPromise) return mapkitLoadPromise;
  mapkitLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${MAPKIT_SCRIPT_SRC}"]`,
    );
    const onLoad = () => resolve();
    const onError = () => {
      mapkitLoadPromise = null;
      reject(new Error("Failed to load Apple MapKit JS"));
    };
    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return;
    }
    const s = document.createElement("script");
    s.src = MAPKIT_SCRIPT_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.addEventListener("load", onLoad);
    s.addEventListener("error", onError);
    document.head.appendChild(s);
  });
  return mapkitLoadPromise;
}
