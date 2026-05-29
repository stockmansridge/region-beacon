import { createFileRoute } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Stamp, Wine } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

const venues = [
  { name: "Swinging Bridge Wines", description: "Award-winning cool-climate wines in a relaxed country setting.", stamped: true },
  { name: "Stockman's Ridge Vineyard", description: "Bold reds and crisp whites from premium Orange fruit.", stamped: true },
  { name: "See Saw Wine", description: "Sustainable, organic wines with a laid-back cellar door.", stamped: true },
  { name: "Cargo Road Wines", description: "Boutique family vineyard specialising in Chardonnay and Pinot Noir.", stamped: false },
  { name: "Brangayne of Orange", description: "Historic estate with sweeping vineyard views and elegant tastings.", stamped: false },
  { name: "Ross Hill Wines", description: "Handcrafted wines from one of Orange's oldest vineyards.", stamped: false },
  { name: "Philip Shaw Wines", description: "Architect-designed cellar door and cool-climate classics.", stamped: false },
  { name: "Angullong Cellar Door", description: "Rustic charm meets modern winemaking on the slopes of Mount Canobolas.", stamped: false },
];

export const Route = createFileRoute("/demo/wineries")({
  head: () => ({
    meta: [
      { title: "Wineries — Cargo Road Wine Trail" },
      { name: "description", content: "Demo wineries preview." },
    ],
  }),
  component: DemoWineries,
});

function DemoWineries() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="wineries"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample venues
      </div>

      {/* Header */}
      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          Wineries
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Cargo Road Wine Trail
        </h1>
      </section>

      {/* Venue cards */}
      <section className="mt-6">
        <SectionTitle>Trail Venues</SectionTitle>
        <ul className="mt-2 space-y-2">
          {venues.map((v) => (
            <li
              key={v.name}
              className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: v.stamped ? PRIMARY : "#EFE6D2",
                  color: v.stamped ? GOLD : "#8A7E66",
                  boxShadow: v.stamped ? `inset 0 0 0 1px ${GOLD}80` : undefined,
                }}
              >
                {v.stamped ? <Stamp className="h-4 w-4" /> : <Wine className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#2A2620]">{v.name}</div>
                <div className="text-[11px] text-[#7A6F5C]">{v.description}</div>
              </div>
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
