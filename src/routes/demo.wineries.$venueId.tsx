import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Navigation, MapPin, Tag, Star, Check, Circle, Stamp } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import {
  DEMO_EVENT,
  DEMO_VENUES,
  DEMO_OFFERS,
  DEMO_BONUS_CHALLENGES,
  useDemoPassport,
} from "@/lib/demo-cargo-road";
import { buildGoogleMapsDirectionsUrl } from "@/lib/venue-directions";

export const Route = createFileRoute("/demo/wineries/$venueId")({
  head: () => ({ meta: [{ title: `Winery — ${DEMO_EVENT.name} demo` }] }),
  component: DemoVenueDetail,
  notFoundComponent: () => (
    <DemoShell>
      <div className="py-16 text-center text-sm" style={{ color: "var(--event-muted)" }}>
        Winery not found in demo.
        <div className="mt-3">
          <Link to="/demo/wineries" className="underline">
            Back to wineries
          </Link>
        </div>
      </div>
    </DemoShell>
  ),
});

function DemoVenueDetail() {
  const { venueId } = Route.useParams();
  const venue = DEMO_VENUES.find((v) => v.venue_id === venueId);
  const passport = useDemoPassport();
  if (!venue) throw notFound();

  const offer = DEMO_OFFERS.find((o) => o.venue_id === venue.venue_id) ?? null;
  const done = passport.hasStamp(venue.venue_id);
  const directions = buildGoogleMapsDirectionsUrl({
    lat: venue.lat,
    lng: venue.lng,
    address: venue.address,
  });

  return (
    <DemoShell activeNav="venues">
      <main className="pb-20">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl"
            style={{
              backgroundColor: done
                ? "var(--event-primary)"
                : "color-mix(in srgb, var(--event-primary) 12%, transparent)",
              color: done ? "var(--event-accent)" : "var(--event-primary)",
            }}
          >
            {done ? <Check className="h-6 w-6" /> : <Stamp className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1
              className="text-xl font-semibold leading-tight"
              style={{ color: "var(--event-heading)" }}
            >
              {venue.name}
            </h1>
            <div
              className="mt-1 flex items-start gap-1 text-xs"
              style={{ color: "var(--event-muted)" }}
            >
              <MapPin className="mt-0.5 h-3 w-3 flex-none" />
              <span>{venue.address}</span>
            </div>
          </div>
        </div>

        <p
          className="mt-4 rounded-2xl border p-4 text-sm leading-relaxed"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
            color: "var(--event-card-text)",
          }}
        >
          {venue.description}
        </p>

        {/* CTAs */}
        <div className="mt-4 flex gap-2">
          {done ? (
            <div
              className="flex-1 rounded-full py-3 text-center text-sm font-semibold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--event-primary) 15%, transparent)",
                color: "var(--event-primary)",
              }}
            >
              ✓ Stamped
            </div>
          ) : (
            <Link
              to="/demo/checkin/$venueId"
              params={{ venueId: venue.venue_id }}
              className="flex-1 rounded-full py-3 text-center text-sm font-semibold shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
            >
              Check in here
            </Link>
          )}
          {directions ? (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-full border px-4 py-3 text-sm font-semibold"
              style={{
                borderColor: "var(--event-card-border)",
                color: "var(--event-primary)",
              }}
            >
              <Navigation className="h-4 w-4" /> Directions
            </a>
          ) : null}
        </div>

        {/* Offer */}
        {offer ? (
          <section
            className="mt-5 rounded-2xl border p-4"
            style={{
              borderColor: "var(--event-card-border)",
              backgroundColor: "var(--event-card-bg)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--event-accent) 18%, transparent)",
                  color: "var(--event-accent)",
                }}
              >
                <Tag className="h-4 w-4" />
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--event-accent)" }}>
                Passport offer
              </div>
            </div>
            <div className="mt-2 text-base font-semibold" style={{ color: "var(--event-card-heading)" }}>
              {offer.title}
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--event-card-text)" }}>
              {offer.description}
            </p>
            <div className="mt-2 text-xs" style={{ color: "var(--event-card-muted)" }}>
              {offer.redemption_instructions}
            </div>
          </section>
        ) : null}

        {/* Bonus challenges */}
        {DEMO_BONUS_CHALLENGES.length > 0 ? (
          <section className="mt-5">
            <h2
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--event-muted)" }}
            >
              Bonus challenges
            </h2>
            <div className="mt-2 space-y-2">
              {DEMO_BONUS_CHALLENGES.map((b) => {
                const claimed = passport.hasBonus(b.bonus_id);
                return (
                  <div
                    key={b.bonus_id}
                    className="rounded-2xl border p-4"
                    style={{
                      borderColor: "var(--event-card-border)",
                      backgroundColor: "var(--event-card-bg)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Star
                          className="mt-0.5 h-5 w-5 flex-none"
                          style={{ color: "var(--event-accent)" }}
                        />
                        <div>
                          <div
                            className="text-sm font-semibold"
                            style={{ color: "var(--event-card-heading)" }}
                          >
                            {b.name}
                          </div>
                          <div
                            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                            style={{ color: "var(--event-accent)" }}
                          >
                            +{b.points} pts
                          </div>
                        </div>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{
                          backgroundColor: claimed
                            ? "color-mix(in srgb, var(--event-primary) 15%, transparent)"
                            : "color-mix(in srgb, var(--event-card-border) 60%, transparent)",
                          color: claimed ? "var(--event-primary)" : "var(--event-card-muted)",
                        }}
                      >
                        {claimed ? (
                          <>
                            <Check className="h-3 w-3" /> Done
                          </>
                        ) : (
                          <>
                            <Circle className="h-3 w-3" /> Open
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-sm" style={{ color: "var(--event-card-text)" }}>
                      {b.description}
                    </p>
                    {!claimed ? (
                      <button
                        type="button"
                        onClick={() => passport.claimBonus(b.bonus_id)}
                        className="mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: "var(--event-accent)",
                          color: "var(--event-accent)",
                        }}
                      >
                        Simulate bonus scan
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </DemoShell>
  );
}
