import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Navigation, Check } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, DEMO_VENUES, useDemoPassport } from "@/lib/demo-cargo-road";
import { buildGoogleMapsDirectionsUrl } from "@/lib/venue-directions";

export const Route = createFileRoute("/demo/trail-map")({
  head: () => ({ meta: [{ title: `Trail Map — ${DEMO_EVENT.name} demo` }] }),
  component: DemoTrailMap,
});

function DemoTrailMap() {
  const passport = useDemoPassport();
  // Static map placeholder using OSM tile-style gradient. The live app uses
  // Apple MapKit; here we mock the visual for the demo.
  return (
    <DemoShell activeNav="map">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Trail Map
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Six wineries across the Cargo Road ridge. Tap a pin for details.
        </p>

        {/* Faux map hero */}
        <div
          className="relative mt-4 aspect-[4/3] overflow-hidden rounded-3xl border shadow-inner"
          style={{
            borderColor: "var(--event-card-border)",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--event-primary) 25%, #E9E3D2) 0%, color-mix(in srgb, var(--event-primary) 12%, #F5EED9) 100%)",
          }}
          aria-hidden
        >
          {/* Ridge lines */}
          <svg
            className="absolute inset-0 h-full w-full opacity-40"
            viewBox="0 0 400 300"
            preserveAspectRatio="none"
          >
            <path
              d="M0,220 C80,180 160,240 240,200 S360,180 400,210"
              stroke="var(--event-primary)"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M0,150 C60,120 160,170 260,130 S380,160 400,140"
              stroke="var(--event-primary)"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          {/* Pins */}
          {DEMO_VENUES.map((v, i) => {
            const cols = 3;
            const x = 12 + (i % cols) * 40; // 12, 52, 92 percent-ish
            const y = 22 + Math.floor(i / cols) * 42;
            const done = passport.hasStamp(v.venue_id);
            return (
              <Link
                key={v.venue_id}
                to="/demo/wineries/$venueId"
                params={{ venueId: v.venue_id }}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div
                  className="flex flex-col items-center gap-1"
                  style={{ color: "var(--event-primary)" }}
                >
                  <div
                    className="grid h-9 w-9 place-items-center rounded-full border-2 shadow"
                    style={{
                      backgroundColor: done ? "var(--event-primary)" : "white",
                      color: done ? "var(--event-accent)" : "var(--event-primary)",
                      borderColor: "var(--event-accent)",
                    }}
                  >
                    {done ? <Check className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                  </div>
                  <span
                    className="max-w-[90px] truncate rounded-full bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ color: "var(--event-primary)" }}
                  >
                    {v.name}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Venue list */}
        <ul className="mt-5 space-y-2">
          {DEMO_VENUES.map((v, i) => {
            const dir = buildGoogleMapsDirectionsUrl({
              lat: v.lat,
              lng: v.lng,
              address: v.address,
            });
            return (
              <li
                key={v.venue_id}
                className="flex items-center gap-3 rounded-2xl border p-3"
                style={{
                  borderColor: "var(--event-card-border)",
                  backgroundColor: "var(--event-card-bg)",
                }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--event-primary) 12%, transparent)",
                    color: "var(--event-primary)",
                  }}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/demo/wineries/$venueId"
                    params={{ venueId: v.venue_id }}
                    className="block truncate text-sm font-semibold"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {v.name}
                  </Link>
                  <div className="truncate text-[11px]" style={{ color: "var(--event-card-muted)" }}>
                    {v.address}
                  </div>
                </div>
                {dir ? (
                  <a
                    href={dir}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border"
                    style={{
                      borderColor: "var(--event-card-border)",
                      color: "var(--event-primary)",
                    }}
                    aria-label={`Directions to ${v.name}`}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </main>
    </DemoShell>
  );
}
