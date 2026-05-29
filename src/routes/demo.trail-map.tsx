import { createFileRoute } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { MapPin, Navigation as RouteIcon } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

const stops = [
  "Swinging Bridge Wines",
  "Stockman's Ridge Vineyard",
  "See Saw Wine",
  "Cargo Road Wines",
  "Brangayne of Orange",
  "Ross Hill Wines",
  "Philip Shaw Wines",
  "Angullong Cellar Door",
];

export const Route = createFileRoute("/demo/trail-map")({
  head: () => ({
    meta: [
      { title: "Trail Map — Cargo Road Wine Trail" },
      { name: "description", content: "Demo trail map preview." },
    ],
  }),
  component: DemoTrailMap,
});

function DemoTrailMap() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="map"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · map preview
      </div>

      {/* Map placeholder */}
      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          Trail Map
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Cargo Road Wine Trail
        </h1>

        <div className="mx-auto mt-6 flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-[#C9A24A]/40 bg-[#F6EFE2]">
          <div className="flex flex-col items-center gap-2 text-[#8A7E66]">
            <RouteIcon className="h-8 w-8" />
            <span className="text-sm font-medium">Map preview</span>
            <span className="text-[11px]">Coming soon</span>
          </div>
        </div>

        <p className="mt-4 text-sm text-[#3D372C]">
          Interactive maps will be available for live events.
        </p>
      </section>

      {/* Route stops */}
      <section className="mt-6">
        <SectionTitle>Route Stops</SectionTitle>
        <ul className="mt-2 space-y-2">
          {stops.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ backgroundColor: `${PRIMARY}14`, color: PRIMARY }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 text-sm font-semibold text-[#2A2620]">{s}</div>
              <MapPin className="h-4 w-4 text-[#8A7E66]" />
            </li>
          ))}
        </ul>
      </section>
    </TrailShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#E6DCC7]" />
      <h2 className="font-trail-serif text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: PRIMARY }}>
        {children}
      </h2>
      <div className="h-px flex-1 bg-[#E6DCC7]" />
    </div>
  );
}
