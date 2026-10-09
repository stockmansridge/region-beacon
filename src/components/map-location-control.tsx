import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MapLocationControl({ onLocate }: { onLocate: (latitude: number, longitude: number) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const locate = () => {
    if (pending) return;
    setError(null);
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current) return;
        setPending(false);
        try {
          onLocate(coords.latitude, coords.longitude);
        } catch {
          setError("Could not show your location. Please try again.");
        }
      },
      (failure) => {
        if (!mounted.current) return;
        setPending(false);
        setError(failure.code === 1
          ? "Allow location access in your browser to find your position."
          : failure.code === 3
            ? "Finding your location took too long. Please try again."
            : "Your location is unavailable. Please try again.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
      {error && <p role="alert" className="max-w-60 rounded-md border border-[var(--event-card-border)] bg-[var(--event-card-bg)] p-3 text-xs text-[var(--event-card-text)] shadow-sm">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={pending ? "Finding your location" : "Find my location"}
        title={pending ? "Finding your location…" : "Find my location"}
        aria-busy={pending}
        disabled={pending}
        onClick={locate}
        className="pointer-events-auto h-11 w-11 border-[var(--event-card-border)] bg-[var(--event-card-bg)] text-[var(--event-link)] shadow-md hover:bg-[var(--event-card-bg)] hover:text-[var(--event-link)]"
      >
        {pending ? <LoaderCircle className="motion-safe:animate-spin" /> : <Navigation fill="currentColor" />}
      </Button>
    </div>
  );
}