import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMapkitToken } from "@/lib/mapkit.functions";
import { loadMapKitScript } from "@/lib/mapkit-loader";

type Props = {
  name: string;
  lat: number | null | string;
  lng: number | null | string;
  hasAddress: boolean;
};

export function VenueMiniMap({ name, lat, lng, hasAddress }: Props) {
  const fetchToken = useServerFn(getMapkitToken);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const latNum = lat == null ? NaN : Number(lat);
  const lngNum = lng == null ? NaN : Number(lng);
  const hasCoords =
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    !(latNum === 0 && lngNum === 0);

  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await fetchToken();
        if (cancelled) return;
        if (!tokenRes.token) {
          setError(tokenRes.error ?? "MapKit token unavailable.");
          return;
        }
        await loadMapKitScript();
        if (cancelled) return;
        const mapkit = window.mapkit;
        if (!mapkit) {
          setError("Apple MapKit JS unavailable.");
          return;
        }
        mapkit.init({
          authorizationCallback: (done: (t: string) => void) => done(tokenRes.token!),
        });
        if (!containerRef.current) return;
        const map = new mapkit.Map(containerRef.current, {
          showsCompass: mapkit.FeatureVisibility?.Hidden,
          isRotationEnabled: false,
          showsUserLocationControl: false,
          tracksUserLocation: false,
          showsUserLocation: false,
          isZoomEnabled: true,
          isScrollEnabled: true,
        });
        const coord = new mapkit.Coordinate(latNum, lngNum);
        map.region = new mapkit.CoordinateRegion(
          coord,
          new mapkit.CoordinateSpan(0.02, 0.02),
        );
        const annotation = new mapkit.MarkerAnnotation(coord, {
          title: name,
          color: "#1F3D2B",
        });
        map.addAnnotation(annotation);
        mapRef.current = map;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Map failed to load.");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch { /* ignore */ }
        mapRef.current = null;
      }
    };
  }, [hasCoords, latNum, lngNum, name, fetchToken]);

  if (!hasCoords) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-[#8A7E66]/40 bg-[#FBF5E8] px-4 py-6 text-center text-xs text-[#8A7E66]">
        {hasAddress
          ? "Map location has not been set for this venue yet."
          : "No location available for this venue yet."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-6 text-center text-xs text-[#8A7E66]">
        Map couldn't load right now.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mt-6 aspect-[5/3] w-full overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8]"
      aria-label={`Map showing ${name}`}
    />
  );
}
