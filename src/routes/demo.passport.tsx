import { createFileRoute } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Check, Lock, Stamp } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

export const Route = createFileRoute("/demo/passport")({
  head: () => ({
    meta: [
      { title: "My passport — Cargo Road Wine Trail" },
      { name: "description", content: "Visitor passport preview." },
    ],
  }),
  component: DemoPassport,
});

const stops = [
  { name: "Swinging Bridge Wines", done: true },
  { name: "Stockman's Ridge Vineyard", done: true },
  { name: "See Saw Wine", done: true },
  { name: "Cargo Road Wines", done: false },
  { name: "Brangayne of Orange", done: false },
  { name: "Ross Hill Wines", done: false },
  { name: "Philip Shaw Wines", done: false },
  { name: "Angullong Cellar Door", done: false },
];

const rewards = [
  { at: 3, label: "Welcome glass", unlocked: true },
  { at: 5, label: "Trail tote", unlocked: false },
  { at: 8, label: "Mixed dozen entry", unlocked: false },
];

function DemoPassport() {
  const completed = stops.filter((s) => s.done).length;
  const total = stops.length;
  const pct = Math.round((completed / total) * 100);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="passport"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample progress
      </div>

      {/* Progress hero */}
      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em]" style={{ color: GOLD }}>
          Your Passport
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Cargo Road Wine Trail
        </h1>

        <div className="relative mx-auto mt-5 h-36 w-36">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#EFE6D2"
              strokeWidth="10"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={ACCENT}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-trail-serif text-4xl font-semibold" style={{ color: PRIMARY }}>
              {completed}
              <span className="text-base text-[#8A7E66]">/{total}</span>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8A7E66]">
              Stamps
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-[#3D372C]">
          {total - completed} stops to go until the next reward.
        </p>
      </section>

      {/* Rewards */}
      <section className="mt-5">
        <SectionTitle>Rewards</SectionTitle>
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

      {/* Stops */}
      <section className="mt-6">
        <SectionTitle>Stops</SectionTitle>
        <ul className="mt-2 space-y-2">
          {stops.map((s, i) => (
            <li
              key={s.name}
              className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: s.done ? PRIMARY : "#EFE6D2",
                  color: s.done ? GOLD : "#8A7E66",
                  boxShadow: s.done ? `inset 0 0 0 1px ${GOLD}80` : undefined,
                }}
              >
                {s.done ? <Stamp className="h-4 w-4" /> : <span className="text-[11px] font-semibold">{String(i + 1).padStart(2, "0")}</span>}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#2A2620]">{s.name}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#8A7E66]">
                  {s.done ? "Stamped" : "Scan QR at venue"}
                </div>
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
