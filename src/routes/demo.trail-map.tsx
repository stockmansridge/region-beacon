import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrailShell } from "@/components/trail-shell";
import { MapPin, Navigation as RouteIcon, Check } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const CREAM = "#F6EFE2";

type Venue = {
  id: string;
  name: string;
  region: string;
  visited: boolean;
  // pin position in % within the map panel
  x: number;
  y: number;
};

const VENUES: Venue[] = [
  { id: "stockmans", name: "Stockman's Ridge", region: "Orange", visited: true, x: 22, y: 32 },
  { id: "rowlee", name: "Rowlee Wines", region: "Nashdale", visited: true, x: 40, y: 22 },
  { id: "nashdale", name: "Nashdale Lane", region: "Nashdale", visited: false, x: 56, y: 30 },
  { id: "ferment", name: "Ferment", region: "Orange CBD", visited: true, x: 70, y: 44 },
  { id: "heifer", name: "Heifer Station Wines", region: "Borenore", visited: false, x: 30, y: 58 },
  { id: "cargo", name: "Cargo Road Cellars", region: "Cargo", visited: false, x: 50, y: 68 },
  { id: "smallacres", name: "Small Acres Cyder", region: "Borenore", visited: true, x: 78, y: 62 },
  { id: "agrestic", name: "The Agrestic Grocer", region: "Orange", visited: false, x: 62, y: 78 },
];

type Filter = "all" | "visited" | "not";

export const Route = createFileRoute("/demo/trail-map")({
  head: () => ({
    meta: [
      { title: "Trail Map — GetStampd Demo" },
      { name: "description", content: "Demo trail map preview." },
    ],
  }),
  component: DemoTrailMap,
});

function DemoTrailMap() {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string>("rowlee");

  const visible = VENUES.filter((v) =>
    filter === "all" ? true : filter === "visited" ? v.visited : !v.visited,
  );
  const selected = VENUES.find((v) => v.id === selectedId) ?? VENUES[0];

  return (
    <TrailShell
      eventName="Orange Wine Trail"
      monogram="OW"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="map"
      venueLabelPlural="Wineries"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample trail
      </div>

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
            Explore
          </div>
          <h1 className="font-trail-serif mt-1 text-3xl font-semibold" style={{ color: PRIMARY }}>
            Trail Map
          </h1>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#7A6F5C]">
          <RouteIcon className="h-3.5 w-3.5" />
          {VENUES.filter((v) => v.visited).length}/{VENUES.length} visited
        </div>
      </div>

      {/* Filter pills */}
      <div className="mt-4 flex gap-2">
        {(
          [
            { k: "all", label: "All" },
            { k: "visited", label: "Visited" },
            { k: "not", label: "Not visited" },
          ] as { k: Filter; label: string }[]
        ).map((p) => {
          const active = filter === p.k;
          return (
            <button
              key={p.k}
              onClick={() => setFilter(p.k)}
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              style={{
                borderColor: active ? PRIMARY : "#E6DCC7",
                backgroundColor: active ? PRIMARY : CREAM,
                color: active ? CREAM : "#3D372C",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Map panel */}
      <section className="mt-4 overflow-hidden rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] shadow-sm">
        <div className="relative h-72 w-full">
          {/* Cream base */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #F4EAD2 0%, #ECE0C2 100%)",
            }}
          />
          {/* Contour lines (svg) */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 400 300"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="#C9A24A" opacity="0.18" />
              </pattern>
            </defs>
            <rect width="400" height="300" fill="url(#dots)" />
            {/* contours */}
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M -20 ${60 + i * 40} C 80 ${30 + i * 40}, 200 ${110 + i * 30}, 420 ${50 + i * 40}`}
                fill="none"
                stroke="#C9A24A"
                strokeOpacity="0.25"
                strokeWidth="1"
              />
            ))}
            {/* roads */}
            <path
              d="M 0 220 C 80 180, 160 240, 240 180 S 360 140, 420 170"
              fill="none"
              stroke={PRIMARY}
              strokeOpacity="0.35"
              strokeWidth="2.5"
              strokeDasharray="6 5"
            />
            <path
              d="M 60 0 C 90 80, 70 160, 130 220 S 240 300, 280 320"
              fill="none"
              stroke={PRIMARY}
              strokeOpacity="0.22"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            {/* river */}
            <path
              d="M -20 100 C 100 130, 180 70, 280 110 S 420 90, 460 130"
              fill="none"
              stroke="#7BA6B5"
              strokeOpacity="0.55"
              strokeWidth="3"
            />
          </svg>

          {/* Pins */}
          {visible.map((v) => {
            const isSel = v.id === selected.id;
            const color = v.visited ? PRIMARY : ACCENT;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className="absolute -translate-x-1/2 -translate-y-full transition"
                style={{ left: `${v.x}%`, top: `${v.y}%` }}
                aria-label={v.name}
              >
                <span
                  className="relative flex h-7 w-7 items-center justify-center rounded-full ring-2"
                  style={{
                    backgroundColor: color,
                    color: CREAM,
                    boxShadow: isSel
                      ? `0 6px 18px ${color}66, 0 0 0 6px ${color}22`
                      : `0 3px 10px ${color}55`,
                    transform: isSel ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  {v.visited ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected venue card */}
        <div className="border-t border-[#E6DCC7] bg-[#FBF5E8] p-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full"
              style={{
                backgroundColor: selected.visited ? `${PRIMARY}14` : `${ACCENT}14`,
                color: selected.visited ? PRIMARY : ACCENT,
              }}
            >
              {selected.visited ? <Check className="h-4 w-4" strokeWidth={3} /> : <MapPin className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
                {selected.region}
              </div>
              <div className="font-trail-serif text-lg font-semibold" style={{ color: PRIMARY }}>
                {selected.name}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7A6F5C]">
                {selected.visited ? "Stamp collected" : "Not yet visited"}
              </div>
            </div>
            <button
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: PRIMARY, color: CREAM }}
            >
              Details
            </button>
          </div>
        </div>
      </section>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-5 text-[11px] text-[#7A6F5C]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRIMARY }} />
          Visited
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT }} />
          Not visited
        </div>
      </div>
    </TrailShell>
  );
}
