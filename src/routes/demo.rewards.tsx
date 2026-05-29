import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Check, Lock, Award, Trophy, Ticket, Sparkles } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

const STAMPS = 3;

type Tier = {
  key: string;
  name: string;
  threshold: number;
  description: string;
  tone: "bronze" | "silver" | "gold";
};

const TIERS: Tier[] = [
  { key: "bronze", name: "Bronze Reward", threshold: 3, description: "Visit 3 wineries", tone: "bronze" },
  { key: "silver", name: "Silver Reward", threshold: 5, description: "Visit 5 wineries", tone: "silver" },
  { key: "gold", name: "Gold Reward", threshold: 8, description: "Visit 8 wineries", tone: "gold" },
];

const TONE: Record<Tier["tone"], { ring: string; bg: string; medal: string; label: string }> = {
  bronze: { ring: "#B5572A", bg: "#F4E0CF", medal: "#B5572A", label: "Bronze" },
  silver: { ring: "#9AA3A8", bg: "#ECEEF0", medal: "#7E8A92", label: "Silver" },
  gold: { ring: "#C9A24A", bg: "#F6E9C2", medal: "#C9A24A", label: "Gold" },
};

export const Route = createFileRoute("/demo/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — GetStampd Demo" },
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

      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          Rewards
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Earn as you explore
        </h1>
        <p className="mt-2 text-sm text-[#7A6F5C]">
          {STAMPS} stamps collected so far. Keep going to unlock the next tier.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        {TIERS.map((tier) => {
          const unlocked = STAMPS >= tier.threshold;
          const tone = TONE[tier.tone];
          const pct = Math.min(100, Math.round((STAMPS / tier.threshold) * 100));
          return (
            <article
              key={tier.key}
              className="rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <Medal tone={tier.tone} unlocked={unlocked} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone.medal }}>
                        {tone.label}
                      </div>
                      <h3 className="font-trail-serif text-lg font-semibold" style={{ color: PRIMARY }}>
                        {tier.name}
                      </h3>
                    </div>
                    {unlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#1F3D2B] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#F6EFE2]">
                        <Check className="h-3 w-3" /> Unlocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#E6DCC7] bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#8A7E66]">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[#7A6F5C]">{tier.description}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE6D2]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: tone.medal }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#8A7E66]">
                    <span>
                      {Math.min(STAMPS, tier.threshold)} / {tier.threshold} stamps
                    </span>
                    <span>{unlocked ? "Ready to claim" : `${tier.threshold - STAMPS} to go`}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-6">
        <article className="relative overflow-hidden rounded-2xl border border-[#C9A24A]/40 bg-gradient-to-br from-[#1F3D2B] to-[#264A35] p-5 text-[#F6EFE2] shadow-md">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#C9A24A]/20" />
          <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-[#B5572A]/20" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A24A]/20 ring-2 ring-[#C9A24A]/60">
              <Trophy className="h-6 w-6 text-[#F6D98A]" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F6D98A]">
                Major Prize Draw
              </div>
              <h3 className="font-trail-serif text-xl font-semibold">A weekend in the vines</h3>
              <p className="mt-1 text-sm text-[#E8DFCB]">
                Visit 5 or more wineries to enter the seasonal prize draw.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-[#F6EFE2]">
                <Ticket className="h-3.5 w-3.5" />
                Entry pending · {STAMPS} / 5 stamps
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B5572A]/12 text-[#B5572A]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#2A2620]">Want bonus stamps?</div>
            <div className="text-[12px] text-[#7A6F5C]">Check out today's special offers.</div>
          </div>
          <Link
            to="/demo/offers"
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#F6EFE2]"
            style={{ backgroundColor: PRIMARY }}
          >
            Offers
          </Link>
        </div>
      </section>
    </TrailShell>
  );
}

function Medal({ tone, unlocked }: { tone: Tier["tone"]; unlocked: boolean }) {
  const t = TONE[tone];
  return (
    <div className="relative">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          backgroundColor: t.bg,
          boxShadow: `inset 0 0 0 2px ${t.ring}, 0 4px 10px ${t.ring}33`,
          opacity: unlocked ? 1 : 0.7,
        }}
      >
        <Award className="h-7 w-7" style={{ color: t.medal }} />
      </div>
      {!unlocked && (
        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-[#E6DCC7]">
          <Lock className="h-3 w-3 text-[#8A7E66]" />
        </div>
      )}
    </div>
  );
}
