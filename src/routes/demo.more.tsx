import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import {
  User,
  Info,
  FileText,
  Shield,
  HelpCircle,
  Mail,
  LogOut,
  ArrowLeft,
  ChevronRight,
  Tag,
  UserPlus,
} from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

type Row = {
  icon: typeof User;
  label: string;
  to?: string;
  tone?: "default" | "danger";
};

const MENU: Row[] = [
  { icon: User, label: "My Profile" },
  { icon: Info, label: "How It Works" },
  { icon: FileText, label: "Terms & Conditions" },
  { icon: Shield, label: "Privacy Policy" },
  { icon: HelpCircle, label: "Frequently Asked Questions" },
  { icon: Mail, label: "Contact Us" },
  { icon: LogOut, label: "Log Out", tone: "danger" },
];

export const Route = createFileRoute("/demo/more")({
  head: () => ({
    meta: [
      { title: "More — GetStampd Demo" },
      { name: "description", content: "Demo more menu preview." },
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
      venueLabelPlural="Wineries"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample menu
      </div>

      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1F3D2B] text-[#F6EFE2]">
          <User className="h-6 w-6" />
        </div>
        <h1 className="font-trail-serif mt-3 text-xl font-semibold" style={{ color: PRIMARY }}>
          Demo Visitor
        </h1>
        <p className="text-[12px] text-[#7A6F5C]">visitor@example.com</p>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <QuickAction
          to="/demo/offers"
          icon={Tag}
          label="Special Offers"
          color={ACCENT}
        />
        <QuickAction
          to="/demo/invite"
          icon={UserPlus}
          label="Invite friends"
          color={PRIMARY}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8]">
        {MENU.map((row, i) => (
          <MenuRow key={row.label} row={row} divider={i < MENU.length - 1} />
        ))}
      </section>

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
        <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[#A8A091]">
          Demo build · v0.1
        </p>
      </div>
    </TrailShell>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  color,
}: {
  to: string;
  icon: typeof User;
  label: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3 shadow-sm transition hover:bg-[#EFE6D2]"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-semibold text-[#2A2620]">{label}</span>
    </Link>
  );
}

function MenuRow({ row, divider }: { row: Row; divider: boolean }) {
  const Icon = row.icon;
  const danger = row.tone === "danger";
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${divider ? "border-b border-[#E6DCC7]" : ""}`}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{
          backgroundColor: danger ? `${ACCENT}14` : `${PRIMARY}10`,
          color: danger ? ACCENT : PRIMARY,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span
        className="flex-1 text-sm font-medium"
        style={{ color: danger ? ACCENT : "#2A2620" }}
      >
        {row.label}
      </span>
      <ChevronRight className="h-4 w-4 text-[#B5AC97]" />
    </div>
  );
}
