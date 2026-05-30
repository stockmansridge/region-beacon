import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { TrailLanding } from "@/components/trail-landing";
import { PoweredByGetStampd } from "@/components/brand";

const SAMPLE = {
  eventName: "Cargo Road Wine Trail",
  monogram: "CR",
  pitch: "Eight cellar doors, one valley. Collect a stamp at every stop and unlock the trail rewards.",
  welcomeCopy:
    "Welcome to Cargo Road. Wander between cool-climate vineyards, taste what the ridge grows best, and let your passport quietly fill up as you go.",
  badge: "Summer 2026 · Orange NSW",
  primaryColor: "#1F3D2B",
  accentColor: "#B5572A",
  goldColor: "#C9A24A",
  venueNames: [
    "Swinging Bridge Wines",
    "Stockman's Ridge Vineyard",
    "See Saw Wine",
    "Cargo Road Wines",
    "Brangayne of Orange",
    "Ross Hill Wines",
    "Philip Shaw Wines",
    "Angullong Cellar Door",
  ],
};

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Cargo Road Wine Trail — GetStampd demo" },
      {
        name: "description",
        content:
          "Preview the customer experience of a regional wine trail digital passport — collect stamps at every cellar door and unlock rewards.",
      },
    ],
  }),
  component: DemoLanding,
});

function DemoLanding() {
  return (
    <TrailShell
      eventName={SAMPLE.eventName}
      monogram={SAMPLE.monogram}
      primaryColor={SAMPLE.primaryColor}
      accentColor={SAMPLE.accentColor}
      topRight={
        <Link
          to="/"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8A7E66] hover:text-[#1F3D2B]"
        >
          ← GetStampd
        </Link>
      }
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo mode · no real passport is created
      </div>

      <TrailLanding
        eventName={SAMPLE.eventName}
        monogram={SAMPLE.monogram}
        pitch={SAMPLE.pitch}
        welcomeCopy={SAMPLE.welcomeCopy}
        badge={SAMPLE.badge}
        primaryColor={SAMPLE.primaryColor}
        accentColor={SAMPLE.accentColor}
        goldColor={SAMPLE.goldColor}
        venueNames={SAMPLE.venueNames}
        venueCount={SAMPLE.venueNames.length}
        primaryCta={
          <Link
            to="/demo/join"
            className="flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            style={{ backgroundColor: SAMPLE.primaryColor }}
          >
            Join the trail
          </Link>
        }
        secondaryCta={
          <Link
            to="/demo/passport"
            className="flex h-11 w-full items-center justify-center rounded-full border bg-transparent text-sm font-semibold tracking-wide"
            style={{ borderColor: `${SAMPLE.primaryColor}40`, color: SAMPLE.primaryColor }}
          >
            I already have a passport
          </Link>
        }
        termsUrl={null}
      />

      <div className="mt-6 flex justify-center">
        <PoweredByGetStampd variant="trail" />
      </div>

    </TrailShell>
  );
}
