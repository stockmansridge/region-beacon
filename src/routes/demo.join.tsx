import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

export const Route = createFileRoute("/demo/join")({
  head: () => ({
    meta: [
      { title: "Join the trail — Cargo Road Wine Trail" },
      { name: "description", content: "Sign-up preview for the regional passport demo." },
    ],
  }),
  component: DemoJoin,
});

function DemoJoin() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      topRight={
        <Link
          to="/demo"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8A7E66] hover:text-[#1F3D2B]"
        >
          ← Back
        </Link>
      }
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo mode · nothing is saved
      </div>

      <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em]" style={{ color: GOLD }}>
          Digital Passport
        </div>
        <h1 className="font-trail-serif mt-1 text-3xl font-semibold leading-tight" style={{ color: PRIMARY }}>
          Start your trail
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#3D372C]">
          A passport takes a moment. We use your details only to send your stamps and trail updates.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <TrailField label="Full name">
            <input
              className="h-12 w-full rounded-xl border border-[#E6DCC7] bg-[#F6EFE2] px-4 text-sm outline-none transition focus:border-[#1F3D2B]"
              placeholder="Jane Doe"
            />
          </TrailField>
          <TrailField label="Email address">
            <input
              type="email"
              className="h-12 w-full rounded-xl border border-[#E6DCC7] bg-[#F6EFE2] px-4 text-sm outline-none transition focus:border-[#1F3D2B]"
              placeholder="you@example.com"
            />
          </TrailField>
          <TrailField label="Postcode (optional)">
            <input
              className="h-12 w-full rounded-xl border border-[#E6DCC7] bg-[#F6EFE2] px-4 text-sm outline-none transition focus:border-[#1F3D2B]"
              placeholder="2800"
            />
          </TrailField>

          <label className="flex items-start gap-2.5 rounded-xl border border-[#E6DCC7] bg-[#F6EFE2] p-3 text-xs leading-relaxed text-[#3D372C]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[#C9A24A] accent-[#1F3D2B]"
            />
            <span>
              I accept the trail{" "}
              <span className="underline" style={{ color: ACCENT }}>
                terms
              </span>{" "}
              and{" "}
              <span className="underline" style={{ color: ACCENT }}>
                privacy policy
              </span>
              .
            </span>
          </label>

          <Link
            to="/demo/passport"
            className="mt-2 flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            style={{ backgroundColor: PRIMARY }}
          >
            Start exploring
          </Link>
        </form>
      </div>

      <p className="mt-5 text-center text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
        No app download required
      </p>
    </TrailShell>
  );
}

function TrailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8A7E66]">
        {label}
      </span>
      {children}
    </label>
  );
}
