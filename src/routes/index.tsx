import { createFileRoute, Link } from "@tanstack/react-router";
import { GetStampdLogo, GetStampdMark } from "@/components/brand";
import {
  LifeBuoy,
  Sparkles,
  QrCode,
  MapPin,
  Trophy,
  Gift,
  Smartphone,
  Repeat,
  Stamp,
  Star,
  Ticket,
  Wine,
  Building2,
  Calendar,
  Users,
  Tag,
  ArrowRight,
  Check,
  ScanLine,
  PartyPopper,
} from "lucide-react";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { authUrl } from "@/lib/auth-redirect";
import { LivePublicPage } from "./live.$subdomain.index";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GetStampd — Scan. Check in. Earn rewards." },
      {
        name: "description",
        content:
          "GetStampd turns simple QR scans into customer check-ins, points, stamps and rewards. Drive repeat visits across venues, cellar doors, events, trails and product campaigns.",
      },
      { property: "og:title", content: "GetStampd — QR check-ins that build loyalty" },
      {
        property: "og:description",
        content:
          "Customers scan, check in, collect points and unlock rewards — no app download required.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <LivePublicPage subdomain={subdomain} />;
  return <Landing />;
}

const STEPS = [
  {
    n: "01",
    icon: ScanLine,
    title: "Scan the code",
    body: "Customers scan a GetStampd QR at a venue, cellar door, product display, trail stop, event or counter.",
  },
  {
    n: "02",
    icon: Smartphone,
    title: "Check in",
    body: "A simple mobile screen opens — no app to download. They confirm the visit, tasting, purchase or participation.",
  },
  {
    n: "03",
    icon: Stamp,
    title: "Earn points or stamps",
    body: "Every valid check-in earns points, a stamp, an entry, or progress toward a campaign reward.",
  },
  {
    n: "04",
    icon: Repeat,
    title: "Build progress over time",
    body: "Points accumulate across repeat visits, venues, products, trails and events.",
  },
  {
    n: "05",
    icon: Gift,
    title: "Unlock rewards",
    body: "Discounts, free tastings, perks, member benefits, VIP experiences or campaign prize entries.",
  },
];

const REWARD_TYPES = [
  { icon: Tag, label: "Discounts" },
  { icon: Wine, label: "Free tastings" },
  { icon: Gift, label: "Product offers" },
  { icon: PartyPopper, label: "Event perks" },
  { icon: Trophy, label: "Trail completion rewards" },
  { icon: Star, label: "Member benefits" },
  { icon: Sparkles, label: "VIP experiences" },
  { icon: Ticket, label: "Campaign prize entries" },
];

