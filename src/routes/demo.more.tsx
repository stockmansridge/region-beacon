import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Info, FileText, HelpCircle, ArrowLeft } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

export const Route = createFileRoute("/demo/more")({
  head: () => ({
    meta: [
      { title: "More — Cargo Road Wine Trail" },
      { name: "description", content: "Demo more options preview." },
    ],
  }),
  component: DemoMore,
});

function DemoMore() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="more"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample menu
      </div>

      {/* Header */}
      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          More
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Event Info
        </h1>
      </section>

      {/* Menu items */}
      <section className="mt-6 space-y-2">
        <MenuItem icon={Info} label="About this event" description="Trail details, dates and locations." />
        <MenuItem icon={FileText} label="Terms & Privacy" description="Event terms and privacy policy." />
        <MenuItem icon={HelpCircle} label="Support / Contact" description="Get help or contact the organiser." />
      </section>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#8A7E66]">
          Powered by <span className="font-semibold" style={{ color: PRIMARY }}>GetStampd</span>
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-2 text-sm font-medium text-[#2A2620] transition hover:bg-[#EFE6D2]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to product site
        </Link>
      </div>
    </TrailShell>
  );
}

function MenuItem({
  icon: Icon,
  label,
  description,
}: {
  icon: typeof Info;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${PRIMARY}14`, color: PRIMARY }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-[#2A2620]">{label}</div>
        <div className="text-[11px] text-[#7A6F5C]">{description}</div>
      </div>
    </div>
  );
}
