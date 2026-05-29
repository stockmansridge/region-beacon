import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { TrailShell } from "@/components/trail-shell";
import { Check, MapPin } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const CREAM = "#F6EFE2";
const GOLD = "#C9A24A";

type Venue = {
  id: string;
  name: string;
  location: string;
  distance: string;
  visited: boolean;
  imageColor: string;
};

const VENUES: Venue[] = [
  {
    id: "stockmans",
    name: "Stockman's Ridge Wines",
    location: "Orange",
    distance: "2.3 km away",
    visited: true,
    imageColor: "#3d5c3f",
  },
  {
    id: "rowlee",
    name: "Rowlee Wines",
    location: "Nashdale",
    distance: "4.1 km away",
    visited: true,
    imageColor: "#8b4513",
  },
  {
    id: "nashdale",
    name: "Nashdale Lane",
    location: "Nashdale",
    distance: "5.6 km away",
    visited: false,
    imageColor: "#6b4226",
  },
  {
    id: "ferment",
    name: "Ferment",
    location: "Orange CBD",
    distance: "1.2 km away",
    visited: false,
    imageColor: "#7a4e3e",
  },
  {
    id: "heifer",
    name: "Heifer Station Wines",
    location: "Borenore",
    distance: "8.9 km away",
    visited: false,
    imageColor: "#4a5d23",
  },
  {
    id: "cargo",
    name: "Cargo Road Cellars",
    location: "Cargo",
    distance: "12.4 km away",
    visited: false,
    imageColor: "#5c4033",
  },
  {
    id: "smallacres",
    name: "Small Acres Cyder",
    location: "Borenore",
    distance: "9.3 km away",
    visited: false,
    imageColor: "#8fbc8f",
  },
  {
    id: "agrestic",
    name: "The Agrestic Grocer",
    location: "Orange",
    distance: "2.8 km away",
    visited: false,
    imageColor: "#a0522d",
  },
];

type Filter = "all" | "visited" | "not";

export const Route = createFileRoute("/demo/wineries")({
  head: () => ({
    meta: [
      { title: "Wineries — GetStampd Demo" },
      { name: "description", content: "Demo wineries list preview." },
    ],
  }),
  component: DemoWineries,
});

function DemoWineries() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = VENUES.filter((v) =>
    filter === "all" ? true : filter === "visited" ? v.visited : !v.visited,
  );

  const visitedCount = VENUES.filter((v) => v.visited).length;

  return (
    <TrailShell
      eventName="Orange Wine Trail"
      monogram="OW"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="wineries"
      venueLabelPlural="Wineries"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample venues
      </div>

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
            Discover
          </div>
          <h1
            className="font-trail-serif mt-1 text-3xl font-semibold"
            style={{ color: PRIMARY }}
          >
            Wineries
          </h1>
        </div>
        <div className="text-[11px] text-[#7A6F5C]">
          {visitedCount}/{VENUES.length} visited
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

      {/* Venue cards */}
      <section className="mt-5 space-y-3">
        {visible.map((v) => (
          <Link
            key={v.id}
            to="/demo/wineries/$venueId"
            params={{ venueId: v.id }}
            className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3 transition active:scale-[0.98]"
          >
            {/* Thumbnail placeholder */}
            <div
              className="h-14 w-14 flex-none overflow-hidden rounded-xl"
              style={{ backgroundColor: v.imageColor }}
            >
              <div className="flex h-full w-full items-center justify-center">
                <WineIcon className="h-5 w-5 text-white/60" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#2A2620]">
                {v.name}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#7A6F5C]">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{v.location}</span>
                <span className="text-[#C9A24A]">·</span>
                <span>{v.distance}</span>
              </div>
            </div>

            {/* Visited state */}
            <div className="flex-none">
              {v.visited ? (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: `${PRIMARY}14`,
                    color: PRIMARY,
                  }}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </div>
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: "#E6DCC7",
                    color: "#C9A24A",
                  }}
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-current opacity-60" />
                </div>
              )}
            </div>
          </Link>
        ))}
      </section>

      {/* Legend */}
      <div className="mt-5 flex items-center justify-center gap-5 text-[11px] text-[#7A6F5C]">
        <div className="flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" style={{ color: PRIMARY }} strokeWidth={3} />
          Visited
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[#C9A24A] bg-[#C9A24A]/30" />
          Not visited
        </div>
      </div>
    </TrailShell>
  );
}

function WineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 22h8" />
      <path d="M7 10h10" />
      <path d="M9.5 10L9 3.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5L15 10" />
      <path d="M12 10v12" />
    </svg>
  );
}