const AUDIENCES = [
  { icon: Wine, title: "Cellar doors", body: "Reward tastings and repeat visits." },
  { icon: Building2, title: "Wineries & producers", body: "Turn product interactions into loyalty." },
  { icon: MapPin, title: "Tourism trails", body: "Run a multi-stop passport across a region." },
  { icon: Calendar, title: "Events & festivals", body: "Stamp activations, stalls and stages." },
  { icon: Users, title: "Regional groups", body: "Coordinate venues under one trail." },
  { icon: Star, title: "Membership organisations", body: "Track member engagement and perks." },
  { icon: Tag, title: "Product campaigns", body: "QR on packs, bottles, and displays." },
  { icon: Repeat, title: "Return-visit programs", body: "Quietly reward your regulars." },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 460px at 12% 8%, rgba(59,130,246,0.28), transparent 60%), radial-gradient(720px 380px at 88% 92%, rgba(6,182,212,0.18), transparent 60%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link to="/" className="flex items-center">
          <GetStampdLogo variant="blue" size="md" wordmarkClassName="text-white" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#top" className="hover:text-white">Home</a>
          <a href="#how-it-works" className="hover:text-white">How it works</a>
          <Link to="/demo" className="hover:text-white">Demo</Link>
          <a href="#rewards" className="hover:text-white">Rewards</a>
          <a href="#for-venues" className="hover:text-white">For venues</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={authUrl("/admin/login")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10"
          >
            Sign in
          </a>
          <a
            href={authUrl("/signup")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Sparkles className="h-4 w-4" />
            Get started
          </a>
        </div>
      </header>

      <main id="top" className="relative z-10">
        {/* HERO */}
        <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-10 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
              Customer engagement & rewards
            </span>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Scan. Check in. <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Earn rewards.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
              GetStampd helps venues, producers, events and organisations turn
              simple QR scans into check-ins, points, rewards, discounts and
              repeat customer engagement.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                <Smartphone className="h-4 w-4" />
                Try the demo
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                See how it works
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={authUrl("/admin/login")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 px-5 text-sm font-medium text-slate-200 hover:bg-white/5"
              >
                Sign in
              </a>
            </div>
            <p className="mt-6 text-xs text-slate-400">
              No app download required · Works on any modern phone
            </p>
          </div>

          <PhoneMockup />
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">How it works</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              The customer journey, in five simple steps
            </h2>
            <p className="mt-4 text-slate-300">
              Designed for real-world venues, trails and campaigns. Built for
              customers who don't want to download anything.
            </p>
          </div>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.n}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-400/20 text-cyan-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-xs font-semibold tracking-widest text-cyan-300/70">
                      {s.n}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-10 flex justify-center">
            <Link
              to="/demo"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Smartphone className="h-4 w-4" />
              Walk through the demo
            </Link>
          </div>
        </section>

        {/* DEMO TEASER */}
        <section id="demo" className="mx-auto max-w-6xl px-6 py-20">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-8 sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Live demo</span>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  See the scan-to-reward journey
                </h2>
                <p className="mt-4 text-slate-300">
                  Step through a real customer experience — open the trail,
                  check in at a cellar door, watch your passport fill up, and
                  unlock a reward at the end.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-slate-200">
                  {[
                    "Scan a QR code",
                    "Open the mobile check-in screen",
                    "Complete a check-in",
                    "Earn points and stamps",
                    "See reward progress",
                    "Unlock and redeem a reward",
                  ].map((line) => (
                    <li key={line} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-cyan-300" />
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/demo"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    Launch the demo
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/demo/passport"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    See a sample passport
                  </Link>
                </div>
              </div>
              <DemoCards />
            </div>
          </div>
        </section>

        {/* REWARDS */}
        <section id="rewards" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Rewards</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Rewards that give customers a reason to return
            </h2>
            <p className="mt-4 text-slate-300">
              GetStampd turns everyday customer interactions into trackable
              engagement. A scan can become a check-in, a check-in can become
              points, and points can become discounts, offers, perks, or
              memorable experiences.
            </p>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REWARD_TYPES.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.label}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-400/20 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-white">{r.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* FOR VENUES */}
        <section id="for-venues" className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">For venues, producers & organisations</span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Quiet loyalty, built around a QR
              </h2>
              <p className="mt-4 text-slate-300">
                GetStampd helps you drive repeat visits, reward loyal customers,
                encourage product discovery and support trails, events and
                campaigns — without building a custom app.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-200">
                {[
                  "Drive repeat visits and return customers",
                  "Reward loyalty without a punch card",
                  "Encourage product discovery on bottles, packs and displays",
                  "Power wine trails, tourism trails, events and festivals",
                  "Track participation and customer interactions",
                  "Offer discounts and perks through a branded experience",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={authUrl("/signup")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  <Sparkles className="h-4 w-4" />
                  Get started
                </a>
                <Link
                  to="/contact"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Talk to us
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {AUDIENCES.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.title}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-400/20 text-cyan-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-white">{a.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{a.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-slate-900 to-cyan-500/10 p-10 text-center sm:p-14">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Turn every scan into a reason to come back
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-300">
              Try the customer experience first, then set up your own trail in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                <Smartphone className="h-4 w-4" />
                Try the demo
              </Link>
              <a
                href={authUrl("/signup")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4" />
                Get started
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-slate-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <GetStampdMark variant="blue" size="sm" />
            <span>© {new Date().getFullYear()} GetStampd. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/demo" className="hover:text-white">Demo</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
            <Link to="/support" className="inline-flex items-center gap-1 hover:text-white">
              <LifeBuoy className="h-3.5 w-3.5" />
              Support
            </Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Visual: phone mockup with stacked cards ---------- */

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* floating cards */}
      <div className="absolute -left-6 top-6 z-20 hidden rotate-[-6deg] sm:block">
        <FloatingCard
          icon={<QrCode className="h-4 w-4" />}
          title="QR scanned"
          subtitle="Stockman's Ridge Vineyard"
        />
      </div>
      <div className="absolute -right-4 top-40 z-20 hidden rotate-[5deg] sm:block">
        <FloatingCard
          icon={<Sparkles className="h-4 w-4" />}
          title="+10 points earned"
          subtitle="Cargo Road Wine Trail"
          tone="cyan"
        />
      </div>
      <div className="absolute -right-8 bottom-10 z-20 hidden rotate-[3deg] sm:block">
        <FloatingCard
          icon={<Gift className="h-4 w-4" />}
          title="Reward unlocked"
          subtitle="Free tasting flight"
          tone="amber"
        />
      </div>

      {/* phone frame */}
      <div className="relative z-10 mx-auto aspect-[9/19] w-full max-w-[320px] rounded-[44px] border border-white/15 bg-slate-900/80 p-3 shadow-[0_30px_80px_-20px_rgba(6,182,212,0.35)]">
        <div className="absolute left-1/2 top-3 z-30 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-950" />
        <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-gradient-to-b from-[#0c1428] to-[#0b1a2e]">
          {/* hero strip */}
          <div className="px-5 pt-10">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              You're checked in
            </div>
            <div className="mt-2 text-lg font-semibold text-white">Stockman's Ridge</div>
            <div className="text-xs text-slate-400">Cargo Road Wine Trail</div>
          </div>

          <div className="mt-5 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cyan-300/60 bg-cyan-400/10">
              <Check className="h-7 w-7 text-cyan-200" />
            </div>
          </div>

          {/* progress */}
          <div className="mx-5 mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-300">
              <span>Trail progress</span>
              <span className="text-cyan-200">4 / 8 stamps</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-400 to-cyan-300" />
            </div>
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-6 flex-1 rounded-md ${i < 4 ? "bg-cyan-400/30 ring-1 ring-cyan-300/60" : "bg-white/[0.04] ring-1 ring-white/10"}`}
                />
              ))}
            </div>
          </div>

          {/* reward card */}
          <div className="mx-5 mt-3 rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/10 to-rose-400/10 p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              <Gift className="h-3.5 w-3.5" />
              Next reward
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              10% off your next bottle
            </div>
            <div className="text-[11px] text-slate-300">Unlocks at 5 stamps</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingCard({
  icon,
  title,
  subtitle,
  tone = "blue",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: "blue" | "cyan" | "amber";
}) {
  const toneCls =
    tone === "amber"
      ? "from-amber-400/20 to-rose-400/10 text-amber-200 ring-amber-300/30"
      : tone === "cyan"
        ? "from-cyan-400/20 to-blue-500/10 text-cyan-200 ring-cyan-300/30"
        : "from-blue-500/20 to-cyan-400/10 text-cyan-100 ring-white/15";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-br ${toneCls} px-3.5 py-2.5 shadow-xl ring-1 backdrop-blur`}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/70">
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="text-[10px] text-slate-300">{subtitle}</div>
      </div>
    </div>
  );
}

function DemoCards() {
  const items = [
    { icon: ScanLine, title: "QR scan", body: "Tap your phone camera at the QR poster." },
    { icon: Check, title: "Checked in", body: "Visit confirmed at the venue." },
    { icon: Sparkles, title: "+10 points", body: "Added to your trail passport." },
    { icon: Stamp, title: "Stamp 4 of 8", body: "Halfway through the trail." },
    { icon: Gift, title: "Reward unlocked", body: "10% off your next bottle." },
    { icon: Ticket, title: "Prize entry", body: "Entered into the trail prize draw." },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div
            key={it.title}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-400/20 text-cyan-200">
              <Icon className="h-4 w-4" />
            </span>
            <div className="mt-3 text-sm font-semibold text-white">{it.title}</div>
            <div className="mt-0.5 text-xs text-slate-300">{it.body}</div>
          </div>
        );
      })}
    </div>
  );
}
