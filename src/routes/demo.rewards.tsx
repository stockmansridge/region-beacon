import { createFileRoute } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Check, Lock, Gift, Ticket } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

const rewards = [
  { at: 3, label: "Welcome glass", unlocked: true },
  { at: 5, label: "Trail tote", unlocked: false },
  { at: 8, label: "Mixed dozen entry", unlocked: false },
];

export const Route = createFileRoute("/demo/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — Cargo Road Wine Trail" },
      { name: "description", content: "Demo rewards preview." },
    ],
  }),
  component: DemoRewards,
});

function DemoRewards() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="rewards"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample rewards
      </div>

      {/* Header */}
      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          Rewards
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Your Rewards
        </h1>
      </section>

      {/* Reward thresholds */}
      <section className="mt-6">
        <SectionTitle>Reward Tiers</SectionTitle>
        <div className="mt-2 space-y-2">
          {rewards.map((r) => (
            <div
              key={r.label}
              className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: r.unlocked ? `${GOLD}33` : "#EFE6D2",
                  color: r.unlocked ? ACCENT : "#8A7E66",
                }}
              >
                {r.at}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#2A2620]">{r.label}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8A7E66]">
                  {r.unlocked ? "Unlocked" : `At ${r.at} stamps`}
                </div>
              </div>
              {r.unlocked ? (
                <Check className="h-4 w-4" style={{ color: PRIMARY }} />
              ) : (
                <Lock className="h-4 w-4 text-[#8A7E66]" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Prize draw teaser */}
      <section className="mt-6">
        <SectionTitle>Prize Draw</SectionTitle>
        <div className="mt-2 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 text-center">
          <Gift className="mx-auto h-6 w-6 text-[#C9A24A]" />
          <h3 className="font-trail-serif mt-2 text-lg font-semibold" style={{ color: PRIMARY }}>
            Grand Prize Draw
          </h3>
          <p className="mt-1 text-sm text-[#7A6F5C]">
            Collect all stamps to enter the prize draw at the end of the trail season.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#EFE6D2] px-3 py-1 text-[11px] font-medium text-[#8A7E66]">
            <Ticket className="h-3.5 w-3.5" />
            3 entries earned so far
          </div>
        </div>
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
