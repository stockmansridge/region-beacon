import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Check } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

const HERO =
  "https://images.unsplash.com/photo-1474722883778-792e7990302f?auto=format&fit=crop&w=1200&q=70";

const VENUES: Record<string, string> = {
  v1: "Swinging Bridge Wines",
  v2: "Stockman's Ridge Vineyard",
  v3: "See Saw Wine",
  v4: "Cargo Road Wines",
};

export const Route = createFileRoute("/demo/checkin/$venueId")({
  head: () => ({ meta: [{ title: "Checked in — Cargo Road Wine Trail" }] }),
  component: DemoCheckIn,
});

function DemoCheckIn() {
  const { venueId } = Route.useParams();
  const venueName = VENUES[venueId] ?? "Cellar door";

  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="passport"
      venueLabelPlural="Wineries"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · QR is not verified
      </div>

      <section className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_-30px_rgba(31,61,43,0.45)]">
        <div className="relative h-[420px] w-full">
          <img src={HERO} alt="" className="h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${PRIMARY}33 0%, ${PRIMARY}AA 55%, ${PRIMARY}F2 100%)`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-8 text-center text-[#F6EFE2]">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full border-2"
              style={{
                borderColor: GOLD,
                backgroundColor: `${PRIMARY}E6`,
                boxShadow: `0 0 0 6px ${GOLD}22`,
              }}
            >
              <Check className="h-9 w-9" style={{ color: GOLD }} />
            </div>
            <div
              className="mt-5 text-[10px] font-semibold uppercase tracking-[0.32em]"
              style={{ color: GOLD }}
            >
              Stamp Collected
            </div>
            <h1 className="font-trail-serif mt-2 text-[34px] font-semibold leading-tight">
              You're checked in
            </h1>
            <p className="mt-1 text-base text-[#F6EFE2]/90">{venueName}</p>
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-2.5">
        <Link
          to="/demo/passport"
          className="flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
          style={{ backgroundColor: PRIMARY }}
        >
          View my passport
        </Link>
        <Link
          to="/demo"
          className="flex h-11 w-full items-center justify-center rounded-full border bg-transparent text-sm font-semibold tracking-wide"
          style={{ borderColor: `${PRIMARY}40`, color: PRIMARY }}
        >
          Scan another location
        </Link>
      </div>
    </TrailShell>
  );
}
