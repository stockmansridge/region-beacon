import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, DEMO_VENUES, useDemoPassport } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/checkin/$venueId")({
  head: () => ({ meta: [{ title: `Check in — ${DEMO_EVENT.name} demo` }] }),
  component: DemoCheckin,
  notFoundComponent: () => (
    <DemoShell>
      <div className="py-16 text-center text-sm" style={{ color: "var(--event-muted)" }}>
        Winery not found in demo.
      </div>
    </DemoShell>
  ),
});

function DemoCheckin() {
  const { venueId } = Route.useParams();
  const venue = DEMO_VENUES.find((v) => v.venue_id === venueId);
  const passport = useDemoPassport();
  const navigate = useNavigate();
  if (!venue) throw notFound();

  const alreadyStamped = passport.hasStamp(venue.venue_id);

  useEffect(() => {
    if (!passport.registered) {
      navigate({ to: "/demo/join" });
    }
  }, [passport.registered, navigate]);

  useEffect(() => {
    if (passport.registered && !alreadyStamped) {
      passport.addStamp(venue.venue_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passport.registered, venue.venue_id]);

  return (
    <DemoShell activeNav="passport">
      <main className="flex min-h-[60vh] flex-col items-center justify-center pb-20 text-center">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full shadow"
          style={{
            backgroundColor: "var(--event-primary)",
            color: "var(--event-accent)",
          }}
        >
          <Check className="h-10 w-10" strokeWidth={3} />
        </div>
        <h1 className="mt-6 text-2xl font-semibold" style={{ color: "var(--event-heading)" }}>
          {alreadyStamped ? "You're already stamped here" : "Stamp collected!"}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--event-muted)" }}>
          {venue.name} · +{venue.points_value} points
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
          <Link
            to="/demo/passport"
            className="grid h-12 place-items-center rounded-full text-sm font-semibold shadow"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            View passport
          </Link>
          <Link
            to="/demo/wineries"
            className="grid h-12 place-items-center rounded-full border text-sm font-semibold"
            style={{
              borderColor: "var(--event-card-border)",
              color: "var(--event-primary)",
            }}
          >
            Back to wineries
          </Link>
        </div>
      </main>
    </DemoShell>
  );
}
