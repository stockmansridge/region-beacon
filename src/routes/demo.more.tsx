import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  HelpCircle,
  MapPin,
  Share2,
  Tag,
  Trophy,
  Award,
  RotateCcw,
  Home,
} from "lucide-react";
import { DemoShell } from "@/components/demo/demo-shell";
import { DEMO_EVENT, DEMO_FAQ, useDemoPassport } from "@/lib/demo-cargo-road";

export const Route = createFileRoute("/demo/more")({
  head: () => ({ meta: [{ title: `More — ${DEMO_EVENT.name} demo` }] }),
  component: DemoMore,
});

function DemoMore() {
  const passport = useDemoPassport();
  return (
    <DemoShell activeNav="more">
      <main className="pb-20">
        <h1 className="text-xl font-semibold" style={{ color: "var(--event-heading)" }}>
          More
        </h1>

        <nav className="mt-4 rounded-2xl border" style={{ borderColor: "var(--event-card-border)", backgroundColor: "var(--event-card-bg)" }}>
          <MoreRow to="/demo" icon={<Home className="h-4 w-4" />} label="Home" />
          <MoreRow to="/demo/wineries" icon={<MapPin className="h-4 w-4" />} label="Wineries" />
          <MoreRow to="/demo/offers" icon={<Tag className="h-4 w-4" />} label="Offers" />
          <MoreRow to="/demo/rewards" icon={<Trophy className="h-4 w-4" />} label="Prizes" />
          <MoreRow to="/demo/invite" icon={<Share2 className="h-4 w-4" />} label="Invite friends" />
        </nav>

        <section className="mt-6">
          <h2
            className="text-xs font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--event-muted)" }}
          >
            FAQ
          </h2>
          <div className="mt-2 space-y-2">
            {DEMO_FAQ.map((f, i) => (
              <details
                key={i}
                className="rounded-2xl border p-3"
                style={{
                  borderColor: "var(--event-card-border)",
                  backgroundColor: "var(--event-card-bg)",
                }}
              >
                <summary
                  className="flex cursor-pointer items-center gap-2 text-sm font-semibold"
                  style={{ color: "var(--event-card-heading)" }}
                >
                  <HelpCircle className="h-4 w-4" style={{ color: "var(--event-accent)" }} />
                  {f.question}
                </summary>
                <p className="mt-2 pl-6 text-sm" style={{ color: "var(--event-card-text)" }}>
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-8 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => passport.reset()}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ borderColor: "var(--event-card-border)", color: "var(--event-muted)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset demo
          </button>
        </div>
      </main>
    </DemoShell>
  );
}

function MoreRow({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
      style={{
        borderColor: "var(--event-card-border)",
        color: "var(--event-card-heading)",
      }}
    >
      <span style={{ color: "var(--event-primary)" }}>{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4" style={{ color: "var(--event-card-muted)" }} />
    </Link>
  );
}
