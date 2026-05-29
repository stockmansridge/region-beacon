import { createFileRoute, Link } from "@tanstack/react-router";
import { VisitorShell } from "@/components/visitor-shell";
import { QrCode, Trophy, MapPin } from "lucide-react";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Easy Passport — Visitor demo" },
      {
        name: "description",
        content: "Walk through the visitor experience: join, collect QR check-ins and earn rewards.",
      },
    ],
  }),
  component: DemoLanding,
});

function DemoLanding() {
  return (
    <VisitorShell>
      <div className="mb-4 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Demo mode · sample event, no real passport is created.
      </div>

      <section className="overflow-hidden rounded-3xl bg-hero-gradient p-6 text-primary-foreground shadow-lg">
        <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
          Summer 2026 · Wine Trail
        </span>
        <h1 className="mt-4 text-3xl font-semibold leading-tight">
          Discover the region, one scan at a time.
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/85">
          Visit participating venues, scan the QR at each stop, and complete your passport to
          unlock rewards.
        </p>
        <Link
          to="/demo/join"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-background px-6 text-sm font-semibold text-foreground shadow-sm transition hover:opacity-90"
        >
          Start my passport
        </Link>
      </section>

      <section className="mt-8 grid gap-3">
        {[
          {
            icon: QrCode,
            title: "Scan QR codes",
            desc: "Each venue has a unique QR — scan it to check in.",
          },
          { icon: MapPin, title: "Explore venues", desc: "Browse the full trail and find your next stop." },
          { icon: Trophy, title: "Earn rewards", desc: "Complete the passport and enter the prize draw." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex gap-3 rounded-2xl border bg-card p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Powered by <span className="font-medium text-foreground">Easy Passport</span> · No app required
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          ← Back to product site
        </Link>
      </p>
    </VisitorShell>
  );
}
