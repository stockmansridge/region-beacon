import { createFileRoute, Link } from "@tanstack/react-router";
import { VisitorShell } from "@/components/visitor-shell";

export const Route = createFileRoute("/join")({
  head: () => ({ meta: [{ title: "Join the passport" }, { name: "description", content: "Sign up to start your regional passport." }] }),
  component: Join,
});

function Join() {
  return (
    <VisitorShell>
      <h1 className="text-2xl font-semibold">Join the passport</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your details to start collecting check-ins.</p>

      {/* NOTE: Placeholder form — submitting does not create a real passport yet.
          The CTA simply navigates to the passport preview page. */}
      <div className="mt-4 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Placeholder · no passport is created yet.
      </div>


      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full name</label>
          <input className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <input type="email" className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Postcode (optional)</label>
          <input className="h-11 w-full rounded-lg border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="A1B 2C3" />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5" />
          I agree to receive updates about the event and accept the terms.
        </label>
        <Link
          to="/passport"
          className="mt-2 flex h-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm"
        >
          Start my passport
        </Link>
      </form>
    </VisitorShell>
  );
}
