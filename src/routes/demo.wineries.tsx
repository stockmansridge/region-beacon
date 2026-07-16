import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, MapPin, Navigation } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_VENUES, useDemoPassport, DEMO_EVENT } from "@/lib/demo-cargo-road";
import { buildGoogleMapsDirectionsUrl } from "@/lib/venue-directions";

export const Route = createFileRoute("/demo/wineries/")({
  head: () => ({ meta: [{ title: `Wineries — ${DEMO_EVENT.name} demo` }] }),
  component: DemoWineries,
});

function DemoWineries() {
  const passport = useDemoPassport();
  return (
    <DemoShell activeNav="venues">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Wineries
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Six cellar doors across the ridge. Tap any winery for details, offers and directions.
        </p>

        <ul className="mt-5 space-y-3">
          {DEMO_VENUES.map((v, i) => {
            const done = passport.hasStamp(v.venue_id);
            return (
              <li key={v.venue_id}>
                <div
                  className="rounded-2xl border p-4 shadow-sm"
                  style={{
                    borderColor: "var(--event-card-border)",
                    backgroundColor: "var(--event-card-bg)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: done
                          ? "var(--event-primary)"
                          : "color-mix(in srgb, var(--event-card-border) 60%, transparent)",
                        color: done ? "var(--event-accent)" : "var(--event-card-muted)",
                      }}
                    >
                      {done ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <span className="text-sm font-semibold">{String(i + 1).padStart(2, "0")}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/demo/wineries/$venueId"
                        params={{ venueId: v.venue_id }}
                        className="block truncate text-base font-semibold"
                        style={{ color: "var(--event-card-heading)" }}
                      >
                        {v.name}
                      </Link>
                      <div
                        className="mt-0.5 flex items-start gap-1 text-xs"
                        style={{ color: "var(--event-card-muted)" }}
                      >
                        <MapPin className="mt-0.5 h-3 w-3 flex-none" />
                        <span className="line-clamp-2">{v.address}</span>
                      </div>
                      {v.offer_summary ? (
                        <div
                          className="mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--event-accent) 15%, transparent)",
                            color: "var(--event-accent)",
                          }}
                        >
                          {v.offer_summary}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Link
                      to="/demo/wineries/$venueId"
                      params={{ venueId: v.venue_id }}
                      className="flex-1 rounded-full py-2 text-center text-xs font-semibold shadow"
                      style={{
                        backgroundColor: "var(--event-button-primary-bg)",
                        color: "var(--event-button-primary-fg)",
                      }}
                    >
                      View venue
                    </Link>
                    <a
                      href={buildGoogleMapsDirectionsUrl({
                        lat: v.lat,
                        lng: v.lng,
                        address: v.address,
                        name: v.name,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold"
                      style={{
                        borderColor: "var(--event-card-border)",
                        color: "var(--event-primary)",
                      }}
                    >
                      <Navigation className="h-3.5 w-3.5" /> Directions
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </DemoShell>
  );
}
