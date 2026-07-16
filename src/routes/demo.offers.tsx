import { createFileRoute, Link } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, DEMO_OFFERS, DEMO_VENUES } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/offers")({
  head: () => ({ meta: [{ title: `Offers — ${DEMO_EVENT.name} demo` }] }),
  component: DemoOffers,
});

function DemoOffers() {
  return (
    <DemoShell activeNav="offers">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          Passport offers
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--event-muted)" }}>
          Exclusive perks when you show your passport at these cellar doors.
        </p>

        <ul className="mt-5 space-y-3">
          {DEMO_OFFERS.map((o) => {
            const venue = DEMO_VENUES.find((v) => v.venue_id === o.venue_id);
            return (
              <li key={o.offer_id}>
                <Link
                  to="/demo/wineries/$venueId"
                  params={{ venueId: o.venue_id }}
                  className="block rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
                  style={{
                    borderColor: "var(--event-card-border)",
                    backgroundColor: "var(--event-card-bg)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-full"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--event-accent) 18%, transparent)",
                        color: "var(--event-accent)",
                      }}
                    >
                      <Tag className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-xs font-semibold uppercase tracking-[0.2em]"
                        style={{ color: "var(--event-accent)" }}
                      >
                        {venue?.name ?? "Venue"}
                      </div>
                      <div
                        className="mt-1 text-base font-semibold"
                        style={{ color: "var(--event-card-heading)" }}
                      >
                        {o.title}
                      </div>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--event-card-text)" }}
                      >
                        {o.description}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </DemoShell>
  );
}
