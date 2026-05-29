import { createFileRoute, Link } from "@tanstack/react-router";
import { VisitorShell } from "@/components/visitor-shell";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkin/$venueId")({
  head: () => ({ meta: [{ title: "Check-in confirmed" }] }),
  component: CheckIn,
});

function CheckIn() {
  const { venueId } = Route.useParams();
  return (
    <VisitorShell>
      {/* NOTE: Placeholder result screen — the venueId in the URL is echoed back as-is.
          No real QR token validation, signing, or check-in persistence happens yet. */}
      <div className="flex flex-col items-center rounded-3xl border bg-card p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">You're checked in!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Venue <span className="font-mono text-foreground">{venueId}</span> added to your passport.
        </p>
        <p className="mt-3 rounded-md border border-dashed bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          Placeholder · QR tokens are not verified yet.
        </p>

        <Link
          to="/passport"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          View my passport
        </Link>
        <Link to="/" className="mt-3 text-xs text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </div>
    </VisitorShell>
  );
}
